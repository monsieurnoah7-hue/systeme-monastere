import { randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { writeAudit } from '../lib/audit.js';
import { hashPassword, verifyPassword } from '../lib/crypto.js';
import { actorId, actorName, requireAuth, requireRole } from '../middleware/auth.js';
import { requirePerm } from '../middleware/permissions.js';
import type { EmployeeRow } from '../types.js';

export const employeesRoutes = new Hono();

employeesRoutes.use('*', requireAuth);

const createBody = z.object({
  full_name: z.string().min(3),
  job_title: z.string().min(2),
  photo_path: z.string().nullable().optional(),
  pin: z.string().min(4).max(10).optional(),
  workdays: z.array(z.number().int().min(0).max(6)).optional(),
  daily_work_hours: z.number().min(0.5).max(24).optional(),
  create_account: z.boolean().optional(),
  account_login: z.string().optional(),
  account_password: z.string().optional(),
  account_role: z.string().optional(),
});

const patchBody = z.object({
  full_name: z.string().min(3).optional(),
  job_title: z.string().min(2).optional(),
  active: z.boolean().optional(),
  photo_path: z.string().nullable().optional(),
  pin: z.string().min(4).max(10).optional(),
  workdays: z.array(z.number().int().min(0).max(6)).optional(),
  daily_work_hours: z.number().min(0.5).max(24).optional(),
});

async function nextEmployeeId(): Promise<string> {
  const row = await getDb().one<{ max_id: string | null }>(
    `SELECT max(id) AS max_id FROM employees WHERE id ~ '^EMP-[0-9]+$'`,
  );
  const current = row?.max_id ? Number(row.max_id.split('-')[1] ?? 0) : 0;
  return `EMP-${String(current + 1).padStart(3, '0')}`;
}

const BADGE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function newBadgeToken(): string {
  const bytes = randomBytes(5);
  let token = '';
  for (let i = 0; i < 5; i += 1) token += BADGE_ALPHABET[bytes.readUInt8(i) % BADGE_ALPHABET.length];
  return token;
}

employeesRoutes.get('/', requirePerm('employees.view'), async (c) => {
  const employees = await getDb().query<EmployeeRow & { has_pin: boolean }>(
    `SELECT e.id, e.full_name, coalesce(r.name, e.job_title) AS job_title, e.photo_path, e.badge_token, e.active, (e.pin_hash IS NOT NULL) AS has_pin, coalesce(e.workdays, '[1,2,3,4,5,6]'::jsonb) AS workdays, coalesce(e.daily_work_hours, 8)::float AS daily_work_hours
       FROM employees e
       LEFT JOIN users u ON u.employee_id = e.id
       LEFT JOIN roles r ON r.id = u.role
      ORDER BY e.full_name`,
  );
  return c.json({ employees });
});

employeesRoutes.get('/today-status', requirePerm('employees.view'), async (c) => {
  const db = getDb();
  const today = await db.query<{ id: string; full_name: string; job_title: string; photo_path: string | null; active: boolean; in_at: string | null; out_at: string | null; break_in: string | null; break_out: string | null; late_minutes: number; status: string; leave_kind: string | null }>(
    `SELECT e.id, e.full_name, coalesce(max(r.name), e.job_title) AS job_title, e.photo_path, e.active,
            min(CASE WHEN a.punch_type = 'in'  THEN to_char(a.server_at, 'HH24:MI') END) AS in_at,
            max(CASE WHEN a.punch_type = 'out' THEN to_char(a.server_at, 'HH24:MI') END) AS out_at,
            min(CASE WHEN a.punch_type = 'break_in'  THEN to_char(a.server_at, 'HH24:MI') END) AS break_in,
            max(CASE WHEN a.punch_type = 'break_out' THEN to_char(a.server_at, 'HH24:MI') END) AS break_out,
            coalesce(max(a.late_minutes), 0) AS late_minutes,
            coalesce(max(a.status), '') AS status,
            (SELECT ab.kind FROM absences ab
              WHERE ab.employee_id = e.id AND CURRENT_DATE BETWEEN ab.from_date AND ab.to_date AND ab.status = 'approved'
              ORDER BY ab.created_at DESC LIMIT 1) AS leave_kind
       FROM employees e
       LEFT JOIN users u ON u.employee_id = e.id
       LEFT JOIN roles r ON r.id = u.role
       LEFT JOIN attendance a ON a.employee_id = e.id AND a.punch_date = CURRENT_DATE
      WHERE e.active = true
      GROUP BY e.id, e.full_name, e.job_title, e.photo_path, e.active
      ORDER BY e.full_name`,
  );
  return c.json({
    employees: today.map((r) => {
      let s: string;
      if (r.leave_kind === 'conge' || r.leave_kind === 'absence') s = 'conge';
      else if (r.leave_kind === 'permission') s = 'permission';
      else if (r.in_at) s = Number(r.late_minutes) > 0 ? 'late' : 'present';
      else s = 'absent';
      return {
        id: r.id,
        full_name: r.full_name,
        job_title: r.job_title,
        photo_path: r.photo_path,
        active: r.active,
        status: s,
        inAt: r.in_at,
        outAt: r.out_at,
        breakIn: r.break_in,
        breakOut: r.break_out,
        lateMinutes: Number(r.late_minutes),
        leaveKind: r.leave_kind,
      };
    }),
  });
});

employeesRoutes.get('/:id', requirePerm('employees.view'), async (c) => {
  const id = c.req.param('id') ?? '';
  const employee = await getDb().one<EmployeeRow & { has_pin: boolean }>(
    `SELECT e.id, e.full_name, coalesce(r.name, e.job_title) AS job_title, e.photo_path, e.badge_token, e.active, (e.pin_hash IS NOT NULL) AS has_pin, coalesce(e.workdays, '[1,2,3,4,5,6]'::jsonb) AS workdays, coalesce(e.daily_work_hours, 8)::float AS daily_work_hours
       FROM employees e
       LEFT JOIN users u ON u.employee_id = e.id
       LEFT JOIN roles r ON r.id = u.role
      WHERE e.id = $1`,
    [id],
  );
  if (!employee) return c.json({ error: 'Travailleur introuvable.' }, 404);
  return c.json({ employee });
});

employeesRoutes.get('/:id/detail', requirePerm('employees.view'), async (c) => {
  const id = c.req.param('id') ?? '';
  const db = getDb();
  const employee = await db.one<EmployeeRow & { has_pin: boolean }>(
    `SELECT e.id, e.full_name, coalesce(r.name, e.job_title) AS job_title, e.photo_path, e.badge_token, e.active, (e.pin_hash IS NOT NULL) AS has_pin, coalesce(e.workdays, '[1,2,3,4,5,6]'::jsonb) AS workdays, coalesce(e.daily_work_hours, 8)::float AS daily_work_hours
       FROM employees e
       LEFT JOIN users u ON u.employee_id = e.id
       LEFT JOIN roles r ON r.id = u.role
      WHERE e.id = $1`,
    [id],
  );
  if (!employee) return c.json({ error: 'Travailleur introuvable.' }, 404);

  const [history, monthRows, openLoans, loanHistory, userAccount, leaves] = await Promise.all([
    db.query<{
      punch_date: string;
      in_at: string | null;
      out_at: string | null;
      break_in: string | null;
      break_out: string | null;
      late_minutes: number;
      status: string;
    }>(
      `SELECT punch_date::text AS punch_date,
              min(CASE WHEN punch_type = 'in'  THEN to_char(server_at, 'HH24:MI') END) AS in_at,
              max(CASE WHEN punch_type = 'out' THEN to_char(server_at, 'HH24:MI') END) AS out_at,
              min(CASE WHEN punch_type = 'break_in'  THEN to_char(server_at, 'HH24:MI') END) AS break_in,
              max(CASE WHEN punch_type = 'break_out' THEN to_char(server_at, 'HH24:MI') END) AS break_out,
              max(late_minutes) AS late_minutes,
              max(status) AS status
         FROM attendance
        WHERE employee_id = $1 AND punch_date >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY punch_date
        ORDER BY punch_date DESC
        LIMIT 30`,
      [id],
    ),
    db.query<{ late_count: string; days: string; breaks: string }>(
      `SELECT count(*) FILTER (WHERE late_minutes > 0)::text AS late_count,
              count(DISTINCT punch_date) FILTER (WHERE punch_type = 'in')::text AS days,
              count(*) FILTER (WHERE punch_type = 'break_in')::text AS breaks
         FROM attendance
        WHERE employee_id = $1 AND date_trunc('month', punch_date) = date_trunc('month', CURRENT_DATE)`,
      [id],
    ),
    db.query(
      `SELECT l.id, l.tool_id, l.out_at, l.motive, t.name AS tool_name, t.category
         FROM loans l JOIN tools t ON t.id = l.tool_id
        WHERE l.employee_id = $1 AND l.status = 'out'
        ORDER BY l.out_at DESC`,
      [id],
    ),
    db.query(
      `SELECT l.id, l.tool_id, l.out_at, l.returned_at, l.return_condition, l.motive, t.name AS tool_name
         FROM loans l JOIN tools t ON t.id = l.tool_id
        WHERE l.employee_id = $1
        ORDER BY l.out_at DESC
        LIMIT 20`,
      [id],
    ),
    db.one<{
      id: number;
      login: string;
      role: string;
      role_name: string;
      created_at: string;
    }>(
      `SELECT u.id, u.login, u.role, coalesce(r.name, u.role) AS role_name, u.created_at::text
         FROM users u
         LEFT JOIN roles r ON r.id = u.role
        WHERE u.employee_id = $1
        LIMIT 1`,
      [id],
    ),
    db.query<{
      id: number;
      from_date: string;
      to_date: string;
      kind: string;
      status: string;
      note: string | null;
      reviewed_by: string | null;
      created_at: string;
    }>(
      `SELECT id, from_date::text AS from_date, to_date::text AS to_date, kind, status, note, reviewed_by, created_at::text
         FROM absences
        WHERE employee_id = $1
        ORDER BY from_date DESC, id DESC`,
      [id],
    ),
  ]);

  return c.json({
    employee,
    account: userAccount ?? null,
    leaves,
    history: history.map((row) => ({
      date: row.punch_date,
      inAt: row.in_at,
      outAt: row.out_at,
      breakIn: row.break_in,
      breakOut: row.break_out,
      lateMinutes: Number(row.late_minutes),
      status: row.status,
    })),
    month: {
      daysPresent: Number(monthRows[0]?.days ?? 0),
      lateCount: Number(monthRows[0]?.late_count ?? 0),
      breaks: Number(monthRows[0]?.breaks ?? 0),
    },
    openLoans,
    loanHistory,
  });
});

employeesRoutes.post('/', requirePerm('employees.create'), async (c) => {
  const body = createBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Nom et métier obligatoires.' }, 400);
  const db = getDb();
  const id = await nextEmployeeId();
  const badge = newBadgeToken();
  const pinHash = body.data.pin ? hashPassword(body.data.pin.trim()) : null;
  const workdaysJson = body.data.workdays ? JSON.stringify(body.data.workdays) : '[1,2,3,4,5,6]';
  const employee = await db.one<EmployeeRow>(
    `INSERT INTO employees (id, full_name, job_title, badge_token, pin_hash, photo_path, workdays, daily_work_hours)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
     RETURNING id, full_name, job_title, photo_path, badge_token, active, workdays, daily_work_hours`,
    [id, body.data.full_name.trim(), body.data.job_title.trim(), badge, pinHash, body.data.photo_path?.trim() || null, workdaysJson, body.data.daily_work_hours ?? 8],
  );

  await writeAudit(db, {
    entity: 'employee',
    entityId: id,
    action: 'create',
    after: employee,
    actorId: actorId(c),
    actorName: actorName(c),
  });

  // Création fluide du compte utilisateur si demandée
  let createdAccount: { id: number; login: string; role: string } | null = null;
  if (body.data.create_account) {
    let login = (body.data.account_login?.trim().toLowerCase() ||
      body.data.full_name
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '.')
        .replace(/^\.+|\.+$/g, '')).slice(0, 32);
    if (login.length < 3) login = `${login}.${id.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

    const exists = await db.one('SELECT id FROM users WHERE login = $1', [login]);
    if (exists) {
      login = `${login}.${Math.floor(10 + Math.random() * 90)}`;
    }

    const password = body.data.account_password?.trim() || body.data.pin?.trim() || 'Monastere2026!';
    const role = body.data.account_role?.trim() || 'travailleur';

    const user = await db.one<{ id: number; login: string; role: string }>(
      `INSERT INTO users (login, password_hash, display_name, role, employee_id, photo_path)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, login, role`,
      [login, hashPassword(password), body.data.full_name.trim(), role, id, body.data.photo_path?.trim() || null],
    );
    createdAccount = user ?? null;
    await writeAudit(db, {
      entity: 'user',
      entityId: String(user?.id ?? ''),
      action: 'create',
      after: { login, role, employee_id: id },
      actorId: actorId(c),
      actorName: actorName(c),
    });
  }

  return c.json({ employee, account: createdAccount }, 201);
});

employeesRoutes.patch('/:id', requirePerm('employees.edit'), async (c) => {
  const id = c.req.param('id') ?? '';
  const body = patchBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Données invalides.' }, 400);
  if (Object.keys(body.data).length === 0) return c.json({ error: 'Aucun champ à modifier.' }, 400);

  const db = getDb();
  const before = await db.one<EmployeeRow>('SELECT * FROM employees WHERE id = $1', [id]);
  if (!before) return c.json({ error: 'Travailleur introuvable.' }, 404);
  const patch = body.data;

  if (patch.daily_work_hours !== undefined || patch.workdays !== undefined) {
    const nextCapacity = patch.daily_work_hours ?? Number(before.daily_work_hours ?? 8);
    const nextWorkdays = patch.workdays ?? (Array.isArray(before.workdays) ? before.workdays : [1, 2, 3, 4, 5, 6]);
    const activePlans = await db.query<{ code: string; work_plan: unknown }>(
      `SELECT code, work_plan FROM projects WHERE status <> 'termine' AND $1 = ANY(assigned_worker_ids)`, [id]);
    const scheduledByDay = new Map<number, number>();
    for (const project of activePlans) {
      const plan = Array.isArray(project.work_plan) ? project.work_plan as { employee_id: string; weekday: number; planned_hours: number }[] : [];
      for (const entry of plan) if (entry.employee_id === id) {
        scheduledByDay.set(entry.weekday, (scheduledByDay.get(entry.weekday) ?? 0) + Number(entry.planned_hours));
      }
    }
    for (const [weekday, hours] of scheduledByDay) {
      const dayName = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][weekday];
      if (!nextWorkdays.includes(weekday)) return c.json({ error: `Le planning du projet prévoit ${dayName}; modifiez d’abord cette répartition avant de retirer ce jour ouvré.` }, 409);
      if (hours > nextCapacity + 0.001) return c.json({ error: `Les projets prévoient ${hours} h le ${dayName}, au-delà de la nouvelle capacité de ${nextCapacity} h. Ajustez les répartitions des projets d’abord.` }, 409);
    }
  }

  if (patch.active === false) {
    const openLoans = await getDb().one<{ count: string }>(
      `SELECT count(*)::text AS count FROM loans WHERE employee_id = $1 AND status = 'out'`,
      [id],
    );
    if (Number(openLoans?.count ?? 0) > 0) {
      return c.json({ error: 'Outils encore en prêt sur ce travailleur : enregistrez d’abord les retours.' }, 409);
    }
  }

  const pinHash = patch.pin ? hashPassword(patch.pin.trim()) : undefined;
  const workdaysJson = patch.workdays !== undefined ? JSON.stringify(patch.workdays) : null;
  const dailyWorkHours = patch.daily_work_hours ?? null;

  const updated = await db.one<EmployeeRow>(
    `UPDATE employees SET
       full_name = coalesce($2, full_name),
       job_title = coalesce($3, job_title),
       active = coalesce($4, active),
       pin_hash = CASE WHEN $5::text IS NOT NULL THEN $5::text ELSE pin_hash END,
       photo_path = CASE WHEN $6::text IS NOT NULL THEN (CASE WHEN $6 = '' THEN NULL ELSE $6 END) ELSE photo_path END,
       workdays = CASE WHEN $7::text IS NOT NULL THEN $7::jsonb ELSE workdays END,
       daily_work_hours = coalesce($8, daily_work_hours)
      WHERE id = $1
      RETURNING id, full_name, job_title, photo_path, badge_token, active, workdays, daily_work_hours`,
    [
      id,
      patch.full_name?.trim() ?? null,
      patch.job_title?.trim() ?? null,
      patch.active ?? null,
      pinHash ?? null,
      patch.photo_path !== undefined ? (patch.photo_path ? patch.photo_path.trim() : null) : null,
      workdaysJson,
      dailyWorkHours,
    ],
  );
  await writeAudit(db, {
    entity: 'employee',
    entityId: id,
    action: patch.active === false && !before.active ? 'update' : patch.active === false ? 'deactivate' : 'update',
    before,
    after: updated,
    actorId: actorId(c),
    actorName: actorName(c),
  });
  return c.json({ employee: updated });
});

employeesRoutes.post('/:id/photo', requirePerm('employees.photo_edit'), async (c) => {
  const id = c.req.param('id') ?? '';
  const body = z.object({ photo_path: z.string().nullable() }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Photo invalide.' }, 400);

  const db = getDb();
  const updated = await db.one<EmployeeRow>(
    'UPDATE employees SET photo_path = $2 WHERE id = $1 RETURNING id, full_name, job_title, photo_path, badge_token, active',
    [id, body.data.photo_path || null],
  );
  if (!updated) return c.json({ error: 'Travailleur introuvable.' }, 404);

  await writeAudit(db, {
    entity: 'employee',
    entityId: id,
    action: 'photo_update',
    actorId: actorId(c),
    actorName: actorName(c),
    after: { photo_path: body.data.photo_path },
  });
  return c.json({ ok: true, employee: updated });
});

employeesRoutes.post('/:id/pin', requirePerm('employees.edit'), async (c) => {
  const id = c.req.param('id') ?? '';
  const body = z.object({
    old_pin: z.string().optional(),
    pin: z.string().min(4).max(10),
  }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Le code PIN doit comporter entre 4 et 10 caractères.' }, 400);

  const db = getDb();
  const before = await db.one<{ id: string; pin_hash: string | null }>('SELECT id, pin_hash FROM employees WHERE id = $1', [id]);
  if (!before) return c.json({ error: 'Travailleur introuvable.' }, 404);

  if (before.pin_hash && body.data.old_pin) {
    const valid = verifyPassword(body.data.old_pin.trim(), before.pin_hash);
    if (!valid) {
      return c.json({ error: "L'ancien code PIN est incorrect." }, 400);
    }
  }

  const pinHash = hashPassword(body.data.pin.trim());
  await db.query('UPDATE employees SET pin_hash = $1 WHERE id = $2', [pinHash, id]);

  await writeAudit(db, {
    entity: 'employee',
    entityId: id,
    action: 'pin_update',
    actorId: actorId(c),
    actorName: actorName(c),
    reason: 'Code PIN secret de pointage mis à jour par la direction',
  });

  return c.json({ ok: true });
});

employeesRoutes.post('/:id/badge', requirePerm('employees.print_badge'), async (c) => {
  const id = c.req.param('id') ?? '';
  const db = getDb();
  const before = await db.one<EmployeeRow>('SELECT * FROM employees WHERE id = $1', [id]);
  if (!before) return c.json({ error: 'Travailleur introuvable.' }, 404);
  const badge = newBadgeToken();
  const updated = await db.one<EmployeeRow>(
    `UPDATE employees SET badge_token = $2
      WHERE id = $1
      RETURNING id, full_name, job_title, photo_path, badge_token, active`,
    [id, badge],
  );
  await writeAudit(db, {
    entity: 'employee',
    entityId: id,
    action: 'badge_regen',
    before: { badge_token: before.badge_token },
    after: { badge_token: badge },
    actorId: actorId(c),
    actorName: actorName(c),
    reason: 'Nouveau badge (ancien token révoqué)',
  });
  return c.json({ employee: updated });
});

employeesRoutes.delete('/:id', requirePerm('employees.edit'), async (c) => {
  const id = c.req.param('id') ?? '';
  const db = getDb();
  const employee = await db.one<EmployeeRow>('SELECT * FROM employees WHERE id = $1', [id]);
  if (!employee) return c.json({ error: 'Travailleur introuvable.' }, 404);

  // Vérifier s'il a des emprunts d'outils en cours non rendus
  const activeLoans = await db.one<{ count: string }>(
    `SELECT count(*)::text AS count FROM loans WHERE employee_id = $1 AND status = 'out'`,
    [id],
  );
  if (Number(activeLoans?.count ?? 0) > 0) {
    return c.json({ error: 'Impossible de supprimer ce travailleur : il a encore des outils en prêt non restitués.' }, 409);
  }

  await db.transaction(async (tx) => {
    // 1. Délier les comptes utilisateurs rattachés
    await tx.query('UPDATE users SET employee_id = NULL WHERE employee_id = $1', [id]);
    // 2. Nettoyer les pointages, absences et historiques d'emprunts
    await tx.query('DELETE FROM attendance WHERE employee_id = $1', [id]);
    await tx.query('DELETE FROM absences WHERE employee_id = $1', [id]);
    await tx.query('DELETE FROM loans WHERE employee_id = $1', [id]);
    // 3. Supprimer la fiche employé
    await tx.query('DELETE FROM employees WHERE id = $1', [id]);

    await writeAudit(tx, {
      entity: 'employee',
      entityId: id,
      action: 'delete',
      before: employee,
      actorId: actorId(c),
      actorName: actorName(c),
      reason: 'Suppression définitive de la fiche travailleur',
    });
  });

  return c.json({ ok: true, message: `Travailleur ${employee.full_name} supprimé avec succès.`, deleted: employee });
});

const restoreEmployeeSchema = z.object({
  employee: z.object({
    id: z.string().min(1),
    full_name: z.string().min(1),
    job_title: z.string().min(1),
    photo_path: z.string().nullable().optional(),
    badge_token: z.string().nullable().optional(),
    pin_hash: z.string().nullable().optional(),
    active: z.boolean().optional(),
  }),
});

employeesRoutes.post('/restore', requirePerm('employees.edit'), async (c) => {
  const body = restoreEmployeeSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    return c.json({ error: 'Données de restauration invalides.' }, 400);
  }
  const emp = body.data.employee;
  const db = getDb();

  await db.transaction(async (tx) => {
    await tx.query(
      `INSERT INTO employees (id, full_name, job_title, photo_path, badge_token, pin_hash, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE
       SET full_name = EXCLUDED.full_name,
           job_title = EXCLUDED.job_title,
           photo_path = COALESCE(EXCLUDED.photo_path, employees.photo_path),
           badge_token = EXCLUDED.badge_token,
           pin_hash = COALESCE(EXCLUDED.pin_hash, employees.pin_hash),
           active = EXCLUDED.active`,
      [
        emp.id,
        emp.full_name,
        emp.job_title,
        emp.photo_path ?? null,
        emp.badge_token ?? null,
        emp.pin_hash ?? null,
        emp.active ?? true,
      ],
    );

    await writeAudit(tx, {
      entity: 'employee',
      entityId: emp.id,
      action: 'restore',
      after: emp,
      actorId: actorId(c),
      actorName: actorName(c),
      reason: 'Restauration suite à annulation Ctrl+Z',
    });
  });

  const restored = await db.one<EmployeeRow>('SELECT * FROM employees WHERE id = $1', [emp.id]);
  return c.json({ ok: true, employee: restored, message: `Travailleur ${emp.full_name} restauré avec succès.` });
});
