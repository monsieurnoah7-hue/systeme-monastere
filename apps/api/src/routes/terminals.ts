import { randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { writeAudit } from '../lib/audit.js';
import { actorId, actorName, requireAuth } from '../middleware/auth.js';
import { hasPermission, requirePerm } from '../middleware/permissions.js';

export const terminalsRoutes = new Hono();

terminalsRoutes.use('*', requireAuth);

const createBody = z.object({
  name: z.string().min(3),
  id: z.string().regex(/^TERM-[A-Z0-9]{4,10}$/).optional(),
});

const patchBody = z.object({
  name: z.string().min(3).optional(),
  active: z.boolean().optional(),
});
const authorizationBody = z.object({ user_ids: z.array(z.number().int().positive()).max(100) });

type TerminalRow = {
  id: string;
  name: string;
  active: boolean;
  registered_at: string;
};

terminalsRoutes.get('/', requirePerm('terminals.manage'), async (c) => {
  const db = getDb();
  const terminals = await db.query<TerminalRow & { last_used: string | null; punches_today: string }>(
    `SELECT t.id, t.name, t.active, t.registered_at,
            max(a.server_at)::text AS last_used,
            count(*) FILTER (WHERE a.punch_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Douala')::date)::text AS punches_today
       FROM terminals t
       LEFT JOIN attendance a ON a.terminal_id = t.id
      GROUP BY t.id, t.name, t.active, t.registered_at
      ORDER BY t.name`,
  );
  const authorizations = await db.query<{ terminal_id: string; user_id: string }>(
    'SELECT terminal_id, user_id::text AS user_id FROM terminal_authorizations ORDER BY terminal_id, user_id',
  );
  return c.json({
    terminals: terminals.map((t) => ({
      ...t,
      punches_today: Number(t.punches_today),
      authorized_user_ids: authorizations.filter((a) => a.terminal_id === t.id).map((a) => Number(a.user_id)),
    })),
  });
});

terminalsRoutes.get('/eligible-users', requirePerm('terminals.manage'), async (c) => {
  const accounts = await getDb().query<{ id: string; display_name: string; login: string; role: string; employee_id: string | null }>(
    `SELECT id::text AS id, display_name, login, role, employee_id
       FROM users WHERE active = true AND role <> 'direction'
      ORDER BY display_name`,
  );
  const users = [];
  for (const account of accounts) {
    if (await hasPermission(account.role, 'terminals.access')) users.push({ ...account, id: Number(account.id) });
  }
  return c.json({ users });
});

terminalsRoutes.post('/', requirePerm('terminals.manage'), async (c) => {
  const body = createBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Nom du terminal requis (ex. « Tablette de l’atelier »).' }, 400);
  const db = getDb();

  let id = body.data.id;
  if (id) {
    const existing = await db.one('SELECT id FROM terminals WHERE id = $1', [id]);
    if (existing) return c.json({ error: `L’identifiant ${id} est déjà utilisé.` }, 409);
  } else {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = `TERM-${randomBytes(2).toString('hex').toUpperCase()}`;
      const existing = await db.one('SELECT id FROM terminals WHERE id = $1', [candidate]);
      if (!existing) {
        id = candidate;
        break;
      }
    }
    if (!id) return c.json({ error: 'Impossible de générer un identifiant, précisez-le (TERM-XXXX).' }, 500);
  }

  const terminal = await db.one<TerminalRow>(
    'INSERT INTO terminals (id, name) VALUES ($1, $2) RETURNING *',
    [id, body.data.name.trim()],
  );
  await writeAudit(db, {
    entity: 'terminal',
    entityId: id,
    action: 'create',
    after: terminal,
    actorId: actorId(c),
    actorName: actorName(c),
  });
  return c.json({ terminal }, 201);
});

terminalsRoutes.patch('/:id', requirePerm('terminals.manage'), async (c) => {
  const id = c.req.param('id') ?? '';
  const body = patchBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Données invalides.' }, 400);
  if (Object.keys(body.data).length === 0) return c.json({ error: 'Aucun champ à modifier.' }, 400);

  const db = getDb();
  const before = await db.one<TerminalRow>('SELECT * FROM terminals WHERE id = $1', [id]);
  if (!before) return c.json({ error: 'Terminal introuvable.' }, 404);

  const updated = await db.one<TerminalRow>(
    'UPDATE terminals SET name = $2, active = $3 WHERE id = $1 RETURNING *',
    [id, body.data.name?.trim() ?? before.name, body.data.active ?? before.active],
  );
  await writeAudit(db, {
    entity: 'terminal',
    entityId: id,
    action: body.data.active === false ? 'deactivate' : 'update',
    before,
    after: updated,
    actorId: actorId(c),
    actorName: actorName(c),
  });
  return c.json({ terminal: updated });
});

terminalsRoutes.put('/:id/authorizations', requirePerm('terminals.manage'), async (c) => {
  const id = c.req.param('id') ?? '';
  const parsed = authorizationBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'Liste de responsables invalide.' }, 400);

  const db = getDb();
  const terminal = await db.one<TerminalRow>('SELECT * FROM terminals WHERE id = $1', [id]);
  if (!terminal) return c.json({ error: 'Terminal introuvable.' }, 404);
  const userIds = [...new Set(parsed.data.user_ids)];
  const before = await db.query<{ user_id: string }>(
    'SELECT user_id::text AS user_id FROM terminal_authorizations WHERE terminal_id = $1 ORDER BY user_id', [id],
  );

  for (const userId of userIds) {
    const account = await db.one<{ id: string; role: string; active: boolean }>(
      'SELECT id::text AS id, role, active FROM users WHERE id = $1', [userId],
    );
    if (!account || !account.active) return c.json({ error: 'Un compte sélectionné est introuvable ou inactif.' }, 400);
    if (!await hasPermission(account.role, 'terminals.access')) {
      return c.json({ error: 'Accordez d’abord le droit « Utiliser les terminaux de pointage autorisés » au rôle de ce compte.' }, 400);
    }
  }

  await db.transaction(async (tx) => {
    await tx.query('DELETE FROM terminal_authorizations WHERE terminal_id = $1', [id]);
    for (const userId of userIds) {
      await tx.query(
        'INSERT INTO terminal_authorizations (terminal_id, user_id, assigned_by) VALUES ($1, $2, $3)',
        [id, userId, actorId(c)],
      );
    }
  });

  await writeAudit(db, {
    entity: 'terminal',
    entityId: id,
    action: 'authorization_update',
    before: before.map((row) => Number(row.user_id)),
    after: userIds,
    actorId: actorId(c),
    actorName: actorName(c),
  });
  return c.json({ ok: true, authorized_user_ids: userIds });
});
