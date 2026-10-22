import { getDb } from './index.js';
import { migrate } from './migrate.js';
import { hashPassword } from '../lib/crypto.js';

function formatIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60000);
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function simulate360Days() {
  console.log('===============================================================');
  console.log('🚀 SIMULATION 360 JOURS OUVRÉS - ATELIER DE MENUISERIE DU MONT FÈBÈ');
  console.log('===============================================================');

  const startTime = Date.now();
  await migrate();
  const db = getDb();

  // 1. Initial clean or ensure base structures
  console.log('1. Vérification et initialisation des référentiels de base...');

  const settings: [string, unknown][] = [
    ['opening_time', '07:30'],
    ['closing_time', '16:30'],
    ['tolerance_minutes', 10],
    ['workdays', [1, 2, 3, 4, 5, 6]],
    ['late_motifs', ['Transport', 'Motif familial', 'Mission extérieure', 'Autorisé par la direction', 'Panne matériel', 'Pluie torrentielle', 'Autre']],
    ['selfie_retention_days', 90],
    ['card_display_seconds', 8],
  ];
  for (const [key, value] of settings) {
    await db.query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2', [key, JSON.stringify(value)]);
  }

  const magasins = [
    ['MAG-001', 'Magasin A', 'A', 'Réserve principale — bois massif et panneaux'],
    ['MAG-002', 'Magasin B', 'B', 'Atelier électroportatif et machines de précision'],
    ['MAG-003', 'Atelier A', 'ATA', 'Poste de travail usinage et rabotage'],
    ['MAG-004', 'Atelier B', 'ATB', 'Poste assemblage, ponçage et finitions vernis'],
    ['MAG-005', 'Quincaillerie', 'QNC', 'Visserie, ferrures, colles et consommables'],
  ] as const;
  for (const [id, name, code, desc] of magasins) {
    await db.query('INSERT INTO magasins (id, name, code, description) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET name = $2, code = $3, description = $4', [id, name, code, desc]);
  }

  const terminals = [
    ['TERM-ATELIER', 'Tablette d’atelier — Kiosque entrée'],
    ['TERM-MAGASIN', 'Smartphone magasinier — Dépôt central'],
  ] as const;
  for (const [id, name] of terminals) {
    await db.query('INSERT INTO terminals (id, name) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET name = $2', [id, name]);
  }

  const employees = [
    ['EMP-001', 'Jean-Marc ATANGANA', 'Chef d’atelier', 'H4K7M'],
    ['EMP-002', 'Pierre NKOA', 'Magasinier', 'R9T2W'],
    ['EMP-003', 'Aimé MBARGA', 'Menuisier Ébéniste', 'P3N8D'],
    ['EMP-004', 'Serge OLIVIER', 'Menuisier Raboteur', 'X6V5J'],
    ['EMP-005', 'Bruno EYENGA', 'Apprenti Menuisier', 'M2Q9F'],
    ['EMP-006', 'Claire ATANGANA', 'Comptable & Gestion', 'T7B4K'],
    ['EMP-007', 'David SIMO', 'Menuisier Assembleur', 'C5R8H'],
    ['EMP-008', 'Landry ONANA', 'Apprenti Finitions', 'W3J6N'],
  ] as const;
  for (const [id, name, job, badge] of employees) {
    await db.query(
      'INSERT INTO employees (id, full_name, job_title, badge_token) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET full_name = $2, job_title = $3, badge_token = $4',
      [id, name, job, badge],
    );
  }

  const users: [string, string, string, string, string | null][] = [
    ['direction', 'direction226', 'Direction du Monastère', 'direction', null],
    ['magasinier', 'magasin226', 'Pierre NKOA', 'magasinier', 'EMP-002'],
    ['chef', 'atelier226', 'Jean-Marc ATANGANA', 'chef_atelier', 'EMP-001'],
    ['ouvrier', 'atelier226', 'Aimé MBARGA', 'travailleur', 'EMP-003'],
  ];
  for (const [login, password, displayName, role, employeeId] of users) {
    await db.query(
      `INSERT INTO users (login, password_hash, display_name, role, employee_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (login) DO UPDATE SET display_name = $3, role = $4, employee_id = $5`,
      [login, hashPassword(password), displayName, role, employeeId],
    );
  }

  const toolsList = [
    ['RBT-001', 'Rabot électrique 900 W', 'Rabot', 'Atelier A', 'MAG-003'],
    ['RBT-002', 'Rabot à main varlope 45 mm', 'Rabot', 'Atelier A', 'MAG-003'],
    ['SCI-001', 'Scie circulaire plongeante 180 mm', 'Scie', 'Atelier B', 'MAG-004'],
    ['SCI-002', 'Scie à onglet radiale 216 mm', 'Scie', 'Atelier B', 'MAG-004'],
    ['SCI-003', 'Scie sauteuse pendulaire', 'Scie', 'Atelier B', 'MAG-004'],
    ['PER-001', 'Perceuse à percussion SDS', 'Perceuse', 'Atelier A', 'MAG-003'],
    ['PER-002', 'Perceuse-visseuse compacte 18 V', 'Perceuse', 'Magasin B', 'MAG-002'],
    ['VIS-001', 'Visseuse à choc pneumatique', 'Visseuse', 'Magasin B', 'MAG-002'],
    ['DEF-001', 'Défonceuse de précision 1400 W', 'Fraiseuse', 'Atelier A', 'MAG-003'],
    ['PON-001', 'Ponceuse excentrique 150 mm', 'Ponceuse', 'Atelier B', 'MAG-004'],
    ['PON-002', 'Ponceuse à bande lourde', 'Ponceuse', 'Atelier B', 'MAG-004'],
    ['MAR-001', 'Marteau de menuisier arrache-clou', 'Marteau', 'Atelier A', 'MAG-003'],
    ['MEU-001', 'Meuleuse d’angle 125 mm', 'Meuleuse', 'Atelier B', 'MAG-004'],
    ['PIN-001', 'Pince universelle isolée', 'Pince', 'Atelier A', 'MAG-003'],
    ['MET-001', 'Mètre ruban acier 5 m', 'Mesure', 'Atelier A', 'MAG-003'],
    ['MET-002', 'Niveau tubulaire 60 cm', 'Mesure', 'Magasin A', 'MAG-001'],
    ['SER-001', 'Presse à cadre 1000 mm (paire)', 'Serrage', 'Atelier A', 'MAG-003'],
    ['SER-002', 'Serre-joint à pompe 600 mm', 'Serrage', 'Atelier A', 'MAG-003'],
    ['TOU-001', 'Jeu de tournevis d’ébéniste', 'Tournevis', 'Magasin A', 'MAG-001'],
    ['CISEAU-01', 'Jeu de 6 ciseaux à bois affûtés', 'Tranchant', 'Atelier A', 'MAG-003'],
  ] as const;

  for (const [id, name, cat, loc, mag] of toolsList) {
    await db.query(
      `INSERT INTO tools (id, name, category, location, magasin_id, status, condition)
       VALUES ($1, $2, $3, $4, $5, 'disponible', 'bon')
       ON CONFLICT (id) DO UPDATE SET name = $2, category = $3, location = $4, magasin_id = $5`,
      [id, name, cat, loc, mag],
    );
  }

  const stockRefsList = [
    ['Vis inox 4×40 (boîte 200)', 'Visserie', 'boîte', 5, 25, 'MAG-005'],
    ['Vis inox 5×60 (boîte 200)', 'Visserie', 'boîte', 4, 18, 'MAG-005'],
    ['Tasseaux chêne massif 40×30 (m)', 'Bois', 'm', 50, 220, 'MAG-001'],
    ['Planches ayous raboté 200×27 (m)', 'Bois', 'm', 40, 160, 'MAG-001'],
    ['Plaque OSB 18 mm (feuille)', 'Panneau', 'feuille', 6, 32, 'MAG-001'],
    ['Contreplaqué marine 15 mm', 'Panneau', 'feuille', 5, 14, 'MAG-001'],
    ['Colle polyuréthane D4 (cartouche)', 'Consommable', 'cartouche', 8, 28, 'MAG-005'],
    ['Colle à bois vinylique 5 kg', 'Consommable', 'pot', 3, 7, 'MAG-005'],
    ['Disque à tronçonner 125 mm', 'Consommable', 'u', 10, 45, 'MAG-005'],
    ['Bandes abrasives grain 80', 'Consommable', 'u', 20, 60, 'MAG-005'],
    ['Charnière laiton poli (paire)', 'Quincaillerie', 'paire', 12, 40, 'MAG-005'],
    ['Poignée meuble laiton vieilli', 'Quincaillerie', 'u', 8, 22, 'MAG-005'],
    ['Serrure d’armoire avec clé', 'Quincaillerie', 'u', 6, 15, 'MAG-005'],
    ['Vernis polyuréthane mat 5 L', 'Finition', 'pot', 4, 9, 'MAG-004'],
  ] as const;

  for (const [name, cat, unit, minQty, initial, mag] of stockRefsList) {
    const existing = await db.one<{ id: number }>('SELECT id FROM stock_refs WHERE name = $1', [name]);
    if (!existing) {
      await db.query(
        'INSERT INTO stock_refs (name, category, unit, min_qty, initial_qty, magasin_id) VALUES ($1, $2, $3, $4, $5, $6)',
        [name, cat, unit, minQty, initial, mag],
      );
    }
  }

  // 2. Génération de 360 jours ouvrés d'historique (du lundi au samedi, exclusion du dimanche)
  console.log('2. Génération de 360 jours ouvrés d’activité réelle...');

  const workdaysList: string[] = [];
  const curr = new Date();
  let dayOffset = 0;

  while (workdaysList.length < 360) {
    const d = new Date(curr);
    d.setDate(d.getDate() - dayOffset);
    dayOffset++;
    // Exclure le dimanche (0)
    if (d.getDay() !== 0) {
      workdaysList.push(formatIsoDate(d));
    }
  }
  // Trier par ordre chronologique croissant
  workdaysList.reverse();

  console.log(`Période couverte : du ${workdaysList[0]} au ${workdaysList[workdaysList.length - 1]}`);

  // Nettoyage des anciennes données pour un benchmark pur
  await db.query('DELETE FROM attendance');
  await db.query('DELETE FROM absences');
  await db.query('DELETE FROM stock_movements');
  await db.query('DELETE FROM loans');
  await db.query('DELETE FROM tool_events');

  let totalPunches = 0;
  let totalAbsences = 0;
  let totalStockMoves = 0;
  let totalLoans = 0;

  const stockRefsInDb = await db.query<{ id: number; name: string }>('SELECT id, name FROM stock_refs');
  const toolsInDb = await db.query<{ id: string; name: string }>('SELECT id, name FROM tools');

  const motives = ['Transport — embouteillage axe Bastos', 'Motif familial', 'Mission extérieure pour la communauté', 'Pluie torrentielle', 'Panne de véhicule', 'Rendez-vous médical'];

  // Parcours des 360 jours
  for (let idx = 0; idx < workdaysList.length; idx++) {
    const dateStr = workdaysList[idx];
    if (!dateStr) continue;
    const isSaturday = new Date(dateStr).getDay() === 6;

    // --- A. GESTION DES PRÉSENCES ET POINTAGES ---
    for (const emp of employees) {
      const empId = emp[0];
      const rand = Math.random();

      // 4% du temps : Congé ou permission
      if (rand < 0.04) {
        const kind = Math.random() < 0.7 ? 'conge' : 'permission';
        await db.query(
          `INSERT INTO absences (employee_id, kind, from_date, to_date, note, status, actor, created_at)
           VALUES ($1, $2, $3, $3, $4, 'approved', 'Direction', $5::date + time '07:00:00')`,
          [empId, kind, dateStr, `Absence programmée (${kind})`, dateStr],
        );
        totalAbsences++;
        continue;
      }

      // 1% du temps : Absence non justifiée
      if (rand < 0.05) {
        await db.query(
          `INSERT INTO absences (employee_id, kind, from_date, to_date, note, status, actor, created_at)
           VALUES ($1, 'absence', $2, $2, 'Absence constatée à l’atelier', 'approved', 'Jean-Marc ATANGANA', $2::date + time '08:00:00')`,
          [empId, dateStr],
        );
        totalAbsences++;
        continue;
      }

      // Pointage d'arrivée (in)
      let arrivalMinutes = randInt(10, 28); // 07:10 à 07:28 (à l'heure)
      let isLate = false;
      let lateMinutes = 0;
      let lateReason: string | null = null;

      // 8% du temps : retard
      if (rand > 0.92) {
        isLate = true;
        lateMinutes = randInt(12, 55);
        arrivalMinutes = 30 + lateMinutes; // ex 07:42, 08:15
        lateReason = motives[randInt(0, motives.length - 1)] ?? null;
      }

      const inHour = Math.floor(arrivalMinutes / 60) + 7;
      const inMin = arrivalMinutes % 60;
      const inIso = `${dateStr}T${String(inHour).padStart(2, '0')}:${String(inMin).padStart(2, '0')}:00Z`;

      await db.query(
        `INSERT INTO attendance (employee_id, punch_type, punch_date, server_at, photo_path, terminal_id, id_mode, late_minutes, reason, status)
         VALUES ($1, 'in', $2, $3, $4, 'TERM-ATELIER', 'badge', $5, $6, $7)`,
        [empId, dateStr, inIso, `selfies/${empId}_${dateStr}.jpg`, lateMinutes, lateReason, isLate ? 'late' : 'normal'],
      );
      totalPunches++;

      // Pause déjeuner (sauf le samedi court 12h30)
      if (!isSaturday) {
        const breakInIso = `${dateStr}T12:00:00Z`;
        const breakOutIso = `${dateStr}T12:45:00Z`;
        await db.query(
          `INSERT INTO attendance (employee_id, punch_type, punch_date, server_at, photo_path, terminal_id, id_mode, late_minutes, status)
           VALUES ($1, 'break_in', $2, $3, $4, 'TERM-ATELIER', 'badge', 0, 'normal')`,
          [empId, dateStr, breakInIso, `selfies/${empId}_bin.jpg`],
        );
        await db.query(
          `INSERT INTO attendance (employee_id, punch_type, punch_date, server_at, photo_path, terminal_id, id_mode, late_minutes, status)
           VALUES ($1, 'break_out', $2, $3, $4, 'TERM-ATELIER', 'badge', 0, 'normal')`,
          [empId, dateStr, breakOutIso, `selfies/${empId}_bout.jpg`],
        );
        totalPunches += 2;
      }

      // Départ (out) - 99% du temps (1% oubli de sortie pour tester missing_out)
      if (Math.random() > 0.01) {
        const depHour = isSaturday ? 12 : randInt(16, 17);
        const depMin = isSaturday ? randInt(25, 45) : randInt(25, 55);
        const outIso = `${dateStr}T${String(depHour).padStart(2, '0')}:${String(depMin).padStart(2, '0')}:00Z`;

        await db.query(
          `INSERT INTO attendance (employee_id, punch_type, punch_date, server_at, photo_path, terminal_id, id_mode, late_minutes, status)
           VALUES ($1, 'out', $2, $3, $4, 'TERM-ATELIER', 'badge', 0, 'normal')`,
          [empId, dateStr, outIso, `selfies/${empId}_out.jpg`],
        );
        totalPunches++;
      }
    }

    // --- B. MOUVEMENTS DE STOCK RÉGULIERS ---
    // Chaque jour ouvré, 1 à 3 consommations atelier
    const movesToday = randInt(1, 3);
    for (let m = 0; m < movesToday; m++) {
      const ref = stockRefsInDb[randInt(0, stockRefsInDb.length - 1)];
      if (!ref) continue;
      const outQty = randInt(1, 5);
      await db.query(
        `INSERT INTO stock_movements (ref_id, move_type, qty, beneficiary, doc_ref, actor, created_at)
         VALUES ($1, 'out', $2, $3, $4, 'Pierre NKOA', $5::timestamptz + interval '10 hours')`,
        [ref.id, outQty, 'Poste de fabrication — Atelier A', `BS-${idx}-${m}`, dateStr],
      );
      totalStockMoves++;
    }

    // Tous les 15 jours ouvrés : réapprovisionnement fournisseur
    if (idx % 15 === 0) {
      for (const ref of stockRefsInDb) {
        if (!ref) continue;
        if (Math.random() < 0.4) {
          const inQty = randInt(15, 60);
          await db.query(
            `INSERT INTO stock_movements (ref_id, move_type, qty, beneficiary, doc_ref, actor, created_at)
             VALUES ($1, 'in', $2, $3, $4, 'Pierre NKOA', $5::timestamptz + interval '14 hours')`,
            [ref.id, inQty, 'Livraison Fournisseur — Quincaillerie du Centre', `BL-${idx}`, dateStr],
          );
          totalStockMoves++;
        }
      }
    }

    // --- C. PRÊTS ET RETOURS D'OUTILS ---
    // Tous les 2 jours : prêt d'un outil
    if (idx % 2 === 0) {
      const tool = toolsList[randInt(0, toolsList.length - 1)];
      const emp = employees[randInt(2, employees.length - 1)];
      if (!tool || !emp) continue;
      const returnDate = workdaysList[Math.min(workdaysList.length - 1, idx + randInt(1, 4))];

      const isReturned = idx < workdaysList.length - 5; // Les derniers jours restent en prêt
      const condition = Math.random() < 0.92 ? 'bon' : 'a_reparer';

      await db.query(
        `INSERT INTO loans (tool_id, employee_id, out_at, returned_at, return_condition, motive, status)
         VALUES ($1, $2, $3::timestamptz + interval '8 hours', $4, $5, $6, $7)`,
        [
          tool[0],
          emp[0],
          dateStr,
          isReturned ? `${returnDate}T16:00:00Z` : null,
          isReturned ? condition : null,
          'Usinage des portes et fenêtres paroissiales',
          isReturned ? 'returned' : 'out',
        ],
      );
      totalLoans++;

      // Log d'événement d'outil
      await db.query(
        `INSERT INTO tool_events (tool_id, event_type, from_status, to_status, actor, note, created_at)
         VALUES ($1, 'loan', 'disponible', 'en_pret', 'Pierre NKOA', $2, $3::timestamptz + interval '8 hours')`,
        [tool[0], `Prêté à ${emp[1]}`, dateStr],
      );
      if (isReturned) {
        await db.query(
          `INSERT INTO tool_events (tool_id, event_type, from_status, to_status, actor, note, created_at)
           VALUES ($1, 'return', 'en_pret', 'disponible', 'Pierre NKOA', $2, $3::timestamptz + interval '16 hours')`,
          [tool[0], `Retourné par ${emp[1]} (état: ${condition})`, returnDate],
        );
      }
    }
  }

  // Mettre à jour le statut des outils actuellement en prêt
  const openLoans = await db.query<{ tool_id: string }>('SELECT DISTINCT tool_id FROM loans WHERE status = \'out\'');
  for (const row of openLoans) {
    await db.query('UPDATE tools SET status = \'en_pret\' WHERE id = $1', [row.tool_id]);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('===============================================================');
  console.log(`✅ SIMULATION TERMINÉE EN ${duration}s`);
  console.log(`- Jours simulés : 360 jours ouvrés`);
  console.log(`- Pointages enregistrés (in/out/pauses) : ${totalPunches.toLocaleString()}`);
  console.log(`- Absences et congés tracés : ${totalAbsences.toLocaleString()}`);
  console.log(`- Mouvements de stock (entrées/sorties) : ${totalStockMoves.toLocaleString()}`);
  console.log(`- Prêts & retours d’outils : ${totalLoans.toLocaleString()}`);
  console.log('===============================================================');

  // Test de performance de lecture sur la base stressée
  console.log('3. Benchmark de performance des requêtes SQL sur 360 jours...');
  const t0 = Date.now();
  const punchStats = await db.query(`
    SELECT punch_type, status, COUNT(*) as c
    FROM attendance
    GROUP BY punch_type, status
  `);
  const t1 = Date.now();
  console.log(`✓ Agrégation des pointages (${t1 - t0}ms) :`, punchStats);

  const t2 = Date.now();
  const stockSummary = await db.query(`
    SELECT r.id, r.name,
           r.initial_qty + COALESCE(SUM(CASE WHEN m.move_type = 'in' THEN m.qty WHEN m.move_type = 'out' THEN -m.qty ELSE m.qty END), 0) as current_qty
    FROM stock_refs r
    LEFT JOIN stock_movements m ON m.ref_id = r.id
    GROUP BY r.id, r.name, r.initial_qty
    LIMIT 5
  `);
  const t3 = Date.now();
  console.log(`✓ Calcul du stock en temps réel (${t3 - t2}ms) :`, stockSummary);
}

simulate360Days().catch((err) => {
  console.error('Erreur simulation:', err);
  process.exit(1);
});
