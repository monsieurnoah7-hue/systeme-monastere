import { env } from '../env.js';
import { hashPassword } from '../lib/crypto.js';
import { DDL, MIGRATION_DDL, MIGRATION_NAME } from './ddl.js';
import { getDb } from './index.js';
import { syncOfficialCftmData } from './cftm-data.js';
import { DEFAULT_PERMISSIONS, PERMISSION_ACTIONS } from '../lib/permissions.js';

type AccessProvision = {
  employeeId: string;
  role: string;
  roleName: string;
  description: string;
  baseRole: string;
  grants: string[];
  logins?: string[];
  terminal?: string;
  stores?: { id: string; scan?: boolean; stock?: boolean; lend?: boolean; return?: boolean }[];
};

const REQUESTED_ACCESS: AccessProvision[] = [
  { employeeId: 'EMP-001', role: 'direction', roleName: 'Direction (Super-Admin)', description: 'Super-administrateur du système', baseRole: 'direction', grants: [], terminal: 'TERM-FEAD' },
  { employeeId: 'EMP-002', role: 'sg_pointage', roleName: 'Secrétariat général · pointage', description: 'Consultation des présences et accès à la borne dédiée', baseRole: 'travailleur', grants: ['attendance.view', 'terminals.access'], logins: ['mekeli'], terminal: 'TERM-7AFD' },
  { employeeId: 'EMP-003', role: 'direction_formation_magasin', roleName: 'Direction formation · magasins autorisés', description: 'Accès de consultation et mouvements dans les magasins attribués, plus borne de pointage', baseRole: 'travailleur', grants: ['attendance.view', 'terminals.access', 'scanner.use', 'tools.view', 'loans.view', 'loans.create', 'loans.return', 'magasins.view', 'stock.view', 'stock.move', 'dashboard.view'], logins: ['kouomou'], terminal: 'TERM-BB37', stores: ['MAG-019', 'MAG-021', 'MAG-022', 'MAG-006'].map((id) => ({ id, scan: true, stock: true, lend: true, return: true })) },
  { employeeId: 'EMP-004', role: 'direction_projets', roleName: 'Direction des projets', description: 'Pilotage et mise à jour des commandes et chantiers', baseRole: 'travailleur', grants: ['projects.view', 'projects.create', 'projects.edit', 'dashboard.view', 'reports.view'], logins: ['kamga'] },
  { employeeId: 'EMP-005', role: 'economat_magasin', roleName: 'Économat · magasins autorisés', description: 'Entrées et sorties dans les magasins attribués', baseRole: 'travailleur', grants: ['scanner.use', 'tools.view', 'loans.view', 'loans.create', 'loans.return', 'magasins.view', 'stock.view', 'stock.move', 'dashboard.view'], logins: ['etoga'], stores: ['MAG-019', 'MAG-021', 'MAG-022', 'MAG-006'].map((id) => ({ id, scan: true, stock: true, lend: true, return: true })) },
  { employeeId: 'EMP-006', role: 'controleur_chef', roleName: 'Contrôleur en chef · ateliers et magasins dédiés', description: 'Supervision atelier, pointage, scan des outils et mouvements limités aux panneaux et machines défectueuses', baseRole: 'chef_atelier', grants: ['terminals.access', 'scanner.use', 'stock.move'], logins: ['chef', 'lawson'], terminal: 'TERM-622B', stores: ['MAG-012', 'MAG-014'].map((id) => ({ id, scan: true } )).concat(['MAG-022', 'MAG-018'].map((id) => ({ id, scan: true, stock: true, lend: true, return: true }))) },
  { employeeId: 'EMP-007', role: 'controleur_adjoint', roleName: 'Contrôleur adjoint · scan ateliers', description: 'Supervision existante et scan des outils des ateliers', baseRole: 'chef_atelier', grants: ['scanner.use'], logins: ['mvogo'], stores: ['MAG-012', 'MAG-014'].map((id) => ({ id, scan: true })) },
  { employeeId: 'EMP-008', role: 'responsable_livraisons_parc', roleName: 'Responsable des livraisons · gestion du parc', description: 'Gestion du parc automobile et des groupes électrogènes', baseRole: 'travailleur', grants: ['tools.view', 'tools.create', 'tools.edit', 'tools.delete', 'tools.edit_status'], logins: ['magasin226', 'minkoumba'] },
  { employeeId: 'EMP-009', role: 'expert_comptable', roleName: 'Expert-comptable', description: 'Consultation financière et rapports comptables', baseRole: 'travailleur', grants: ['financial.view', 'reports.view', 'reports.export', 'dashboard.view'], logins: ['sangue'] },
  { employeeId: 'EMP-010', role: 'comptable', roleName: 'Comptable', description: 'Consultation financière et rapports comptables', baseRole: 'travailleur', grants: ['financial.view', 'reports.view', 'dashboard.view'], logins: ['sandjo'] },
  { employeeId: 'EMP-025', role: 'scanner_atelier_obionda', roleName: 'Scanner atelier · Obionda', description: 'Consultation et scan des outils dans les ateliers', baseRole: 'travailleur', grants: ['scanner.use', 'tools.view'], logins: ['obionda'], stores: ['MAG-012', 'MAG-014'].map((id) => ({ id, scan: true })) },
  { employeeId: 'EMP-028', role: 'scanner_atelier_tiembomba', roleName: 'Scanner atelier · Tiembomba', description: 'Consultation et scan des outils dans les ateliers', baseRole: 'travailleur', grants: ['scanner.use', 'tools.view'], logins: ['tiembomba'], stores: ['MAG-012', 'MAG-014'].map((id) => ({ id, scan: true })) },
  { employeeId: 'EMP-055', role: 'vigile_pointage', roleName: 'Vigile · pointage', description: 'Consultation des présences et accès à la borne dédiée', baseRole: 'travailleur', grants: ['attendance.view', 'terminals.access'], logins: ['abdoulaye', 'njarayam'], terminal: 'TERM-D527' },
];

async function provisionRequestedAccess(): Promise<void> {
  const db = getDb();
  await db.query(`INSERT INTO terminals (id, name) VALUES
    ('TERM-D527', 'Borne · Vigile'),
    ('TERM-7AFD', 'Borne · Secrétariat général'),
    ('TERM-BB37', 'Borne · Direction formation'),
    ('TERM-622B', 'Borne · Contrôleur en chef'),
    ('TERM-FEAD', 'Borne · Super-Admin')
    ON CONFLICT (id) DO NOTHING`);

  for (const item of REQUESTED_ACCESS) {
    const marker = `019_access_${item.employeeId.toLowerCase()}`;
    if (await db.one('SELECT name FROM _migrations WHERE name = $1', [marker])) continue;
    const user = await db.one<{ id: number; role: string }>(
      `SELECT id, role FROM users WHERE active = true AND (
         employee_id = $1 OR lower(login) = ANY($2::text[])
       ) ORDER BY (employee_id = $1) DESC, id LIMIT 1`,
      [item.employeeId, item.logins ?? []],
    );
    if (!user) continue; // Retry on a later cold start if the worker account is created afterward.

    if (item.employeeId !== 'EMP-001') {
      await db.query(
        `INSERT INTO roles (id, name, description, is_system) VALUES ($1, $2, $3, false)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description`,
        [item.role, item.roleName, item.description],
      );
      const configured = await db.query<{ action: string; allowed: boolean }>(
        'SELECT action, allowed FROM role_permissions WHERE role = $1', [item.baseRole],
      );
      const basePermissions = new Map(configured.map((permission) => [permission.action, permission.allowed]));
      const allowedPermissions = PERMISSION_ACTIONS.map((action) =>
        item.grants.includes(action) || (basePermissions.get(action) ?? DEFAULT_PERMISSIONS[action].includes(item.baseRole as any)),
      );
      await db.query(
        `INSERT INTO role_permissions (role, action, allowed)
         SELECT $1, permission.action, permission.allowed
           FROM unnest($2::text[], $3::boolean[]) AS permission(action, allowed)
         ON CONFLICT (role, action) DO UPDATE SET allowed = EXCLUDED.allowed`,
        [item.role, [...PERMISSION_ACTIONS], allowedPermissions],
      );
      await db.query('UPDATE users SET role = $2 WHERE id = $1', [user.id, item.role]);
    }

    if (item.terminal) {
      await db.query('DELETE FROM terminal_authorizations WHERE user_id = $1', [user.id]);
      await db.query(
        'INSERT INTO terminal_authorizations (terminal_id, user_id, assigned_by) VALUES ($1, $2, (SELECT id FROM users WHERE employee_id = \'EMP-001\' ORDER BY id LIMIT 1)) ON CONFLICT DO NOTHING',
        [item.terminal, user.id],
      );
    }

    if (item.stores) {
      await db.query('DELETE FROM user_magasin_access WHERE user_id = $1', [user.id]);
      for (const store of item.stores) {
        await db.query(
          `INSERT INTO user_magasin_access (user_id, magasin_id, can_view, can_scan, can_move_stock, can_lend_tools, can_return_tools)
           SELECT $1, id, true, $3, $4, $5, $6 FROM magasins WHERE id = $2
           ON CONFLICT (user_id, magasin_id) DO UPDATE SET can_view = true, can_scan = EXCLUDED.can_scan,
             can_move_stock = EXCLUDED.can_move_stock, can_lend_tools = EXCLUDED.can_lend_tools, can_return_tools = EXCLUDED.can_return_tools`,
          [user.id, store.id, Boolean(store.scan), Boolean(store.stock), Boolean(store.lend), Boolean(store.return)],
        );
      }
    }
    await db.query('INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [marker]);
  }

  const penaltyMarker = '019_project_penalty_rate_v1';
  if (!(await db.one('SELECT name FROM _migrations WHERE name = $1', [penaltyMarker]))) {
    await db.query('UPDATE projects SET penalty_rate_daily_fcfa = 10000 WHERE penalty_rate_daily_fcfa = 0');
    await db.query('INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [penaltyMarker]);
  }
}

// Un seul aller-retour par lot : verrou conseil inclus dans la même
// requête multi-énoncés → transaction implicite unique, les cold starts
// Vercel concurrents ne peuvent plus se marcher dessus.
const LOCK = env.databaseUrl ? 'SELECT pg_advisory_xact_lock(715827882);' : '';

async function runBatch(sql: string): Promise<void> {
  await getDb().query(`${LOCK}\n${sql}`);
}

async function runOneByOne(sql: string): Promise<void> {
  for (const statement of sql.split(';')) {
    const stmt = statement.trim();
    if (!stmt) continue;
    try {
      await getDb().query(stmt);
    } catch {
      // énoncé déjà appliqué ou non applicable sur ce schéma
    }
  }
}

async function runSql(sql: string): Promise<void> {
  try {
    await runBatch(sql);
  } catch {
    await runOneByOne(sql);
  }
}

export async function migrate(): Promise<void> {
  await runSql(DDL);
  await runSql(MIGRATION_DDL);
  await getDb().query('INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [MIGRATION_NAME]);

  // Amorçage initial unique (One-Time Bootstrap) :
  // Ne s'exécute qu'une seule fois sur une base vierge. Les démarrages ultérieurs
  // ne réinjectent JAMAIS les données afin de respecter scrupuleusement les suppressions et modifications de l'admin.
  const SEED_LOCK = '012_cftm_official_seed_v1';
  const seeded = await getDb().query<{ name: string }>(
    'SELECT name FROM _migrations WHERE name = $1',
    [SEED_LOCK],
  );

  if (seeded.length === 0) {
    const empCount = await getDb().one<{ count: string }>('SELECT count(*)::text as count FROM employees').catch(() => null);
    if (!empCount || Number(empCount.count) === 0) {
      await syncOfficialCftmData(getDb());
      console.log('[db] Données initiales CFTM amorcées avec succès (Base vierge initialisée)');
    } else {
      console.log('[db] Base existante détectée avec enregistrements en service : amorçage ignoré pour préserver les suppressions admin');
    }
    await getDb().query('INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [SEED_LOCK]);
  }

  // Révision demandée des dotations nominatives : retirer les établis de
  // supervision 15–17, supprimer deux outils et ajouter les deux nouvelles
  // dotations aux établis restants. Le marqueur et les écritures sont atomiques.
  const KIT_REVISION = '020_worker_kit_inventory_revision';
  await getDb().transaction(async (tx) => {
    const claimed = await tx.query<{ name: string }>(
      'INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING RETURNING name',
      [KIT_REVISION],
    );
    if (!claimed.length) return;

    await tx.query(
      'DELETE FROM etabli_kits WHERE id = ANY($1::text[])',
      [['KIT-LAF-15', 'KIT-MM-16', 'KIT-KD-17']],
    );
    await tx.query(
      `DELETE FROM etabli_kit_items
        WHERE lower(trim(name)) = ANY($1::text[])`,
      [['scie à dos', 'chasse-pointe']],
    );
    await tx.query(`
      INSERT INTO etabli_kit_items (kit_id, item_num, name, qty, unit, tool_code, condition, is_present)
      SELECT k.id, COALESCE(MAX(i.item_num), 0)::int + 1,
             'Caisse bleue pour vis, mèches et embouts', 1, 'pièce',
             'CFTM-' || k.code || '-CAI-VIS-' || LPAD(k.etabli_number::text, 2, '0'), 'bon', true
        FROM etabli_kits k
        LEFT JOIN etabli_kit_items i ON i.kit_id = k.id
       GROUP BY k.id
      ON CONFLICT (tool_code) DO NOTHING
    `);
    await tx.query(`
      INSERT INTO etabli_kit_items (kit_id, item_num, name, qty, unit, tool_code, condition, is_present)
      SELECT k.id, COALESCE(MAX(i.item_num), 0)::int + 1,
             'Gants pour parc à bois', 1, 'paire',
             'CFTM-' || k.code || '-GAN-BOIS-' || LPAD(k.etabli_number::text, 2, '0'), 'bon', true
        FROM etabli_kits k
        LEFT JOIN etabli_kit_items i ON i.kit_id = k.id
      GROUP BY k.id
      ON CONFLICT (tool_code) DO NOTHING
    `);
  });

  // Chaque établi reçoit son propre sac de chantier, y compris sur les bases déjà initialisées.
  await getDb().query(`
    INSERT INTO etabli_kit_items (kit_id, item_num, name, qty, unit, tool_code, condition, is_present)
    SELECT k.id,
           COALESCE(MAX(i.item_num), 0)::int + 1,
           'Sac de chantier', 1, 'pièce',
           'CFTM-' || k.code || '-SAC-' || LPAD(k.etabli_number::text, 2, '0'),
           'bon', true
      FROM etabli_kits k
      LEFT JOIN etabli_kit_items i ON i.kit_id = k.id
     WHERE NOT EXISTS (
       SELECT 1 FROM etabli_kit_items bag
        WHERE bag.kit_id = k.id AND lower(bag.name) = lower('Sac de chantier')
     )
     GROUP BY k.id, k.code, k.etabli_number
    ON CONFLICT (tool_code) DO NOTHING
  `);

  await provisionRequestedAccess();

  const PROJECT_REVISION = '021_project_optional_fields_defaults_v2';
  if (!(await getDb().one('SELECT name FROM _migrations WHERE name = $1', [PROJECT_REVISION]))) {
    await runSql(`
      ALTER TABLE projects ALTER COLUMN installation_days SET DEFAULT 0;
      ALTER TABLE projects ALTER COLUMN installation_days DROP NOT NULL;
      ALTER TABLE projects ALTER COLUMN budget_hours SET DEFAULT 0;
      ALTER TABLE projects ALTER COLUMN budget_hours DROP NOT NULL;
      ALTER TABLE projects ALTER COLUMN hourly_rate_fcfa SET DEFAULT 0;
      ALTER TABLE projects ALTER COLUMN hourly_rate_fcfa DROP NOT NULL;
      ALTER TABLE projects ALTER COLUMN start_date DROP NOT NULL;
      ALTER TABLE projects ALTER COLUMN start_date SET DEFAULT CURRENT_DATE;
      ALTER TABLE projects ALTER COLUMN delivery_deadline DROP NOT NULL;
      ALTER TABLE projects ALTER COLUMN penalty_rate_daily_fcfa DROP NOT NULL;
      ALTER TABLE projects ALTER COLUMN penalty_rate_daily_fcfa SET DEFAULT 10000;
      ALTER TABLE projects ALTER COLUMN title DROP NOT NULL;
      ALTER TABLE projects ALTER COLUMN client_name DROP NOT NULL;
      ALTER TABLE projects ALTER COLUMN site_location DROP NOT NULL;
      ALTER TABLE projects ALTER COLUMN category DROP NOT NULL;
    `);
    await getDb().query('INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [PROJECT_REVISION]);
  }

  const INCIDENT_REVIEW_REVISION = '022_project_incident_review_flow_v1';
  if (!(await getDb().one('SELECT name FROM _migrations WHERE name = $1', [INCIDENT_REVIEW_REVISION]))) {
    await runSql(`
      ALTER TABLE project_incidents ADD COLUMN IF NOT EXISTS reporter_employee_id text REFERENCES employees(id);
      ALTER TABLE project_incidents ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'approved';
      ALTER TABLE project_incidents ADD COLUMN IF NOT EXISTS review_note text;
      ALTER TABLE project_incidents ADD COLUMN IF NOT EXISTS reviewed_by bigint REFERENCES users(id);
      ALTER TABLE project_incidents ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
      ALTER TABLE project_incidents DROP CONSTRAINT IF EXISTS project_incidents_review_status_check;
      ALTER TABLE project_incidents ADD CONSTRAINT project_incidents_review_status_check CHECK (review_status IN ('pending','approved','rejected'));
      ALTER TABLE project_incidents ALTER COLUMN excluded_from_accountability SET DEFAULT false;
    `);
    await getDb().query('INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [INCIDENT_REVIEW_REVISION]);
  }

  const SUPER_OBSERVERS_REVISION = '023_super_observateurs_passifs_v1';
  if (!(await getDb().one('SELECT name FROM _migrations WHERE name = $1', [SUPER_OBSERVERS_REVISION]))) {
    // 1. Inscrire le rôle système 'observateur'
    await getDb().query(`
      INSERT INTO roles (id, name, description, is_system) VALUES
        ('observateur', 'Observateur Passif (Haute Autorité)', 'Consultation intégrale du système, de tous les modules et indicateurs financiers en lecture seule stricte, sans droit de modification.', true)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        is_system = true;
    `);

    // 2. Définir les permissions de l'observateur :
    // Toutes les vues + valorisation financière + export de rapports + édition personnelle de son profil (photo + login)
    // AUCUNE permission de création, modification ou suppression opérationnelle
    const VIEW_AND_SELF_ACTIONS = [
      'dashboard.view',
      'projects.view',
      'tools.view',
      'loans.view',
      'magasins.view',
      'stock.view',
      'attendance.view',
      'leaves.view',
      'employees.view',
      'financial.view',
      'reports.view',
      'reports.export',
      'settings.view',
      'users.view',
      'profile.photo_edit_self',
      'profile.login_edit',
    ];

    for (const action of PERMISSION_ACTIONS) {
      const allowed = VIEW_AND_SELF_ACTIONS.includes(action);
      await getDb().query(`
        INSERT INTO role_permissions (role, action, allowed)
        VALUES ('observateur', $1, $2)
        ON CONFLICT (role, action) DO UPDATE SET allowed = EXCLUDED.allowed;
      `, [action, allowed]);
    }

    // 3. Créer ou mettre à jour les deux super comptes d'observateurs passifs :
    // - Père Nicolas, Prieur du monastère
    // - Père Abbé Christian Meyer (en Suisse)
    const prieurPass = hashPassword('prieur2026');
    const abbePass = hashPassword('abbemeyer2026');

    await getDb().query(`
      INSERT INTO users (login, password_hash, display_name, role, employee_id, photo_path, active)
      VALUES ('prieur', $1, 'Père Nicolas (Prieur)', 'observateur', NULL, '/photos/users/prieur.jpg', true)
      ON CONFLICT (login) DO UPDATE SET
        role = 'observateur',
        display_name = 'Père Nicolas (Prieur)',
        photo_path = COALESCE(users.photo_path, '/photos/users/prieur.jpg'),
        active = true;
    `, [prieurPass]);

    await getDb().query(`
      INSERT INTO users (login, password_hash, display_name, role, employee_id, photo_path, active)
      VALUES ('abbe.meyer', $1, 'Père Abbé Christian Meyer (Suisse)', 'observateur', NULL, '/photos/users/abbe-meyer.jpg', true)
      ON CONFLICT (login) DO UPDATE SET
        role = 'observateur',
        display_name = 'Père Abbé Christian Meyer (Suisse)',
        photo_path = COALESCE(users.photo_path, '/photos/users/abbe-meyer.jpg'),
        active = true;
    `, [abbePass]);

    await getDb().query('INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [SUPER_OBSERVERS_REVISION]);
  }

  const SUPER_OBSERVERS_PHOTOS_REVISION = '024_photos_super_observateurs_v1';
  if (!(await getDb().one('SELECT name FROM _migrations WHERE name = $1', [SUPER_OBSERVERS_PHOTOS_REVISION]))) {
    await getDb().query(`
      UPDATE users SET photo_path = '/photos/users/prieur.jpg' WHERE login = 'prieur';
      UPDATE users SET photo_path = '/photos/users/abbe-meyer.jpg' WHERE login = 'abbe.meyer';
    `);
    await getDb().query('INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [SUPER_OBSERVERS_PHOTOS_REVISION]);
  }
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  migrate()
    .then(() => {
      console.log('[db] migrations appliquées');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[db] échec des migrations', err);
      process.exit(1);
    });
}
