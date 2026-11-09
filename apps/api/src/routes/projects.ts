import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { writeAudit } from '../lib/audit.js';
import { actorId, actorName, requireAuth } from '../middleware/auth.js';
import { hasPermission, requirePerm } from '../middleware/permissions.js';
import { DEFAULT_PERMISSIONS } from '../lib/permissions.js';
import { randomUUID } from 'node:crypto';
import { withOfflineIdempotency } from '../lib/offline-idempotency.js';

type WorkPlanEntry = { employee_id: string; weekday: number; planned_hours: number };

export const projectsRoutes = new Hono();

export type ProjectRow = {
  id: string;
  code: string;
  title: string | null;
  client_name: string | null;
  site_location: string | null;
  category: string | null;
  start_date: string | null;
  work_plan: WorkPlanEntry[];
  assigned_worker_ids: string[];
  assigned_worker_names: string[];
  budget_hours: number;
  spent_hours: number;
  hourly_rate_fcfa: number;
  penalty_rate_daily_fcfa: number | null;
  ratio_value: number | null;
  ratio_unit: string | null;
  ratio_basis: string | null;
  ratio_quantity: number | null;
  ratio_deadline: string | null;
  delivery_deadline: string | null;
  installation_start_date?: string | null;
  installation_days: number;
  status: 'planifie' | 'en_fabrication' | 'en_pose' | 'termine' | 'en_retard' | 'litige';
  notes?: string | null;
  created_at: string;
  updated_at: string;
  // Computed metrics (PDF Pt 1 & 2)
  is_delayed?: boolean;
  delayed_days?: number;
  days_to_deadline?: number | null;
  overtime_hours?: number;
  overtime_cost_fcfa?: number;
  penalties_cost_fcfa?: number;
  financial_damage_fcfa?: number;
  hours_progress_pct?: number;
  ratio_delayed_workdays?: number;
  planned_weekly_hours?: number;
  planned_completion_date?: string | null;
  schedule_at_risk?: boolean;
  attributable_overtime_hours?: number;
  accountability_data_complete?: boolean;
};

type ProjectMetricContext = {
  workdaysByEmployee: Map<string, number[]>;
  dailyCapacityByEmployee: Map<string, number>;
  holidays: Set<string>;
  loggedHours: Map<string, Map<string, number>>;
  workLogsByProject: Map<string, { employeeId: string; workDate: string; hours: number }[]>;
  excludedIncidentDays: Map<string, { days: number; employeeIds: string[] }[]>;
};

function parseWorkdays(value: unknown): number[] {
  if (Array.isArray(value)) {
    const days = value.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
    return days.length ? days : [1, 2, 3, 4, 5, 6];
  }
  if (typeof value === 'string') {
    try { return parseWorkdays(JSON.parse(value)); } catch { return [1, 2, 3, 4, 5, 6]; }
  }
  return [1, 2, 3, 4, 5, 6];
}

function eachDate(from: string, to: string, visit: (date: Date, iso: string) => void): void {
  const cursor = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  while (cursor <= end) {
    visit(cursor, `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`);
    cursor.setDate(cursor.getDate() + 1);
  }
}

function projectWorkdays(project: ProjectRow, context?: ProjectMetricContext): Set<number> {
  const planned = Array.isArray(project.work_plan) ? project.work_plan.map((entry) => entry.weekday) : [];
  if (planned.length) return new Set(planned);
  const assignedDays = (project.assigned_worker_ids ?? []).flatMap((id) => context?.workdaysByEmployee.get(id) ?? [1, 2, 3, 4, 5, 6]);
  return new Set(assignedDays.length ? assignedDays : [1, 2, 3, 4, 5, 6]);
}

function countProjectWorkdays(from: string, to: string, weekdays: Set<number>, holidays: Set<string>, includeStart = false): number {
  if (from > to) return 0;
  let count = 0;
  eachDate(includeStart ? from : addCalendarDay(from, 1), to, (date, iso) => {
    if (weekdays.has(date.getDay()) && !holidays.has(iso)) count += 1;
  });
  return count;
}

function addCalendarDay(dateIso: string, amount: number): string {
  const date = new Date(`${dateIso}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addWorkdays(dateIso: string, days: number, workerDays: number[], holidays: Set<string>): string {
  const cursor = new Date(`${dateIso}T12:00:00`);
  let added = 0;
  while (added < Math.ceil(days)) {
    cursor.setDate(cursor.getDate() + 1);
    const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    if (workerDays.includes(cursor.getDay()) && !holidays.has(iso)) added += 1;
  }
  return `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
}

async function loadProjectMetricContext(projects: ProjectRow[]): Promise<ProjectMetricContext> {
  const db = getDb();
  const [employees, holidays, logs, incidents] = await Promise.all([
    db.query<{ id: string; workdays: unknown; daily_work_hours: number }>('SELECT id, workdays, daily_work_hours FROM employees'),
    db.query<{ holiday_date: string }>("SELECT holiday_date::text AS holiday_date FROM holidays WHERE is_chome = true"),
    projects.length ? db.query<{ project_id: string; employee_id: string; work_date: string; hours: string | number }>(
      'SELECT project_id, employee_id, work_date::text AS work_date, hours FROM project_work_logs WHERE project_id = ANY($1::text[]) ORDER BY work_date, id',
      [projects.map((project) => project.id)],
    ) : Promise.resolve([]),
    projects.length ? db.query<{ project_id: string; delay_days: string | number; employee_ids: string[]; excluded_from_accountability: boolean }>(
      'SELECT project_id, delay_days, employee_ids, excluded_from_accountability FROM project_incidents WHERE project_id = ANY($1::text[]) AND excluded_from_accountability = true',
      [projects.map((project) => project.id)],
    ) : Promise.resolve([]),
  ]);
  const loggedHours = new Map<string, Map<string, number>>();
  const workLogsByProject = new Map<string, { employeeId: string; workDate: string; hours: number }[]>();
  for (const row of logs) {
    if (!loggedHours.has(row.project_id)) loggedHours.set(row.project_id, new Map());
    const employeeHours = loggedHours.get(row.project_id)!;
    employeeHours.set(row.employee_id, (employeeHours.get(row.employee_id) ?? 0) + Number(row.hours));
    const projectLogs = workLogsByProject.get(row.project_id) ?? [];
    projectLogs.push({ employeeId: row.employee_id, workDate: row.work_date, hours: Number(row.hours) });
    workLogsByProject.set(row.project_id, projectLogs);
  }
  const excludedIncidentDays = new Map<string, { days: number; employeeIds: string[] }[]>();
  for (const row of incidents) {
    const current = excludedIncidentDays.get(row.project_id) ?? [];
    current.push({ days: Number(row.delay_days), employeeIds: row.employee_ids ?? [] });
    excludedIncidentDays.set(row.project_id, current);
  }
  return {
    workdaysByEmployee: new Map(employees.map((employee) => [employee.id, parseWorkdays(employee.workdays)])),
    dailyCapacityByEmployee: new Map(employees.map((employee) => [employee.id, Number(employee.daily_work_hours) || 8])),
    holidays: new Set(holidays.map((holiday) => holiday.holiday_date)),
    loggedHours,
    workLogsByProject,
    excludedIncidentDays,
  };
}

function computeProjectMetrics(p: ProjectRow, context?: ProjectMetricContext): ProjectRow {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayIso = today.toISOString().slice(0, 10);
  const weekdays = projectWorkdays(p, context);
  const holidays = context?.holidays ?? new Set<string>();
  const deadline = p.delivery_deadline ? new Date(`${p.delivery_deadline}T00:00:00`) : null;
  const diffDays = deadline ? Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;
  p.days_to_deadline = deadline && diffDays !== null
    ? diffDays >= 0
      ? countProjectWorkdays(todayIso, p.delivery_deadline!, weekdays, holidays, true)
      : -countProjectWorkdays(p.delivery_deadline!, todayIso, weekdays, holidays)
    : null;

  // Un retard ne commence qu’après un jour effectivement ouvré de dépassement.
  const overdueWorkdays = p.delivery_deadline && diffDays !== null && diffDays < 0
    ? countProjectWorkdays(p.delivery_deadline, todayIso, weekdays, holidays)
    : 0;
  const isOverdue = overdueWorkdays > 0 && p.status !== 'termine';
  p.is_delayed = isOverdue;
  p.delayed_days = isOverdue ? overdueWorkdays : 0;

  // Décompte / compte à rebours des heures supplémentaires dès dépassement
  const budget = Number(p.budget_hours) || 0;
  const spent = Number(p.spent_hours) || 0;
  const hourlyRate = Number(p.hourly_rate_fcfa) || 0;
  const dailyPenalty = Number(p.penalty_rate_daily_fcfa) || 0;

  const overtime = budget > 0 ? Math.max(0, spent - budget) : 0;
  p.overtime_hours = overtime;
  p.overtime_cost_fcfa = overtime * hourlyRate;
  const assignedIds = p.assigned_worker_ids ?? [];
  const workerLogs = context?.loggedHours.get(p.id);
  let accountableOvertime = 0;
  let estimatedPenalty = 0;
  let ratioDelayedWorkdays = 0;
  if (context && assignedIds.length) {
    const logs = context.workLogsByProject.get(p.id) ?? [];
    const totalLogged = logs.reduce((sum, log) => sum + log.hours, 0);
    const canAttribute = budget > 0 && totalLogged >= spent - 0.01;
    let remainingBudget = budget;
    const overrunByEmployee = new Map<string, number>();
    if (canAttribute) for (const log of logs) {
      const countedWithinBudget = Math.min(remainingBudget, log.hours);
      remainingBudget -= countedWithinBudget;
      const excess = log.hours - countedWithinBudget;
      if (excess > 0) overrunByEmployee.set(log.employeeId, (overrunByEmployee.get(log.employeeId) ?? 0) + excess);
    }
    let remaining = budget;
    const from = p.start_date || new Date().toISOString().slice(0, 10);
    const plan = Array.isArray(p.work_plan) ? p.work_plan : [];
    const weeklyHours = plan.reduce((sum, entry) => sum + Number(entry.planned_hours || 0), 0);
    p.planned_weekly_hours = weeklyHours;
    let completion: string | null = null;
    if (weeklyHours > 0 && remaining > 0) {
      eachDate(from, addWorkdays(from, 1825, [0, 1, 2, 3, 4, 5, 6], context.holidays), (date, iso) => {
        if (completion || iso < from || context!.holidays.has(iso)) return;
        for (const entry of plan) {
          if (date.getDay() !== entry.weekday || !context!.workdaysByEmployee.get(entry.employee_id)?.includes(entry.weekday)) continue;
          const capacity = context!.dailyCapacityByEmployee.get(entry.employee_id) ?? 8;
          const perProjectThatDay = plan.filter((item) => item.employee_id === entry.employee_id && item.weekday === entry.weekday)
            .reduce((sum, item) => sum + Number(item.planned_hours), 0);
          const hours = Math.min(Number(entry.planned_hours), capacity, perProjectThatDay);
          remaining -= hours;
          if (remaining <= 0) { completion = iso; break; }
        }
      });
    }
    const completionDate = completion as string | null;
    p.planned_completion_date = completionDate;
    p.schedule_at_risk = Boolean(completionDate && p.delivery_deadline && completionDate > p.delivery_deadline);
    const target = completionDate && p.delivery_deadline && completionDate > p.delivery_deadline ? completionDate : p.delivery_deadline;
    if (target && today > new Date(`${target}T23:59:59`)) {
      ratioDelayedWorkdays = countProjectWorkdays(target, todayIso, weekdays, context.holidays);
    }
    if (canAttribute) for (const [employeeId, workerOvertime] of overrunByEmployee) {
      accountableOvertime += workerOvertime;
      const workerDays = context.workdaysByEmployee.get(employeeId) ?? [1, 2, 3, 4, 5, 6];
      const incidents = context.excludedIncidentDays.get(p.id) ?? [];
      const excludedDays = incidents.reduce((sum, incident) => sum + (!incident.employeeIds.length || incident.employeeIds.includes(employeeId) ? incident.days : 0), 0);
      const adjustedDeadline = p.delivery_deadline ? addWorkdays(p.delivery_deadline, excludedDays, workerDays, context.holidays) : null;
      const workerDelay = adjustedDeadline && todayIso > adjustedDeadline
        ? countProjectWorkdays(adjustedDeadline, todayIso, new Set(workerDays), context.holidays)
        : 0;
      ratioDelayedWorkdays = Math.max(ratioDelayedWorkdays, workerDelay);
      estimatedPenalty += workerOvertime * dailyPenalty * workerDelay;
    }
  }
  p.attributable_overtime_hours = accountableOvertime;
  const loggedTotal = workerLogs ? [...workerLogs.values()].reduce((sum, hours) => sum + hours, 0) : 0;
  p.accountability_data_complete = assignedIds.length > 0 && loggedTotal >= spent - 0.01;
  p.ratio_delayed_workdays = ratioDelayedWorkdays;
  p.penalties_cost_fcfa = estimatedPenalty;

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
const emptyToNull = (val: unknown) => (typeof val === 'string' && val.trim() === '' ? null : val);

const projectBody = z.object({
  code: z.string().trim().max(40).nullable().optional(),
  title: z.preprocess(emptyToNull, z.string().trim().max(240).nullable().optional()),
  client_name: z.preprocess(emptyToNull, z.string().trim().max(160).nullable().optional()),
  site_location: z.preprocess(emptyToNull, z.string().trim().max(240).nullable().optional()),
  category: z.preprocess(emptyToNull, z.string().trim().max(120).nullable().optional()),
  start_date: z.preprocess(emptyToNull, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format date requis: AAAA-MM-JJ').nullable().optional()),
  work_plan: z.array(z.object({ employee_id: z.string().min(2), weekday: z.number().int().min(0).max(6), planned_hours: z.number().positive().max(24) })).optional(),
  assigned_worker_ids: z.array(z.string()).default([]),
  assigned_worker_names: z.array(z.string()).default([]),
  budget_hours: z.number().min(0).nullable().optional(),
  spent_hours: z.number().min(0).default(0),
  hourly_rate_fcfa: z.number().min(0).default(0),
  penalty_rate_daily_fcfa: z.number().min(0).nullable().optional(),
  ratio_value: z.number().min(0).nullable().optional(),
  ratio_unit: z.preprocess(emptyToNull, z.string().trim().max(80).nullable().optional()),
  ratio_basis: z.preprocess(emptyToNull, z.string().trim().max(160).nullable().optional()),
  ratio_quantity: z.number().positive().nullable().optional(),
  ratio_deadline: z.preprocess(emptyToNull, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()),
  delivery_deadline: z.preprocess(emptyToNull, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format date requis: AAAA-MM-JJ').nullable().optional()),
  installation_start_date: z.preprocess(emptyToNull, z.string().nullable().optional()),
  installation_days: z.number().min(0).default(0),
  status: z.enum(['planifie', 'en_fabrication', 'en_pose', 'termine', 'en_retard', 'litige']).default('planifie'),
  notes: z.preprocess(emptyToNull, z.string().nullable().optional()),
});

async function validateWorkPlan(projectId: string | null, assignedIds: string[], plan: WorkPlanEntry[]) {
  const db = getDb();
  const keys = new Set<string>();
  for (const entry of plan) {
    const key = `${entry.employee_id}:${entry.weekday}`;
    if (keys.has(key)) return 'Une seule durée est attendue par travailleur et jour de semaine.';
    keys.add(key);
    if (!assignedIds.includes(entry.employee_id)) return 'Le planning contient un travailleur qui n’est pas affecté au projet.';
  }
  const workers = assignedIds.length
    ? await db.query<{ id: string; full_name: string; workdays: unknown; daily_work_hours: number }>(
        'SELECT id, full_name, workdays, daily_work_hours FROM employees WHERE id = ANY($1::text[])', [assignedIds])
    : [];
  const byId = new Map(workers.map((worker) => [worker.id, worker]));
  const newSums = new Map<string, number>();
  for (const entry of plan) {
    const worker = byId.get(entry.employee_id);
    if (!worker) return 'Un travailleur sélectionné est introuvable.';
    if (!parseWorkdays(worker.workdays).includes(entry.weekday)) return 'Le planning inclut un jour non ouvré pour un travailleur.';
    const key = `${entry.employee_id}:${entry.weekday}`;
    newSums.set(key, (newSums.get(key) ?? 0) + entry.planned_hours);
  }
  const others = await db.query<{ id: string; work_plan: WorkPlanEntry[] }>(
    `SELECT id, work_plan FROM projects WHERE ($1::text IS NULL OR id <> $1) AND status <> 'termine'`, [projectId]);
  const existingSums = new Map<string, number>();
  for (const project of others) for (const entry of (Array.isArray(project.work_plan) ? project.work_plan : [])) {
    const key = `${entry.employee_id}:${entry.weekday}`;
    existingSums.set(key, (existingSums.get(key) ?? 0) + Number(entry.planned_hours || 0));
  }
  for (const [key, hours] of newSums) {
    const employeeId = key.split(':')[0]!;
    const capacity = Number(byId.get(employeeId)?.daily_work_hours) || 8;
    if (hours + (existingSums.get(key) ?? 0) > capacity + 0.001) {
      const worker = byId.get(employeeId);
      return `${worker?.full_name ?? 'Ce travailleur'} dépasse sa capacité de ${capacity} h ce jour-là, en cumulant ses projets.`;
    }
  }
  return null;
}

projectsRoutes.get('/', requireAuth, requirePerm('projects.view'), async (c) => {
  const db = getDb();
  const user = c.get('auth').user;
  const explicitView = await db.one<{ allowed: boolean }>(
    'SELECT allowed FROM role_permissions WHERE role = $1 AND action = $2', [user.role, 'projects.view'],
  );
  const canViewAll = user.role === 'direction' || Boolean(explicitView?.allowed) ||
    (!explicitView && DEFAULT_PERMISSIONS['projects.view'].includes(user.role)) ||
    await hasPermission(user.role, 'projects.edit') || await hasPermission(user.role, 'projects.create');
  const rows = await db.query<ProjectRow>(`
    SELECT id, code, title, client_name, site_location, category,
           start_date::text AS start_date, work_plan, assigned_worker_ids, assigned_worker_names,
           budget_hours, spent_hours, hourly_rate_fcfa, penalty_rate_daily_fcfa,
           ratio_value, ratio_unit, ratio_basis, ratio_quantity,
           ratio_deadline::text AS ratio_deadline,
           delivery_deadline::text AS delivery_deadline,
           installation_start_date::text AS installation_start_date,
           installation_days, status, notes,
           created_at::text AS created_at, updated_at::text AS updated_at
    FROM projects
    WHERE ($1::boolean OR $2::text IS NOT NULL AND $2 = ANY(assigned_worker_ids))
    ORDER BY delivery_deadline ASC NULLS LAST, created_at DESC
  `, [canViewAll, user.employee_id ?? null]);

  const context = await loadProjectMetricContext(rows);
  const projects = rows.map((row) => computeProjectMetrics(row, context));

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
  const id = `prj-${randomUUID()}`;
  const generatedCode = !d.code?.trim();
  let normalizedCode = d.code?.trim().toUpperCase() || `CMD-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  const plan = d.work_plan ?? [];
  const planError = await validateWorkPlan(null, d.assigned_worker_ids, plan);
  if (planError) return c.json({ error: planError }, 400);
  let duplicate = await db.one<{ id: string }>('SELECT id FROM projects WHERE upper(code) = $1 LIMIT 1', [normalizedCode]);
  for (let attempt = 0; generatedCode && duplicate && attempt < 3; attempt += 1) {
    normalizedCode = `CMD-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
    duplicate = await db.one<{ id: string }>('SELECT id FROM projects WHERE upper(code) = $1 LIMIT 1', [normalizedCode]);
  }
  if (duplicate) {
    return c.json({ error: generatedCode ? 'Impossible de générer un code unique. Réessayez.' : `Le code ${normalizedCode} est déjà utilisé. Choisissez un autre code.` }, 409);
  }

  const row = await db.transaction(async (tx) => {
    const created = await tx.one<ProjectRow>(`
      INSERT INTO projects (
        id, code, title, client_name, site_location, category,
        start_date, work_plan, assigned_worker_ids, assigned_worker_names, budget_hours, spent_hours,
        hourly_rate_fcfa, penalty_rate_daily_fcfa, delivery_deadline,
        installation_start_date, installation_days,
        status, notes
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8::jsonb,
        $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
      )
      RETURNING id, code, title, client_name, site_location, category,
                start_date::text AS start_date, work_plan, assigned_worker_ids, assigned_worker_names,
                budget_hours, spent_hours, hourly_rate_fcfa, penalty_rate_daily_fcfa,
                ratio_value, ratio_unit, ratio_basis, ratio_quantity,
                ratio_deadline::text AS ratio_deadline,
                delivery_deadline::text AS delivery_deadline,
                installation_start_date::text AS installation_start_date,
                installation_days, status, notes,
                created_at::text AS created_at, updated_at::text AS updated_at
    `, [
      id, normalizedCode, d.title?.trim() || null, d.client_name?.trim() || null, d.site_location?.trim() || null, d.category?.trim() || null,
      d.start_date || null, JSON.stringify(plan), d.assigned_worker_ids ?? [], d.assigned_worker_names ?? [],
      d.budget_hours ?? 0, 0, d.hourly_rate_fcfa ?? 0, d.penalty_rate_daily_fcfa ?? null, d.delivery_deadline || null,
      d.installation_start_date || null, d.installation_days ?? 0,
      d.status, d.notes || null,
    ]);
    if (!created) throw new Error('La commande n’a pas pu être enregistrée.');

    await writeAudit(tx, {
      entity: 'project',
      entityId: id,
      action: 'create',
      after: created,
      actorId: actorId(c),
      actorName: actorName(c) || 'Utilisateur',
      reason: `Création commande projet ${normalizedCode}${d.title?.trim() ? ` (${d.title.trim()})` : ''}`,
    });
    return created;
  });

  return c.json({ project: computeProjectMetrics(row, await loadProjectMetricContext([row])) }, 201);
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
  const nextWorkers = d.assigned_worker_ids ?? existing.assigned_worker_ids;
  const currentPlan = d.work_plan ?? (Array.isArray(existing.work_plan) ? existing.work_plan : []);
  const nextPlan = currentPlan.filter((entry) => nextWorkers.includes(entry.employee_id));
  const planError = await validateWorkPlan(id, nextWorkers, nextPlan);
  if (planError) return c.json({ error: planError }, 400);
  const row = await db.one<ProjectRow>(`
    UPDATE projects SET
      code = COALESCE($2, code),
      title = CASE WHEN $22::boolean THEN $3::text ELSE title END,
      client_name = CASE WHEN $23::boolean THEN $4::text ELSE client_name END,
      site_location = CASE WHEN $24::boolean THEN $5::text ELSE site_location END,
      category = CASE WHEN $6::boolean THEN $7::text ELSE category END,
      assigned_worker_ids = COALESCE($8, assigned_worker_ids),
      assigned_worker_names = COALESCE($9, assigned_worker_names),
      budget_hours = CASE WHEN $20::boolean THEN COALESCE($10, 0) ELSE budget_hours END,
      penalty_rate_daily_fcfa = CASE WHEN $21::boolean THEN $11 ELSE penalty_rate_daily_fcfa END,
      delivery_deadline = CASE WHEN $25::boolean THEN $12::date ELSE delivery_deadline END,
      start_date = CASE WHEN $26::boolean THEN $13::date ELSE start_date END,
      work_plan = CASE WHEN $14::boolean THEN $15::jsonb ELSE work_plan END,
      status = COALESCE($16, status),
      notes = CASE WHEN $17::boolean THEN $18::text ELSE notes END,
      ratio_value = CASE WHEN $19::boolean THEN NULL ELSE ratio_value END,
      ratio_unit = CASE WHEN $19::boolean THEN NULL ELSE ratio_unit END,
      ratio_basis = CASE WHEN $19::boolean THEN NULL ELSE ratio_basis END,
      ratio_quantity = CASE WHEN $19::boolean THEN NULL ELSE ratio_quantity END,
      ratio_deadline = CASE WHEN $19::boolean THEN NULL ELSE ratio_deadline END,
      installation_start_date = CASE WHEN $19::boolean THEN NULL ELSE installation_start_date END,
      installation_days = CASE WHEN $19::boolean THEN 0 ELSE installation_days END,
      updated_at = now()
    WHERE id = $1
    RETURNING id, code, title, client_name, site_location, category,
              start_date::text AS start_date, work_plan, assigned_worker_ids, assigned_worker_names,
              budget_hours, spent_hours, hourly_rate_fcfa, penalty_rate_daily_fcfa,
              ratio_value, ratio_unit, ratio_basis, ratio_quantity,
              ratio_deadline::text AS ratio_deadline,
              delivery_deadline::text AS delivery_deadline,
              installation_start_date::text AS installation_start_date,
              installation_days, status, notes,
              created_at::text AS created_at, updated_at::text AS updated_at
  `, [
    id,
    d.code?.trim().toUpperCase() || null,
    d.title?.trim() || null,
    d.client_name?.trim() || null,
    d.site_location?.trim() || null,
    hasField('category'),
    d.category ?? null,
    d.assigned_worker_ids ?? null,
    d.assigned_worker_names ?? null,
    d.budget_hours ?? null,
    d.penalty_rate_daily_fcfa ?? null,
    d.delivery_deadline ?? null,
    d.start_date ?? null,
    hasField('work_plan') || hasField('assigned_worker_ids'),
    JSON.stringify(nextPlan),
    d.status ?? null,
    hasField('notes'),
    d.notes ?? null,
    hasField('budget_hours') || hasField('work_plan') || hasField('assigned_worker_ids'),
    hasField('budget_hours'),
    hasField('penalty_rate_daily_fcfa'),
    hasField('title'),
    hasField('client_name'),
    hasField('site_location'),
    hasField('delivery_deadline'),
    hasField('start_date'),
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

  return c.json({ project: computeProjectMetrics(row!, await loadProjectMetricContext([row!])) });
});

const workLogBody = z.object({
  employee_id: z.string().min(2),
  work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hours: z.number().positive().max(24),
  note: z.string().trim().max(500).optional(),
});

projectsRoutes.get('/:id/work-logs', requireAuth, requirePerm('projects.view'), async (c) => {
  const rows = await getDb().query(
    `SELECT w.id, w.employee_id, e.full_name AS employee_name, w.work_date::text AS work_date,
            w.hours, w.note, w.created_at::text AS created_at
       FROM project_work_logs w JOIN employees e ON e.id = w.employee_id
      WHERE w.project_id = $1 ORDER BY w.work_date DESC, w.id DESC`,
    [c.req.param('id')],
  );
  return c.json({ work_logs: rows });
});

projectsRoutes.post('/:id/work-logs', requireAuth, requirePerm('projects.edit'), async (c) => {
  const projectId = c.req.param('id');
  const parsed = workLogBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'Indiquez l’exécutant, la date et les heures réellement travaillées.' }, 400);
  const db = getDb();
  const project = await db.one<ProjectRow>('SELECT * FROM projects WHERE id = $1', [projectId]);
  if (!project) return c.json({ error: 'Projet introuvable.' }, 404);
  if (!project.assigned_worker_ids.includes(parsed.data.employee_id)) return c.json({ error: 'Ce travailleur n’est pas affecté à ce projet.' }, 400);
  const employee = await db.one<{ id: string; full_name: string; active: boolean }>(
    'SELECT id, full_name, active FROM employees WHERE id = $1', [parsed.data.employee_id],
  );
  if (!employee?.active) return c.json({ error: 'Exécutant introuvable ou inactif.' }, 404);
  const capacity = await db.one<{ workdays: unknown; daily_work_hours: number }>(
    'SELECT workdays, daily_work_hours FROM employees WHERE id = $1', [employee.id]);
  const workDate = new Date(`${parsed.data.work_date}T12:00:00`);
  const isScheduledWorkday = parseWorkdays(capacity?.workdays).includes(workDate.getDay());
  const holiday = await db.one<{ is_holiday: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM holidays WHERE holiday_date = $1::date AND is_chome = true) AS is_holiday', [parsed.data.work_date]);
  const exceptionalDay = !isScheduledWorkday || Boolean(holiday?.is_holiday);
  if (exceptionalDay && !parsed.data.note?.trim()) {
    return c.json({ error: 'Ajoutez un motif pour enregistrer un travail effectué un jour de repos ou férié.' }, 400);
  }
  const alreadyLogged = await db.one<{ hours: string | number }>(
    'SELECT coalesce(sum(hours), 0) AS hours FROM project_work_logs WHERE employee_id = $1 AND work_date = $2::date',
    [employee.id, parsed.data.work_date]);
  const dailyCapacity = Number(capacity?.daily_work_hours) || 8;
  if (!exceptionalDay && Number(alreadyLogged?.hours ?? 0) + parsed.data.hours > dailyCapacity + 0.001) {
    return c.json({ error: `Cette saisie dépasse la capacité journalière de ${dailyCapacity} h cumulée sur tous les projets.` }, 409);
  }
  const result = await db.transaction(async (tx) => {
    const log = await tx.one(
      `INSERT INTO project_work_logs (project_id, employee_id, work_date, hours, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, project_id, employee_id, work_date::text AS work_date, hours, note, created_at::text AS created_at`,
      [projectId, employee.id, parsed.data.work_date, parsed.data.hours, parsed.data.note || null, actorId(c)],
    );
    await tx.query('UPDATE projects SET spent_hours = spent_hours + $2, updated_at = now() WHERE id = $1', [projectId, parsed.data.hours]);
    await writeAudit(tx, {
      entity: 'project_work_log', entityId: String((log as any)?.id ?? ''), action: 'create', after: log,
      actorId: actorId(c), actorName: actorName(c), reason: `${parsed.data.hours} h saisies pour ${employee.full_name}`,
    });
    return log;
  });
  const updated = await db.one<ProjectRow>('SELECT * FROM projects WHERE id = $1', [projectId]);
  return c.json({ work_log: result, project: computeProjectMetrics(updated!, await loadProjectMetricContext([updated!])) }, 201);
});

const incidentKinds = ['power_outage', 'scope_change', 'justified_absence', 'unjustified_absence', 'work_accident', 'other'] as const;
const incidentBody = z.object({
  kind: z.enum(incidentKinds),
  description: z.string().trim().min(3).max(500),
  delay_days: z.number().int().min(0).max(365).default(0),
  employee_ids: z.array(z.string()).default([]),
  excluded_from_accountability: z.boolean().optional(),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

projectsRoutes.get('/:id/incidents', requireAuth, requirePerm('projects.view'), async (c) => {
  const db = getDb();
  const projectId = c.req.param('id');
  const user = c.get('auth').user;
  const project = await db.one<ProjectRow>('SELECT * FROM projects WHERE id = $1', [projectId]);
  if (!project) return c.json({ error: 'Projet introuvable.' }, 404);
  const canReview = await hasPermission(user.role, 'projects.edit');
  if (!canReview && (!user.employee_id || !project.assigned_worker_ids.includes(user.employee_id))) {
    return c.json({ error: 'Ce projet ne vous est pas affecté.' }, 403);
  }
  const incidents = await db.query(
    `SELECT i.id, i.project_id, i.kind, i.description, i.delay_days, i.employee_ids, i.excluded_from_accountability,
            i.event_date::text AS event_date, i.created_at::text AS created_at,
            i.reporter_employee_id, e.full_name AS reporter_name, i.review_status, i.review_note, i.reviewed_by, i.reviewed_at::text AS reviewed_at
       FROM project_incidents i LEFT JOIN employees e ON e.id = i.reporter_employee_id
      WHERE i.project_id = $1 AND ($2::boolean OR i.reporter_employee_id = $3)
       ORDER BY i.event_date DESC, i.id DESC`,
    [projectId, canReview, user.employee_id ?? null],
  );
  return c.json({ incidents });
});

projectsRoutes.post('/:id/incidents', requireAuth, requirePerm('projects.report_incident'), async (c) => {
  const projectId = c.req.param('id');
  const parsed = incidentBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'Vérifiez le type, la description et la durée de l’imprévu.' }, 400);
  const db = getDb();
  const project = await db.one<ProjectRow>('SELECT * FROM projects WHERE id = $1', [projectId]);
  if (!project) return c.json({ error: 'Projet introuvable.' }, 404);
  const reporterId = c.get('auth').user.employee_id;
  if (await hasPermission(c.get('auth').user.role, 'projects.edit')) return c.json({ error: 'Les responsables traitent les signalements ; ils ne les déclarent pas au nom des travailleurs.' }, 403);
  if (!reporterId || !project.assigned_worker_ids.includes(reporterId)) return c.json({ error: 'Seul un travailleur affecté peut signaler un imprévu sur ce projet.' }, 403);
  const employeeIds = [reporterId];
  const result = await withOfflineIdempotency(db, c.get('auth').user.id, c.req.header('Idempotency-Key'), async (tx) => {
    const incident = await tx.one(
      `INSERT INTO project_incidents (project_id, kind, description, delay_days, employee_ids, excluded_from_accountability, event_date, created_by, reporter_employee_id, review_status)
       VALUES ($1, $2, $3, $4, $5, false, $6, $7, $8, 'pending')
       RETURNING id, project_id, kind, description, delay_days, employee_ids, excluded_from_accountability,
                 event_date::text AS event_date, created_at::text AS created_at,
                 reporter_employee_id, (SELECT full_name FROM employees e WHERE e.id = project_incidents.reporter_employee_id) AS reporter_name,
                 review_status, review_note, reviewed_by, reviewed_at::text AS reviewed_at`,
      [projectId, parsed.data.kind, parsed.data.description, parsed.data.delay_days, employeeIds, parsed.data.event_date, actorId(c), reporterId],
    );
    await writeAudit(tx, {
      entity: 'project_incident', entityId: String((incident as any)?.id ?? ''), action: 'create', after: incident,
      actorId: actorId(c), actorName: actorName(c), reason: parsed.data.description,
    });
    return { incident };
  });
  return c.json(result.value, 201);
});

projectsRoutes.patch('/:id/incidents/:incidentId/review', requireAuth, requirePerm('projects.edit'), async (c) => {
  const parsed = z.object({ decision: z.enum(['approved', 'rejected']), note: z.string().trim().max(500).optional() }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'Décision invalide.' }, 400);
  const db = getDb();
  const projectId = c.req.param('id');
  const incidentId = c.req.param('incidentId') ?? '';
  const incident = await db.one<any>('SELECT * FROM project_incidents WHERE id = $1 AND project_id = $2', [incidentId, projectId]);
  if (!incident) return c.json({ error: 'Signalement introuvable.' }, 404);
  if (incident.review_status !== 'pending') return c.json({ error: 'Ce signalement a déjà été traité.' }, 409);
  if (parsed.data.decision === 'rejected' && !parsed.data.note?.trim()) return c.json({ error: 'Indiquez le motif du refus.' }, 400);
  const excluded = parsed.data.decision === 'approved' && incident.kind !== 'unjustified_absence';
  const reviewed = await db.one(
    `UPDATE project_incidents SET review_status = $3, review_note = $4, excluded_from_accountability = $5,
            reviewed_by = $6, reviewed_at = now()
      WHERE id = $1 AND project_id = $2 AND review_status = 'pending'
      RETURNING id, project_id, kind, description, delay_days, employee_ids, excluded_from_accountability,
                event_date::text AS event_date, created_at::text AS created_at, reporter_employee_id,
                review_status, review_note, reviewed_by, reviewed_at::text AS reviewed_at`,
    [incidentId, projectId, parsed.data.decision, parsed.data.note?.trim() || null, excluded, actorId(c)],
  );
  await writeAudit(db, { entity: 'project_incident', entityId: incidentId, action: parsed.data.decision, before: incident, after: reviewed, actorId: actorId(c), actorName: actorName(c), reason: parsed.data.note || 'Décision sur un signalement d’imprévu' });
  return c.json({ incident: reviewed });
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
