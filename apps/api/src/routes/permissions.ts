import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { writeAudit } from '../lib/audit.js';
import {
  PERMISSION_ACTIONS,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  buildMatrix,
  isSuperAdmin,
  type PermissionAction,
} from '../lib/permissions.js';
import { actorId, actorName, requireAuth, requireRole } from '../middleware/auth.js';
import { invalidatePermissionCache } from '../middleware/permissions.js';

export const permissionsRoutes = new Hono();

permissionsRoutes.use('*', requireAuth);

permissionsRoutes.get('/', requireRole('direction'), async (c) => {
  const db = getDb();
  const dbRoles = await db.query<{ id: string; name: string; description: string | null; is_system: boolean }>(
    'SELECT id, name, description, is_system FROM roles ORDER BY is_system DESC, name ASC',
  );
  const roleIds = dbRoles.map((r) => r.id);
  const rows = await db.query<{ role: string; action: string; allowed: boolean }>(
    'SELECT role, action, allowed FROM role_permissions',
  );
  return c.json({
    actions: PERMISSION_ACTIONS.map((a) => ({ action: a, label: PERMISSION_LABELS[a] })),
    groups: PERMISSION_GROUPS,
    roles: roleIds,
    rolesDetail: dbRoles,
    matrix: buildMatrix(rows, roleIds),
  });
});

permissionsRoutes.get('/roles', requireRole('direction'), async (c) => {
  const db = getDb();
  const roles = await db.query<{ id: string; name: string; description: string | null; is_system: boolean; user_count: string }>(
    `SELECT r.id, r.name, r.description, r.is_system, count(u.id)::text AS user_count
     FROM roles r
     LEFT JOIN users u ON u.role = r.id
     GROUP BY r.id, r.name, r.description, r.is_system
     ORDER BY r.is_system DESC, r.name ASC`,
  );
  return c.json({ roles });
});

const createRoleSchema = z.object({
  id: z.string().min(2).max(40).regex(/^[a-z0-9_-]+$/, 'Identifiant composé de minuscules, chiffres, tirets'),
  name: z.string().min(2).max(80),
  description: z.string().max(250).optional().nullable(),
});

permissionsRoutes.post('/roles', requireRole('direction'), async (c) => {
  const body = createRoleSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    return c.json({ error: body.error.issues[0]?.message ?? 'Données du rôle invalides.' }, 400);
  }
  const db = getDb();
  const exists = await db.one<{ id: string }>('SELECT id FROM roles WHERE id = $1', [body.data.id]);
  if (exists) {
    return c.json({ error: 'Un rôle avec cet identifiant existe déjà.' }, 409);
  }

  await db.query(
    'INSERT INTO roles (id, name, description, is_system) VALUES ($1, $2, $3, false)',
    [body.data.id, body.data.name.trim(), body.data.description?.trim() || null],
  );

  await writeAudit(db, {
    entity: 'roles',
    entityId: body.data.id,
    action: 'create',
    after: body.data,
    actorId: actorId(c),
    actorName: actorName(c),
  });

  return c.json({ ok: true, id: body.data.id });
});

const updateRoleSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(250).optional().nullable(),
});

permissionsRoutes.put('/roles/:id', requireRole('direction'), async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Identifiant requis.' }, 400);
  const body = updateRoleSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    return c.json({ error: 'Libellé de rôle invalide.' }, 400);
  }
  const db = getDb();
  const before = await db.one<{ id: string; name: string; description: string | null }>(
    'SELECT id, name, description FROM roles WHERE id = $1',
    [id],
  );
  if (!before) return c.json({ error: 'Rôle introuvable.' }, 404);

  await db.query('UPDATE roles SET name = $1, description = $2 WHERE id = $3', [
    body.data.name.trim(),
    body.data.description?.trim() || null,
    id,
  ]);

  await writeAudit(db, {
    entity: 'roles',
    entityId: id,
    action: 'update',
    before,
    after: body.data,
    actorId: actorId(c),
    actorName: actorName(c),
  });

  return c.json({ ok: true });
});

permissionsRoutes.delete('/roles/:id', requireRole('direction'), async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Identifiant requis.' }, 400);
  const db = getDb();
  const role = await db.one<{ id: string; is_system: boolean }>('SELECT id, is_system FROM roles WHERE id = $1', [id]);
  if (!role) return c.json({ error: 'Rôle introuvable.' }, 404);
  if (role.is_system || id === 'direction') {
    return c.json({ error: 'Ce rôle système ne peut pas être supprimé.' }, 400);
  }

  const assigned = await db.one<{ count: string }>('SELECT count(*)::text AS count FROM users WHERE role = $1', [id]);
  if (Number(assigned?.count ?? 0) > 0) {
    return c.json({ error: 'Impossible de supprimer un rôle attribué à des utilisateurs actifs.' }, 400);
  }

  await db.transaction(async (tx) => {
    await tx.query('DELETE FROM role_permissions WHERE role = $1', [id]);
    await tx.query('DELETE FROM roles WHERE id = $1', [id]);
  });
  invalidatePermissionCache();

  await writeAudit(db, {
    entity: 'roles',
    entityId: id,
    action: 'delete',
    before: role,
    actorId: actorId(c),
    actorName: actorName(c),
  });

  return c.json({ ok: true });
});

permissionsRoutes.get('/me', async (c) => {
  const state = c.get('auth')!;
  const role = state.user.role;
  if (isSuperAdmin(role)) {
    const all = {} as Record<PermissionAction, boolean>;
    for (const a of PERMISSION_ACTIONS) all[a] = true;
    return c.json({ role, superAdmin: true, permissions: all });
  }
  const rows = await getDb().query<{ action: string; allowed: boolean }>(
    'SELECT action, allowed FROM role_permissions WHERE role = $1',
    [role],
  );
  const permissions = {} as Record<PermissionAction, boolean>;
  for (const a of PERMISSION_ACTIONS) permissions[a] = false;
  for (const r of rows) {
    if ((PERMISSION_ACTIONS as readonly string[]).includes(r.action)) {
      permissions[r.action as PermissionAction] = r.allowed;
    }
  }
  return c.json({ role, superAdmin: false, permissions });
});

const saveBody = z.object({
  matrix: z.record(
    z.string(),
    z.record(z.string(), z.boolean()),
  ),
});

permissionsRoutes.put('/', requireRole('direction'), async (c) => {
  const body = saveBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Matrice de permissions invalide.' }, 400);
  const db = getDb();
  const dbRoles = await db.query<{ id: string }>('SELECT id FROM roles');
  const validRoleIds = dbRoles.map((r) => r.id);

  const before = await db.query<{ role: string; action: string; allowed: boolean }>(
    'SELECT role, action, allowed FROM role_permissions',
  );

  const entries: { role: string; action: string; allowed: boolean }[] = [];
  for (const [action, roles] of Object.entries(body.data.matrix)) {
    if (!(PERMISSION_ACTIONS as readonly string[]).includes(action)) continue;
    for (const [role, allowed] of Object.entries(roles)) {
      if (!validRoleIds.includes(role)) continue;
      entries.push({ role, action, allowed: Boolean(allowed) });
    }
  }

  await db.transaction(async (tx) => {
    await tx.query('DELETE FROM role_permissions');
    for (const e of entries) {
      await tx.query('INSERT INTO role_permissions (role, action, allowed) VALUES ($1, $2, $3)', [
        e.role,
        e.action,
        e.allowed,
      ]);
    }
  });
  invalidatePermissionCache();

  const after = await db.query<{ role: string; action: string; allowed: boolean }>(
    'SELECT role, action, allowed FROM role_permissions',
  );
  await writeAudit(db, {
    entity: 'permissions',
    entityId: 'matrix',
    action: 'update',
    before: { count: before.length },
    after: { count: after.length },
    actorId: actorId(c),
    actorName: actorName(c),
  });
  return c.json({ ok: true, matrix: buildMatrix(after, validRoleIds) });
});
