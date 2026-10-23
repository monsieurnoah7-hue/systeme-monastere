import { Hono } from 'hono';
import { getDb } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import type { EmployeeRow } from '../types.js';

export const meRoutes = new Hono();

meRoutes.use('*', requireAuth);

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
