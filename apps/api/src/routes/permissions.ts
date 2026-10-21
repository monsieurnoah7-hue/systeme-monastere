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

const MATRIX_ROLES = ['direction', 'magasinier', 'chef_atelier', 'travailleur'] as const;

permissionsRoutes.get('/', requireRole('direction'), async (c) => {
  const rows = await getDb().query<{ role: string; action: string; allowed: boolean }>(
    'SELECT role, action, allowed FROM role_permissions',
  );
  return c.json({
    actions: PERMISSION_ACTIONS.map((a) => ({ action: a, label: PERMISSION_LABELS[a] })),
    groups: PERMISSION_GROUPS,
    roles: MATRIX_ROLES,
    matrix: buildMatrix(rows),
  });
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
  const before = await db.query<{ role: string; action: string; allowed: boolean }>(
    'SELECT role, action, allowed FROM role_permissions',
  );

  const entries: { role: string; action: string; allowed: boolean }[] = [];
  for (const [action, roles] of Object.entries(body.data.matrix)) {
    if (!(PERMISSION_ACTIONS as readonly string[]).includes(action)) continue;
    for (const [role, allowed] of Object.entries(roles)) {
      if (!(MATRIX_ROLES as readonly string[]).includes(role)) continue;
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
  return c.json({ ok: true, matrix: buildMatrix(after) });
});
