import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { verifyPassword } from '../lib/crypto.js';
import { checkSelfie } from '../lib/images.js';
import { loadSettings } from '../lib/settings.js';
import { saveSelfie } from '../lib/selfie-store.js';
import { isSuperAdmin } from '../lib/permissions.js';
import { requireAuth } from '../middleware/auth.js';
import { hasPermission, requirePerm } from '../middleware/permissions.js';
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
  selfie: z.string().optional(),
  pin: z.string().optional(),
  reason: z.string().optional(),
  reasonNote: z.string().optional(),
});

export const kioskRoutes = new Hono();
kioskRoutes.use('*', requireAuth);

kioskRoutes.get('/terminals', requirePerm('terminals.access'), async (c) => {
  const auth = c.get('auth');
  const db = getDb();
  const terminals = isSuperAdmin(auth.user.role)
    ? await db.query('SELECT id, name FROM terminals WHERE active = true ORDER BY name')
    : await db.query(
      `SELECT t.id, t.name
         FROM terminals t
         JOIN terminal_authorizations ta ON ta.terminal_id = t.id
        WHERE t.active = true AND ta.user_id = $1
        ORDER BY t.name`,
      [auth.user.id],
    );
  return c.json({ terminals });
});

kioskRoutes.get('/settings', async (c) => {
  const settings = await loadSettings();
  return c.json({ settings });
});

kioskRoutes.post('/identify', requirePerm('terminals.access'), async (c) => {
  const body = identifyBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Terminal et identifiant requis.' }, 400);

  const locked = checkLock(body.data.terminalId);
  if (locked) return c.json({ error: locked, locked: true }, 423);

  const db = getDb();
  if (!await canUseTerminal(c.get('auth').user.id, c.get('auth').user.role, body.data.terminalId)) {
    return c.json({ error: 'Ce compte n’est pas autorisé à utiliser ce terminal.' }, 403);
  }
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
  const openedMin = parseHm(settings.opening_time || '07:30');
  const earlyCheckinMin = parseHm((settings as any).early_checkin_time || '07:25');
  const lateThresholdMin = parseHm((settings as any).late_threshold_time || '08:00');
  const morningLockoutMin = parseHm((settings as any).morning_lockout_time || '10:00');

  const isMealDelayed = (settings as any).meal_schedule_mode === 'delayed_13h';
  const breakStartMin = parseHm(isMealDelayed ? ((settings as any).break_delayed_start || '13:00') : ((settings as any).break_normal_start || '12:00'));
  const breakEndMin = parseHm(isMealDelayed ? ((settings as any).break_delayed_end || '13:25') : ((settings as any).break_normal_end || '12:25'));
  const resumeStartMin = parseHm(isMealDelayed ? ((settings as any).resume_delayed_start || '14:00') : ((settings as any).resume_normal_start || '13:00'));
  const resumeEndMin = parseHm(isMealDelayed ? ((settings as any).resume_delayed_end || '14:10') : ((settings as any).resume_normal_end || '13:10'));
  const resumeLockoutMin = parseHm(isMealDelayed ? ((settings as any).resume_delayed_lockout_time || '14:30') : ((settings as any).resume_lockout_time || '14:00'));

  const closedMin = parseHm(settings.closing_time || '16:30');
  const closingEndMin = parseHm((settings as any).closing_end_time || '16:40');
  const dayCutoffMin = parseHm((settings as any).day_cutoff_time || '17:00');

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
    ? (todayMin < openedMin ? 0 : todayMin - openedMin)
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

  const isBreakTimeReached = todayMin >= breakStartMin;
  const isTooEarlyForCheckin = !hasIn && isWorkday && todayMin < earlyCheckinMin;
  const isMorningLocked = !hasIn && isWorkday && todayMin >= morningLockoutMin;
  const isResumeLocked = onBreak && isWorkday && todayMin >= resumeLockoutMin;
  const isDayClosed = todayMin >= dayCutoffMin;

  const canPunchIn = !hasIn && !isMorningLocked && !isTooEarlyForCheckin && !isDayClosed;
  const canPunchOut = hasIn && !hasOut && !onBreak;
  const canBreakIn = hasIn && !hasBreakIn && !hasBreakOut && !onBreak && isBreakTimeReached;
  const canBreakOut = onBreak && !isResumeLocked;

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
      isLate: isWorkday && !hasIn && (todayMin >= lateThresholdMin || lateMinutes > settings.tolerance_minutes),
      isTooEarlyForCheckin,
      isMorningLocked,
      isResumeLocked,
      isDayClosed,
      isLateCriticalBlocked: isMorningLocked,
      maxLateAllowed: morningLockoutMin - openedMin,
      isBreakTimeReached,
      breakStartTime: formatHm(breakStartMin),
      breakEndTime: formatHm(breakEndMin),
      resumeStartTime: formatHm(resumeStartMin),
      resumeEndTime: formatHm(resumeEndMin),
      resumeLockoutTime: formatHm(resumeLockoutMin),
      mealScheduleMode: (settings as any).meal_schedule_mode || 'normal_12h',
      isMealDelayed,
      afterClosing: todayMin >= closedMin,
      earlyCheckinTime: (settings as any).early_checkin_time || '07:25',
      openingTime: settings.opening_time || '07:30',
      lateThresholdTime: (settings as any).late_threshold_time || '08:00',
      morningLockoutTime: (settings as any).morning_lockout_time || '10:00',
      closingTime: settings.closing_time || '16:30',
      closingEndTime: (settings as any).closing_end_time || '16:40',
      dayCutoffTime: (settings as any).day_cutoff_time || '17:00',
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

const verifyPinBody = z.object({
  terminalId: z.string().min(1),
  employeeId: z.string().min(1),
  pin: z.string().min(1),
});

kioskRoutes.post('/verify-pin', requirePerm('terminals.access'), async (c) => {
  const body = verifyPinBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Code secret requis.' }, 400);

  const db = getDb();
  if (!await canUseTerminal(c.get('auth').user.id, c.get('auth').user.role, body.data.terminalId)) {
    return c.json({ error: 'Ce compte n’est pas autorisé à utiliser ce terminal.' }, 403);
  }
  const terminal = await db.one<{ id: string }>('SELECT id FROM terminals WHERE id = $1 AND active = true', [body.data.terminalId]);
  if (!terminal) return c.json({ error: 'Terminal non enregistré par la direction.' }, 403);

  const employee = await db.one<{ id: string; full_name: string; active: boolean; pin_hash: string | null; badge_token: string | null }>(
    'SELECT id, full_name, active, pin_hash, badge_token FROM employees WHERE id = $1 AND active = true',
    [body.data.employeeId],
  );
  if (!employee) return c.json({ error: 'Travailleur introuvable.' }, 404);

  const linkedUser = await db.one<{ id: number; role: string; password_hash: string }>(
    'SELECT id, role, password_hash FROM users WHERE employee_id = $1',
    [employee.id],
  );
  if (linkedUser?.role === 'direction') {
    return c.json({ error: 'La Direction n’est pas soumise au pointage.' }, 403);
  }

  const inputPin = body.data.pin.trim();
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

  return c.json({ ok: true });
});

kioskRoutes.post('/punch', requirePerm('terminals.access'), async (c) => {
  const body = punchBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Données de pointage incomplètes.' }, 400);

  const db = getDb();
  if (!await canUseTerminal(c.get('auth').user.id, c.get('auth').user.role, body.data.terminalId)) {
    return c.json({ error: 'Ce compte n’est pas autorisé à utiliser ce terminal.' }, 403);
  }
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

  const pt = body.data.punchType;
  const isSelfieRequired = pt === 'in' || pt === 'out';

  if (isSelfieRequired) {
    if (!body.data.selfie) {
      return c.json({ error: 'Preuve photo obligatoire pour l’arrivée et le départ.' }, 400);
    }
    const photo = checkSelfie(body.data.selfie);
    if (!photo.ok) return c.json({ error: photo.reason }, 400);
  }

  const settings = await loadSettings();
  const now = new Date();
  const today = localDate(now);
  const todayMin = minutesOfDay(now);
  const openedMin = parseHm(settings.opening_time || '07:30');
  const earlyCheckinMin = parseHm((settings as any).early_checkin_time || '07:25');
  const lateThresholdMin = parseHm((settings as any).late_threshold_time || '08:00');
  const morningLockoutMin = parseHm((settings as any).morning_lockout_time || '10:00');

  const isMealDelayed = (settings as any).meal_schedule_mode === 'delayed_13h';
  const breakStartMin = parseHm(isMealDelayed ? ((settings as any).break_delayed_start || '13:00') : ((settings as any).break_normal_start || '12:00'));
  const resumeLockoutMin = parseHm(isMealDelayed ? ((settings as any).resume_delayed_lockout_time || '14:30') : ((settings as any).resume_lockout_time || '14:00'));

  const closedMin = parseHm(settings.closing_time || '16:30');
  const dayCutoffMin = parseHm((settings as any).day_cutoff_time || '17:00');
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

  // Calcul du retard d'arrivée :
  // Si arrivée entre 7h25 et 7h30 : lateMinutes = 0 (effet officiel à 7h30)
  // Si arrivée après 7h30 : minutes de retard
  const lateMinutes = pt === 'in'
    ? (isWorkday ? (todayMin < openedMin ? 0 : todayMin - openedMin) : 0)
    : 0;

  if (pt === 'in') {
    if (hasIn) return c.json({ error: 'Arrivée déjà pointée aujourd’hui.' }, 409);
    if (isWorkday && todayMin < earlyCheckinMin) {
      return c.json({ error: `Pointage non ouvert : les enregistrements débutent à ${(settings as any).early_checkin_time || '07:25'}.` }, 403);
    }
    if (isWorkday && todayMin >= morningLockoutMin) {
      return c.json(
        {
          error: `Pointage bloqué : accès au système verrouillé après ${formatHm(morningLockoutMin)}. Veuillez vous présenter auprès du Frère Surveillant ou de la Direction pour régularisation.`,
          isMorningLocked: true,
        },
        403,
      );
    }
    if (todayMin >= dayCutoffMin) {
      return c.json({ error: `Pointage impossible : la journée de travail a été clôturée par le système à ${formatHm(dayCutoffMin)}.` }, 403);
    }
  }

  if ((pt === 'out' || pt === 'break_out' || pt === 'break_in') && !hasIn) {
    return c.json({ error: 'Pointage impossible sans arrivée préalable.' }, 409);
  }
  if (pt === 'out' && hasOut) return c.json({ error: 'Déjà pointé en fin de journée.' }, 409);
  if (pt === 'out' && onBreak) {
    return c.json({ error: 'Vous êtes actuellement en pause : veuillez pointer la reprise avant le départ définitif.' }, 409);
  }

  if (pt === 'break_in') {
    if (hasBreakIn || hasBreakOut) return c.json({ error: 'Une pause a déjà été enregistrée aujourd’hui.' }, 409);
    if (todayMin < breakStartMin) {
      return c.json({ error: `Heure de pause non atteinte : la pause est autorisée uniquement à partir de ${formatHm(breakStartMin)}.` }, 403);
    }
  }

  if (pt === 'break_out') {
    if (!onBreak) return c.json({ error: 'Aucune pause en cours.' }, 409);
    if (isWorkday && todayMin >= resumeLockoutMin) {
      return c.json(
        {
          error: `Accès au système verrouillé pour la reprise (dépassement limite après ${formatHm(resumeLockoutMin)}). Veuillez vous adresser au Frère Surveillant.`,
          isResumeLocked: true,
        },
        403,
      );
    }
  }

  const reasonRequired = pt === 'in' && isWorkday && (todayMin >= lateThresholdMin || todayMin > openedMin + settings.tolerance_minutes);
  let reason = body.data.reason?.trim() || null;
  if (!isWorkday) {
    reason = reason ? `${reason} (Astreinte / Jour non ouvré)` : 'Pointage exceptionnel (Jour non ouvré / Astreinte)';
  }
  if (reasonRequired && !reason) {
    return c.json(
      { error: `Retard de ${lateMinutes} min : le motif est obligatoire (tolérance jusqu'à ${formatHm(lateThresholdMin)}).`, lateMinutes, reasonRequired: true },
      409,
    );
  }

  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\..+$/, '');
  let fileName = 'break_no_photo.svg';
  if (isSelfieRequired && body.data.selfie) {
    fileName = await saveSelfie(employee.id, body.data.punchType, stamp, body.data.selfie);
  }

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

kioskRoutes.post('/unlock', requirePerm('terminals.access'), async (c) => {
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

async function canUseTerminal(userId: number, role: string, terminalId: string): Promise<boolean> {
  if (isSuperAdmin(role)) return true;
  if (!await hasPermission(role, 'terminals.access')) return false;
  const assignment = await getDb().one(
    'SELECT 1 AS allowed FROM terminal_authorizations WHERE terminal_id = $1 AND user_id = $2',
    [terminalId, userId],
  );
  return Boolean(assignment);
}
