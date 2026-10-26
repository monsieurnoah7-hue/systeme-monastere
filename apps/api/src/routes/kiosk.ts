import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { verifyPassword } from '../lib/crypto.js';
import { checkSelfie } from '../lib/images.js';
import { loadSettings } from '../lib/settings.js';
import { saveSelfie } from '../lib/selfie-store.js';
import { formatHm, localDate, minutesOfDay, parseHm } from '../lib/time.js';

type LockState = { fails: number; lockedUntil: number };
const locks = new Map<string, LockState>();
const MAX_FAILS = 5;
const LOCK_MS = 60_000;

function normalizeCode(code: string): string[] {
  const raw = code.trim().toUpperCase();
  if (!raw) return [];
  const candidates = [raw];
  if (/^\d+$/.test(raw)) {
    candidates.push(`EMP-${raw.padStart(3, '0')}`, `EMP-${raw}`);
  }
  return [...new Set(candidates)];
}

function checkLock(terminalId: string): string | null {
  const state = locks.get(terminalId);
  if (!state) return null;
  if (state.lockedUntil > Date.now()) {
    const seconds = Math.ceil((state.lockedUntil - Date.now()) / 1000);
    return `Terminal verrouillé après ${MAX_FAILS} identifiants invalides. Réessayez dans ${seconds} s.`;
  }
  locks.delete(terminalId);
  return null;
}

function registerFailure(terminalId: string): number {
  const state = locks.get(terminalId) ?? { fails: 0, lockedUntil: 0 };
  state.fails += 1;
  if (state.fails >= MAX_FAILS) {
    state.fails = 0;
    state.lockedUntil = Date.now() + LOCK_MS;
  }
  locks.set(terminalId, state);
  return MAX_FAILS - (state.lockedUntil > Date.now() ? MAX_FAILS : state.fails);
}

const identifyBody = z.object({
  terminalId: z.string().min(1),
  code: z.string().min(1),
});

const punchBody = z.object({
  terminalId: z.string().min(1),
  employeeId: z.string().min(1),
  punchType: z.enum(['in', 'out', 'break_in', 'break_out']),
  idMode: z.enum(['manual', 'badge']),
  selfie: z.string().min(20),
  pin: z.string().optional(),
  reason: z.string().optional(),
  reasonNote: z.string().optional(),
});

export const kioskRoutes = new Hono();

kioskRoutes.get('/terminals', async (c) => {
  const terminals = await getDb().query('SELECT id, name FROM terminals WHERE active = true ORDER BY name');
  return c.json({ terminals });
});

kioskRoutes.get('/settings', async (c) => {
  const settings = await loadSettings();
  return c.json({ settings });
});

kioskRoutes.post('/identify', async (c) => {
  const body = identifyBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Terminal et identifiant requis.' }, 400);

  const locked = checkLock(body.data.terminalId);
  if (locked) return c.json({ error: locked, locked: true }, 423);

  const db = getDb();
  const terminal = await db.one<{ id: string }>('SELECT id FROM terminals WHERE id = $1 AND active = true', [body.data.terminalId]);
  if (!terminal) return c.json({ error: 'Terminal non enregistré par la direction.' }, 403);

  const candidates = normalizeCode(body.data.code);
  const employee = await db.one<{
    id: string;
    full_name: string;
    job_title: string;
    photo_path: string | null;
    active: boolean;
    badge_token: string | null;
    pin_hash: string | null;
  }>(
    `SELECT id, full_name, job_title, photo_path, active, badge_token, pin_hash
       FROM employees
      WHERE active = true AND (id = ANY($1) OR badge_token = ANY($1))
      LIMIT 1`,
    [candidates],
  );

  if (!employee) {
    const remaining = registerFailure(body.data.terminalId);
    if (remaining <= 0) {
      return c.json({ error: `Terminal verrouillé après ${MAX_FAILS} identifiants invalides.`, locked: true }, 423);
    }
    return c.json({ error: `Identifiant inconnu. ${remaining} tentative(s) avant verrouillage.`, remaining }, 404);
  }

  locks.delete(body.data.terminalId);
  const settings = await loadSettings();
  const today = localDate();

  const todayRows = await db.query<{ punch_type: string; server_at: string; late_minutes: number }>(
    'SELECT punch_type, server_at, late_minutes FROM attendance WHERE employee_id = $1 AND punch_date = $2',
    [employee.id, today],
  );

  const history = await db.query<{
    punch_date: string;
    in_at: string | null;
    out_at: string | null;
    late_minutes: number;
    status: string;
  }>(
    `SELECT punch_date::text AS punch_date,
            min(CASE WHEN punch_type = 'in'  THEN to_char(server_at, 'HH24:MI') END) AS in_at,
            max(CASE WHEN punch_type = 'out' THEN to_char(server_at, 'HH24:MI') END) AS out_at,
            max(late_minutes) AS late_minutes,
            max(status) AS status
       FROM attendance
      WHERE employee_id = $1 AND punch_date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY punch_date
      ORDER BY punch_date DESC
      LIMIT 30`,
    [employee.id],
  );

  const monthRows = await db.query<{ late_count: string; days: string }>(
    `SELECT count(*) FILTER (WHERE late_minutes > 0)::text AS late_count,
            count(DISTINCT punch_date)::text AS days
       FROM attendance
      WHERE employee_id = $1
        AND punch_type = 'in'
        AND date_trunc('month', punch_date) = date_trunc('month', CURRENT_DATE)`,
    [employee.id],
  );

  const now = new Date();
  const openedMin = parseHm(settings.opening_time);
  const closedMin = parseHm(settings.closing_time);
  const todayMin = minutesOfDay(now);
  const isWorkday = settings.workdays.includes(now.getDay());
  const hasIn = todayRows.some((r) => r.punch_type === 'in');
  const hasOut = todayRows.some((r) => r.punch_type === 'out');
  const hasBreakIn = todayRows.some((r) => r.punch_type === 'break_in');
  const hasBreakOut = todayRows.some((r) => r.punch_type === 'break_out');
  const onBreak = hasBreakIn && !hasBreakOut;
  const lateMinutes = hasIn
    ? Number(todayRows.find((r) => r.punch_type === 'in')?.late_minutes ?? 0)
    : isWorkday
    ? Math.max(0, todayMin - openedMin)
    : 0;

  // Recherche d'un congé ou d'une permission validée pour aujourd'hui
  const activeLeave = await db.one<{ kind: string; note: string | null; from_date: string; to_date: string }>(
    `SELECT kind, note, from_date::text AS from_date, to_date::text AS to_date 
       FROM absences 
      WHERE employee_id = $1 
        AND status = 'approved' 
        AND $2 >= from_date AND $2 <= to_date
      LIMIT 1`,
    [employee.id, today],
  ).catch(() => null);

  const canPunchIn = !hasIn;
  const canPunchOut = hasIn && !hasOut && !onBreak;
  const canBreakIn = hasIn && !hasBreakIn && !hasBreakOut && !onBreak;
  const canBreakOut = onBreak;

  return c.json({
    employee: {
      id: employee.id,
      full_name: employee.full_name,
      job_title: employee.job_title,
      photo_path: employee.photo_path,
      has_pin: !!employee.pin_hash,
    },
    situation: {
      isWorkday,
      hasIn,
      hasOut,
      hasBreakIn,
      hasBreakOut,
      onBreak,
      canPunchIn,
      canPunchOut,
      canBreakIn,
      canBreakOut,
      lateMinutes,
      isLate: isWorkday && !hasIn && lateMinutes > settings.tolerance_minutes,
      afterClosing: todayMin > closedMin,
      openingTime: settings.opening_time,
      closingTime: settings.closing_time,
      toleranceMinutes: settings.tolerance_minutes,
      lateMotifs: settings.late_motifs,
      cardDisplaySeconds: settings.card_display_seconds,
      isExceptionalWorkday: !isWorkday,
      activeLeave: activeLeave ? { kind: activeLeave.kind, note: activeLeave.note } : null,
    },
    history: history.map((row) => ({
      date: row.punch_date,
      inAt: row.in_at,
      outAt: row.out_at,
      lateMinutes: Number(row.late_minutes),
      status: row.status,
    })),
    month: {
      daysPresent: Number(monthRows[0]?.days ?? 0),
      lateCount: Number(monthRows[0]?.late_count ?? 0),
    },
  });
});

kioskRoutes.post('/punch', async (c) => {
  const body = punchBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Données de pointage incomplètes.' }, 400);

  const db = getDb();
  const terminal = await db.one<{ id: string }>('SELECT id FROM terminals WHERE id = $1 AND active = true', [body.data.terminalId]);
  if (!terminal) return c.json({ error: 'Terminal non enregistré par la direction.' }, 403);

  const employee = await db.one<{ id: string; full_name: string; active: boolean; pin_hash: string | null; badge_token: string | null }>(
    'SELECT id, full_name, active, pin_hash, badge_token FROM employees WHERE id = $1 AND active = true',
    [body.data.employeeId],
  );
  if (!employee) return c.json({ error: 'Travailleur introuvable.' }, 404);

  // 1. La Direction ne pointe jamais
  const linkedUser = await db.one<{ id: number; role: string; password_hash: string }>(
    'SELECT id, role, password_hash FROM users WHERE employee_id = $1',
    [employee.id],
  );
  if (linkedUser?.role === 'direction') {
    return c.json({ error: 'La Direction n’est pas soumise au pointage.' }, 403);
  }

  // 2. Validation OBLIGATOIRE du code secret personnel (Pilier 2 Anti-Fraude)
  const inputPin = body.data.pin?.trim();
  if (!inputPin) {
    return c.json({ error: 'La validation par votre code secret personnel est obligatoire pour pointer.' }, 401);
  }

  let pinValid = false;
  if (employee.pin_hash && verifyPassword(inputPin, employee.pin_hash)) {
    pinValid = true;
  } else if (linkedUser?.password_hash && verifyPassword(inputPin, linkedUser.password_hash)) {
    pinValid = true;
  } else if (employee.badge_token && inputPin.toUpperCase() === employee.badge_token.toUpperCase()) {
    pinValid = true;
  }

  if (!pinValid) {
    return c.json({ error: 'Code secret personnel incorrect. Veuillez vérifier et réessayer.' }, 401);
  }

  const photo = checkSelfie(body.data.selfie);
  if (!photo.ok) return c.json({ error: photo.reason }, 400);

  const settings = await loadSettings();
  const now = new Date();
  const today = localDate(now);
  const todayMin = minutesOfDay(now);
  const openedMin = parseHm(settings.opening_time);
  const closedMin = parseHm(settings.closing_time);
  const isWorkday = settings.workdays.includes(now.getDay());

  const existing = await db.query<{ punch_type: string }>(
    'SELECT punch_type FROM attendance WHERE employee_id = $1 AND punch_date = $2',
    [employee.id, today],
  );
  const hasIn = existing.some((r) => r.punch_type === 'in');
  const hasOut = existing.some((r) => r.punch_type === 'out');
  const hasBreakIn = existing.some((r) => r.punch_type === 'break_in');
  const hasBreakOut = existing.some((r) => r.punch_type === 'break_out');
  const onBreak = hasBreakIn && !hasBreakOut;

  const pt = body.data.punchType;
  if (pt === 'in' && hasIn) return c.json({ error: 'Arrivée déjà pointée aujourd’hui.' }, 409);
  if ((pt === 'out' || pt === 'break_out' || pt === 'break_in') && !hasIn) {
    return c.json({ error: 'Pointage impossible sans arrivée préalable.' }, 409);
  }
  if (pt === 'out' && hasOut) return c.json({ error: 'Déjà pointé en fin de journée.' }, 409);
  if (pt === 'out' && onBreak) return c.json({ error: 'Vous êtes en pause : reprenez d’abord (reprise de pause).' }, 409);
  if (pt === 'break_in' && (hasBreakIn || hasBreakOut)) {
    return c.json({ error: 'Une pause est déjà enregistrée aujourd’hui.' }, 409);
  }
  if (pt === 'break_out' && !onBreak) return c.json({ error: 'Aucune pause en cours.' }, 409);

  const lateMinutes = pt === 'in' ? (isWorkday ? Math.max(0, todayMin - openedMin) : 0) : 0;
  const reasonRequired = pt === 'in' && isWorkday && todayMin > openedMin + settings.tolerance_minutes;
  let reason = body.data.reason?.trim() || null;
  if (!isWorkday) {
    reason = reason ? `${reason} (Astreinte / Jour non ouvré)` : 'Pointage exceptionnel (Jour non ouvré / Astreinte)';
  }
  if (reasonRequired && !reason) {
    return c.json(
      { error: `Retard de ${lateMinutes} min : le motif est obligatoire (tolérance ${settings.tolerance_minutes} min).`, lateMinutes, reasonRequired: true },
      409,
    );
  }

  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\..+$/, '');
  const fileName = await saveSelfie(employee.id, body.data.punchType, stamp, body.data.selfie);

  const status = lateMinutes > 0 ? 'late' : 'normal';
  try {
    await db.query(
      `INSERT INTO attendance (employee_id, punch_type, punch_date, photo_path, terminal_id, id_mode, late_minutes, reason, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        employee.id,
        body.data.punchType,
        today,
        `selfies/${fileName}`,
        body.data.terminalId,
        body.data.idMode,
        lateMinutes,
        reason,
        status,
      ],
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (
      message.includes('attendance_employee_id_punch_type_punch_date_key') ||
      message.includes('attendance_in_unique') ||
      message.includes('attendance_out_unique') ||
      message.includes('attendance_break_in_unique') ||
      message.includes('attendance_break_out_unique') ||
      message.includes('duplicate key')
    ) {
      return c.json({ error: 'Ce pointage a déjà été enregistré.' }, 409);
    }
    throw err;
  }

  return c.json({
    ok: true,
    employee: { id: employee.id, full_name: employee.full_name },
    punchType: body.data.punchType,
    serverAt: now.toISOString(),
    serverTime: formatHm(todayMin),
    lateMinutes,
    status,
    photoUrl: `/files/selfies/${fileName}`,
  });
});

kioskRoutes.post('/unlock', async (c) => {
  const body = z.object({ password: z.string().min(1) }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Mot de passe requis pour déverrouiller la borne.' }, 400);

  const db = getDb();
  const adminUsers = await db.query<{ id: number; login: string; password_hash: string }>(
    `SELECT id, login, password_hash FROM users WHERE role = 'direction' AND active = true`,
  );

  const isMatched = adminUsers.some((u) => verifyPassword(body.data.password, u.password_hash));
  if (!isMatched) {
    return c.json({ error: 'Code superviseur ou mot de passe Direction invalide. Déverrouillage refusé.' }, 403);
  }

  return c.json({ ok: true });
});
