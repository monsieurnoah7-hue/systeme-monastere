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
    path.startsWith('/api/permissions') ||
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
    if (path.includes('/tools')) {
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
};

export type KioskSettings = {
  opening_time: string;
  closing_time: string;
  tolerance_minutes: number;
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
    afterClosing: boolean;
    openingTime: string;
    closingTime: string;
    toleranceMinutes: number;
    lateMotifs: string[];
    cardDisplaySeconds: number;
    isExceptionalWorkday?: boolean;
    isLate?: boolean;
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
  | { kind: 'etabli_kit_item'; item: EtabliKitItem & { kit_code: string; etabli_location: string; employee_name: string; employee_job: string; employee_photo: string | null }; code: string }
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
