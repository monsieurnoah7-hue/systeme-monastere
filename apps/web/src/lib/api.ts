export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type ApiOptions = RequestInit & {
  bypassCache?: boolean;
  cacheTtlMs?: number;
};

type CacheEntry<T = unknown> = {
  data: T;
  etag?: string;
  timestamp: number;
};

const RAM_CACHE = new Map<string, CacheEntry>();
const IN_FLIGHT = new Map<string, Promise<unknown>>();
const PERSIST_PREFIX = 'mf_cache_v2_';

function isPersistable(path: string): boolean {
  return (
    path.startsWith('/api/magasins') ||
    path.startsWith('/api/tools') ||
    path.startsWith('/api/stock') ||
    path.startsWith('/api/employees') ||
    path.startsWith('/api/settings') ||
    path.startsWith('/api/dashboard') ||
    path.startsWith('/api/me')
  );
}

function getStoredCache<T>(path: string): CacheEntry<T> | null {
  try {
    const raw = localStorage.getItem(PERSIST_PREFIX + path);
    if (!raw) return null;
    return JSON.parse(raw) as CacheEntry<T>;
  } catch {
    return null;
  }
}

function setStoredCache(path: string, entry: CacheEntry): void {
  try {
    localStorage.setItem(PERSIST_PREFIX + path, JSON.stringify(entry));
  } catch {
    // quota safe
  }
}

export function clearApiCache(prefix?: string): void {
  if (!prefix) {
    RAM_CACHE.clear();
    try {
      const keys = Object.keys(localStorage);
      for (const k of keys) {
        if (k.startsWith(PERSIST_PREFIX)) localStorage.removeItem(k);
      }
    } catch {}
    return;
  }

  for (const k of Array.from(RAM_CACHE.keys())) {
    if (k.startsWith(prefix)) RAM_CACHE.delete(k);
  }
  try {
    const keys = Object.keys(localStorage);
    for (const k of keys) {
      if (k.startsWith(PERSIST_PREFIX + prefix)) localStorage.removeItem(k);
    }
  } catch {}
}

if (typeof window !== 'undefined') {
  window.addEventListener('mf-refresh-data', () => {
    RAM_CACHE.clear();
  });
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const isGet = method === 'GET';
  const bypassCache = options.bypassCache ?? false;
  const ttl = options.cacheTtlMs ?? 20_000; // 20s en mémoire

  // Mutations (POST, PATCH, PUT, DELETE)
  if (!isGet) {
    const res = await fetch(path, {
      credentials: 'include',
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers ?? {}),
      },
    });
    const text = await res.text();
    const data = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    if (!res.ok) {
      throw new ApiError(res.status, (data?.error as string) ?? `Erreur ${res.status}`);
    }

    // Invalidation intelligente des caches cibles
    if (path.includes('/fleet')) {
      clearApiCache('/api/fleet');
      clearApiCache('/api/dashboard');
    } else if (path.includes('/tools')) {
      clearApiCache('/api/tools');
      clearApiCache('/api/magasins');
      clearApiCache('/api/dashboard');
    } else if (path.includes('/stock')) {
      clearApiCache('/api/stock');
      clearApiCache('/api/magasins');
      clearApiCache('/api/dashboard');
    } else if (path.includes('/magasins')) {
      clearApiCache('/api/magasins');
      clearApiCache('/api/tools');
      clearApiCache('/api/stock');
      clearApiCache('/api/dashboard');
    } else if (path.includes('/employees') || path.includes('/leaves') || path.includes('/attendance')) {
      clearApiCache('/api/employees');
      clearApiCache('/api/leaves');
      clearApiCache('/api/attendance');
      clearApiCache('/api/dashboard');
    } else if (path.includes('/projects')) {
      clearApiCache('/api/projects');
      clearApiCache('/api/dashboard');
    } else if (path.includes('/users') || path.includes('/permissions')) {
      clearApiCache('/api/users');
      clearApiCache('/api/permissions');
    }

    return data as T;
  }

  // Requêtes GET avec Cache SWR & Résilience 2G / Hors-ligne
  const now = Date.now();
  let cached = RAM_CACHE.get(path) as CacheEntry<T> | undefined;
  if (!cached && isPersistable(path)) {
    const disk = getStoredCache<T>(path);
    if (disk) {
      RAM_CACHE.set(path, disk);
      cached = disk;
    }
  }

  // 1. Hit de cache mémoire frais (< 20s) -> Réponse instantanée à 0 ms !
  if (!bypassCache && cached && now - cached.timestamp < ttl) {
    return cached.data;
  }

  // 2. Déduplication des requêtes identiques en cours de vol
  if (IN_FLIGHT.has(path)) {
    return IN_FLIGHT.get(path) as Promise<T>;
  }

  const fetchPromise = (async (): Promise<T> => {
    const headers: Record<string, string> = {
      ...((options.headers as Record<string, string>) ?? {}),
    };
    if (cached?.etag && !bypassCache) {
      headers['If-None-Match'] = cached.etag;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      const res = await fetch(path, {
        credentials: 'include',
        ...options,
        signal: controller.signal,
        headers,
      });
      clearTimeout(timeoutId);

      // 304 Not Modified -> Réutilisation immédiate sans re-téléchargement
      if (res.status === 304 && cached) {
        cached.timestamp = Date.now();
        RAM_CACHE.set(path, cached);
        if (isPersistable(path)) setStoredCache(path, cached);
        return cached.data;
      }

      const text = await res.text();
      const data = text ? (JSON.parse(text) as Record<string, unknown>) : null;

      if (!res.ok) {
        if (res.status >= 500 && cached) {
          console.warn(`[Resilience] Serveur indisponible (${res.status}), utilisation du cache local pour ${path}`);
          return cached.data;
        }
        throw new ApiError(res.status, (data?.error as string) ?? `Erreur ${res.status}`);
      }

      const etag = res.headers.get('etag') ?? undefined;
      const newEntry: CacheEntry<T> = {
        data: data as T,
        etag,
        timestamp: Date.now(),
      };
      RAM_CACHE.set(path, newEntry as CacheEntry);
      if (isPersistable(path)) {
        setStoredCache(path, newEntry as CacheEntry);
      }

      return data as T;
    } catch (err) {
      clearTimeout(timeoutId);
      // Mode dégradé 2G / Réseau coupé : fallback transparent sur le cache local
      if (cached) {
        console.warn(`[Resilience 2G/Hors-ligne] Réseau instable ou lent, données servies depuis le cache pour ${path}`);
        return cached.data;
      }
      throw err;
    } finally {
      IN_FLIGHT.delete(path);
    }
  })();

  IN_FLIGHT.set(path, fetchPromise);
  return fetchPromise;
}

export type Role = string;

export type RoleInfo = {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  user_count?: string | number;
};

export type User = {
  id: number;
  login: string;
  display_name: string;
  role: Role;
  employee_id: string | null;
  photo_path?: string | null;
};

export type ToolStatus = 'disponible' | 'en_pret' | 'maintenance' | 'manquant' | 'reforme';
export type ToolCondition = 'bon' | 'a_reparer' | 'hors_service';

export type Tool = {
  id: string;
  name: string;
  category: string;
  location: string;
  magasin_id: string | null;
  condition: ToolCondition;
  status: ToolStatus;
  status_reason: string | null;
  observations: string | null;
  photo_path: string | null;
  brand?: string | null;
  model?: string | null;
  serial_number?: string | null;
  acquisition_cost?: number | null;
  acquisition_year?: number | null;
  acquisition_date?: string | null;
  lifespan_years?: number | null;
  total_qty?: number;
  loaned_qty?: number;
  available_qty?: number;
  created_at: string;
  magasin_name?: string | null;
  magasin_code?: string | null;
};

export type Magasin = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  active: boolean;
  can_lend?: boolean;
  can_receive_in?: boolean;
  can_deliver_out?: boolean;
  can_transfer?: boolean;
  manager_name?: string | null;
  created_at: string;
  tools_count?: number;
  stock_count?: number;
};

export type LeaveKind = 'conge' | 'permission' | 'absence';
export type LeaveStatus = 'pending' | 'approved' | 'rejected';

export type Leave = {
  id: number;
  employee_id: string;
  full_name?: string;
  job_title?: string;
  photo_path?: string | null;
  kind: LeaveKind;
  from_date: string;
  to_date: string;
  note: string | null;
  status: LeaveStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  actor: string;
  created_at: string;
};

export type HolidayKind = 'legal_national' | 'religious' | 'presidential_decree';

export type Holiday = {
  id: string;
  holiday_date: string;
  name: string;
  kind: HolidayKind;
  decree_ref?: string | null;
  is_chome: boolean;
};

export async function fetchHolidays(year: number): Promise<Holiday[]> {
  const res = await api<{ holidays: Holiday[] }>(`/api/leaves/holidays?year=${year}`);
  return res.holidays || [];
}

export async function declarePresidentialDecree(data: {
  holiday_date: string;
  name: string;
  decree_ref?: string;
  kind?: 'religious' | 'presidential_decree' | 'legal_national';
}): Promise<Holiday> {
  const res = await api<{ holiday: Holiday }>('/api/leaves/holidays/decree', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.holiday;
}

export async function deleteHoliday(id: string): Promise<void> {
  await api(`/api/leaves/holidays/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function requestWorkerPermission(data: { from_date: string; to_date: string; note: string }): Promise<Leave> {
  const res = await api<{ leave: Leave }>('/api/leaves/request-permission', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.leave;
}

export async function deleteLeave(id: number): Promise<void> {
  await api(`/api/leaves/${id}`, {
    method: 'DELETE',
  });
}

export async function updateLeave(
  id: number,
  data: { kind?: LeaveKind; from_date?: string; to_date?: string; note?: string | null; status?: LeaveStatus },
): Promise<Leave> {
  const res = await api<{ leave: Leave }>(`/api/leaves/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return res.leave;
}

export async function purgeLeavesTestData(): Promise<void> {
  await api('/api/leaves/purge-test-data', {
    method: 'POST',
  });
}

export type TodayEmployee = {
  id: string;
  full_name: string;
  job_title: string;
  photo_path: string | null;
  active: boolean;
  status: 'present' | 'late' | 'absent' | 'conge' | 'permission';
  inAt: string | null;
  outAt: string | null;
  breakIn: string | null;
  breakOut: string | null;
  lateMinutes: number;
  leaveKind: string | null;
};

export type MyOverview = {
  employee: Employee;
  situation: 'present' | 'late' | 'absent' | 'conge' | 'permission';
  situationNote: string | null;
  today: { in_at: string | null; out_at: string | null; break_in: string | null; break_out: string | null; late_minutes: number; status: string } | null;
  history: { date: string; in_at: string | null; out_at: string | null; break_in: string | null; break_out: string | null; late_minutes: number; late_reason?: string | null; status: string }[];
  month: { daysPresent: number; lateCount: number; breaks: number };
  openLoans: { id: number; tool_id: string; out_at: string; motive: string | null; tool_name: string; category: string }[];
  loansHistory?: {
    id: number;
    tool_id: string;
    out_at: string;
    returned_at: string | null;
    out_condition?: string | null;
    return_condition: string | null;
    return_notes?: string | null;
    motive: string | null;
    status: string;
    tool_name: string;
    category?: string;
  }[];
  leaves: Leave[];
};

export type Catalog = {
  magasins: { id: string; name: string; code: string }[];
  tools: { id: string; name: string; category: string; status: ToolStatus; condition: ToolCondition; status_reason: string | null; magasin_id: string | null; magasin_name: string | null }[];
  refs: { id: number; name: string; category: string; unit: string; min_qty: number; magasin_id: string | null; magasin_name: string | null; qty: number }[];
};

export type ToolEvent = {
  id: number;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor: string;
  note: string | null;
  created_at: string;
};

export type ToolLoan = {
  id: number;
  tool_id: string;
  tool_name?: string;
  tool_category?: string;
  employee_id: string;
  full_name?: string;
  employee_name?: string;
  qty?: number;
  returned_qty?: number;
  remaining_qty?: number;
  out_at: string;
  out_condition?: string;
  due_at?: string | null;
  motive: string | null;
};

export type Employee = {
  id: string;
  full_name: string;
  job_title: string;
  photo_path: string | null;
  badge_token: string | null;
  active: boolean;
  has_pin?: boolean;
  workdays?: number[];
  daily_work_hours?: number;
};

export type StockRef = {
  id: number;
  name: string;
  category: string;
  unit: string;
  location: string;
  magasin_id: string | null;
  magasin_name?: string | null;
  magasin_code?: string | null;
  min_qty: number;
  supplier: string | null;
  brand?: string | null;
  unit_cost?: number | null;
  photo_path?: string | null;
  initial_qty: number;
  qty: number;
};

export type StockMovement = {
  id: number;
  ref_id: number;
  move_type: 'in' | 'out' | 'correction' | 'transfer';
  qty: number;
  beneficiary: string | null;
  target_magasin_id?: string | null;
  target_magasin_name?: string | null;
  doc_ref: string | null;
  note: string | null;
  actor: string;
  created_at: string;
  ref_name?: string;
  unit?: string;
};

export type Dashboard = {
  role: Role;
  date: string;
  projectsAccess?: boolean;
  generatedAt: string;
  das01: { total: number; disponible: number; en_pret: number; maintenance: number; manquant: number; reforme: number };
  das02: { refs: number; low: number; empty: number };
  das03: { entries: number; exits: number; returns: number };
  das04: {
    present: number;
    absent: number;
    conge: number;
    permission: number;
    late: number;
    detail: {
      id: string;
      fullName: string;
      jobTitle: string;
      photoPath?: string | null;
      inAt: string | null;
      outAt: string | null;
      lateMinutes: number;
      status: string;
    }[];
  } | null;
  das05: {
    overdueLoans: number;
    lowStock: number;
    missingTools: number;
    missingOut: number;
    details: {
      overdueLoans: { id: number; tool_id: string; tool_name: string; employee_name: string; out_date: string; due_date?: string | null; days_overdue?: number }[];
      lowStock: { id: number; name: string; qty: number; min_qty: number; unit: string; location?: string }[];
      missingTools: { id: string; name: string; category: string; location: string; status_reason?: string | null }[];
      missingOut: { id: string; full_name: string; in_at: string | null; punch_date?: string }[];
      absent: { id: string; fullName: string; jobTitle: string }[];
      conge: { id: string; fullName: string }[];
    };
  };
  lastMovements: (StockMovement & { ref_name: string; unit: string })[];
  etablis?: {
    totalKits: number;
    totalItems: number;
    intactItems: number;
    missingItems: number;
    toSharpenItems: number;
    completenessRate: number;
    overdueAuditCount: number;
    anomaliesCount: number;
    dailyCompliance: {
      date: string;
      dueAt: string;
      requiredCount: number;
      completedCount: number;
      pendingCount: number;
      overdueCount: number;
      exemptCount: number;
      items: { kitId: string; code: string; employeeId: string; employeeName: string; etabliNumber: number; status: 'done' | 'pending' | 'overdue' | 'exempt'; reason: string | null; auditedAt: string | null; auditStatus: string | null }[];
    };
    lastAudit: {
      kitCode: string;
      etabliNumber: number;
      employeeName: string;
      auditedAt: string;
      auditedBy: string;
      status: string;
    } | null;
    kits: {
      id: string;
      code: string;
      etabli_number: number;
      location: string;
      status: string;
      last_audited_at: string | null;
      last_audited_by: string | null;
      last_audit_status: string | null;
      employee_id: string;
      employee_name: string;
      employee_job: string;
      employee_photo: string | null;
      source_magasin_id: string;
      source_magasin_name: string;
      source_magasin_code: string;
      items_total: number;
      items_present: number;
      items_missing: number;
      items_to_sharpen: number;
    }[];
  };
  pendingLeaves?: {
    id: number;
    employee_id: string;
    full_name: string;
    job_title?: string;
    photo_path?: string | null;
    kind: string;
    from_date: string;
    to_date: string;
    note: string | null;
    created_at: string;
  }[];
  projects?: {
    totalCount: number;
    activeCount: number;
    delayedCount: number;
    overtimeHours: number;
    financialDamageFcfa: number | null;
    attention: {
      code: string;
      title: string;
      category: string | null;
      status: string;
      delivery_deadline: string;
      days_late: number;
      overtime_hours: number;
    }[];
  } | null;
};

export type MyEtabli = {
  employee: { id: string; full_name: string; active: boolean };
  kit: { id: string; code: string; etabli_number: number; location: string; status: string } | null;
  items: EtabliKitItem[];
  daily: {
    date: string;
    isRequired: boolean;
    reason: string | null;
    status: 'done' | 'pending' | 'overdue' | 'exempt';
    dueAt?: string;
    audit: EtabliKitAudit | null;
  };
};

export type KioskSettings = {
  early_checkin_time?: string;
  opening_time: string;
  late_threshold_time?: string;
  morning_lockout_time?: string;
  meal_schedule_mode?: 'normal_12h' | 'delayed_13h';
  break_start_time?: string;
  break_end_time?: string;
  break_normal_start?: string;
  break_normal_end?: string;
  resume_normal_start?: string;
  resume_normal_end?: string;
  resume_lockout_time?: string;
  break_delayed_start?: string;
  break_delayed_end?: string;
  resume_delayed_start?: string;
  resume_delayed_end?: string;
  resume_delayed_lockout_time?: string;
  closing_time: string;
  closing_end_time?: string;
  day_cutoff_time?: string;
  tolerance_minutes: number;
  max_late_minutes_allowed?: number;
  workdays: number[];
  late_motifs: string[];
  selfie_retention_days: number;
  card_display_seconds: number;
};

export type KioskIdentify = {
  employee: { id: string; full_name: string; job_title: string; photo_path: string | null; has_pin?: boolean };
  situation: {
    isWorkday: boolean;
    hasIn: boolean;
    hasOut: boolean;
    hasBreakIn: boolean;
    hasBreakOut: boolean;
    onBreak: boolean;
    canPunchIn: boolean;
    canPunchOut: boolean;
    canBreakIn: boolean;
    canBreakOut: boolean;
    lateMinutes: number;
    isLateCriticalBlocked?: boolean;
    maxLateAllowed?: number;
    isBreakTimeReached?: boolean;
    breakStartTime?: string;
    afterClosing: boolean;
    openingTime: string;
    closingTime: string;
    toleranceMinutes: number;
    lateMotifs: string[];
    cardDisplaySeconds: number;
    isExceptionalWorkday?: boolean;
    isLate?: boolean;
    isTooEarlyForCheckin?: boolean;
    isMorningLocked?: boolean;
    isResumeLocked?: boolean;
    isDayClosed?: boolean;
    earlyCheckinTime?: string;
    breakEndTime?: string;
    resumeStartTime?: string;
    resumeEndTime?: string;
    resumeLockoutTime?: string;
    mealScheduleMode?: 'normal_12h' | 'delayed_13h';
    isMealDelayed?: boolean;
    activeLeave?: { kind: string; note: string | null } | null;
  };
  history: {
    date: string;
    inAt: string | null;
    outAt: string | null;
    breakIn?: string | null;
    breakOut?: string | null;
    lateMinutes: number;
    status: string;
  }[];
  month: { daysPresent: number; lateCount: number };
};

export type PunchType = 'in' | 'out' | 'break_in' | 'break_out';

export type PunchResult = {
  ok: boolean;
  employee: { id: string; full_name: string };
  punchType: PunchType;
  serverAt: string;
  serverTime: string;
  lateMinutes: number;
  status: string;
  photoUrl: string;
};

export type ScanResult =
  | { kind: 'tool'; tool: Tool & { loan_employee_id?: string | null; loan_employee_name?: string | null; loan_id?: number | null; loan_motive?: string | null; loan_out_at?: string | null }; code: string }
  | { kind: 'employee'; employee: { id: string; full_name: string; job_title: string; photo_path: string | null; active: boolean }; code: string; via: string }
  | { kind: 'stock'; ref: StockRef; code: string }
  | { kind: 'terminal'; terminal: { id: string; name: string }; code: string }
  | { kind: 'etabli_kit'; kit: EtabliKit; items: EtabliKitItem[]; code: string }
  | { kind: 'etabli_kit_item'; item: EtabliKitItem & { kit_code: string; etabli_number: number; etabli_location: string }; code: string }
  | { kind: 'ignored'; reason: string }
  | { kind: 'unknown'; code: string };

export type EtabliKit = {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_job: string;
  employee_photo: string | null;
  etabli_number: number;
  code: string;
  location: string;
  source_magasin_id: string;
  source_magasin_name: string;
  source_magasin_code: string;
  status: string;
  notes: string | null;
  last_audited_at: string | null;
  last_audited_by: string | null;
  last_audit_status: string | null;
  created_at: string;
  items_total: number;
  items_present: number;
  items_anomalies: number;
};

export type EtabliKitItem = {
  id: number;
  kit_id: string;
  item_num: number;
  name: string;
  qty: number;
  unit: string;
  tool_code: string;
  condition: 'bon' | 'a_affuter' | 'a_reparer' | 'manquant' | 'reforme';
  is_present: boolean;
  notes: string | null;
  updated_at: string;
};

export type EtabliKitAudit = {
  id: number;
  kit_id: string;
  audited_by: string;
  auditor_name: string;
  status: 'conforme' | 'anomalie' | 'incomplet';
  items_present_count: number;
  items_total_count: number;
  anomalies_note: string | null;
  audited_at: string;
};

export type EmployeeDetail = {
  employee: Employee;
  account?: {
    id: number;
    login: string;
    role: string;
    role_name: string;
    created_at: string;
  } | null;
  leaves?: {
    id: number;
    from_date: string;
    to_date: string;
    kind: string;
    status: string;
    note: string | null;
    reviewed_by: string | null;
    created_at: string;
  }[];
  history: {
    date: string;
    inAt: string | null;
    outAt: string | null;
    breakIn: string | null;
    breakOut: string | null;
    lateMinutes: number;
    status: string;
  }[];
  month: { daysPresent: number; lateCount: number; breaks: number };
  openLoans: { id: number; tool_id: string; out_at: string; motive: string | null; tool_name: string; category: string }[];
  loanHistory: { id: number; tool_id: string; out_at: string; returned_at: string | null; return_condition: string | null; motive: string | null; tool_name: string }[];
};

export type PermissionAction = string;

export type PermissionMatrix = {
  actions: { action: PermissionAction; label: string; kind?: 'view' | 'action' }[];
  groups: { label: string; actions: PermissionAction[] }[];
  roles: Role[];
  rolesDetail?: RoleInfo[];
  matrix: Record<PermissionAction, Record<string, boolean>>;
};

export type MyPermissions = {
  role: Role;
  superAdmin: boolean;
  permissions: Record<PermissionAction, boolean>;
};

export type TerminalInfo = {
  id: string;
  name: string;
  active: boolean;
  registered_at: string;
  last_used: string | null;
  punches_today: number;
  authorized_user_ids?: number[];
};

export type AppUserRow = {
  id: number;
  login: string;
  display_name: string;
  role: Role;
  employee_id: string | null;
  active: boolean;
  created_at: string;
  photo_path?: string | null;
};

export type BackupInfo = {
  pathname: string;
  uploadedAt: string;
  size: number;
};

// =========================================================================
// PARC AUTOMOBILE & GROUPES ÉLECTROGÈNES
// =========================================================================
export type Vehicle = {
  id: string;
  registration_number: string;
  brand_model: string;
  vehicle_type: 'camionnette' | 'pickup' | 'camion' | 'moto_coursier' | 'voiture_liaison';
  assigned_role: 'coursier' | 'responsable_livraisons' | 'direction' | 'chauffeur' | 'autre';
  assigned_worker_id?: string | null;
  assigned_worker_name?: string | null;
  insurance_company?: string | null;
  insurance_policy_number?: string | null;
  insurance_start_date?: string | null;
  insurance_end_date?: string | null;
  technical_visit_last_date?: string | null;
  technical_visit_due_date?: string | null;
  current_mileage: number;
  last_oil_change_date?: string | null;
  last_oil_change_mileage: number;
  next_oil_change_mileage: number;
  status: 'operationnel' | 'en_maintenance' | 'immobilise' | 'reforme';
  photo_path?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  // Alertes calculées
  insurance_status?: 'valide' | 'warning_30j' | 'urgent_15j' | 'expire';
  insurance_days_left?: number | null;
  tech_visit_status?: 'a_jour' | 'urgent_15j' | 'expire';
  tech_visit_days_left?: number | null;
  oil_change_status?: 'ok' | 'proche' | 'depasse';
  mileage_to_oil_change?: number;
};

export type Generator = {
  id: string;
  name_code: string;
  brand_model: string;
  power_kva: number;
  location: string;
  assigned_manager_id?: string | null;
  assigned_manager_name?: string | null;
  running_hours: number;
  last_oil_change_date?: string | null;
  last_oil_change_hours: number;
  oil_change_interval_hours: number;
  next_oil_change_hours: number;
  last_maintenance_date?: string | null;
  next_maintenance_date?: string | null;
  status: 'en_fonction' | 'en_veille' | 'en_maintenance' | 'hors_service';
  fuel_level_pct: number;
  photo_path?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  // Alertes calculées
  oil_change_status?: 'ok' | 'proche' | 'depasse';
  hours_to_oil_change?: number;
};

export type FleetSummary = {
  vehicles_count: number;
  generators_count: number;
  alerts: {
    insurance_urgent: number;
    tech_visit_urgent: number;
    oil_change_urgent: number;
    generator_oil_urgent: number;
    total_urgent: number;
  };
  vehicles: Vehicle[];
  generators: Generator[];
};

export async function fetchFleetSummary(): Promise<FleetSummary> {
  return api<FleetSummary>('/api/fleet/summary');
}

export async function createVehicle(data: Partial<Vehicle>): Promise<Vehicle> {
  const res = await api<{ vehicle: Vehicle }>('/api/fleet/vehicles', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.vehicle;
}

export async function updateVehicle(id: string, data: Partial<Vehicle>): Promise<Vehicle> {
  const res = await api<{ vehicle: Vehicle }>(`/api/fleet/vehicles/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return res.vehicle;
}

export async function deleteVehicle(id: string): Promise<void> {
  await api(`/api/fleet/vehicles/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function createGenerator(data: Partial<Generator>): Promise<Generator> {
  const res = await api<{ generator: Generator }>('/api/fleet/generators', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.generator;
}

export async function updateGenerator(id: string, data: Partial<Generator>): Promise<Generator> {
  const res = await api<{ generator: Generator }>(`/api/fleet/generators/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return res.generator;
}

export async function deleteGenerator(id: string): Promise<void> {
  await api(`/api/fleet/generators/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// =========================================================================
// COMMANDES, PROJETS & PLANIFICATION DES CHANTIERS DE POSE (PDF Pt 1 & 2)
// =========================================================================
export type Project = {
  id: string;
  code: string;
  title: string;
  client_name: string;
  site_location: string;
  category: string | null;
  start_date?: string;
  work_plan?: ProjectWorkPlanAllocation[];
  assigned_worker_ids: string[];
  assigned_worker_names: string[];
  budget_hours: number;
  spent_hours: number;
  hourly_rate_fcfa: number;
  penalty_rate_daily_fcfa: number;
  ratio_value: number | null;
  ratio_unit: string | null;
  ratio_basis: string | null;
  ratio_quantity: number | null;
  ratio_deadline: string | null;
  delivery_deadline: string;
  installation_start_date?: string | null;
  installation_days: number;
  status: 'planifie' | 'en_fabrication' | 'en_pose' | 'termine' | 'en_retard' | 'litige';
  notes?: string | null;
  created_at: string;
  updated_at: string;
  // Métriques de suivi & arbitrage Direction
  is_delayed?: boolean;
  delayed_days?: number;
  days_to_deadline?: number;
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

export type ProjectWorkPlanAllocation = {
  employee_id: string;
  weekday: number;
  planned_hours: number;
};

export type ProjectWorkLog = {
  id: number;
  employee_id: string;
  employee_name: string;
  work_date: string;
  hours: number;
  note: string | null;
};

export type ProjectIncident = {
  id: number;
  kind: 'power_outage' | 'scope_change' | 'justified_absence' | 'unjustified_absence' | 'work_accident' | 'other';
  description: string;
  delay_days: number;
  employee_ids: string[];
  excluded_from_accountability: boolean;
  event_date: string;
};

export type ProjectsResponse = {
  projects: Project[];
  summary: {
    total_count: number;
    active_count: number;
    delayed_count: number;
    total_overtime_hours: number;
    total_financial_damage_fcfa: number;
  };
};

export async function fetchProjects(): Promise<ProjectsResponse> {
  return api<ProjectsResponse>('/api/projects');
}

export async function createProject(data: Partial<Project>): Promise<Project> {
  const res = await api<{ project: Project }>('/api/projects', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.project;
}

export async function updateProject(id: string, data: Partial<Project>): Promise<Project> {
  const res = await api<{ project: Project }>(`/api/projects/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return res.project;
}

export async function addProjectWorkLog(id: string, data: Pick<ProjectWorkLog, 'employee_id' | 'work_date' | 'hours' | 'note'>): Promise<Project> {
  const res = await api<{ project: Project }>(`/api/projects/${encodeURIComponent(id)}/work-logs`, {
    method: 'POST', body: JSON.stringify(data),
  });
  return res.project;
}

export async function fetchProjectIncidents(id: string): Promise<ProjectIncident[]> {
  const res = await api<{ incidents: ProjectIncident[] }>(`/api/projects/${encodeURIComponent(id)}/incidents`);
  return res.incidents;
}

export async function addProjectIncident(id: string, data: Omit<ProjectIncident, 'id'>): Promise<ProjectIncident> {
  const res = await api<{ incident: ProjectIncident }>(`/api/projects/${encodeURIComponent(id)}/incidents`, {
    method: 'POST', body: JSON.stringify(data),
  });
  return res.incident;
}

export async function deleteProject(id: string): Promise<void> {
  await api(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
