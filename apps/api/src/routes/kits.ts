import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { requireAuth, actorName, actorId } from '../middleware/auth.js';
import { requirePerm } from '../middleware/permissions.js';
import { writeAudit } from '../lib/audit.js';
import { canAccessStore } from '../lib/store-access.js';

export const kitsRoutes = new Hono();

kitsRoutes.use('*', requireAuth);

export interface EtabliKitRow {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_job: string;
  employee_photo: string | null;
  etabli_number: number;
  code: string;
  location: string;
  source_magasin_id: string;
  source_magasin_name: string;
  source_magasin_code: string;
  status: string;
  notes: string | null;
  last_audited_at: string | null;
  last_audited_by: string | null;
  last_audit_status: string | null;
  created_at: string;
  items_total: number;
  items_present: number;
  items_anomalies: number;
}

export interface EtabliKitItemRow {
  id: number;
  kit_id: string;
  item_num: number;
  name: string;
  qty: number;
  unit: string;
  tool_code: string;
  condition: string;
  is_present: boolean;
  notes: string | null;
  updated_at: string;
}

// 1. Liste de tous les kits d'établis
kitsRoutes.get('/', requirePerm('employees.view'), async (c) => {
  const db = getDb();
  const rows = await db.query<EtabliKitRow>(`
    SELECT k.*,
           e.full_name AS employee_name,
           e.job_title AS employee_job,
           e.photo_path AS employee_photo,
           m.name AS source_magasin_name,
           m.code AS source_magasin_code,
           COUNT(i.id)::int AS items_total,
           COUNT(CASE WHEN i.is_present = true AND i.condition = 'bon' THEN 1 END)::int AS items_present,
           COUNT(CASE WHEN i.is_present = false OR i.condition != 'bon' THEN 1 END)::int AS items_anomalies
      FROM etabli_kits k
      JOIN employees e ON e.id = k.employee_id
      JOIN magasins m ON m.id = k.source_magasin_id
      LEFT JOIN etabli_kit_items i ON i.kit_id = k.id
     GROUP BY k.id, e.full_name, e.job_title, e.photo_path, m.name, m.code
    HAVING COUNT(i.id) > 0
     ORDER BY k.etabli_number ASC
  `);
  return c.json({ kits: rows });
});

// 2. Détail d'un kit par ID ou par Code
kitsRoutes.get('/:id', requirePerm('employees.view'), async (c) => {
  const param = c.req.param('id');
  const db = getDb();

  const kit = await db.one<EtabliKitRow>(`
    SELECT k.*,
           e.full_name AS employee_name,
           e.job_title AS employee_job,
           e.photo_path AS employee_photo,
           m.name AS source_magasin_name,
           m.code AS source_magasin_code,
           COUNT(i.id)::int AS items_total,
           COUNT(CASE WHEN i.is_present = true AND i.condition = 'bon' THEN 1 END)::int AS items_present,
           COUNT(CASE WHEN i.is_present = false OR i.condition != 'bon' THEN 1 END)::int AS items_anomalies
      FROM etabli_kits k
      JOIN employees e ON e.id = k.employee_id
      JOIN magasins m ON m.id = k.source_magasin_id
      LEFT JOIN etabli_kit_items i ON i.kit_id = k.id
     WHERE (k.id = $1 OR k.code = $1 OR k.employee_id = $1)
     GROUP BY k.id, e.full_name, e.job_title, e.photo_path, m.name, m.code
    HAVING COUNT(i.id) > 0
  `, [param]);

  if (!kit) return c.json({ error: 'Kit introuvable.' }, 404);

  const items = await db.query<EtabliKitItemRow>(`
    SELECT * FROM etabli_kit_items
     WHERE kit_id = $1
     ORDER BY item_num ASC
  `, [kit.id]);

  const audits = await db.query(`
    SELECT * FROM etabli_kit_audits
     WHERE kit_id = $1
     ORDER BY audited_at DESC
     LIMIT 10
  `, [kit.id]);

  return c.json({ kit, items, audits });
});

// 3. Récupérer le kit d'un travailleur spécifique
kitsRoutes.get('/by-employee/:employeeId', requirePerm('employees.view'), async (c) => {
  const employeeId = c.req.param('employeeId');
  const db = getDb();

  const kit = await db.one<EtabliKitRow>(`
    SELECT k.*,
           e.full_name AS employee_name,
           e.job_title AS employee_job,
           e.photo_path AS employee_photo,
           m.name AS source_magasin_name,
           m.code AS source_magasin_code,
           COUNT(i.id)::int AS items_total,
           COUNT(CASE WHEN i.is_present = true AND i.condition = 'bon' THEN 1 END)::int AS items_present,
           COUNT(CASE WHEN i.is_present = false OR i.condition != 'bon' THEN 1 END)::int AS items_anomalies
      FROM etabli_kits k
      JOIN employees e ON e.id = k.employee_id
      JOIN magasins m ON m.id = k.source_magasin_id
      LEFT JOIN etabli_kit_items i ON i.kit_id = k.id
     WHERE k.employee_id = $1
     GROUP BY k.id, e.full_name, e.job_title, e.photo_path, m.name, m.code
    HAVING COUNT(i.id) > 0
  `, [employeeId]);

  if (!kit) return c.json({ kit: null, items: [] });

  const items = await db.query<EtabliKitItemRow>(`
    SELECT * FROM etabli_kit_items
     WHERE kit_id = $1
     ORDER BY item_num ASC
  `, [kit.id]);

  return c.json({ kit, items });
});

const createKitItemSchema = z.object({
  name: z.string().trim().min(2).max(120),
  qty: z.number().int().min(1).max(1000).default(1),
  unit: z.string().trim().min(1).max(24).default('pièce'),
  notes: z.string().trim().max(500).optional(),
});

const createFirstKitItemSchema = createKitItemSchema.extend({
  source_magasin_id: z.string().trim().min(1).max(40),
  location: z.string().trim().max(120).optional(),
});

// Créer la dotation initiale d'un travailleur : le premier outil et l'établi
// sont enregistrés ensemble, avec numéro et QR uniques.
kitsRoutes.post('/by-employee/:employeeId/items', requirePerm('tools.create'), async (c) => {
  const employeeId = c.req.param('employeeId');
  const parsed = createFirstKitItemSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'Renseignez l’outil et son magasin de rattachement.' }, 400);
  const body = parsed.data;
  const db = getDb();
  const auth = c.get('auth');
  if (!await canAccessStore(auth.user.id, body.source_magasin_id, 'can_view')) {
    return c.json({ error: 'Vous n’êtes pas autorisé à affecter un établi à ce magasin.' }, 403);
  }

  const result = await db.transaction(async (tx) => {
    const employee = await tx.one<{ id: string; full_name: string; active: boolean }>(
      'SELECT id, full_name, active FROM employees WHERE id = $1 FOR UPDATE',
      [employeeId],
    );
    if (!employee) return { error: 'Travailleur introuvable.' as const };
    if (!employee.active) return { error: 'Impossible de créer un établi pour un travailleur inactif.' as const };

    const store = await tx.one<{ id: string; name: string; active: boolean }>(
      'SELECT id, name, active FROM magasins WHERE id = $1',
      [body.source_magasin_id],
    );
    if (!store || !store.active) return { error: 'Magasin introuvable ou inactif.' as const };

    const existingKit = await tx.one<{ id: string }>(
      `SELECT k.id FROM etabli_kits k
        WHERE k.employee_id = $1
          AND EXISTS (SELECT 1 FROM etabli_kit_items i WHERE i.kit_id = k.id)
        ORDER BY k.created_at DESC LIMIT 1 FOR UPDATE`,
      [employeeId],
    );
    if (existingKit) return { error: 'Ce travailleur possède déjà un établi. Actualisez sa fiche avant d’ajouter l’outil.' as const };

    const numberRow = await tx.one<{ number: number }>("SELECT nextval('etabli_number_seq')::int AS number");
    const number = numberRow?.number;
    if (!number) throw new Error('Numéro d’établi indisponible.');
    const numberLabel = String(number).padStart(3, '0');
    const code = `ETB-${numberLabel}`;
    const kitId = `KIT-${code}`;
    const location = body.location?.trim() || `${store.name} — Établi N° ${number}`;

    const kit = await tx.one<{ id: string; employee_id: string; etabli_number: number; code: string; location: string; source_magasin_id: string; status: string }>(`
      INSERT INTO etabli_kits (id, employee_id, etabli_number, code, location, source_magasin_id, status, notes)
      VALUES ($1, $2, $3, $4, $5, $6, 'actif', $7)
      RETURNING id, employee_id, etabli_number, code, location, source_magasin_id, status
    `, [kitId, employee.id, number, code, location, store.id, `Établi créé lors de l’ajout du premier outil pour ${employee.full_name}.`]);

    const item = await tx.one<EtabliKitItemRow>(`
      INSERT INTO etabli_kit_items (kit_id, item_num, name, qty, unit, tool_code, condition, is_present, notes)
      VALUES ($1, 1, $2, $3, $4, $5, 'bon', true, $6)
      RETURNING *
    `, [kitId, body.name, body.qty, body.unit, `CFTM-${code}-IT-001`, body.notes ?? null]);

    await writeAudit(tx, {
      action: 'etabli_kit.create_with_first_item',
      entity: 'etabli_kit',
      entityId: kitId,
      after: { kit, item },
      actorId: actorId(c),
      actorName: actorName(c),
    });
    return { kit, item };
  });

  if ('error' in result) return c.json({ error: result.error }, result.error === 'Travailleur introuvable.' ? 404 : 409);
  return c.json(result, 201);
});

// Ajouter une dotation physique à un seul établi. Le code QR est stable et propre au kit.
kitsRoutes.post('/:id/items', requirePerm('tools.create'), async (c) => {
  const kitId = c.req.param('id');
  const body = createKitItemSchema.parse(await c.req.json());
  const db = getDb();

  const result = await db.transaction(async (tx) => {
    const kit = await tx.one<{ id: string; code: string }>(
      'SELECT id, code FROM etabli_kits WHERE id = $1 FOR UPDATE',
      [kitId],
    );
    if (!kit) return { item: null, duplicateBag: false };

    const isBag = body.name.toLocaleLowerCase('fr').replace(/\s+/g, ' ') === 'sac de chantier';
    if (isBag) {
      const existingBag = await tx.one<{ id: number }>(
        `SELECT id FROM etabli_kit_items WHERE kit_id = $1 AND lower(name) = lower('Sac de chantier') LIMIT 1`,
        [kitId],
      );
      if (existingBag) return { item: null, duplicateBag: true };
    }

    const last = await tx.one<{ item_num: number }>(
      'SELECT COALESCE(MAX(item_num), 0)::int AS item_num FROM etabli_kit_items WHERE kit_id = $1',
      [kitId],
    );
    const itemNum = (last?.item_num ?? 0) + 1;
    const toolCode = `CFTM-${kit.code}-IT-${String(itemNum).padStart(3, '0')}`;
    const created = await tx.one<EtabliKitItemRow>(`
      INSERT INTO etabli_kit_items (kit_id, item_num, name, qty, unit, tool_code, condition, is_present, notes)
      VALUES ($1, $2, $3, $4, $5, $6, 'bon', true, $7)
      RETURNING *
    `, [kitId, itemNum, body.name, body.qty, body.unit, toolCode, body.notes ?? null]);

    await writeAudit(tx, {
      action: 'etabli_kit.item_create',
      entity: 'etabli_kit_item',
      entityId: String(created?.id ?? ''),
      after: created,
      actorId: actorId(c),
      actorName: actorName(c),
    });
    return { item: created, duplicateBag: false };
  });

  if (result.duplicateBag) return c.json({ error: 'Cet établi possède déjà son sac de chantier.' }, 409);
  if (!result.item) return c.json({ error: 'Établi introuvable.' }, 404);
  return c.json({ item: result.item }, 201);
});

// 4. Mettre à jour l'état d'un outil individuel du kit (Signalement / Remplacement / Restitution)
const updateItemSchema = z.object({
  condition: z.enum(['bon', 'a_affuter', 'a_reparer', 'manquant', 'reforme']).optional(),
  is_present: z.boolean().optional(),
  notes: z.string().optional(),
});

kitsRoutes.patch('/items/:id', requirePerm('tools.edit_status'), async (c) => {
  const id = Number(c.req.param('id'));
  const body = updateItemSchema.parse(await c.req.json());
  const db = getDb();

  const current = await db.one<EtabliKitItemRow>(`SELECT * FROM etabli_kit_items WHERE id = $1`, [id]);
  if (!current) return c.json({ error: 'Outil introuvable dans le kit.' }, 404);

  const updated = await db.one<EtabliKitItemRow>(`
    UPDATE etabli_kit_items
       SET condition = COALESCE($1, condition),
           is_present = COALESCE($2, is_present),
           notes = COALESCE($3, notes),
           updated_at = now()
     WHERE id = $4
    RETURNING *
  `, [body.condition ?? null, body.is_present ?? null, body.notes ?? null, id]);

  await writeAudit(db, {
    action: 'etabli_kit.item_update',
    entity: 'etabli_kit_item',
    entityId: String(id),
    before: current,
    after: updated,
    actorId: actorId(c),
    actorName: actorName(c),
  });

  return c.json({ item: updated });
});

// Retirer définitivement une dotation d'établi. Le droit tools.delete est
// vérifié côté serveur et la suppression est inscrite dans le journal d'audit.
kitsRoutes.delete('/items/:id', requirePerm('tools.delete'), async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isSafeInteger(id) || id <= 0) return c.json({ error: 'Identifiant d’outil invalide.' }, 400);
  const db = getDb();
  const deleted = await db.transaction(async (tx) => {
    const current = await tx.one<EtabliKitItemRow>(
      'SELECT * FROM etabli_kit_items WHERE id = $1 FOR UPDATE',
      [id],
    );
    if (!current) return null;
    const kit = await tx.one<{ id: string; employee_id: string; code: string; etabli_number: number }>(
      'SELECT id, employee_id, code, etabli_number FROM etabli_kits WHERE id = $1 FOR UPDATE',
      [current.kit_id],
    );
    await tx.query('DELETE FROM etabli_kit_items WHERE id = $1', [id]);
    await writeAudit(tx, {
      action: 'etabli_kit.item_delete',
      entity: 'etabli_kit_item',
      entityId: String(id),
      before: current,
      after: null,
      actorId: actorId(c),
      actorName: actorName(c),
    });
    const remaining = await tx.one<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM etabli_kit_items WHERE kit_id = $1',
      [current.kit_id],
    );
    const kitRemoved = Boolean(kit && (remaining?.count ?? 0) === 0);
    if (kitRemoved && kit) {
      await writeAudit(tx, {
        action: 'etabli_kit.delete_empty',
        entity: 'etabli_kit',
        entityId: kit.id,
        before: kit,
        after: null,
        actorId: actorId(c),
        actorName: actorName(c),
      });
      await tx.query('DELETE FROM etabli_kits WHERE id = $1', [kit.id]);
    }
    return { item: current, kitRemoved };
  });
  if (!deleted) return c.json({ error: 'Outil introuvable dans cet établi.' }, 404);
  return c.json({ ok: true, item: deleted.item, kitRemoved: deleted.kitRemoved });
});

// 5. Exécuter un "Contrôle Inopiné / Flash Audit" de l'établi
const auditSchema = z.object({
  status: z.enum(['conforme', 'anomalie', 'incomplet']),
  anomalies_note: z.string().optional(),
  items_status: z.array(z.object({
    id: z.number(),
    is_present: z.boolean(),
    condition: z.enum(['bon', 'a_affuter', 'a_reparer', 'manquant', 'reforme']),
  })).optional(),
});

kitsRoutes.post('/:id/audit', requirePerm('tools.edit_status'), async (c) => {
  const kitId = c.req.param('id');
  const body = auditSchema.parse(await c.req.json());
  const db = getDb();
  const auditor = actorName(c);

  const kit = await db.one(`SELECT * FROM etabli_kits WHERE id = $1`, [kitId]);
  if (!kit) return c.json({ error: 'Kit introuvable.' }, 404);

  // Mettre à jour les statuts des items si fournis
  if (body.items_status && body.items_status.length > 0) {
    for (const it of body.items_status) {
      await db.query(`
        UPDATE etabli_kit_items
           SET is_present = $1, condition = $2, updated_at = now()
         WHERE id = $3 AND kit_id = $4
      `, [it.is_present, it.condition, it.id, kitId]);
    }
  }

  // Calculer les compteurs
  const counts = await db.one<{ total: number; present: number }>(`
    SELECT COUNT(*)::int AS total,
           COUNT(CASE WHEN is_present = true AND condition = 'bon' THEN 1 END)::int AS present
      FROM etabli_kit_items
     WHERE kit_id = $1
  `, [kitId]);

  const itemsTotal = counts?.total ?? 0;
  const itemsPresent = counts?.present ?? 0;

  // Enregistrer l'audit
  const audit = await db.one(`
    INSERT INTO etabli_kit_audits (kit_id, audited_by, auditor_name, status, items_present_count, items_total_count, anomalies_note)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `, [kitId, String(actorId(c) ?? '0'), auditor, body.status, itemsPresent, itemsTotal, body.anomalies_note || null]);

  // Mettre à jour l'établi
  await db.query(`
    UPDATE etabli_kits
       SET last_audited_at = now(),
           last_audited_by = $1,
           last_audit_status = $2
     WHERE id = $3
  `, [auditor, body.status, kitId]);

  await writeAudit(db, {
    action: 'etabli_kit.audit',
    entity: 'etabli_kit',
    entityId: kitId ?? '',
    after: { status: body.status, items_present: itemsPresent, items_total: itemsTotal },
    actorId: actorId(c),
    actorName: auditor,
  });

  return c.json({ audit, success: true });
});
