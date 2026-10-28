import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { writeAudit } from '../lib/audit.js';
import { actorId, actorName, requireAuth, requireRole } from '../middleware/auth.js';
import { hasPermission, requirePerm } from '../middleware/permissions.js';
import { isSuperAdmin } from '../lib/permissions.js';
import { TOOL_STATUSES, type Role, type ToolRow, type ToolStatus } from '../types.js';
import { Context } from 'hono';

const PREFIX: Record<string, string> = {
  Rabot: 'RBT',
  Scie: 'SCI',
  Perceuse: 'PER',
  Visseuse: 'VIS',
  Marteau: 'MAR',
  Meuleuse: 'MEU',
  Pince: 'PIN',
  Tournevis: 'TOU',
  Mesure: 'MET',
  Quincaillerie: 'QUI',
};

const listQuery = z.object({
  q: z.string().optional(),
  status: z.enum(TOOL_STATUSES).optional(),
  category: z.string().optional(),
  location: z.string().optional(),
  magasin_id: z.string().optional(),
});

const createBody = z.object({
  name: z.string().min(2),
  category: z.string().min(1).default('Divers'),
  location: z.string().min(1).default('Magasin'),
  magasin_id: z.string().optional(),
  observations: z.string().optional(),
  photo_path: z.string().nullable().optional(),
  brand: z.string().optional(),
  model: z.string().optional(),
  serial_number: z.string().optional(),
  acquisition_cost: z.coerce.number().min(0).optional(),
  acquisition_year: z.coerce.number().int().min(1950).max(2100).optional(),
  acquisition_date: z.string().optional(),
  lifespan_years: z.coerce.number().int().min(1).max(50).default(5).optional(),
});

const editBody = z.object({
  name: z.string().min(2).optional(),
  category: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  magasin_id: z.string().optional(),
  observations: z.string().optional(),
  photo_path: z.string().nullable().optional(),
  brand: z.string().optional(),
  model: z.string().optional(),
  serial_number: z.string().optional(),
  acquisition_cost: z.coerce.number().min(0).nullable().optional(),
  acquisition_year: z.coerce.number().int().min(1950).max(2100).nullable().optional(),
  acquisition_date: z.string().nullable().optional(),
  lifespan_years: z.coerce.number().int().min(1).max(50).optional(),
});

const statusBody = z.object({
  status: z.enum(TOOL_STATUSES),
  reason: z.string().min(2),
});

async function nextToolId(category: string): Promise<string> {
  const db = getDb();
  const prefix = PREFIX[category] ?? 'OUT';
  const row = await db.one<{ max_id: string | null }>(
    `SELECT max(id) AS max_id FROM tools WHERE id LIKE $1`,
    [`${prefix}-%`],
  );
  const current = row?.max_id ? Number(row.max_id.split('-')[1] ?? 0) : 0;
  return `${prefix}-${String(current + 1).padStart(3, '0')}`;
}

export const toolsRoutes = new Hono();

toolsRoutes.use('*', requireAuth);

toolsRoutes.get('/', requirePerm('tools.view'), async (c) => {
  const parsed = listQuery.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: 'Filtres invalides.' }, 400);
  const { q, status, category, location, magasin_id } = parsed.data;

  const where: string[] = [];
  const params: unknown[] = [];
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where.push(`(lower(t.id) LIKE $${params.length} OR lower(t.name) LIKE $${params.length} OR lower(t.category) LIKE $${params.length})`);
  }
  if (status) {
    params.push(status);
    where.push(`t.status = $${params.length}`);
  }
  if (category) {
    params.push(category);
    where.push(`t.category = $${params.length}`);
  }
  if (location) {
    params.push(location);
    where.push(`t.location = $${params.length}`);
  }
  if (magasin_id) {
    params.push(magasin_id);
    where.push(`t.magasin_id = $${params.length}`);
  }
  const sql = `SELECT t.*, m.name AS magasin_name, m.code AS magasin_code
                 FROM tools t LEFT JOIN magasins m ON m.id = t.magasin_id
                 ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY t.id`;
  const db = getDb();
  const authState = c.get('auth');
  const userRole = authState?.user?.role;
  const canViewFinancial = userRole ? (isSuperAdmin(userRole as Role) || await hasPermission(userRole, 'financial.view')) : false;

  const [rawTools, cats, locs] = await Promise.all([
    db.query<any>(sql, params),
    db.query<{ category: string }>('SELECT DISTINCT category FROM tools ORDER BY category'),
    db.query<{ location: string }>('SELECT DISTINCT location FROM tools ORDER BY location'),
  ]);

  const tools = canViewFinancial
    ? rawTools
    : rawTools.map((t) => ({ ...t, acquisition_cost: null }));

  return c.json({
    tools,
    facets: { categories: cats.map((r) => r.category), locations: locs.map((r) => r.location) },
  });
});

toolsRoutes.get('/:id', requirePerm('tools.view'), async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const tool = await db.one<any>(`SELECT t.*, m.name AS magasin_name, m.code AS magasin_code
    FROM tools t LEFT JOIN magasins m ON m.id = t.magasin_id WHERE t.id = $1`, [id]);
  if (!tool) return c.json({ error: 'Outil introuvable.' }, 404);

  const authState = c.get('auth');
  const userRole = authState?.user?.role;
  const canViewFinancial = userRole ? (isSuperAdmin(userRole as Role) || await hasPermission(userRole, 'financial.view')) : false;
  if (!canViewFinancial) {
    tool.acquisition_cost = null;
  }
  const events = await db.query<{
    id: number;
    event_type: string;
    from_status: string | null;
    to_status: string | null;
    actor: string;
    note: string | null;
    created_at: string;
  }>('SELECT * FROM tool_events WHERE tool_id = $1 ORDER BY created_at DESC, id DESC LIMIT 50', [id]);
  const loan = await db.one<{
    id: number;
    employee_id: string;
    full_name: string;
    out_at: string;
    due_at: string | null;
    motive: string | null;
  }>(
    `SELECT l.id, l.employee_id, e.full_name, l.out_at, l.due_at, l.motive
       FROM loans l JOIN employees e ON e.id = l.employee_id
      WHERE l.tool_id = $1 AND l.status = 'out'
      ORDER BY l.out_at DESC LIMIT 1`,
    [id],
  );
  return c.json({ tool, events, loan });
});

toolsRoutes.post('/', requirePerm('tools.create'), async (c) => {
  const body = createBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Nom et catégorie obligatoires.' }, 400);
  const db = getDb();
  const id = await nextToolId(body.data.category);
  const d = body.data;
  const tool = await db.one<ToolRow>(
    `INSERT INTO tools (
       id, name, category, location, magasin_id, observations, photo_path,
       brand, model, serial_number, acquisition_cost, acquisition_year, acquisition_date, lifespan_years
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    [
      id,
      d.name.trim(),
      d.category.trim(),
      d.location.trim(),
      d.magasin_id || null,
      d.observations?.trim() || null,
      d.photo_path?.trim() || null,
      d.brand?.trim() || null,
      d.model?.trim() || null,
      d.serial_number?.trim() || null,
      d.acquisition_cost ?? null,
      d.acquisition_year ?? (d.acquisition_date ? new Date(d.acquisition_date).getFullYear() : new Date().getFullYear()),
      d.acquisition_date || null,
      d.lifespan_years ?? 5,
    ],
  );
  await db.query(
    `INSERT INTO tool_events (tool_id, event_type, from_status, to_status, actor, note)
     VALUES ($1, 'creation', NULL, 'disponible', $2, $3)`,
    [id, actorName(c), 'Création de la fiche outil'],
  );
  await writeAudit(db, {
    entity: 'tool',
    entityId: id,
    action: 'create',
    after: tool,
    actorId: actorId(c),
    actorName: actorName(c),
  });
  return c.json({ tool }, 201);
});

toolsRoutes.patch('/:id', requirePerm('tools.edit'), async (c) => {
  const id = c.req.param('id') ?? '';
  const body = editBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Données invalides.' }, 400);
  if (Object.keys(body.data).length === 0) return c.json({ error: 'Aucun champ à modifier.' }, 400);
  const db = getDb();
  const before = await db.one<ToolRow>('SELECT * FROM tools WHERE id = $1', [id]);
  if (!before) return c.json({ error: 'Outil introuvable.' }, 404);
  const p = body.data;
  const updated = await db.one<ToolRow>(
    `UPDATE tools SET
       name = coalesce($2, name),
       category = coalesce($3, category),
       location = coalesce($4, location),
       magasin_id = CASE WHEN $5::text IS NOT NULL THEN (CASE WHEN $5 = '' THEN NULL ELSE $5 END) ELSE magasin_id END,
       observations = CASE WHEN $6::text IS NOT NULL THEN (CASE WHEN $6 = '' THEN NULL ELSE $6 END) ELSE observations END,
       photo_path = CASE WHEN $7::text IS NOT NULL THEN (CASE WHEN $7 = '' THEN NULL ELSE $7 END) ELSE photo_path END,
       brand = CASE WHEN $8::text IS NOT NULL THEN (CASE WHEN $8 = '' THEN NULL ELSE $8 END) ELSE brand END,
       model = CASE WHEN $9::text IS NOT NULL THEN (CASE WHEN $9 = '' THEN NULL ELSE $9 END) ELSE model END,
       serial_number = CASE WHEN $10::text IS NOT NULL THEN (CASE WHEN $10 = '' THEN NULL ELSE $10 END) ELSE serial_number END,
       acquisition_cost = CASE WHEN $11::numeric IS NOT NULL THEN $11::numeric ELSE acquisition_cost END,
       acquisition_year = CASE WHEN $12::int IS NOT NULL THEN $12::int ELSE acquisition_year END,
       acquisition_date = CASE WHEN $13::date IS NOT NULL THEN $13::date ELSE acquisition_date END,
       lifespan_years = CASE WHEN $14::int IS NOT NULL THEN $14::int ELSE lifespan_years END
     WHERE id = $1
     RETURNING *`,
    [
      id,
      p.name?.trim() ?? null,
      p.category?.trim() ?? null,
      p.location?.trim() ?? null,
      p.magasin_id !== undefined ? p.magasin_id : null,
      p.observations !== undefined ? p.observations?.trim() : null,
      p.photo_path !== undefined ? p.photo_path?.trim() : null,
      p.brand !== undefined ? p.brand?.trim() : null,
      p.model !== undefined ? p.model?.trim() : null,
      p.serial_number !== undefined ? p.serial_number?.trim() : null,
      p.acquisition_cost !== undefined ? p.acquisition_cost : null,
      p.acquisition_year !== undefined ? p.acquisition_year : null,
      p.acquisition_date !== undefined ? p.acquisition_date : null,
      p.lifespan_years !== undefined ? p.lifespan_years : null,
    ],
  );
  await db.query(
    `INSERT INTO tool_events (tool_id, event_type, from_status, to_status, actor, note)
     VALUES ($1, 'correction', $2, $2, $3, $4)`,
    [id, before.status, actorName(c), p.magasin_id && p.magasin_id !== before.magasin_id ? 'Affectation de magasin modifiée' : 'Fiche outil modifiée'],
  );
  await writeAudit(db, {
    entity: 'tool',
    entityId: id,
    action: 'update',
    before,
    after: updated,
    actorId: actorId(c),
    actorName: actorName(c),
  });
  return c.json({ tool: updated });
});

toolsRoutes.post('/:id/photo', requirePerm('tools.photo_edit'), async (c) => {
  const id = c.req.param('id') ?? '';
  const body = z.object({ photo_path: z.string().nullable() }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Photo invalide.' }, 400);

  const db = getDb();
  const tool = await db.one<ToolRow>(
    'UPDATE tools SET photo_path = $2 WHERE id = $1 RETURNING *',
    [id, body.data.photo_path || null],
  );
  if (!tool) return c.json({ error: 'Outil introuvable.' }, 404);

  await writeAudit(db, {
    entity: 'tool',
    entityId: id,
    action: 'photo_update',
    actorId: actorId(c),
    actorName: actorName(c),
    after: { photo_path: body.data.photo_path },
  });
  return c.json({ ok: true, tool });
});

toolsRoutes.patch('/:id/status', requirePerm('tools.edit_status'), async (c) => {
  const body = statusBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Statut et motif obligatoires.' }, 400);
  const db = getDb();
  const id = c.req.param('id') ?? '';
  const before = await db.one<ToolRow>('SELECT * FROM tools WHERE id = $1', [id]);
  if (!before) return c.json({ error: 'Outil introuvable.' }, 404);
  if (before.status === 'en_pret') {
    return c.json({ error: 'Outil en prêt : enregistrez d’abord le retour (PRE-03).' }, 409);
  }
  if (before.status === body.data.status && before.observations === body.data.reason) {
    return c.json({ error: 'Aucun changement à enregistrer.' }, 400);
  }
  const condition =
    body.data.status === 'maintenance' ? 'a_reparer' : body.data.status === 'reforme' ? 'hors_service' : before.condition;
  const statusReason = body.data.status === 'disponible' ? null : body.data.reason.trim();
  const updated = await db.one<ToolRow>(
    'UPDATE tools SET status = $2, condition = $3, status_reason = $4 WHERE id = $1 RETURNING *',
    [id, body.data.status, condition, statusReason],
  );
  await db.query(
    `INSERT INTO tool_events (tool_id, event_type, from_status, to_status, actor, note)
     VALUES ($1, 'status', $2, $3, $4, $5)`,
    [id, before.status, body.data.status, actorName(c), body.data.reason.trim()],
  );
  await writeAudit(db, {
    entity: 'tool',
    entityId: id,
    action: 'status_change',
    before: { status: before.status, condition: before.condition },
    after: { status: updated?.status, condition: updated?.condition, reason: body.data.reason },
    actorId: actorId(c),
    actorName: actorName(c),
    reason: body.data.reason.trim(),
  });
  return c.json({ tool: updated });
});

const importToolsSchema = z.object({
  items: z.array(
    z.object({
      name: z.string().min(1),
      category: z.string().optional(),
      location: z.string().optional(),
      magasin_id: z.string().optional(),
      brand: z.string().optional(),
      model: z.string().optional(),
      serial_number: z.string().optional(),
      acquisition_cost: z.number().nullable().optional(),
      acquisition_year: z.number().nullable().optional(),
      lifespan_years: z.number().optional(),
      observations: z.string().optional(),
    }),
  ).min(1).max(1000),
  default_magasin_id: z.string().optional(),
});

toolsRoutes.post('/import', requirePerm('tools.create'), async (c) => {
  const body = importToolsSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    return c.json({ error: 'Format du fichier invalide ou vide.', details: body.error.issues }, 400);
  }

  const { items, default_magasin_id } = body.data;
  const db = getDb();
  let createdCount = 0;
  let updatedCount = 0;

  await db.transaction(async (tx) => {
    for (const item of items) {
      const cleanName = item.name.trim();
      const targetMagasin = item.magasin_id || default_magasin_id || null;
      const serial = item.serial_number?.trim() || null;

      let existing: ToolRow | null | undefined = null;
      if (serial) {
        existing = await tx.one<ToolRow>(
          'SELECT * FROM tools WHERE lower(trim(serial_number)) = lower(trim($1)) LIMIT 1',
          [serial],
        );
      }
      if (!existing) {
        existing = await tx.one<ToolRow>(
          `SELECT * FROM tools 
           WHERE lower(trim(name)) = lower(trim($1)) 
             AND (magasin_id = $2 OR (magasin_id IS NULL AND $2 IS NULL)) 
           LIMIT 1`,
          [cleanName, targetMagasin],
        );
      }

      if (existing) {
        await tx.query(
          `UPDATE tools SET
             category = coalesce($2, category),
             brand = coalesce($3, brand),
             model = coalesce($4, model),
             location = coalesce($5, location),
             acquisition_cost = coalesce($6, acquisition_cost),
             acquisition_year = coalesce($7, acquisition_year),
             lifespan_years = coalesce($8, lifespan_years),
             observations = coalesce($9, observations)
           WHERE id = $1`,
          [
            existing.id,
            item.category?.trim() || null,
            item.brand?.trim() || null,
            item.model?.trim() || null,
            item.location?.trim() || null,
            item.acquisition_cost !== undefined ? item.acquisition_cost : null,
            item.acquisition_year !== undefined ? item.acquisition_year : null,
            item.lifespan_years ?? null,
            item.observations?.trim() || null,
          ],
        );
        updatedCount += 1;
      } else {
        const cat = item.category?.trim() || 'Divers';
        const prefix = PREFIX[cat] ?? 'OTL';
        const count = await tx.one<{ count: string }>(
          'SELECT count(*) AS count FROM tools WHERE id LIKE $1',
          [`${prefix}-%`],
        );
        const seq = (Number(count?.count ?? 0) + 1).toString().padStart(3, '0');
        const id = `${prefix}-${seq}`;

        await tx.query(
          `INSERT INTO tools (id, name, category, location, magasin_id, brand, model, serial_number, acquisition_cost, acquisition_year, lifespan_years, observations, status, condition)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'disponible', 'bon_etat')`,
          [
            id,
            cleanName,
            cat,
            item.location?.trim() || 'Magasin',
            targetMagasin,
            item.brand?.trim() || null,
            item.model?.trim() || null,
            serial,
            item.acquisition_cost ?? null,
            item.acquisition_year ?? null,
            item.lifespan_years ?? 5,
            item.observations?.trim() || null,
          ],
        );
        createdCount += 1;
      }
    }

    await writeAudit(tx, {
      entity: 'tools',
      entityId: 'spreadsheet_import',
      action: 'import',
      after: { createdCount, updatedCount, total: items.length },
      actorId: actorId(c),
      actorName: actorName(c),
    });
  });

  return c.json({
    ok: true,
    createdCount,
    updatedCount,
    totalProcessed: items.length,
    message: `${createdCount} outil(s) créé(s), ${updatedCount} outil(s) mis à jour sans doublon.`,
  });
});

/* =========================================================================
   DELETION & BATCH OPERATIONS (Google Enterprise Grade)
========================================================================= */

toolsRoutes.delete('/:id', requirePerm('tools.delete'), async (c) => {
  const id = c.req.param('id') ?? '';
  const db = getDb();
  const tool = await db.one<ToolRow>('SELECT * FROM tools WHERE id = $1', [id]);
  if (!tool) return c.json({ error: 'Outil introuvable.' }, 404);
  if (tool.status === 'en_pret') {
    return c.json({ error: 'Impossible de supprimer un outil actuellement en prêt. Enregistrez d’abord son retour.' }, 409);
  }

  await db.transaction(async (tx) => {
    await tx.query('DELETE FROM tool_events WHERE tool_id = $1', [id]);
    await tx.query('DELETE FROM loans WHERE tool_id = $1', [id]);
    await tx.query('DELETE FROM tools WHERE id = $1', [id]);
    await writeAudit(tx, {
      entity: 'tool',
      entityId: id,
      action: 'delete',
      before: tool,
      actorId: actorId(c),
      actorName: actorName(c),
    });
  });

  return c.json({ ok: true, message: `Outil ${id} (${tool.name}) supprimé définitivement.` });
});

const batchDeleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
});

toolsRoutes.post('/batch-delete', requirePerm('tools.delete'), async (c) => {
  const body = batchDeleteSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Liste d’identifiants invalide.' }, 400);
  const { ids } = body.data;
  const db = getDb();

  const inLoan = await db.query<{ id: string; name: string }>(
    `SELECT id, name FROM tools WHERE id = ANY($1) AND status = 'en_pret'`,
    [ids],
  );
  if (inLoan.length > 0) {
    return c.json({
      error: `Suppression bloquée : ${inLoan.length} outil(s) en prêt (${inLoan.map((t) => t.id).join(', ')}). Enregistrez d’abord leurs retours.`,
    }, 409);
  }

  let deletedCount = 0;
  await db.transaction(async (tx) => {
    await tx.query('DELETE FROM tool_events WHERE tool_id = ANY($1)', [ids]);
    await tx.query('DELETE FROM loans WHERE tool_id = ANY($1)', [ids]);
    const res = await tx.query('DELETE FROM tools WHERE id = ANY($1) RETURNING id', [ids]);
    deletedCount = res.length;
    await writeAudit(tx, {
      entity: 'tools',
      entityId: 'batch_delete',
      action: 'delete',
      before: { ids, count: deletedCount },
      actorId: actorId(c),
      actorName: actorName(c),
    });
  });

  return c.json({ ok: true, deletedCount, message: `${deletedCount} outil(s) supprimé(s) définitivement.` });
});

const deleteAllSchema = z.object({
  confirmation: z.literal('SUPPRIMER'),
  drafts_only: z.boolean().optional(),
  magasin_id: z.string().optional(),
});

toolsRoutes.post('/delete-all', requirePerm('tools.delete'), async (c) => {
  const body = deleteAllSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Confirmation "SUPPRIMER" requise.' }, 400);

  const { drafts_only, magasin_id } = body.data;
  const db = getDb();

  let checkSql = `SELECT count(*) AS count FROM tools WHERE status = 'en_pret'`;
  const checkParams: unknown[] = [];
  if (drafts_only) {
    checkSql += ` AND (magasin_id IS NULL OR magasin_id = '')`;
  } else if (magasin_id) {
    checkParams.push(magasin_id);
    checkSql += ` AND magasin_id = $1`;
  }
  const inLoan = await db.one<{ count: string }>(checkSql, checkParams);
  if (Number(inLoan?.count ?? 0) > 0) {
    return c.json({ error: 'Certains outils de ce périmètre sont en prêt. Enregistrez leurs retours avant suppression globale.' }, 409);
  }

  let targetSql = `SELECT id FROM tools WHERE 1=1`;
  const targetParams: unknown[] = [];
  if (drafts_only) {
    targetSql += ` AND (magasin_id IS NULL OR magasin_id = '')`;
  } else if (magasin_id) {
    targetParams.push(magasin_id);
    targetSql += ` AND magasin_id = $1`;
  }

  let deletedCount = 0;
  await db.transaction(async (tx) => {
    const rows = await tx.query<{ id: string }>(targetSql, targetParams);
    const ids = rows.map((r) => r.id);
    if (ids.length > 0) {
      await tx.query('DELETE FROM tool_events WHERE tool_id = ANY($1)', [ids]);
      await tx.query('DELETE FROM loans WHERE tool_id = ANY($1)', [ids]);
      await tx.query('DELETE FROM tools WHERE id = ANY($1)', [ids]);
      deletedCount = ids.length;
    }
    await writeAudit(tx, {
      entity: 'tools',
      entityId: 'delete_all',
      action: 'delete',
      before: { drafts_only, magasin_id, count: deletedCount },
      actorId: actorId(c),
      actorName: actorName(c),
    });
  });

  return c.json({ ok: true, deletedCount, message: `${deletedCount} outil(s) supprimé(s).` });
});

const batchTransferSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
  magasin_id: z.string().nullable().optional(),
});

toolsRoutes.post('/batch-transfer', requirePerm('tools.edit'), async (c) => {
  const body = batchTransferSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Données de transfert invalides.' }, 400);

  const { ids, magasin_id } = body.data;
  const db = getDb();
  const targetMagasin = magasin_id?.trim() || null;

  let magName = '📁 Brouillon / Non affecté';
  let magLocation = 'En attente';
  if (targetMagasin) {
    const mag = await db.one<{ name: string }>('SELECT name FROM magasins WHERE id = $1', [targetMagasin]);
    if (!mag) return c.json({ error: 'Magasin de destination introuvable.' }, 404);
    magName = mag.name;
    magLocation = mag.name;
  }

  await db.transaction(async (tx) => {
    await tx.query(
      `UPDATE tools 
       SET magasin_id = $2,
           location = $3
       WHERE id = ANY($1)`,
      [ids, targetMagasin, magLocation],
    );

    for (const toolId of ids) {
      await tx.query(
        `INSERT INTO tool_events (tool_id, event_type, from_status, to_status, actor, note)
         VALUES ($1, 'transfert', 'disponible', 'disponible', $2, $3)`,
        [toolId, actorName(c), `Affectation/Transfert vers : ${magName}`],
      );
    }

    await writeAudit(tx, {
      entity: 'tools',
      entityId: 'batch_transfer',
      action: 'update',
      after: { ids, targetMagasin, magName },
      actorId: actorId(c),
      actorName: actorName(c),
    });
  });

  return c.json({
    ok: true,
    count: ids.length,
    message: `${ids.length} outil(s) affecté(s) / transféré(s) avec succès vers ${magName}.`,
  });
});

export async function logToolEvent(c: Context, toolId: string, type: string, from: ToolStatus | null, to: ToolStatus, note: string) {
  await getDb().query(
    `INSERT INTO tool_events (tool_id, event_type, from_status, to_status, actor, note)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [toolId, type, from, to, actorName(c), note],
  );
}
