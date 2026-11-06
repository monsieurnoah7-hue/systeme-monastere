import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { writeAudit } from '../lib/audit.js';
import { loadSettings } from '../lib/settings.js';
import { actorId, actorName, requireAuth } from '../middleware/auth.js';
import { requirePerm } from '../middleware/permissions.js';
import { localDate, parseHm } from '../lib/time.js';

export const attendanceRoutes = new Hono();
attendanceRoutes.use('*', requireAuth);

attendanceRoutes.get('/', requirePerm('attendance.view'), async (c) => {
  const date = localDate();
  const rows = await getDb().query<{
    id: string;
    full_name: string;
    job_title: string;
    photo_path: string | null;
    in_at: string | null;
    out_at: string | null;
    late_minutes: number;
    declared_kind: string | null;
  }>(
    `SELECT e.id, e.full_name, e.job_title, e.photo_path,
            min(CASE WHEN a.punch_type = 'in' THEN to_char(a.server_at, 'HH24:MI') END) AS in_at,
            max(CASE WHEN a.punch_type = 'out' THEN to_char(a.server_at, 'HH24:MI') END) AS out_at,
            coalesce(max(a.late_minutes), 0) AS late_minutes,
            (SELECT ab.kind FROM absences ab
              WHERE ab.employee_id = e.id AND $1 BETWEEN ab.from_date AND ab.to_date AND ab.status = 'approved'
              ORDER BY CASE ab.kind WHEN 'absence' THEN 1 WHEN 'conge' THEN 2 ELSE 3 END
              LIMIT 1) AS declared_kind
       FROM employees e
       LEFT JOIN attendance a ON a.employee_id = e.id AND a.punch_date = $1
      WHERE e.active = true
      GROUP BY e.id, e.full_name, e.job_title, e.photo_path
      ORDER BY e.full_name`,
    [date],
  );
  const detail = rows.map((row) => ({
    id: row.id,
    fullName: row.full_name,
    jobTitle: row.job_title,
    photoPath: row.photo_path,
    inAt: row.in_at,
    outAt: row.out_at,
    lateMinutes: Number(row.late_minutes),
    status: row.in_at
      ? Number(row.late_minutes) > 0 ? 'late' : 'present'
      : row.declared_kind === 'absence' || row.declared_kind === 'conge'
        ? 'conge'
        : row.declared_kind === 'permission' ? 'permission' : 'absent',
  }));
  return c.json({ date, detail });
});

const correctionBody = z.object({
  employee_id: z.string().min(1),
  punch_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  punch_type: z.enum(['in', 'out']),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  reason: z.string().trim().min(5, 'Le motif doit contenir au moins 5 caractères.'),
});

attendanceRoutes.patch('/correction', requirePerm('attendance.correct'), async (c) => {
  const parsed = correctionBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Correction invalide.' }, 400);
  const input = parsed.data;
  const date = new Date(`${input.punch_date}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input.punch_date) {
    return c.json({ error: 'Date de pointage invalide.' }, 400);
  }

  const db = getDb();
  const before = await db.one<{
    id: number;
    employee_id: string;
    punch_type: string;
    punch_date: string;
    server_at: string;
    late_minutes: number;
    reason: string | null;
    status: string;
  }>(
    `SELECT id, employee_id, punch_type, punch_date::text AS punch_date, server_at::text AS server_at,
            late_minutes, reason, status
       FROM attendance
      WHERE employee_id = $1 AND punch_date = $2 AND punch_type = $3`,
    [input.employee_id, input.punch_date, input.punch_type],
  );
  if (!before) return c.json({ error: 'Pointage introuvable pour cette date.' }, 404);

  let lateMinutes = Number(before.late_minutes) || 0;
  let status = before.status;
  if (input.punch_type === 'in') {
    const settings = await loadSettings();
    const isWorkday = settings.workdays.includes(date.getUTCDay());
    lateMinutes = isWorkday
      ? Math.max(0, parseHm(input.time) - parseHm(settings.opening_time || '07:30'))
      : 0;
    status = lateMinutes > 0 ? 'late' : 'normal';
  }

  const updated = await db.one(
    `UPDATE attendance
        SET corrected_from = COALESCE(
              corrected_from,
              jsonb_build_object('server_at', server_at, 'late_minutes', late_minutes, 'reason', reason, 'status', status)
            ),
            server_at = date_trunc('day', server_at) + ($4::time - time '00:00'),
            late_minutes = $5,
            status = $6,
            correction_reason = $7
      WHERE employee_id = $1 AND punch_date = $2 AND punch_type = $3
      RETURNING id, employee_id, punch_type, punch_date::text AS punch_date,
                to_char(server_at, 'HH24:MI') AS time, late_minutes, status, correction_reason`,
    [input.employee_id, input.punch_date, input.punch_type, input.time, lateMinutes, status, input.reason],
  );

  await writeAudit(db, {
    entity: 'attendance',
    entityId: String(before.id),
    action: 'correct_time',
    before,
    after: updated,
    actorId: actorId(c),
    actorName: actorName(c),
    reason: input.reason,
  });
  return c.json({ ok: true, attendance: updated });
});
