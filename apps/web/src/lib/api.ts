export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
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
  return data as T;
}

export type Role = 'direction' | 'magasinier' | 'chef_atelier' | 'travailleur' | 'admin';

export type User = {
  id: number;
  login: string;
  display_name: string;
  role: Role;
  employee_id: string | null;
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
  history: { date: string; in_at: string | null; out_at: string | null; break_in: string | null; break_out: string | null; late_minutes: number; status: string }[];
  month: { daysPresent: number; lateCount: number; breaks: number };
  openLoans: { id: number; tool_id: string; out_at: string; motive: string | null; tool_name: string; category: string }[];
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
  employee_id: string;
  full_name: string;
  out_at: string;
  due_at: string | null;
  motive: string | null;
};

export type Employee = {
  id: string;
  full_name: string;
  job_title: string;
  photo_path: string | null;
  badge_token: string | null;
  active: boolean;
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
  initial_qty: number;
  qty: number;
};

export type StockMovement = {
  id: number;
  ref_id: number;
  move_type: 'in' | 'out' | 'correction';
  qty: number;
  beneficiary: string | null;
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
      overdueLoans: { id: number; tool_id: string; tool_name: string; employee_name: string; out_date: string }[];
      lowStock: { id: number; name: string; qty: number; min_qty: number; unit: string }[];
      missingTools: { id: string; name: string; category: string; location: string }[];
      missingOut: { id: string; full_name: string; in_at: string | null }[];
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
  employee: { id: string; full_name: string; job_title: string; photo_path: string | null };
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
  | { kind: 'ignored'; reason: string }
  | { kind: 'unknown'; code: string };

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
  actions: { action: PermissionAction; label: string }[];
  groups: { label: string; actions: PermissionAction[] }[];
  roles: Role[];
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
};
