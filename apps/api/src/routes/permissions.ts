import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { writeAudit } from '../lib/audit.js';
import {
  DEFAULT_PERMISSIONS,
  PERMISSION_ACTIONS,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  ROLE_ARCHETYPES,
  buildMatrix,
  isSuperAdmin,
  type PermissionAction,
} from '../lib/permissions.js';
import { actorId, actorName, requireAuth, requireRole } from '../middleware/auth.js';
import { invalidatePermissionCache } from '../middleware/permissions.js';

export const permissionsRoutes = new Hono();

permissionsRoutes.use('*', requireAuth);

// Liste unifiée des permissions & modules
permissionsRoutes.get('/', requireRole('direction'), async (c) => {
  const db = getDb();
  const dbRoles = await db.query<{ id: string; name: string; description: string | null; is_system: boolean }>(
    'SELECT id, name, description, is_system FROM roles ORDER BY is_system DESC, name ASC',
  );
  const roleIds = dbRoles.map((r) => r.id);
  const rows = await db.query<{ role: string; action: string; allowed: boolean }>(
    'SELECT role, action, allowed FROM role_permissions',
  );

  // Charger les actions additionnelles créées dynamiquement par le Super-Admin
  const customActions = await db.query<{ action: string; label: string; group_label: string; is_custom: boolean }>(
    'SELECT action, label, group_label, is_custom FROM app_permissions ORDER BY created_at ASC',
  ).catch(() => []);

  // Construire la liste complète des actions et groupes
  const allActions = [
    ...PERMISSION_ACTIONS.map((a) => ({ action: a, label: PERMISSION_LABELS[a] })),
    ...customActions
      .filter((ca) => !(PERMISSION_ACTIONS as readonly string[]).includes(ca.action))
      .map((ca) => ({ action: ca.action, label: ca.label })),
  ];

  // Regrouper par groupe thématique
  const groupMap = new Map<string, string[]>();
  for (const g of PERMISSION_GROUPS) {
    groupMap.set(g.label, [...g.actions]);
  }
  for (const ca of customActions) {
    const existing = groupMap.get(ca.group_label) ?? [];
    if (!existing.includes(ca.action)) {
      existing.push(ca.action);
      groupMap.set(ca.group_label, existing);
    }
  }
  const groups = Array.from(groupMap.entries()).map(([label, actions]) => ({ label, actions }));

  // Construire la matrice complète
  const allActionKeys = allActions.map((a) => a.action);
  const matrix = buildMatrix(rows, roleIds);
  // Ajouter les lignes personnalisées dans la matrice
  for (const ca of customActions) {
    if (!matrix[ca.action as PermissionAction]) {
      const row: Record<string, boolean> = {};
      for (const roleId of roleIds) {
        const found = rows.find((r) => r.role === roleId && r.action === ca.action);
        row[roleId] = found ? found.allowed : roleId === 'direction';
      }
      (matrix as any)[ca.action] = row;
    }
  }

  return c.json({
    actions: allActions,
    groups,
    roles: roleIds,
    rolesDetail: dbRoles,
    matrix,
  });
});

const createActionSchema = z.object({
  action: z.string().min(3).max(60).regex(/^[a-z0-9_.-]+$/, 'Identifiant technique composé de lettres, chiffres, points et tirets'),
  label: z.string().min(2).max(100),
  group_label: z.string().min(2).max(60),
});

// Création d'une nouvelle permission / module par le Super-Admin
permissionsRoutes.post('/actions', requireRole('direction'), async (c) => {
  const body = createActionSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    return c.json({ error: body.error.issues[0]?.message ?? 'Paramètres d’action invalides.' }, 400);
  }
  const db = getDb();
  const trimmedAction = body.data.action.trim().toLowerCase();
  const trimmedLabel = body.data.label.trim();
  const trimmedGroup = body.data.group_label.trim();

  // Vérifier si elle existe déjà dans les natives ou en base
  if ((PERMISSION_ACTIONS as readonly string[]).includes(trimmedAction)) {
    return c.json({ error: 'Cette permission système existe déjà.' }, 409);
  }
  const exists = await db.one<{ action: string }>('SELECT action FROM app_permissions WHERE action = $1', [trimmedAction]);
  if (exists) {
    return c.json({ error: 'Cette permission personnalisée existe déjà.' }, 409);
  }

  await db.transaction(async (tx) => {
    await tx.query(
      'INSERT INTO app_permissions (action, label, group_label, is_custom) VALUES ($1, $2, $3, true)',
      [trimmedAction, trimmedLabel, trimmedGroup],
    );
    // Accorder d'office au rôle direction
    await tx.query(
      'INSERT INTO role_permissions (role, action, allowed) VALUES ($1, $2, true) ON CONFLICT (role, action) DO UPDATE SET allowed = true',
      ['direction', trimmedAction],
    );
  });

  invalidatePermissionCache();

  await writeAudit(db, {
    entity: 'permissions',
    entityId: trimmedAction,
    action: 'create_action',
    after: { action: trimmedAction, label: trimmedLabel, group: trimmedGroup },
    actorId: actorId(c),
    actorName: actorName(c),
  });

  return c.json({ ok: true, action: { action: trimmedAction, label: trimmedLabel, group_label: trimmedGroup } }, 201);
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

permissionsRoutes.get('/archetypes', requireRole('direction'), async (c) => {
  return c.json({
    archetypes: Object.entries(ROLE_ARCHETYPES).map(([id, arch]) => ({
      id,
      label: arch.label,
      description: arch.description,
      actionsCount: arch.actions.length,
      actions: arch.actions,
    })),
  });
});

const createRoleSchema = z.object({
  id: z.string().min(2).max(40).regex(/^[a-z0-9_-]+$/, 'Identifiant composé de minuscules, chiffres, tirets'),
  name: z.string().min(2).max(80),
  description: z.string().max(250).optional().nullable(),
  template: z.string().optional().nullable(),
  copy_from: z.string().optional().nullable(),
  permissions: z.array(z.string()).optional(),
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

  // Déterminer les permissions initiales selon le template ou la copie
  let initialActions: string[] = [];
  if (body.data.copy_from) {
    const copiedRows = await db.query<{ action: string; allowed: boolean }>(
      'SELECT action, allowed FROM role_permissions WHERE role = $1 AND allowed = true',
      [body.data.copy_from],
    );
    if (copiedRows.length > 0) {
      initialActions = copiedRows.map((r) => r.action);
    } else {
      // Fallback si c'est un rôle système par défaut non encore écrit en table
      initialActions = PERMISSION_ACTIONS.filter((a) =>
        (DEFAULT_PERMISSIONS[a] as readonly string[] | undefined)?.includes(body.data.copy_from!),
      );
    }
  } else if (body.data.template && body.data.template in ROLE_ARCHETYPES) {
    const arch = ROLE_ARCHETYPES[body.data.template];
    if (arch) initialActions = arch.actions;
  } else if (body.data.permissions && body.data.permissions.length > 0) {
    initialActions = body.data.permissions.filter((a) => (PERMISSION_ACTIONS as readonly string[]).includes(a));
  } else {
    // Par défaut pour tout rôle créé, au minimum l'édition de sa propre photo et profil
    initialActions = ['profile.photo_edit_self'];
  }

  await db.transaction(async (tx) => {
    await tx.query(
      'INSERT INTO roles (id, name, description, is_system) VALUES ($1, $2, $3, false)',
      [body.data.id, body.data.name.trim(), body.data.description?.trim() || null],
    );

    // Initialiser les permissions en base pour ce nouveau rôle
    for (const action of PERMISSION_ACTIONS) {
      const allowed = initialActions.includes(action);
      await tx.query(
        'INSERT INTO role_permissions (role, action, allowed) VALUES ($1, $2, $3)',
        [body.data.id, action, allowed],
      );
    }
  });

  invalidatePermissionCache();

  await writeAudit(db, {
    entity: 'roles',
    entityId: body.data.id,
    action: 'create',
    after: { ...body.data, initialActionsCount: initialActions.length },
    actorId: actorId(c),
    actorName: actorName(c),
  });

  return c.json({ ok: true, id: body.data.id, permissionsCount: initialActions.length });
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
  const db = getDb();
  const customActionRows = await db.query<{ action: string }>('SELECT action FROM app_permissions').catch(() => []);
  const allActionKeys = [...PERMISSION_ACTIONS, ...customActionRows.map((r) => r.action)];

  if (isSuperAdmin(role)) {
    const all = {} as Record<string, boolean>;
    for (const a of allActionKeys) all[a] = true;
    return c.json({ role, superAdmin: true, permissions: all });
  }
  const rows = await db.query<{ action: string; allowed: boolean }>(
    'SELECT action, allowed FROM role_permissions WHERE role = $1',
    [role],
  );
  const rowsMap = new Map<string, boolean>();
  for (const r of rows) {
    rowsMap.set(r.action, r.allowed);
  }
  const permissions = {} as Record<string, boolean>;
  for (const a of allActionKeys) {
    if (rowsMap.has(a)) {
      permissions[a] = rowsMap.get(a)!;
    } else {
      permissions[a] = (DEFAULT_PERMISSIONS[a as PermissionAction] as readonly string[] | undefined)?.includes(role) ?? false;
    }
  }
  // Par défaut, tout utilisateur connecté peut modifier sa propre photo de profil
  if (!rowsMap.has('profile.photo_edit_self')) {
    permissions['profile.photo_edit_self'] = true;
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

  const customActionRows = await db.query<{ action: string }>('SELECT action FROM app_permissions').catch(() => []);
  const validActions = new Set([...PERMISSION_ACTIONS, ...customActionRows.map((r) => r.action)]);

  const before = await db.query<{ role: string; action: string; allowed: boolean }>(
    'SELECT role, action, allowed FROM role_permissions',
  );

  const entries: { role: string; action: string; allowed: boolean }[] = [];
  for (const [action, roles] of Object.entries(body.data.matrix)) {
    if (!validActions.has(action)) continue;
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
