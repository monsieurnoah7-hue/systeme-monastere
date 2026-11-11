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
import { businessDate, businessDayOfWeek, businessMinutes, formatHm, parseHm } from '../lib/time.js';
import { withOfflineIdempotency } from '../lib/offline-idempotency.js';
import { writeAudit } from '../lib/audit.js';

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
  clientRecordedAt: z.string().optional(),
  offlineRecorded: z.boolean().optional(),
  offlinePunchId: z.string().optional(),
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

kioskRoutes.get('/directory', requirePerm('terminals.access'), async (c) => {
  const db = getDb();
  const today = businessDate();
  const [employees, todayPunches] = await Promise.all([
    db.query<{
      id: string;
      full_name: string;
      job_title: string;
      photo_path: string | null;
      badge_token: string | null;
      has_pin: boolean;
    }>(
      `SELECT id, full_name, job_title, photo_path, badge_token, (pin_hash IS NOT NULL) AS has_pin
         FROM employees
        WHERE active = true
        ORDER BY full_name`,
    ),
    db.query<{
      employee_id: string;
      punch_type: string;
      server_at: string;
      late_minutes: number;
    }>(
      `SELECT employee_id, punch_type, to_char(server_at AT TIME ZONE 'Africa/Douala', 'HH24:MI') AS server_at, late_minutes
         FROM attendance
        WHERE punch_date = $1`,
      [today],
    ),
  ]);
  return c.json({ employees, todayPunches, date: today });
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
  const today = businessDate();

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
            min(CASE WHEN punch_type = 'in'  THEN to_char(server_at AT TIME ZONE 'Africa/Douala', 'HH24:MI') END) AS in_at,
            max(CASE WHEN punch_type = 'out' THEN to_char(server_at AT TIME ZONE 'Africa/Douala', 'HH24:MI') END) AS out_at,
            max(late_minutes) AS late_minutes,
            max(status) AS status
       FROM attendance
      WHERE employee_id = $1 AND punch_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Douala')::date - INTERVAL '30 days'
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
        AND date_trunc('month', punch_date) = date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Douala')::date)`,
    [employee.id],
  );

  const now = new Date();
  const openedMin = parseHm(settings.opening_time || '07:30');
  const earlyCheckinMin = parseHm((settings as any).early_checkin_time || '07:25');
  const lateThresholdMin = parseHm((settings as any).late_threshold_time || '08:10');
  const morningLockoutMin = parseHm((settings as any).morning_lockout_time || '09:30');
  const afternoonCheckinStartMin = parseHm((settings as any).afternoon_checkin_start || '13:00');
  const afternoonCheckinEndMin = parseHm((settings as any).afternoon_checkin_end || '14:00');

  const closedMin = parseHm(settings.closing_time || '16:30');
  const closingEndMin = parseHm((settings as any).closing_end_time || '16:40');
  const dayCutoffMin = parseHm((settings as any).day_cutoff_time || '17:00');

  const todayMin = businessMinutes(now);
  const isWorkday = settings.workdays.includes(businessDayOfWeek(now));
  const hasIn = todayRows.some((r) => r.punch_type === 'in');
  const hasOut = todayRows.some((r) => r.punch_type === 'out');
  const hasBreakIn = todayRows.some((r) => r.punch_type === 'break_in');
  const hasBreakOut = todayRows.some((r) => r.punch_type === 'break_out');
  // Plus de contrainte de pause pour le départ du soir
  const onBreak = false;

  // Calcul du retard d'arrivée :
  let lateMinutes = 0;
  if (hasIn) {
    lateMinutes = Number(todayRows.find((r) => r.punch_type === 'in')?.late_minutes ?? 0);
  } else if (isWorkday) {
    if (todayMin < morningLockoutMin) {
      lateMinutes = todayMin <= openedMin ? 0 : todayMin - openedMin;
    } else if (todayMin >= afternoonCheckinStartMin && todayMin <= afternoonCheckinEndMin) {
      lateMinutes = todayMin <= afternoonCheckinStartMin ? 0 : todayMin - afternoonCheckinStartMin;
    }
  }

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

  const isMorningWindow = todayMin >= earlyCheckinMin && todayMin < morningLockoutMin;
  const isAfternoonWindow = todayMin >= afternoonCheckinStartMin && todayMin <= afternoonCheckinEndMin;
  const isTooEarlyForCheckin = !hasIn && isWorkday && todayMin < earlyCheckinMin;
  const isMorningLocked = !hasIn && isWorkday && todayMin >= morningLockoutMin && todayMin < afternoonCheckinStartMin;
  const isAfternoonLocked = !hasIn && isWorkday && todayMin > afternoonCheckinEndMin;
  const isDayClosed = todayMin >= dayCutoffMin;

  // Le travailleur peut pointer son arrivée le matin (07h25 - 09h30) ou l'après-midi (13h00 - 14h00 s'il n'était pas là le matin)
  const canPunchIn = !hasIn && (!isWorkday || isMorningWindow || isAfternoonWindow) && !isDayClosed;
  // Départ direct dès que l'arrivée est effectuée, sans exiger de pause
  const canPunchOut = hasIn && !hasOut;
  // Pointages de pause et reprise désactivés
  const canBreakIn = false;
  const canBreakOut = false;

  const isLate = isWorkday && !hasIn && (
    (todayMin >= lateThresholdMin && todayMin < morningLockoutMin) ||
    (todayMin > afternoonCheckinStartMin + 10 && todayMin <= afternoonCheckinEndMin)
  );

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
      isLate,
      isTooEarlyForCheckin,
      isMorningLocked,
      isAfternoonLocked,
      isResumeLocked: false,
      isDayClosed,
      isLateCriticalBlocked: isMorningLocked || isAfternoonLocked,
      maxLateAllowed: morningLockoutMin - openedMin,
      isBreakTimeReached: false,
      breakStartTime: '12:00',
      breakEndTime: '13:00',
      resumeStartTime: formatHm(afternoonCheckinStartMin),
      resumeEndTime: formatHm(afternoonCheckinEndMin),
      resumeLockoutTime: formatHm(afternoonCheckinEndMin),
      mealScheduleMode: (settings as any).meal_schedule_mode || 'normal_12h',
      isMealDelayed: false,
      afterClosing: todayMin >= closedMin,
      earlyCheckinTime: (settings as any).early_checkin_time || '07:25',
      openingTime: settings.opening_time || '07:30',
      lateThresholdTime: (settings as any).late_threshold_time || '08:10',
      morningLockoutTime: (settings as any).morning_lockout_time || '09:30',
      afternoonCheckinStart: (settings as any).afternoon_checkin_start || '13:00',
      afternoonCheckinEnd: (settings as any).afternoon_checkin_end || '14:00',
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
  let punchTime = now;
  // Online punches use the server clock (Cameroon time is derived in businessMinutes).
  // A queued offline punch keeps its original device timestamp when it is synchronized.
  if (body.data.offlineRecorded && body.data.clientRecordedAt) {
    const parsed = new Date(body.data.clientRecordedAt);
    if (!Number.isNaN(parsed.getTime())) {
      const maxFuture = now.getTime() + 5 * 60 * 1000;
      const maxPast = now.getTime() - 7 * 24 * 60 * 60 * 1000;
      if (parsed.getTime() <= maxFuture && parsed.getTime() >= maxPast) {
        punchTime = parsed;
      }
    }
  }

  const today = businessDate(punchTime);
  const todayMin = businessMinutes(punchTime);
  const openedMin = parseHm(settings.opening_time || '07:30');
  const earlyCheckinMin = parseHm((settings as any).early_checkin_time || '07:25');
  const lateThresholdMin = parseHm((settings as any).late_threshold_time || '08:10');
  const morningLockoutMin = parseHm((settings as any).morning_lockout_time || '09:30');
  const afternoonCheckinStartMin = parseHm((settings as any).afternoon_checkin_start || '13:00');
  const afternoonCheckinEndMin = parseHm((settings as any).afternoon_checkin_end || '14:00');

  const closedMin = parseHm(settings.closing_time || '16:30');
  const dayCutoffMin = parseHm((settings as any).day_cutoff_time || '17:00');
  const isWorkday = settings.workdays.includes(businessDayOfWeek(punchTime));

  const existing = await db.query<{ punch_type: string }>(
    'SELECT punch_type FROM attendance WHERE employee_id = $1 AND punch_date = $2',
    [employee.id, today],
  );
  const hasIn = existing.some((r) => r.punch_type === 'in');
  const hasOut = existing.some((r) => r.punch_type === 'out');

  // Calcul du retard d'arrivée :
  let lateMinutes = 0;
  if (pt === 'in' && isWorkday) {
    if (todayMin < morningLockoutMin) {
      lateMinutes = todayMin <= openedMin ? 0 : todayMin - openedMin;
    } else if (todayMin >= afternoonCheckinStartMin && todayMin <= afternoonCheckinEndMin) {
      lateMinutes = todayMin <= afternoonCheckinStartMin ? 0 : todayMin - afternoonCheckinStartMin;
    }
  }

  if (pt === 'in') {
    if (hasIn) return c.json({ error: 'Arrivée déjà pointée aujourd’hui.' }, 409);
    if (isWorkday) {
      if (todayMin < earlyCheckinMin) {
        return c.json({ error: `Pointage non ouvert : les enregistrements débutent à ${formatHm(earlyCheckinMin)}.` }, 403);
      }
      if (todayMin >= morningLockoutMin && todayMin < afternoonCheckinStartMin) {
        return c.json(
          {
            error: `Pointage du matin clos à ${formatHm(morningLockoutMin)}. Pour les travailleurs embauchant l'après-midi, le pointage réouvre de ${formatHm(afternoonCheckinStartMin)} à ${formatHm(afternoonCheckinEndMin)}. Veuillez contacter la Direction si nécessaire.`,
            isMorningLocked: true,
          },
          403,
        );
      }
      if (todayMin > afternoonCheckinEndMin) {
        return c.json(
          {
            error: `Pointage des arrivées clos pour la journée (fermeture des arrivées à ${formatHm(afternoonCheckinEndMin)}). Veuillez vous présenter auprès de la Direction.`,
            isDayClosed: true,
          },
          403,
        );
      }
    }
    if (todayMin >= dayCutoffMin) {
      return c.json({ error: `Pointage impossible : la journée de travail a été clôturée par le système à ${formatHm(dayCutoffMin)}.` }, 403);
    }
  }

  if (pt === 'out') {
    if (!hasIn) return c.json({ error: 'Pointage du départ impossible sans arrivée préalable.' }, 409);
    if (hasOut) return c.json({ error: 'Départ déjà pointé en fin de journée.' }, 409);
    // Départ direct sans pause
  }

  if (pt === 'break_in' || pt === 'break_out') {
    return c.json({ error: 'Les pointages de pause et de reprise ont été supprimés du système.' }, 400);
  }

  const reasonRequired = pt === 'in' && isWorkday && (
    (todayMin >= lateThresholdMin && todayMin < morningLockoutMin) ||
    (todayMin > afternoonCheckinStartMin + 10 && todayMin <= afternoonCheckinEndMin)
  );
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

  const stamp = punchTime.toISOString().replace(/[-:]/g, '').replace(/\..+$/, '');
  let fileName = 'break_no_photo.svg';
  if (isSelfieRequired && body.data.selfie) {
    fileName = await saveSelfie(employee.id, body.data.punchType, stamp, body.data.selfie);
  }

  const status = lateMinutes > 0 ? 'late' : 'normal';
  const idempotencyKey = c.req.header('Idempotency-Key') || c.req.header('idempotency-key') || body.data.offlinePunchId;
  const auth = c.get('auth');

  let outcome: { value: Record<string, unknown> };
  try {
    outcome = await withOfflineIdempotency(db, auth.user.id, idempotencyKey, async (tx) => {
      await tx.query(
        `INSERT INTO attendance (employee_id, punch_type, punch_date, server_at, photo_path, terminal_id, id_mode, late_minutes, reason, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          employee.id,
          body.data.punchType,
          today,
          punchTime.toISOString(),
          `selfies/${fileName}`,
          body.data.terminalId,
          body.data.idMode,
          lateMinutes,
          reason,
          status,
        ],
      );

      return {
        ok: true,
        employee: { id: employee.id, full_name: employee.full_name },
        punchType: body.data.punchType,
        serverAt: punchTime.toISOString(),
        serverTime: formatHm(todayMin),
        lateMinutes,
        status,
        photoUrl: `/files/selfies/${fileName}`,
      };
    });
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

  return c.json(outcome.value);
});

kioskRoutes.post('/unlock', requirePerm('terminals.access'), async (c) => {
  const body = z.object({ password: z.string().min(1), terminalId: z.string().trim().min(1).max(80) }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Saisissez votre mot de passe et choisissez une borne.' }, 400);
  const user = c.get('auth').user;
  if (!await canUseTerminal(user.id, user.role, body.data.terminalId)) {
    return c.json({ error: 'Votre compte n’est pas autorisé à déverrouiller cette borne.' }, 403);
  }
  const db = getDb();
  const account = await db.one<{ password_hash: string }>(
    'SELECT password_hash FROM users WHERE id = $1 AND active = true', [user.id],
  );
  if (!account || !verifyPassword(body.data.password, account.password_hash)) {
    return c.json({ error: 'Mot de passe incorrect. Vérifiez le mot de passe de votre compte.' }, 403);
  }
  await writeAudit(db, {
    action: 'kiosk.unlock',
    entity: 'terminal',
    entityId: body.data.terminalId,
    after: { terminalId: body.data.terminalId },
    actorId: user.id,
    actorName: user.display_name,
  });
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
