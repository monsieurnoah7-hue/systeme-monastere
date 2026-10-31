export const DDL = `
CREATE TABLE IF NOT EXISTS _migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS magasins (
  id text PRIMARY KEY,
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employees (
  id text PRIMARY KEY,
  full_name text NOT NULL,
  job_title text NOT NULL,
  photo_path text,
  badge_token text UNIQUE,
  pin_hash text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roles (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  login text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL,
  employee_id text REFERENCES employees(id),
  photo_path text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS login_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  login text NOT NULL,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_attempts_login_idx ON login_attempts (login, created_at);

CREATE TABLE IF NOT EXISTS terminals (
  id text PRIMARY KEY,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  registered_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tools (
  id text PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'Divers',
  location text NOT NULL DEFAULT 'Magasin',
  magasin_id text REFERENCES magasins(id),
  condition text NOT NULL DEFAULT 'bon' CHECK (condition IN ('bon','a_reparer','hors_service')),
  status text NOT NULL DEFAULT 'disponible' CHECK (status IN ('disponible','en_pret','maintenance','manquant','reforme')),
  status_reason text,
  observations text,
  photo_path text,
  brand text,
  model text,
  serial_number text,
  acquisition_cost numeric,
  acquisition_year int,
  acquisition_date date,
  lifespan_years int NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tool_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tool_id text NOT NULL REFERENCES tools(id),
  event_type text NOT NULL,
  from_status text,
  to_status text,
  actor text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tool_events_tool_idx ON tool_events(tool_id, created_at DESC);

CREATE TABLE IF NOT EXISTS loans (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tool_id text NOT NULL REFERENCES tools(id),
  employee_id text NOT NULL REFERENCES employees(id),
  out_at timestamptz NOT NULL DEFAULT now(),
  out_condition text NOT NULL DEFAULT 'bon',
  due_at timestamptz,
  returned_at timestamptz,
  return_condition text,
  return_notes text,
  motive text,
  status text NOT NULL DEFAULT 'out' CHECK (status IN ('out','returned'))
);
CREATE INDEX IF NOT EXISTS loans_status_idx ON loans(status);
CREATE INDEX IF NOT EXISTS loans_tool_idx ON loans(tool_id);

CREATE TABLE IF NOT EXISTS stock_refs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'Divers',
  unit text NOT NULL DEFAULT 'u',
  location text NOT NULL DEFAULT 'Quincaillerie',
  magasin_id text REFERENCES magasins(id),
  min_qty numeric NOT NULL DEFAULT 0,
  supplier text,
  brand text,
  unit_cost numeric,
  photo_path text,
  initial_qty numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ref_id bigint NOT NULL REFERENCES stock_refs(id),
  move_type text NOT NULL CHECK (move_type IN ('in','out','correction')),
  qty numeric NOT NULL,
  beneficiary text,
  doc_ref text,
  note text,
  actor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_movements_ref_idx ON stock_movements(ref_id, created_at DESC);

CREATE TABLE IF NOT EXISTS attendance (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id text NOT NULL REFERENCES employees(id),
  punch_type text NOT NULL CHECK (punch_type IN ('in','out','break_in','break_out')),
  punch_date date NOT NULL,
  server_at timestamptz NOT NULL DEFAULT now(),
  photo_path text NOT NULL,
  terminal_id text NOT NULL REFERENCES terminals(id),
  id_mode text NOT NULL CHECK (id_mode IN ('manual','badge')),
  late_minutes int NOT NULL DEFAULT 0,
  reason text,
  status text NOT NULL DEFAULT 'normal' CHECK (status IN ('normal','late','corrected','missing_out')),
  corrected_from jsonb,
  correction_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_in_unique ON attendance(employee_id, punch_date) WHERE punch_type = 'in';
CREATE UNIQUE INDEX IF NOT EXISTS attendance_out_unique ON attendance(employee_id, punch_date) WHERE punch_type = 'out';
CREATE UNIQUE INDEX IF NOT EXISTS attendance_break_in_unique ON attendance(employee_id, punch_date) WHERE punch_type = 'break_in';
CREATE UNIQUE INDEX IF NOT EXISTS attendance_break_out_unique ON attendance(employee_id, punch_date) WHERE punch_type = 'break_out';
CREATE INDEX IF NOT EXISTS attendance_date_idx ON attendance(punch_date, punch_type);

CREATE TABLE IF NOT EXISTS absences (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id text NOT NULL REFERENCES employees(id),
  kind text NOT NULL CHECK (kind IN ('absence','conge','permission')),
  from_date date NOT NULL,
  to_date date NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by text,
  reviewed_at timestamptz,
  review_note text,
  actor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  before jsonb,
  after jsonb,
  actor_id bigint,
  actor_name text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_log(created_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role text NOT NULL,
  action text NOT NULL,
  allowed boolean NOT NULL,
  PRIMARY KEY (role, action)
);

CREATE TABLE IF NOT EXISTS selfie_blobs (
  file_name text PRIMARY KEY,
  data text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS image_blobs (
  file_name text PRIMARY KEY,
  data text NOT NULL,
  content_type text NOT NULL DEFAULT 'image/jpeg',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Performance indices for infinite scale (warehouses, tools, stocks, movements, attendances)
CREATE INDEX IF NOT EXISTS tools_magasin_idx ON tools(magasin_id);
CREATE INDEX IF NOT EXISTS tools_status_idx ON tools(status);
CREATE INDEX IF NOT EXISTS tools_category_idx ON tools(category);
CREATE INDEX IF NOT EXISTS tools_location_idx ON tools(location);
CREATE INDEX IF NOT EXISTS tools_created_idx ON tools(created_at DESC);

CREATE INDEX IF NOT EXISTS stock_refs_magasin_idx ON stock_refs(magasin_id);
CREATE INDEX IF NOT EXISTS stock_refs_category_idx ON stock_refs(category);

CREATE INDEX IF NOT EXISTS stock_movements_ref_move_qty_idx ON stock_movements(ref_id, move_type, qty);
CREATE INDEX IF NOT EXISTS stock_movements_created_idx ON stock_movements(created_at DESC);

CREATE INDEX IF NOT EXISTS magasins_code_idx ON magasins(code);
CREATE INDEX IF NOT EXISTS magasins_active_idx ON magasins(active);

CREATE INDEX IF NOT EXISTS loans_employee_status_idx ON loans(employee_id, status);
CREATE INDEX IF NOT EXISTS loans_tool_status_idx ON loans(tool_id, status);

CREATE INDEX IF NOT EXISTS employees_active_idx ON employees(active);

CREATE INDEX IF NOT EXISTS attendance_emp_date_idx ON attendance(employee_id, punch_date DESC);
CREATE INDEX IF NOT EXISTS attendance_terminal_idx ON attendance(terminal_id);

CREATE INDEX IF NOT EXISTS audit_entity_idx ON audit_log(entity, entity_id);
`;

// Idempotent adjustments for databases created before breaks/permissions/magasins/leaves/tools accounting.
export const MIGRATION_DDL = `
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_punch_type_check;
ALTER TABLE attendance ADD CONSTRAINT attendance_punch_type_check
  CHECK (punch_type IN ('in','out','break_in','break_out'));
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_employee_id_punch_type_punch_date_key;
ALTER TABLE tools ADD COLUMN IF NOT EXISTS magasin_id text REFERENCES magasins(id);
ALTER TABLE tools ADD COLUMN IF NOT EXISTS status_reason text;
ALTER TABLE tools ADD COLUMN IF NOT EXISTS brand text;
ALTER TABLE tools ADD COLUMN IF NOT EXISTS model text;
ALTER TABLE tools ADD COLUMN IF NOT EXISTS serial_number text;
ALTER TABLE tools ADD COLUMN IF NOT EXISTS acquisition_cost numeric;
ALTER TABLE tools ADD COLUMN IF NOT EXISTS acquisition_year int;
ALTER TABLE tools ADD COLUMN IF NOT EXISTS acquisition_date date;
ALTER TABLE tools ADD COLUMN IF NOT EXISTS lifespan_years int DEFAULT 5;
ALTER TABLE stock_refs ADD COLUMN IF NOT EXISTS magasin_id text REFERENCES magasins(id);
ALTER TABLE stock_refs ADD COLUMN IF NOT EXISTS photo_path text;
ALTER TABLE stock_refs ADD COLUMN IF NOT EXISTS brand text;
ALTER TABLE stock_refs ADD COLUMN IF NOT EXISTS unit_cost numeric;
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_path text;
CREATE TABLE IF NOT EXISTS image_blobs (
  file_name text PRIMARY KEY,
  data text NOT NULL,
  content_type text NOT NULL DEFAULT 'image/jpeg',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE absences DROP CONSTRAINT IF EXISTS absences_kind_check;
ALTER TABLE absences ADD CONSTRAINT absences_kind_check
  CHECK (kind IN ('absence','conge','permission'));
ALTER TABLE absences ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved';
ALTER TABLE absences ADD COLUMN IF NOT EXISTS reviewed_by text;
ALTER TABLE absences ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE absences ADD COLUMN IF NOT EXISTS review_note text;
UPDATE users SET role = 'direction' WHERE role = 'admin';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
CREATE TABLE IF NOT EXISTS roles (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
UPDATE roles SET is_system = true WHERE id IN ('direction', 'magasinier', 'chef_atelier', 'travailleur');
INSERT INTO roles (id, name, description, is_system) VALUES
  ('direction', 'Direction (Super-Admin)', 'Gouvernance intégrale du monastère et du C.F.T., gestion des rôles et droits', true),
  ('magasinier', 'Magasinier', 'Gestion de l''outillage, des dépôts, de la quincaillerie et des stocks', true),
  ('chef_atelier', 'Chef d''atelier', 'Supervision des équipes, des plannings d''atelier et des présences', true),
  ('travailleur', 'Travailleur / Menuisier', 'Consultation personnelle de son espace, de ses outils et de ses fiches', true)
ON CONFLICT (id) DO UPDATE SET is_system = true;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS out_condition text DEFAULT 'bon';
ALTER TABLE loans ADD COLUMN IF NOT EXISTS return_notes text;
CREATE TABLE IF NOT EXISTS app_permissions (
  action text PRIMARY KEY,
  label text NOT NULL,
  group_label text NOT NULL,
  is_custom boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Performance indices for infinite scale (warehouses, tools, stocks, movements, attendances)
CREATE INDEX IF NOT EXISTS tools_magasin_idx ON tools(magasin_id);
CREATE INDEX IF NOT EXISTS tools_status_idx ON tools(status);
CREATE INDEX IF NOT EXISTS tools_category_idx ON tools(category);
CREATE INDEX IF NOT EXISTS tools_location_idx ON tools(location);
CREATE INDEX IF NOT EXISTS tools_created_idx ON tools(created_at DESC);

CREATE INDEX IF NOT EXISTS stock_refs_magasin_idx ON stock_refs(magasin_id);
CREATE INDEX IF NOT EXISTS stock_refs_category_idx ON stock_refs(category);

CREATE INDEX IF NOT EXISTS stock_movements_ref_move_qty_idx ON stock_movements(ref_id, move_type, qty);
CREATE INDEX IF NOT EXISTS stock_movements_created_idx ON stock_movements(created_at DESC);

CREATE INDEX IF NOT EXISTS magasins_code_idx ON magasins(code);
CREATE INDEX IF NOT EXISTS magasins_active_idx ON magasins(active);

CREATE INDEX IF NOT EXISTS loans_employee_status_idx ON loans(employee_id, status);
CREATE INDEX IF NOT EXISTS loans_tool_status_idx ON loans(tool_id, status);

CREATE INDEX IF NOT EXISTS employees_active_idx ON employees(active);

CREATE INDEX IF NOT EXISTS attendance_emp_date_idx ON attendance(employee_id, punch_date DESC);
CREATE INDEX IF NOT EXISTS attendance_terminal_idx ON attendance(terminal_id);

CREATE INDEX IF NOT EXISTS audit_entity_idx ON audit_log(entity, entity_id);

-- Migration 008: Quantités d'outils par référence, prêts quantitatifs & retours partiels
ALTER TABLE tools ADD COLUMN IF NOT EXISTS total_qty int NOT NULL DEFAULT 1;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS qty int NOT NULL DEFAULT 1;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS returned_qty int NOT NULL DEFAULT 0;
ALTER TABLE tool_events ADD COLUMN IF NOT EXISTS qty int NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS loans_tool_active_idx ON loans(tool_id, status);

-- Migration 009: Extension mouvements de stock (transfert inter-magasins, traçabilité renforcée)
ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_move_type_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_move_type_check CHECK (move_type IN ('in','out','correction','transfer'));
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS target_magasin_id text REFERENCES magasins(id);

-- Migration 010: Permissions opérationnelles et capacités par magasin (prêts, arrivages, sorties, transferts)
ALTER TABLE magasins ADD COLUMN IF NOT EXISTS can_lend boolean NOT NULL DEFAULT true;
ALTER TABLE magasins ADD COLUMN IF NOT EXISTS can_receive_in boolean NOT NULL DEFAULT true;
ALTER TABLE magasins ADD COLUMN IF NOT EXISTS can_deliver_out boolean NOT NULL DEFAULT true;
ALTER TABLE magasins ADD COLUMN IF NOT EXISTS can_transfer boolean NOT NULL DEFAULT true;
ALTER TABLE magasins ADD COLUMN IF NOT EXISTS manager_name text;

-- Migration 011: Kits d'établis & boîtes à outils intelligentes avec traçabilité par QR code
CREATE TABLE IF NOT EXISTS etabli_kits (
  id text PRIMARY KEY,
  employee_id text NOT NULL REFERENCES employees(id),
  etabli_number int NOT NULL,
  code text NOT NULL UNIQUE,
  location text NOT NULL,
  source_magasin_id text NOT NULL REFERENCES magasins(id),
  status text NOT NULL DEFAULT 'actif' CHECK (status IN ('actif', 'en_revision', 'cloture')),
  notes text,
  last_audited_at timestamptz,
  last_audited_by text,
  last_audit_status text DEFAULT 'conforme' CHECK (last_audit_status IN ('conforme', 'anomalie', 'incomplet')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS etabli_kits_emp_idx ON etabli_kits(employee_id);
CREATE INDEX IF NOT EXISTS etabli_kits_source_idx ON etabli_kits(source_magasin_id);

CREATE TABLE IF NOT EXISTS etabli_kit_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kit_id text NOT NULL REFERENCES etabli_kits(id) ON DELETE CASCADE,
  item_num int NOT NULL,
  name text NOT NULL,
  qty int NOT NULL DEFAULT 1,
  unit text NOT NULL DEFAULT 'pièce',
  tool_code text NOT NULL UNIQUE,
  condition text NOT NULL DEFAULT 'bon' CHECK (condition IN ('bon', 'a_affuter', 'a_reparer', 'manquant', 'reforme')),
  is_present boolean NOT NULL DEFAULT true,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS etabli_kit_items_kit_idx ON etabli_kit_items(kit_id);
CREATE INDEX IF NOT EXISTS etabli_kit_items_tool_code_idx ON etabli_kit_items(tool_code);

CREATE TABLE IF NOT EXISTS etabli_kit_audits (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kit_id text NOT NULL REFERENCES etabli_kits(id) ON DELETE CASCADE,
  audited_by text NOT NULL,
  auditor_name text,
  status text NOT NULL CHECK (status IN ('conforme', 'anomalie', 'incomplet')),
  items_present_count int NOT NULL,
  items_total_count int NOT NULL,
  anomalies_note text,
  audited_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS etabli_kit_audits_kit_idx ON etabli_kit_audits(kit_id, audited_at DESC);
`;

export const MIGRATION_NAME = '011_etabli_kits_system';
