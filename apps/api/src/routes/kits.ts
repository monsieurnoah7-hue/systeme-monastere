import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { requireAuth, actorName, actorId } from '../middleware/auth.js';
import { requirePerm } from '../middleware/permissions.js';
import { writeAudit } from '../lib/audit.js';

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
     WHERE k.id = $1 OR k.code = $1 OR k.employee_id = $1
     GROUP BY k.id, e.full_name, e.job_title, e.photo_path, m.name, m.code
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
  `, [employeeId]);

  if (!kit) return c.json({ kit: null, items: [] });

  const items = await db.query<EtabliKitItemRow>(`
    SELECT * FROM etabli_kit_items
     WHERE kit_id = $1
     ORDER BY item_num ASC
  `, [kit.id]);

  return c.json({ kit, items });
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
