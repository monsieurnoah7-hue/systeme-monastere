export const DEFAULT_ROLES = ['direction', 'magasinier', 'chef_atelier', 'travailleur'] as const;
export const ROLES = DEFAULT_ROLES;
export type Role = string;

export const TOOL_STATUSES = ['disponible', 'en_pret', 'maintenance', 'manquant', 'reforme'] as const;
export type ToolStatus = (typeof TOOL_STATUSES)[number];

export const TOOL_CONDITIONS = ['bon', 'a_reparer', 'hors_service'] as const;
export type ToolCondition = (typeof TOOL_CONDITIONS)[number];

export const TOOL_EVENT_TYPES = [
  'creation',
  'loan',
  'return',
  'status',
  'repair',
  'missing',
  'correction',
] as const;

export type UserRow = {
  id: number;
  login: string;
  display_name: string;
  role: Role;
  employee_id: string | null;
  photo_path: string | null;
};

export type EmployeeRow = {
  id: string;
  full_name: string;
  job_title: string;
  photo_path: string | null;
  badge_token: string | null;
  active: boolean;
};

export type ToolRow = {
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
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  acquisition_cost: number | null;
  acquisition_year: number | null;
  acquisition_date: string | null;
  lifespan_years: number | null;
  created_at: string;
  magasin_name?: string | null;
  magasin_code?: string | null;
};

export type StockRefRow = {
  id: number;
  name: string;
  category: string;
  unit: string;
  location: string;
  magasin_id: string | null;
  min_qty: number;
  supplier: string | null;
  brand: string | null;
  unit_cost: number | null;
  photo_path: string | null;
  initial_qty: number;
  qty: number;
  created_at: string;
  magasin_name?: string | null;
  magasin_code?: string | null;
};
