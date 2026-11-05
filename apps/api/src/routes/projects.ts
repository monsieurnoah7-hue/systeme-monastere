import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { writeAudit } from '../lib/audit.js';
import { actorId, actorName, requireAuth } from '../middleware/auth.js';
import { requirePerm } from '../middleware/permissions.js';

export const projectsRoutes = new Hono();

export type ProjectRow = {
  id: string;
  code: string;
  title: string;
  client_name: string;
  site_location: string;
  category: string | null;
  assigned_worker_ids: string[];
  assigned_worker_names: string[];
  budget_hours: number;
  spent_hours: number;
  hourly_rate_fcfa: number;
  penalty_rate_daily_fcfa: number;
  ratio_value: number | null;
  ratio_unit: string | null;
  ratio_basis: string | null;
  ratio_quantity: number | null;
  delivery_deadline: string;
  installation_start_date?: string | null;
  installation_days: number;
  status: 'planifie' | 'en_fabrication' | 'en_pose' | 'termine' | 'en_retard' | 'litige';
  notes?: string | null;
  created_at: string;
  updated_at: string;
  // Computed metrics (PDF Pt 1 & 2)
  is_delayed?: boolean;
  delayed_days?: number;
  days_to_deadline?: number;
  overtime_hours?: number;
  overtime_cost_fcfa?: number;
  penalties_cost_fcfa?: number;
  financial_damage_fcfa?: number;
  hours_progress_pct?: number;
};

function computeProjectMetrics(p: ProjectRow): ProjectRow {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const deadline = new Date(p.delivery_deadline);
  deadline.setHours(0, 0, 0, 0);

  const diffMs = deadline.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  p.days_to_deadline = diffDays;

  // Calcul du retard de livraison
  const isOverdue = diffDays < 0 && p.status !== 'termine';
  p.is_delayed = isOverdue;
  p.delayed_days = isOverdue ? Math.abs(diffDays) : 0;

  // Décompte / compte à rebours des heures supplémentaires dès dépassement
  const budget = Number(p.budget_hours) || 0;
  const spent = Number(p.spent_hours) || 0;
  const hourlyRate = Number(p.hourly_rate_fcfa) || 0;
  const dailyPenalty = Number(p.penalty_rate_daily_fcfa) || 0;

  const overtime = Math.max(0, spent - budget);
  p.overtime_hours = overtime;
  p.overtime_cost_fcfa = overtime * hourlyRate;
  p.penalties_cost_fcfa = (p.delayed_days || 0) * dailyPenalty;

  // Préjudice financier total (Heures sup + Pénalités de retard)
  p.financial_damage_fcfa = p.overtime_cost_fcfa + p.penalties_cost_fcfa;
  p.hours_progress_pct = budget > 0 ? Math.min(200, Math.round((spent / budget) * 100)) : 0;

  // Mise à jour automatique de statut si en retard et pas encore marqué en_pose/termine
  if (isOverdue && p.status === 'en_fabrication') {
    p.status = 'en_retard';
  }

  return p;
}

// -------------------------------------------------------------------------
// CRUD Routes
// -------------------------------------------------------------------------
const projectBody = z.object({
  code: z.string().min(2, 'Code de commande requis'),
  title: z.string().min(3, 'Intitulé du projet requis'),
  client_name: z.string().min(2, 'Nom du client requis'),
  site_location: z.string().trim().min(1, 'Lieu du chantier requis'),
  category: z.string().trim().max(120).nullable().optional(),
  assigned_worker_ids: z.array(z.string()).default([]),
  assigned_worker_names: z.array(z.string()).default([]),
  budget_hours: z.number().min(0).default(0),
  spent_hours: z.number().min(0).default(0),
  hourly_rate_fcfa: z.number().min(0).default(0),
  penalty_rate_daily_fcfa: z.number().min(0).default(0),
  ratio_value: z.number().min(0).nullable().optional(),
  ratio_unit: z.string().trim().max(80).nullable().optional(),
  ratio_basis: z.string().trim().max(160).nullable().optional(),
  ratio_quantity: z.number().positive().nullable().optional(),
  delivery_deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format date requis: AAAA-MM-JJ'),
  installation_start_date: z.string().nullable().optional(),
  installation_days: z.number().min(0).default(0),
  status: z.enum(['planifie', 'en_fabrication', 'en_pose', 'termine', 'en_retard', 'litige']).default('planifie'),
  notes: z.string().nullable().optional(),
});

projectsRoutes.get('/', requireAuth, requirePerm('projects.view'), async (c) => {
  const db = getDb();
  const rows = await db.query<ProjectRow>(`
    SELECT id, code, title, client_name, site_location, category,
           assigned_worker_ids, assigned_worker_names,
           budget_hours, spent_hours, hourly_rate_fcfa, penalty_rate_daily_fcfa,
           ratio_value, ratio_unit, ratio_basis, ratio_quantity,
           delivery_deadline::text AS delivery_deadline,
           installation_start_date::text AS installation_start_date,
           installation_days, status, notes,
           created_at::text AS created_at, updated_at::text AS updated_at
    FROM projects
    ORDER BY delivery_deadline ASC
  `);

  const projects = rows.map(computeProjectMetrics);

  // Synthèse financière & délais pour la Direction
  const delayedProjects = projects.filter((p) => p.is_delayed);
  const totalFinancialDamage = projects.reduce((acc, p) => acc + (p.financial_damage_fcfa || 0), 0);
  const totalOvertimeHours = projects.reduce((acc, p) => acc + (p.overtime_hours || 0), 0);

  return c.json({
    projects,
    summary: {
      total_count: projects.length,
      active_count: projects.filter((p) => p.status !== 'termine').length,
      delayed_count: delayedProjects.length,
      total_overtime_hours: totalOvertimeHours,
      total_financial_damage_fcfa: totalFinancialDamage,
    },
  });
});

projectsRoutes.post('/', requireAuth, requirePerm('projects.create'), async (c) => {
  const body = projectBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    return c.json({ error: body.error.issues[0]?.message || 'Données invalides.' }, 400);
  }
  const db = getDb();
  const d = body.data;
  const id = `prj-${Date.now()}`;

  const normalizedCode = d.code.trim().toUpperCase();
  const ratioStarted = d.ratio_value != null || Boolean(d.ratio_unit?.trim()) || d.ratio_quantity != null;
  if (ratioStarted && (d.ratio_value == null || !d.ratio_unit?.trim() || !d.ratio_quantity || d.ratio_quantity <= 0)) {
    return c.json({ error: 'Pour calculer le budget, indiquez le temps par unité, le nom de l’unité et la quantité.' }, 400);
  }
  const budgetHours = ratioStarted ? d.ratio_value! * d.ratio_quantity! : d.budget_hours;
  const duplicate = await db.one<{ id: string }>(
    'SELECT id FROM projects WHERE upper(code) = $1 LIMIT 1',
    [normalizedCode],
  );
  if (duplicate) {
    return c.json({ error: `Le code ${normalizedCode} est déjà utilisé. Choisissez un autre code.` }, 409);
  }

  const row = await db.transaction(async (tx) => {
    const created = await tx.one<ProjectRow>(`
      INSERT INTO projects (
        id, code, title, client_name, site_location, category,
        assigned_worker_ids, assigned_worker_names, budget_hours, spent_hours,
        hourly_rate_fcfa, penalty_rate_daily_fcfa, ratio_value, ratio_unit, ratio_basis, ratio_quantity, delivery_deadline,
        installation_start_date, installation_days, status, notes
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21
      )
      RETURNING id, code, title, client_name, site_location, category,
                assigned_worker_ids, assigned_worker_names,
                budget_hours, spent_hours, hourly_rate_fcfa, penalty_rate_daily_fcfa,
                ratio_value, ratio_unit, ratio_basis, ratio_quantity,
                delivery_deadline::text AS delivery_deadline,
                installation_start_date::text AS installation_start_date,
                installation_days, status, notes,
                created_at::text AS created_at, updated_at::text AS updated_at
    `, [
      id, normalizedCode, d.title.trim(), d.client_name.trim(), d.site_location.trim(), d.category ?? null,
      d.assigned_worker_ids, d.assigned_worker_names, budgetHours, d.spent_hours,
      d.hourly_rate_fcfa, d.penalty_rate_daily_fcfa, d.ratio_value ?? null, d.ratio_unit || null, d.ratio_basis || null,
      d.ratio_quantity ?? null, d.delivery_deadline, d.installation_start_date || null, d.installation_days, d.status, d.notes || null,
    ]);
    if (!created) throw new Error('La commande n’a pas pu être enregistrée.');

    await writeAudit(tx, {
      entity: 'project',
      entityId: id,
      action: 'create',
      after: created,
      actorId: actorId(c),
      actorName: actorName(c) || 'Utilisateur',
      reason: `Création commande projet ${normalizedCode} (${d.title.trim()})`,
    });
    return created;
  });

  return c.json({ project: computeProjectMetrics(row) }, 201);
});

projectsRoutes.patch('/:id', requireAuth, requirePerm('projects.edit'), async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Id requis.' }, 400);

  const body = projectBody.partial().safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    return c.json({ error: body.error.issues[0]?.message || 'Données invalides.' }, 400);
  }
  const db = getDb();
  const existing = await db.one<ProjectRow>('SELECT * FROM projects WHERE id = $1', [id]);
  if (!existing) return c.json({ error: 'Projet introuvable.' }, 404);

  const d = body.data;
  const hasField = (field: string) => Object.prototype.hasOwnProperty.call(d, field);
  const ratioTouched = hasField('ratio_value') || hasField('ratio_unit') || hasField('ratio_quantity');
  const nextRatioValue = hasField('ratio_value') ? d.ratio_value : existing.ratio_value;
  const nextRatioUnit = hasField('ratio_unit') ? d.ratio_unit : existing.ratio_unit;
  const nextRatioQuantity = hasField('ratio_quantity') ? d.ratio_quantity : existing.ratio_quantity;
  const ratioStarted = nextRatioValue != null || Boolean(nextRatioUnit?.trim()) || nextRatioQuantity != null;
  if (ratioTouched && ratioStarted && (nextRatioValue == null || !nextRatioUnit?.trim() || !nextRatioQuantity || nextRatioQuantity <= 0)) {
    return c.json({ error: 'Pour calculer le budget, indiquez le temps par unité, le nom de l’unité et la quantité.' }, 400);
  }
  const calculatedBudget = ratioStarted && nextRatioValue != null && nextRatioUnit?.trim() && nextRatioQuantity
    ? nextRatioValue * nextRatioQuantity
    : null;
  const row = await db.one<ProjectRow>(`
    UPDATE projects SET
      code = COALESCE($2, code),
      title = COALESCE($3, title),
      client_name = COALESCE($4, client_name),
      site_location = COALESCE($5, site_location),
      category = CASE WHEN $21::boolean THEN $6::text ELSE category END,
      assigned_worker_ids = COALESCE($7, assigned_worker_ids),
      assigned_worker_names = COALESCE($8, assigned_worker_names),
      budget_hours = CASE WHEN $29::boolean THEN $30::numeric ELSE COALESCE($9, budget_hours) END,
      spent_hours = COALESCE($10, spent_hours),
      hourly_rate_fcfa = COALESCE($11, hourly_rate_fcfa),
      penalty_rate_daily_fcfa = COALESCE($12, penalty_rate_daily_fcfa),
      ratio_value = CASE WHEN $22::boolean THEN $13::numeric ELSE ratio_value END,
      ratio_unit = CASE WHEN $23::boolean THEN $14::text ELSE ratio_unit END,
      ratio_basis = CASE WHEN $24::boolean THEN $15::text ELSE ratio_basis END,
      ratio_quantity = CASE WHEN $27::boolean THEN $28::numeric ELSE ratio_quantity END,
      delivery_deadline = CASE WHEN $16::date IS NOT NULL THEN $16::date ELSE delivery_deadline END,
      installation_start_date = CASE WHEN $25::boolean THEN $17::date ELSE installation_start_date END,
      installation_days = COALESCE($18, installation_days),
      status = COALESCE($19, status),
      notes = CASE WHEN $26::boolean THEN $20::text ELSE notes END,
      updated_at = now()
    WHERE id = $1
    RETURNING id, code, title, client_name, site_location, category,
              assigned_worker_ids, assigned_worker_names,
              budget_hours, spent_hours, hourly_rate_fcfa, penalty_rate_daily_fcfa,
              ratio_value, ratio_unit, ratio_basis, ratio_quantity,
              delivery_deadline::text AS delivery_deadline,
              installation_start_date::text AS installation_start_date,
              installation_days, status, notes,
              created_at::text AS created_at, updated_at::text AS updated_at
  `, [
    id,
    d.code ? d.code.trim().toUpperCase() : null,
    d.title?.trim() || null,
    d.client_name?.trim() || null,
    d.site_location?.trim() || null,
    d.category || null,
    d.assigned_worker_ids || null,
    d.assigned_worker_names || null,
    d.budget_hours,
    d.spent_hours,
    d.hourly_rate_fcfa,
    d.penalty_rate_daily_fcfa,
    d.ratio_value,
    d.ratio_unit?.trim() || null,
    d.ratio_basis?.trim() || null,
    d.delivery_deadline || null,
    d.installation_start_date || null,
    d.installation_days,
    d.status || null,
    d.notes,
    hasField('category'),
    hasField('ratio_value'),
    hasField('ratio_unit'),
    hasField('ratio_basis'),
    hasField('installation_start_date'),
    hasField('notes'),
    hasField('ratio_quantity'),
    d.ratio_quantity,
    calculatedBudget !== null,
    calculatedBudget,
  ]);

  await writeAudit(db, {
    entity: 'project',
    entityId: id,
    action: 'update',
    before: existing,
    after: row,
    actorId: actorId(c),
    actorName: actorName(c) || 'Utilisateur',
    reason: `Mise à jour projet ${row?.code}`,
  });

  return c.json({ project: computeProjectMetrics(row!) });
});

projectsRoutes.delete('/:id', requireAuth, requirePerm('projects.delete'), async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Id requis.' }, 400);

  const db = getDb();
  const existing = await db.one<ProjectRow>('SELECT * FROM projects WHERE id = $1', [id]);
  if (!existing) return c.json({ error: 'Projet introuvable.' }, 404);

  await db.query('DELETE FROM projects WHERE id = $1', [id]);
  await writeAudit(db, {
    entity: 'project',
    entityId: id,
    action: 'delete',
    before: existing,
    actorId: actorId(c),
    actorName: actorName(c) || 'Utilisateur',
    reason: `Suppression projet ${existing.code}`,
  });

  return c.json({ ok: true });
});
