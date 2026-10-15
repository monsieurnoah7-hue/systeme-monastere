import { hashPassword } from '../lib/crypto.js';
import { migrate } from './migrate.js';
import { getDb } from './index.js';

async function seed() {
  await migrate();
  const db = getDb();

  await db.query(
    `TRUNCATE audit_log, attendance, absences, stock_movements, stock_refs, loans, tool_events, tools, magasins, terminals, sessions, users, employees, settings RESTART IDENTITY CASCADE`,
  );

  const settings: [string, unknown][] = [
    ['opening_time', '07:30'],
    ['closing_time', '16:30'],
    ['tolerance_minutes', 10],
    ['workdays', [1, 2, 3, 4, 5, 6]],
    ['late_motifs', ['Transport', 'Motif familial', 'Mission extérieure', 'Autorisé par la direction', 'Autre']],
    ['selfie_retention_days', 90],
    ['card_display_seconds', 8],
  ];
  for (const [key, value] of settings) {
    await db.query('INSERT INTO settings (key, value) VALUES ($1, $2)', [key, JSON.stringify(value)]);
  }

  const magasins: [string, string, string, string | null][] = [
    ['MAG-001', 'Magasin A', 'A', 'Réserve principale — bois panneaux et quincaillerie'],
    ['MAG-002', 'Magasin B', 'B', 'Atelier secondaire — outillage électroportatif'],
    ['MAG-003', 'Atelier A', 'ATA', 'Poste de travail menuiserie principale'],
    ['MAG-004', 'Atelier B', 'ATB', 'Poste de travail assemblage et finitions'],
    ['MAG-005', 'Quincaillerie', 'QNC', 'Visserie, ferrures et consommables'],
  ] as const;
  for (const [id, name, code, description] of magasins) {
    await db.query('INSERT INTO magasins (id, name, code, description) VALUES ($1, $2, $3, $4)', [id, name, code, description]);
  }

  await db.query(
    `INSERT INTO terminals (id, name) VALUES
       ('TERM-ATELIER', 'Tablette d’atelier — pointage arrivée'),
       ('TERM-MAGASIN', 'Téléphone magasin — pointage entrée')`,
  );

  const employees = [
    ['EMP-001', 'Jean-Marc ATANGANA', 'Chef d’atelier', 'badge-jean-marc'],
    ['EMP-002', 'Pierre NKOA', 'Magasinier', 'badge-pierre'],
    ['EMP-003', 'Aimé MBARGA', 'Menuisier', 'badge-aime'],
    ['EMP-004', 'Serge OLIVIER', 'Menuisier', 'badge-serge'],
    ['EMP-005', 'Bruno EYENGA', 'Apprenti', 'badge-bruno'],
    ['EMP-006', 'Claire ATANGANA', 'Comptable', 'badge-claire'],
    ['EMP-007', 'David SIMO', 'Menuisier', 'badge-david'],
    ['EMP-008', 'Landry ONANA', 'Apprenti', 'badge-landry'],
  ] as const;
  for (const [id, name, job, badge] of employees) {
    await db.query('INSERT INTO employees (id, full_name, job_title, badge_token) VALUES ($1, $2, $3, $4)', [
      id,
      name,
      job,
      badge,
    ]);
  }

  const users: [string, string, string, string, string | null][] = [
    ['admin', 'admin226', 'Administrateur', 'admin', null],
    ['direction', 'direction226', 'Direction du Monastère', 'direction', null],
    ['magasinier', 'magasin226', 'Pierre NKOA', 'magasinier', 'EMP-002'],
    ['chef', 'atelier226', 'Jean-Marc ATANGANA', 'chef_atelier', 'EMP-001'],
    ['ouvrier', 'atelier226', 'Aimé MBARGA', 'travailleur', 'EMP-003'],
  ];
  for (const [login, password, displayName, role, employeeId] of users) {
    await db.query(
      'INSERT INTO users (login, password_hash, display_name, role, employee_id) VALUES ($1, $2, $3, $4, $5)',
      [login, hashPassword(password), displayName, role, employeeId],
    );
  }

  const tools: [string, string, string, string, string, string, string | null][] = [
    ['RBT-001', 'Rabot électrique 900 W', 'Rabot', 'Atelier A', 'disponible', 'bon', 'MAG-003'],
    ['RBT-002', 'Rabot à main 45 mm', 'Rabot', 'Atelier A', 'en_pret', 'bon', 'MAG-003'],
    ['SCI-001', 'Scie circulaire 180 mm', 'Scie', 'Atelier B', 'disponible', 'bon', 'MAG-004'],
    ['SCI-002', 'Scie à onglet 216 mm', 'Scie', 'Atelier B', 'maintenance', 'a_reparer', 'MAG-004'],
    ['SCI-003', 'Scie sauteuse', 'Scie', 'Atelier B', 'disponible', 'bon', 'MAG-004'],
    ['PER-001', 'Perceuse à percussion', 'Perceuse', 'Atelier A', 'en_pret', 'bon', 'MAG-003'],
    ['PER-002', 'Perceuse-visseuse 18 V', 'Perceuse', 'Magasin', 'disponible', 'bon', 'MAG-002'],
    ['VIS-001', 'Visseuse à choc', 'Visseuse', 'Magasin', 'disponible', 'bon', 'MAG-002'],
    ['MAR-001', 'Marteau arrache-clou', 'Marteau', 'Atelier A', 'disponible', 'bon', 'MAG-003'],
    ['MEU-001', 'Meuleuse 125 mm', 'Meuleuse', 'Atelier B', 'manquant', 'bon', 'MAG-004'],
    ['PIN-001', 'Pince universelle', 'Pince', 'Atelier A', 'disponible', 'bon', 'MAG-003'],
    ['MET-001', 'Mètre ruban 5 m', 'Mesure', 'Atelier A', 'disponible', 'bon', 'MAG-003'],
    ['MET-002', 'Niveau à bulle 60 cm', 'Mesure', 'Magasin', 'reforme', 'hors_service', 'MAG-001'],
    ['TOU-001', 'Jeu de tournevis isolés', 'Tournevis', 'Magasin', 'disponible', 'bon', 'MAG-001'],
  ] as const;
  const statusReasons: Record<string, string> = {
    'SCI-002': 'Disque usé + arbre bloqué — pièces commandées chez le fournisseur',
    'MEU-001': 'Non retrouvé après le chantier de Mvog-Beti — investigation en cours',
    'MET-002': 'Plaque d’alvéoles endommagée, bulle décollée — hors service définitif',
  };
  for (const [id, name, category, location, status, condition, magasinId] of tools) {
    await db.query(
      'INSERT INTO tools (id, name, category, location, magasin_id, status, condition, status_reason) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [id, name, category, location, magasinId, status, condition, statusReasons[id] || null],
    );
    await db.query(
      `INSERT INTO tool_events (tool_id, event_type, from_status, to_status, actor, note)
       VALUES ($1, 'creation', NULL, 'disponible', 'Import initial', 'Reprise de l’inventaire du magasin')`,
      [id],
    );
    if (status !== 'disponible') {
      await db.query(
        `INSERT INTO tool_events (tool_id, event_type, from_status, to_status, actor, note)
         VALUES ($1, 'status', 'disponible', $2, 'Import initial', $3)`,
        [id, status, statusReasons[id] || `Statut constaté à l’inventaire : ${status}`],
      );
    }
  }

  await db.query(
    `INSERT INTO loans (tool_id, employee_id, motive, out_at) VALUES
       ('RBT-002', 'EMP-003', 'Pose du plafond salle paroissiale', now() - interval '2 days'),
       ('PER-001', 'EMP-004', 'Fixation des bancs — chapelle', now() - interval '1 day')`,
  );

  const refs: [string, string, string, number, number, string][] = [
    ['Vis inox 4×40 (boîte 200)', 'Visserie', 'boîte', 5, 2, 'MAG-005'],
    ['Vis inox 5×60 (boîte 200)', 'Visserie', 'boîte', 4, 0, 'MAG-005'],
    ['Tasseaux chêne 40×30 (m)', 'Bois', 'm', 50, 180, 'MAG-001'],
    ['Plaque OSB 18 mm (feuille)', 'Panneau', 'feuille', 6, 9, 'MAG-001'],
    ['Colle polyuréthane (cartouche)', 'Consommable', 'cartouche', 8, 3, 'MAG-005'],
    ['Disque à tronçonner 125 mm', 'Consommable', 'u', 10, 12, 'MAG-005'],
    ['Charnière laiton (paire)', 'Quincaillerie', 'paire', 12, 6, 'MAG-005'],
    ['Poignée intérieure laiton', 'Quincaillerie', 'u', 4, 1, 'MAG-005'],
  ] as const;
  for (const [name, category, unit, minQty, initial, magasinId] of refs) {
    await db.query(
      'INSERT INTO stock_refs (name, category, unit, magasin_id, min_qty, initial_qty) VALUES ($1, $2, $3, $4, $5, $6)',
      [name, category, unit, magasinId, minQty, initial],
    );
  }

  await db.query(
    `INSERT INTO stock_movements (ref_id, move_type, qty, beneficiary, actor, created_at)
     SELECT id, 'out', 2, 'Atelier B — chantier Mvog-Beti', 'Pierre NKOA', now() - interval '3 hours'
       FROM stock_refs WHERE name LIKE 'Vis inox 4×40%'`,
  );
  await db.query(
    `INSERT INTO stock_movements (ref_id, move_type, qty, beneficiary, actor, created_at)
     SELECT id, 'in', 20, 'Quincaillerie Wouri — BC-1042', 'Pierre NKOA', now() - interval '1 day'
       FROM stock_refs WHERE name LIKE 'Colle polyuréthane%'`,
  );
  await db.query(
    `INSERT INTO stock_movements (ref_id, move_type, qty, beneficiary, actor, created_at)
     SELECT id, 'out', 1, 'Aimé MBARGA', 'Pierre NKOA', now() - interval '2 hours'
       FROM stock_refs WHERE name LIKE 'Colle polyuréthane%'`,
  );

  const now = new Date();
  const at = (h: number, m: number) => {
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };
  const punches: [string, 'in' | 'out', string, number, string | null][] = [
    ['EMP-001', 'in', at(7, 18), 0, null],
    ['EMP-002', 'in', at(7, 25), 0, null],
    ['EMP-003', 'in', at(7, 34), 4, 'Transport — embouteillage sur l’axe Bastos'],
    ['EMP-004', 'in', at(7, 12), 0, null],
    ['EMP-005', 'in', at(8, 5), 35, 'Motif familial'],
    ['EMP-007', 'in', at(7, 29), 0, null],
  ];
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  for (const [emp, type, iso, late, reason] of punches) {
    await db.query(
      `INSERT INTO attendance (employee_id, punch_type, punch_date, server_at, photo_path, terminal_id, id_mode, late_minutes, reason, status)
       VALUES ($1, $2, $3, $4, $5, 'TERM-ATELIER', 'badge', $6, $7, $8)`,
      [emp, type, today, iso, `selfies/${emp}_seed.jpg`, late, reason, late > 0 ? 'late' : 'normal'],
    );
  }

  await db.query(
    `INSERT INTO absences (employee_id, kind, from_date, to_date, note, actor, status)
     VALUES ('EMP-006', 'conge', $1, $1, 'Congé autorisé par la direction', 'Direction', 'approved')`,
    [today],
  );
  await db.query(
    `INSERT INTO absences (employee_id, kind, from_date, to_date, note, actor, status)
     VALUES ('EMP-007', 'permission', $1, $1, 'Permission médicale — retour en début d’après-midi', 'Jean-Marc ATANGANA', 'approved')`,
    [today],
  );
  await db.query(
    `INSERT INTO absences (employee_id, kind, from_date, to_date, note, actor, status)
     VALUES ('EMP-008', 'conge', $1, $2, 'Congé familial — demande déposée ce matin', 'Aimé MBARGA', 'pending')`,
    [today, tomorrowStr],
  );

  console.log('[seed] données de démonstration insérées');
  console.log('[seed] comptes : admin/admin226 · direction/direction226 · magasinier/magasin226 · chef/atelier226 · ouvrier/atelier226');
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed] échec', err);
    process.exit(1);
  });
