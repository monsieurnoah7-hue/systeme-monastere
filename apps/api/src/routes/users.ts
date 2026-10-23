import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { writeAudit } from '../lib/audit.js';
import { hashPassword, verifyPassword } from '../lib/crypto.js';
import { actorId, actorName, requireAuth, requireRole } from '../middleware/auth.js';
import { requirePerm } from '../middleware/permissions.js';
import { ROLES, type Role } from '../types.js';

export const usersRoutes = new Hono();

usersRoutes.use('*', requireAuth);

const createBody = z.object({
  login: z.string().min(3).max(32).regex(/^[a-z0-9._-]+$/, 'Identifiant : lettres minuscules, chiffres, point, tiret.'),
  password: z.string().min(6),
  display_name: z.string().min(2),
  role: z.string().min(2),
  employee_id: z.string().optional(),
});

const patchBody = z.object({
  display_name: z.string().min(2).optional(),
  role: z.string().min(2).optional(),
  active: z.boolean().optional(),
  password: z.string().min(6).optional(),
  employee_id: z.string().nullable().optional(),
});

const passwordBody = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(6),
});

type UserListRow = {
  id: number;
  login: string;
  display_name: string;
  role: Role;
  employee_id: string | null;
  active: boolean;
  created_at: string;
};

usersRoutes.get('/', requirePerm('users.view'), async (c) => {
  const users = await getDb().query<UserListRow>(
    'SELECT id, login, display_name, role, employee_id, active, created_at FROM users ORDER BY login',
  );
  return c.json({ users });
});

usersRoutes.post('/', requirePerm('users.manage'), async (c) => {
  const body = createBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? 'Compte invalide.' }, 400);
  const data = body.data;
  const db = getDb();

  const existing = await db.one('SELECT id FROM users WHERE login = $1', [data.login]);
  if (existing) return c.json({ error: `L’identifiant « ${data.login} » est déjà utilisé.` }, 409);

  const roleExists = await db.one('SELECT id FROM roles WHERE id = $1', [data.role]);
  if (!roleExists) return c.json({ error: `Le rôle « ${data.role} » n’existe pas.` }, 400);

  if (data.employee_id) {
    const employee = await db.one('SELECT id FROM employees WHERE id = $1', [data.employee_id]);
    if (!employee) return c.json({ error: 'Travailleur lié introuvable.' }, 404);
  }

  const user = await db.one<UserListRow>(
    `INSERT INTO users (login, password_hash, display_name, role, employee_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, login, display_name, role, employee_id, active, created_at`,
    [data.login, hashPassword(data.password), data.display_name.trim(), data.role, data.employee_id || null],
  );
  await writeAudit(db, {
    entity: 'user',
    entityId: String(user?.id ?? ''),
    action: 'create',
    after: { login: data.login, role: data.role, display_name: data.display_name },
    actorId: actorId(c),
    actorName: actorName(c),
  });
  return c.json({ user }, 201);
});

usersRoutes.patch('/:id', requirePerm('users.manage'), async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return c.json({ error: 'Compte invalide.' }, 400);
  const body = patchBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Données invalides.' }, 400);
  if (Object.keys(body.data).length === 0) return c.json({ error: 'Aucun champ à modifier.' }, 400);

  const db = getDb();
  const before = await db.one<UserListRow & { password_hash: string }>('SELECT * FROM users WHERE id = $1', [id]);
  if (!before) return c.json({ error: 'Compte introuvable.' }, 404);
  const patch = body.data;

  if (patch.active === false && before.id === actorId(c)) {
    return c.json({ error: 'Vous ne pouvez pas désactiver votre propre compte.' }, 409);
  }

  if (patch.role) {
    const roleExists = await db.one('SELECT id FROM roles WHERE id = $1', [patch.role]);
    if (!roleExists) return c.json({ error: `Le rôle « ${patch.role} » n’existe pas.` }, 400);
  }

  if (patch.employee_id) {
    const employee = await db.one('SELECT id FROM employees WHERE id = $1', [patch.employee_id]);
    if (!employee) return c.json({ error: 'Travailleur lié introuvable.' }, 404);
  }

  const updated = await db.one<UserListRow>(
    `UPDATE users SET display_name = $2, role = $3, active = $4, password_hash = $5, employee_id = $6
      WHERE id = $1
      RETURNING id, login, display_name, role, employee_id, active, created_at`,
    [
      id,
      patch.display_name?.trim() ?? before.display_name,
      patch.role ?? before.role,
      patch.active ?? before.active,
      patch.password ? hashPassword(patch.password) : before.password_hash,
      patch.employee_id === undefined ? before.employee_id : patch.employee_id || null,
    ],
  );
  await writeAudit(db, {
    entity: 'user',
    entityId: String(id),
    action: patch.password ? 'password_reset' : patch.active === false ? 'deactivate' : 'update',
    before: { display_name: before.display_name, role: before.role, active: before.active },
    after: { display_name: updated?.display_name, role: updated?.role, active: updated?.active, password_changed: !!patch.password },
    actorId: actorId(c),
    actorName: actorName(c),
  });
  return c.json({ user: updated });
});

usersRoutes.post('/me/password', requireAuth, async (c) => {
  const body = passwordBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Nouveau mot de passe d’au moins 6 caractères requis.' }, 400);
  const state = c.get('auth');
  if (!state) return c.json({ error: 'Authentification requise.' }, 401);
  const db = getDb();
  const row = await db.one<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = $1', [state.user.id]);
  if (!row || !verifyPassword(body.data.current_password, row.password_hash)) {
    return c.json({ error: 'Mot de passe actuel incorrect.' }, 401);
  }
  await db.query('UPDATE users SET password_hash = $2 WHERE id = $1', [state.user.id, hashPassword(body.data.new_password)]);
  await writeAudit(db, {
    entity: 'user',
    entityId: String(state.user.id),
    action: 'password_change_self',
    actorId: actorId(c),
    actorName: actorName(c),
  });
  return c.json({ ok: true });
});
