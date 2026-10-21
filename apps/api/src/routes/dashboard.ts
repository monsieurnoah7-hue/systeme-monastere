import { Hono } from 'hono';
import { getDb } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { localDate } from '../lib/time.js';
import type { Role } from '../types.js';

const FULL_ROLES: Role[] = ['direction'];
const PARTIAL_ROLES: Role[] = ['magasinier', 'chef_atelier'];

export const dashboardRoutes = new Hono();

dashboardRoutes.use('*', requireAuth);

dashboardRoutes.get('/', async (c) => {
  const role = c.get('auth').user.role;
  if (!FULL_ROLES.includes(role) && !PARTIAL_ROLES.includes(role)) {
    return c.json({ error: 'Tableau de bord réservé à la direction, au magasinier et au chef d’atelier.' }, 403);
  }
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
                (r.initial_qty + COALESCE(m.qty, 0)) AS qty
           FROM stock_refs r
           LEFT JOIN (
             SELECT ref_id,
                    sum(CASE WHEN move_type = 'in' THEN qty
                             WHEN move_type = 'out' THEN -qty
                             WHEN move_type = 'correction' THEN qty END) AS qty
               FROM stock_movements GROUP BY ref_id
           ) m ON m.ref_id = r.id
       ) t`,
  );

  const movementsToday = await db.one<{ entries: number; exits: number; returns: number }>(
    `SELECT
        (SELECT count(*)::int FROM stock_movements WHERE move_type = 'in'  AND created_at::date = $1) AS entries,
        (SELECT count(*)::int FROM stock_movements WHERE move_type = 'out' AND created_at::date = $1) AS exits,
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

  const overdueLoans = await db.query(
    `SELECT l.id, l.tool_id, t.name AS tool_name, e.full_name AS employee_name, l.out_at::date::text AS out_date
       FROM loans l JOIN tools t ON t.id = l.tool_id JOIN employees e ON e.id = l.employee_id
      WHERE l.status = 'out' AND l.out_at < now() - interval '7 days'
      ORDER BY l.out_at`,
  );

  const lowStock = await db.query<{ id: number; name: string; qty: number; min_qty: number; unit: string }>(
    `SELECT r.id, r.name, r.unit, r.min_qty::float AS min_qty, (r.initial_qty + COALESCE(m.qty, 0))::float AS qty
       FROM stock_refs r
       LEFT JOIN (
         SELECT ref_id,
                sum(CASE WHEN move_type = 'in' THEN qty
                         WHEN move_type = 'out' THEN -qty
                         WHEN move_type = 'correction' THEN qty END) AS qty
           FROM stock_movements GROUP BY ref_id
       ) m ON m.ref_id = r.id
      WHERE (r.initial_qty + COALESCE(m.qty, 0)) <= r.min_qty
      ORDER BY r.name`,
  );

  const missingTools = await db.query<{ id: string; name: string; category: string; location: string }>(
    `SELECT id, name, category, location FROM tools WHERE status = 'manquant' ORDER BY id`,
  );

  const missingOut = attendanceToday
    .filter((r) => r.in_at && !r.out_at)
    .map((r) => ({ id: r.id, full_name: r.full_name, in_at: r.in_at }));

  const lastMovements = await db.query(
    `SELECT m.created_at::timestamptz::text AS created_at, m.move_type, m.qty::float AS qty, m.beneficiary, r.name AS ref_name, r.unit
       FROM stock_movements m JOIN stock_refs r ON r.id = m.ref_id
      ORDER BY m.created_at DESC LIMIT 12`,
  );

  const showAttendance = FULL_ROLES.includes(role) || PARTIAL_ROLES.includes(role);

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
