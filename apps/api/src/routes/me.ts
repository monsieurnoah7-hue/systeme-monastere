import { Hono } from 'hono';
import { getDb } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import type { EmployeeRow } from '../types.js';
import { z } from 'zod';
import { businessDate, businessMinutes, parseHm } from '../lib/time.js';
import { loadSettings } from '../lib/settings.js';
import { writeAudit } from '../lib/audit.js';

export const meRoutes = new Hono();

meRoutes.use('*', requireAuth);

const kitCondition = z.enum(['bon', 'a_affuter', 'a_reparer', 'manquant', 'reforme']);

async function getDailyKitState(employeeId: string) {
  const db = getDb();
  const date = businessDate();
  const employee = await db.one<{ id: string; full_name: string; active: boolean; workdays: unknown }>(
    'SELECT id, full_name, active, workdays FROM employees WHERE id = $1', [employeeId],
  );
  if (!employee) return null;
  const kit = await db.one<{ id: string; code: string; etabli_number: number; location: string; status: string }>(
    'SELECT id, code, etabli_number, location, status FROM etabli_kits WHERE employee_id = $1 AND EXISTS (SELECT 1 FROM etabli_kit_items i WHERE i.kit_id = etabli_kits.id) ORDER BY created_at DESC LIMIT 1', [employeeId],
  );
  if (!kit) return { employee, kit: null, items: [], daily: { date, status: 'exempt', isRequired: false, reason: 'Aucun établi ne vous est attribué.', audit: null } };

  const parsedDays: unknown = Array.isArray(employee.workdays) ? employee.workdays : typeof employee.workdays === 'string' ? JSON.parse(employee.workdays) as unknown : null;
  const rawDays: number[] = Array.isArray(parsedDays) ? parsedDays.map(Number) : [1, 2, 3, 4, 5, 6];
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const holiday = await db.one<{ name: string }>('SELECT name FROM holidays WHERE holiday_date = $1 AND is_chome = true', [date]);
  const absence = await db.one<{ kind: string }>(
    `SELECT kind FROM absences WHERE employee_id = $1 AND $2 BETWEEN from_date AND to_date AND status = 'approved' ORDER BY created_at DESC LIMIT 1`, [employeeId, date],
  );
  const audit = await db.one<{ id: number; status: string; audited_at: string; auditor_name: string | null; items_present_count: number; items_total_count: number; anomalies_note: string | null }>(
    `SELECT id, status, audited_at::timestamptz::text AS audited_at, auditor_name, items_present_count, items_total_count, anomalies_note
       FROM etabli_kit_audits WHERE kit_id = $1 AND audit_type = 'daily' AND audit_date = $2 LIMIT 1`, [kit.id, date],
  );
  const settings = await loadSettings();
  let reason: string | null = null;
  if (!employee.active || kit.status === 'cloture') reason = 'Établi inactif ou clôturé.';
  else if (holiday) reason = `Jour férié chômé : ${holiday.name}.`;
  else if (absence) reason = `Absence approuvée (${absence.kind}).`;
  else if (!rawDays.includes(weekday)) reason = 'Ce jour ne fait pas partie de vos jours ouvrés.';
  const items = await db.query('SELECT * FROM etabli_kit_items WHERE kit_id = $1 ORDER BY item_num', [kit.id]);
  return {
    employee, kit, items,
    daily: {
      date, isRequired: !reason, reason,
      status: reason ? 'exempt' : audit ? 'done' : businessMinutes() >= parseHm(settings.closing_time) ? 'overdue' : 'pending',
      dueAt: settings.closing_time, audit: audit ?? null,
    },
  };
}

meRoutes.get('/kit', async (c) => {
  const employeeId = c.get('auth').user.employee_id;
  if (!employeeId) return c.json({ kit: null, items: [], daily: { isRequired: false, status: 'exempt', reason: 'Aucun profil travailleur associé.' } });
  const state = await getDailyKitState(employeeId);
  if (!state) return c.json({ error: 'Fiche travailleur introuvable.' }, 404);
  return c.json(state);
});

const dailyAuditSchema = z.object({
  items_status: z.array(z.object({ id: z.number().int().positive(), condition: kitCondition })).min(1),
  anomalies_note: z.string().trim().max(1000).optional(),
});

meRoutes.post('/kit/audit', async (c) => {
  const employeeId = c.get('auth').user.employee_id;
  if (!employeeId) return c.json({ error: 'Aucun profil travailleur associé.' }, 403);
  const body = dailyAuditSchema.parse(await c.req.json());
  const db = getDb();
  const current = await getDailyKitState(employeeId);
  if (!current?.kit) return c.json({ error: 'Aucun établi ne vous est attribué.' }, 404);
  if (!current.daily.isRequired) return c.json({ error: current.daily.reason ?? 'Le contrôle n’est pas requis aujourd’hui.' }, 409);
  if (current.daily.audit) return c.json({ error: 'Le contrôle du jour est déjà enregistré.' }, 409);

  try {
    const audit = await db.transaction(async (tx) => {
      const kit = await tx.one<{ id: string; status: string }>('SELECT id, status FROM etabli_kits WHERE id = $1 AND employee_id = $2 FOR UPDATE', [current.kit!.id, employeeId]);
      if (!kit || kit.status === 'cloture') throw new Error('Établi indisponible.');
      const items = await tx.query<{ id: number }>('SELECT id FROM etabli_kit_items WHERE kit_id = $1 ORDER BY id', [kit.id]);
      const submitted = [...body.items_status].sort((a, b) => a.id - b.id);
      const actual = items.map((item) => item.id).sort((a, b) => a - b);
      if (!actual.length || actual.length !== submitted.length || actual.some((id, i) => id !== submitted[i]?.id)) throw new Error('Chaque élément de votre établi doit être contrôlé une seule fois.');
      for (const item of submitted) {
        await tx.query('UPDATE etabli_kit_items SET condition = $1, is_present = $2, updated_at = now() WHERE id = $3 AND kit_id = $4', [item.condition, item.condition !== 'manquant', item.id, kit.id]);
      }
      const total = submitted.length;
      const present = submitted.filter((item) => item.condition !== 'manquant').length;
      const status = submitted.every((item) => item.condition === 'bon') ? 'conforme' : present < total ? 'incomplet' : 'anomalie';
      const note = body.anomalies_note?.trim() || null;
      const created = await tx.one<{ id: number; status: string; audited_at: string }>(
        `INSERT INTO etabli_kit_audits (kit_id, audited_by, auditor_name, status, items_present_count, items_total_count, anomalies_note, audit_type, audit_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'daily', $8) RETURNING id, status, audited_at::timestamptz::text AS audited_at`,
        [kit.id, employeeId, current.employee.full_name, status, present, total, note, current.daily.date],
      );
      await tx.query('UPDATE etabli_kits SET last_audited_at = now(), last_audited_by = $1, last_audit_status = $2 WHERE id = $3', [current.employee.full_name, status, kit.id]);
      await writeAudit(tx, { action: 'etabli_kit.daily_audit', entity: 'etabli_kit', entityId: kit.id, after: { status, items_present: present, items_total: total, date: current.daily.date }, actorId: c.get('auth').user.id, actorName: current.employee.full_name });
      return created;
    });
    return c.json({ audit, success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('unique') || message.includes('duplicate')) return c.json({ error: 'Le contrôle du jour est déjà enregistré.' }, 409);
    if (message) return c.json({ error: message }, 409);
    throw error;
  }
});

meRoutes.get('/overview', async (c) => {
  const auth = c.get('auth');
  const user = auth.user;
  const employeeId = user.employee_id;
  if (!employeeId) {
    return c.json({ employee: null, history: [], month: { daysPresent: 0, lateCount: 0, breaks: 0 }, openLoans: [], leaves: [], situation: null });
  }
  const db = getDb();
  const employee = await db.one<EmployeeRow>(
    'SELECT id, full_name, job_title, photo_path, badge_token, active FROM employees WHERE id = $1',
    [employeeId],
  );
  if (!employee) return c.json({ error: 'Fiche travailleur introuvable.' }, 404);

  const today = await db.one<{ in_at: string | null; out_at: string | null; break_in: string | null; break_out: string | null; late_minutes: number; status: string }>(
    `SELECT min(CASE WHEN punch_type = 'in'  THEN to_char(server_at, 'HH24:MI') END) AS in_at,
            max(CASE WHEN punch_type = 'out' THEN to_char(server_at, 'HH24:MI') END) AS out_at,
            min(CASE WHEN punch_type = 'break_in'  THEN to_char(server_at, 'HH24:MI') END) AS break_in,
            max(CASE WHEN punch_type = 'break_out' THEN to_char(server_at, 'HH24:MI') END) AS break_out,
            coalesce(max(late_minutes), 0) AS late_minutes,
            coalesce(max(status), 'absent') AS status
       FROM attendance WHERE employee_id = $1 AND punch_date = CURRENT_DATE`,
    [employeeId],
  );

  const declaredToday = await db.one<{ kind: string; note: string | null }>(
    `SELECT kind, note FROM absences
      WHERE employee_id = $1 AND CURRENT_DATE BETWEEN from_date AND to_date AND status = 'approved'
      ORDER BY created_at DESC LIMIT 1`,
    [employeeId],
  );

  const [history, monthRows, openLoans, loansHistory, leaves] = await Promise.all([
    db.query(
      `SELECT punch_date::text AS punch_date,
              min(CASE WHEN punch_type = 'in'  THEN to_char(server_at, 'HH24:MI') END) AS in_at,
              max(CASE WHEN punch_type = 'out' THEN to_char(server_at, 'HH24:MI') END) AS out_at,
              min(CASE WHEN punch_type = 'break_in'  THEN to_char(server_at, 'HH24:MI') END) AS break_in,
              max(CASE WHEN punch_type = 'break_out' THEN to_char(server_at, 'HH24:MI') END) AS break_out,
              max(late_minutes) AS late_minutes,
              max(reason) AS late_reason,
              max(status) AS status
         FROM attendance
        WHERE employee_id = $1 AND punch_date >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY punch_date ORDER BY punch_date DESC LIMIT 30`,
      [employeeId],
    ),
    db.query<{ late_count: string; days: string; breaks: string }>(
      `SELECT count(*) FILTER (WHERE late_minutes > 0)::text AS late_count,
              count(DISTINCT punch_date) FILTER (WHERE punch_type = 'in')::text AS days,
              count(*) FILTER (WHERE punch_type = 'break_in')::text AS breaks
         FROM attendance
        WHERE employee_id = $1 AND date_trunc('month', punch_date) = date_trunc('month', CURRENT_DATE)`,
      [employeeId],
    ),
    db.query(
      `SELECT l.id, l.tool_id, l.out_at, l.out_condition, l.motive, t.name AS tool_name, t.category
         FROM loans l JOIN tools t ON t.id = l.tool_id
        WHERE l.employee_id = $1 AND l.status = 'out'
        ORDER BY l.out_at DESC`,
      [employeeId],
    ),
    db.query(
      `SELECT l.id, l.tool_id, l.out_at, l.returned_at, l.out_condition, l.return_condition, l.return_notes, l.motive, l.status, t.name AS tool_name, t.category
         FROM loans l JOIN tools t ON t.id = l.tool_id
        WHERE l.employee_id = $1
        ORDER BY l.out_at DESC LIMIT 50`,
      [employeeId],
    ),
    db.query(
      `SELECT * FROM absences WHERE employee_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [employeeId],
    ),
  ]);

  let situation = 'absent';
  if (declaredToday) situation = declaredToday.kind;
  else if (today?.in_at) situation = Number(today.late_minutes) > 0 ? 'late' : 'present';

  return c.json({
    employee,
    situation,
    situationNote: declaredToday?.note ?? null,
    today,
    history,
    month: {
      daysPresent: Number(monthRows[0]?.days ?? 0),
      lateCount: Number(monthRows[0]?.late_count ?? 0),
      breaks: Number(monthRows[0]?.breaks ?? 0),
    },
    openLoans,
    loansHistory,
    leaves,
  });
});

meRoutes.get('/catalog', async (c) => {
  const db = getDb();
  const [magasins, tools, refs] = await Promise.all([
    db.query(`SELECT id, name, code FROM magasins WHERE active = true ORDER BY name`),
    db.query(
      `SELECT t.id, t.name, t.category, t.status, t.condition, t.status_reason, t.magasin_id, m.name AS magasin_name
         FROM tools t LEFT JOIN magasins m ON m.id = t.magasin_id
        ORDER BY t.name`,
    ),
    db.query(
      `SELECT r.id, r.name, r.category, r.unit, r.min_qty, r.magasin_id, m.name AS magasin_name,
              (r.initial_qty + COALESCE(mv.qty, 0))::float AS qty
         FROM stock_refs r
         LEFT JOIN magasins m ON m.id = r.magasin_id
         LEFT JOIN (
           SELECT ref_id, sum(CASE WHEN move_type = 'in' THEN qty
                                   WHEN move_type = 'out' THEN -qty
                                   WHEN move_type = 'correction' THEN qty END) AS qty
             FROM stock_movements GROUP BY ref_id
         ) mv ON mv.ref_id = r.id
        ORDER BY r.name`,
    ),
  ]);
  return c.json({ magasins, tools, refs });
});
