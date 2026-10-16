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

CREATE TABLE IF NOT EXISTS users (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  login text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('direction','magasinier','chef_atelier','travailleur','admin')),
  employee_id text REFERENCES employees(id),
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
  due_at timestamptz,
  returned_at timestamptz,
  return_condition text,
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
`;

// Idempotent adjustments for databases created before breaks/permissions/magasins/leaves.
export const MIGRATION_DDL = `
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_punch_type_check;
ALTER TABLE attendance ADD CONSTRAINT attendance_punch_type_check
  CHECK (punch_type IN ('in','out','break_in','break_out'));
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_employee_id_punch_type_punch_date_key;
ALTER TABLE tools ADD COLUMN IF NOT EXISTS magasin_id text REFERENCES magasins(id);
ALTER TABLE tools ADD COLUMN IF NOT EXISTS status_reason text;
ALTER TABLE stock_refs ADD COLUMN IF NOT EXISTS magasin_id text REFERENCES magasins(id);
ALTER TABLE absences DROP CONSTRAINT IF EXISTS absences_kind_check;
ALTER TABLE absences ADD CONSTRAINT absences_kind_check
  CHECK (kind IN ('absence','conge','permission'));
ALTER TABLE absences ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved';
ALTER TABLE absences ADD COLUMN IF NOT EXISTS reviewed_by text;
ALTER TABLE absences ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE absences ADD COLUMN IF NOT EXISTS review_note text;
`;

export const MIGRATION_NAME = '003_magasins_leaves';
