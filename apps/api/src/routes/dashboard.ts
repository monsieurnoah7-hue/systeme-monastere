import { Hono } from 'hono';
import { getDb } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePerm } from '../middleware/permissions.js';
import { localDate } from '../lib/time.js';

export const dashboardRoutes = new Hono();

dashboardRoutes.use('*', requireAuth);

dashboardRoutes.get('/', requirePerm('dashboard.view'), async (c) => {
  const role = c.get('auth').user.role;
  const db = getDb();
  const today = localDate();

  const toolRows = await db.query<{ status: string; n: number }>('SELECT status, count(*)::int AS n FROM tools GROUP BY status');
  const tools = { total: 0, disponible: 0, en_pret: 0, maintenance: 0, manquant: 0, reforme: 0 };
  for (const row of toolRows) {
    tools.total += row.n;
    tools[row.status as keyof typeof tools] = row.n;
  }

  const stock = await db.one<{ refs: number; low: number; empty: number }>(
    `SELECT count(*)::int AS refs,
            count(*) FILTER (WHERE qty > 0 AND qty <= min_qty)::int AS low,
            count(*) FILTER (WHERE qty <= 0)::int AS empty
       FROM (
         SELECT r.id, r.min_qty,
                (
                  r.initial_qty + COALESCE(
                    (SELECT sum(CASE WHEN sm.move_type = 'in' THEN sm.qty
                                     WHEN sm.move_type = 'out' THEN -sm.qty
                                     WHEN sm.move_type = 'correction' THEN sm.qty END)
                       FROM stock_movements sm
                      WHERE sm.ref_id = r.id), 0
                  )
                ) AS qty
           FROM stock_refs r
       ) t`,
  );

  const movementsToday = await db.one<{ entries: number; exits: number; returns: number }>(
    `SELECT
        (SELECT count(*)::int FROM stock_movements WHERE move_type = 'in' AND created_at::date = $1) AS entries,
        (
          (SELECT count(*)::int FROM stock_movements WHERE move_type = 'out' AND created_at::date = $1)
          + (SELECT count(*)::int FROM loans WHERE out_at::date = $1)
        ) AS exits,
        (SELECT count(*)::int FROM loans WHERE status = 'returned' AND returned_at::date = $1) AS returns`,
    [today],
  );

  const attendanceToday = await db.query<{
    id: string;
    full_name: string;
    job_title: string;
    in_at: string | null;
    out_at: string | null;
    late_minutes: number;
    status: string;
  }>(
    `SELECT e.id, e.full_name, e.job_title,
            min(CASE WHEN a.punch_type = 'in'  THEN to_char(a.server_at, 'HH24:MI') END) AS in_at,
            max(CASE WHEN a.punch_type = 'out' THEN to_char(a.server_at, 'HH24:MI') END) AS out_at,
            coalesce(max(a.late_minutes), 0) AS late_minutes,
            coalesce(max(a.status), 'present') AS status
       FROM employees e
       LEFT JOIN attendance a ON a.employee_id = e.id AND a.punch_date = $1
      WHERE e.active = true
      GROUP BY e.id, e.full_name, e.job_title
      ORDER BY e.full_name`,
    [today],
  );

  const declared = await db.query<{ id: string; full_name: string; kind: string; status: string }>(
    `SELECT e.id, e.full_name, ab.kind, ab.status
       FROM absences ab JOIN employees e ON e.id = ab.employee_id
      WHERE $1 BETWEEN ab.from_date AND ab.to_date AND ab.status = 'approved'
      ORDER BY e.full_name`,
    [today],
  );
  const declaredIds = new Set(declared.map((d) => `${d.id}:${d.kind}`));

  const present = attendanceToday.filter((r) => r.in_at);
  const late = present.filter((r) => Number(r.late_minutes) > 0);
  const absentList = attendanceToday.filter(
    (r) => !r.in_at && !declaredIds.has(`${r.id}:absence`) && !declaredIds.has(`${r.id}:conge`) && !declaredIds.has(`${r.id}:permission`),
  );
  const congeList = declared.filter((d) => d.kind === 'conge');
  const permissionList = declared.filter((d) => d.kind === 'permission');
  const absenceList = declared.filter((d) => d.kind === 'absence');

  const overdueLoans = await db.query<{
    id: number;
    tool_id: string;
    tool_name: string;
    employee_name: string;
    out_date: string;
    due_date: string | null;
    days_overdue: number;
  }>(
    `SELECT l.id, l.tool_id, t.name AS tool_name, e.full_name AS employee_name,
            to_char(l.out_at, 'YYYY-MM-DD') AS out_date,
            to_char(l.due_at, 'YYYY-MM-DD') AS due_date,
            GREATEST(1, ROUND(EXTRACT(EPOCH FROM (now() - COALESCE(l.due_at, l.out_at))) / 86400))::int AS days_overdue
       FROM loans l
       JOIN tools t ON t.id = l.tool_id
       JOIN employees e ON e.id = l.employee_id
      WHERE l.status = 'out'
        AND (
          (l.due_at IS NOT NULL AND l.due_at < now())
          OR (l.due_at IS NULL AND l.out_at < now() - interval '24 hours')
        )
      ORDER BY COALESCE(l.due_at, l.out_at) ASC`,
  );

  const lowStock = await db.query<{ id: number; name: string; qty: number; min_qty: number; unit: string; location: string }>(
    `SELECT r.id, r.name, r.unit, r.location, r.min_qty::float AS min_qty,
            (r.initial_qty + COALESCE(m.qty, 0))::float AS qty
       FROM stock_refs r
       LEFT JOIN (
         SELECT ref_id,
                sum(CASE WHEN move_type = 'in' THEN qty
                         WHEN move_type = 'out' THEN -qty
                         WHEN move_type = 'correction' THEN qty END) AS qty
           FROM stock_movements GROUP BY ref_id
       ) m ON m.ref_id = r.id
      WHERE (r.initial_qty + COALESCE(m.qty, 0)) <= r.min_qty
      ORDER BY (r.initial_qty + COALESCE(m.qty, 0)) ASC, r.name ASC`,
  );

  const missingTools = await db.query<{ id: string; name: string; category: string; location: string; status_reason: string | null }>(
    `SELECT id, name, category, location, status_reason FROM tools WHERE status = 'manquant' ORDER BY id`,
  );

  const missingOut = await db.query<{ id: string; full_name: string; punch_date: string; in_at: string }>(
    `SELECT a.employee_id AS id, e.full_name, to_char(a.punch_date, 'YYYY-MM-DD') AS punch_date, to_char(a.server_at, 'HH24:MI') AS in_at
       FROM attendance a
       JOIN employees e ON e.id = a.employee_id
      WHERE a.punch_type = 'in'
        AND NOT EXISTS (
          SELECT 1 FROM attendance a2
           WHERE a2.employee_id = a.employee_id
             AND a2.punch_date = a.punch_date
             AND a2.punch_type = 'out'
        )
        AND (
          a.punch_date < $1::date
          OR (a.punch_date = $1::date AND to_char(now(), 'HH24:MI') > '16:30')
        )
      ORDER BY a.punch_date DESC, a.server_at DESC LIMIT 50`,
    [today],
  );

  const lastMovements = await db.query(
    `SELECT m.created_at::timestamptz::text AS created_at, m.move_type, m.qty::float AS qty, m.beneficiary, r.name AS ref_name, r.unit
       FROM stock_movements m JOIN stock_refs r ON r.id = m.ref_id
      ORDER BY m.created_at DESC LIMIT 12`,
  );

  const showAttendance = true;

  const empDeclMap = new Map<string, string>();
  for (const d of declared) empDeclMap.set(d.id, d.kind);

  return c.json({
    role,
    generatedAt: new Date().toISOString(),
    das01: tools,
    das02: { refs: stock?.refs ?? 0, low: stock?.low ?? 0, empty: stock?.empty ?? 0 },
    das03: { entries: movementsToday?.entries ?? 0, exits: movementsToday?.exits ?? 0, returns: movementsToday?.returns ?? 0 },
    das04: showAttendance
      ? {
          present: present.length,
          absent: absentList.length,
          conge: congeList.length + absenceList.length,
          permission: permissionList.length,
          late: late.length,
          detail: attendanceToday.map((r) => {
            const decl = empDeclMap.get(r.id);
            return {
              id: r.id,
              fullName: r.full_name,
              jobTitle: r.job_title,
              inAt: r.in_at,
              outAt: r.out_at,
              lateMinutes: Number(r.late_minutes),
              status: r.in_at
                ? Number(r.late_minutes) > 0
                  ? 'late'
                  : 'present'
                : decl === 'conge' || decl === 'absence'
                  ? 'conge'
                  : decl === 'permission'
                    ? 'permission'
                    : 'absent',
            };
          }),
        }
      : null,
    das05: {
      overdueLoans: overdueLoans.length,
      lowStock: lowStock.length,
      missingTools: missingTools.length,
      missingOut: missingOut.length,
      details: {
        overdueLoans,
        lowStock,
        missingTools,
        missingOut,
        absent: absentList.map((r) => ({ id: r.id, fullName: r.full_name, jobTitle: r.job_title })),
        conge: congeList.map((r) => ({ id: r.id, fullName: r.full_name })),
        permission: permissionList.map((r) => ({ id: r.id, fullName: r.full_name })),
      },
    },
    lastMovements,
  });
});
