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

  const magasins: [string, string, string, string | null, boolean, boolean, boolean, boolean, string | null][] = [
    ['MAG-001', 'Bureau Directeur Général', 'BUR-DG', 'Direction Générale — Mobilier, équipements informatiques et de direction', false, false, false, false, 'Directeur Général'],
    ['MAG-002', 'Bureau Directeur Formation', 'BUR-DF', 'Direction Pédagogique et Formation — Documents de formation et didactique', false, false, false, false, 'Directeur de Formation'],
    ['MAG-003', 'Bureau Directeur Projets et Caissière', 'BUR-DPC', 'Direction des Projets et Caisse — Dossiers clients et opérations caisse', false, false, false, false, 'Directeur Projets & Caissière'],
    ['MAG-004', 'Économat', 'BUR-ECO', 'Autocom, Réseau, Matériel Didactique, Outils Divers et Produits Hygiène', true, true, true, true, 'Économe'],
    ['MAG-005', 'Bureau Secrétariat', 'BUR-SEC', 'Machines de bureau, matériel d’impression, reliures et fournitures', false, false, true, false, 'Secrétariat'],
    ['MAG-006', 'Bureau Compta et Stagiaires Suisses', 'BUR-CPT', 'Machines bureautiques, archives comptables et espace stagiaires', false, false, false, false, 'Comptable'],
    ['MAG-007', 'Salle Multimédia', 'SAL-DAO', 'Postes informatiques et machines pour la formation en Dessin Assisté par Ordinateur (DAO)', false, false, false, false, 'Responsable DAO / Multimédia'],
    ['MAG-008', 'Salle des Profs', 'SAL-PROF', 'Machines, ordinateurs et documents didactiques du corps professoral', false, false, false, false, 'Corps Professoral'],
    ['MAG-009', 'Bibliothèque', 'SAL-BIB', 'Archives techniques, machines de consultation et documentation de menuiserie', true, false, false, false, 'Bibliothécaire / Archiviste'],
    ['MAG-010', 'Bureau Surveillant Général', 'BUR-SG', 'Machines, matériel didactique et dossiers de surveillance générale', false, false, false, false, 'Surveillant Général'],
    ['MAG-011', 'Bureau Contrôleurs des Travaux', 'BUR-CT', 'Contrôle technique des chantiers et magasin de secours pour les ateliers', true, true, true, true, 'Contrôleur des Travaux'],
    ['MAG-012', 'Atelier de Production', 'ATE-PROD', 'Machines stationnaires et petits outils pour les établis des employés', true, false, false, true, 'Chef d’Atelier Production'],
    ['MAG-013', 'Grand Magasin', 'MAG-GRD', 'Outils de coupe, lames, fraises et machines électroportatives', true, true, true, true, 'Magasinier Principal'],
    ['MAG-014', 'Atelier de Formation', 'ATE-FORM', 'Machines pédagogiques et magasin d’outillage pour les apprenants', true, false, false, true, 'Formateur Principal'],
    ['MAG-015', 'Cabine de Vernissage', 'MAG-VERN', 'Magasin pour outils de vernissage, pistolets et produits de finition', true, true, true, true, 'Responsable Finitions & Vernis'],
    ['MAG-016', 'Salle d’Affûtage', 'SAL-AFF', 'Machines et outils spécialisés d’affûtage (meules, fers, rubans, lames)', true, false, false, true, 'Affûteur'],
    ['MAG-017', 'Parc à Bois', 'MAG-BOIS', 'Stock de bois massif — diverses essences de bois locales et quantités', false, true, true, true, 'Responsable Parc à Bois'],
    ['MAG-018', 'Magasin de Machines Défectueuses', 'MAG-DEF', 'Stock d’outils et machines défectueuses en attente de réparation ou réforme', false, true, false, true, 'Responsable Maintenance'],
    ['MAG-019', 'Magasin Léo', 'MAG-LEO', 'Quincaillerie complète, visserie, accessoires, autres outils et machines', true, true, true, true, 'Gestionnaire Magasin Léo'],
    ['MAG-020', 'Grenier Monastère', 'MAG-GREN', 'Magasin de réserve générale et stockage patrimonial du Monastère', false, true, true, true, 'Intendant du Monastère'],
    ['MAG-021', 'Magasin des Mousses', 'MAG-MOUS', 'Mousses de garnissage — Divers types, densités et quantités', false, true, true, true, 'Responsable Garnissage / Tapisserie'],
    ['MAG-022', 'Magasin des Panneaux', 'MAG-PAN', 'Panneaux dérivés du bois (contreplaqué, MDF, latté, mélaminé)', false, true, true, true, 'Gestionnaire Débits & Panneaux'],
    ['MAG-023', 'Internat', 'DIV-INT', 'Studio, salle d’étude et de TV, dortoirs Niveaux I, II et III', false, false, false, false, 'Responsable Internat'],
    ['MAG-024', 'Cantine', 'MAG-CANT', 'Magasins de réserve intérieure et de réserve extérieure pour la restauration', false, true, true, false, 'Gestionnaire Cantine'],
    ['MAG-025', 'Salles de Classes', 'SAL-CLAS', 'Salles d’enseignement théorique et professionnel (Niveaux I, II et III)', false, false, false, false, 'Surveillance Pédagogique'],
    ['MAG-026', 'Salle Polyvalente', 'SAL-POLY', 'Salle polyvalente, conférences, cérémonies et réunions plénières', false, false, false, false, 'Intendance Générale'],
    ['MAG-027', 'Magasin des Outils Manuels pour le TM', 'MAG-TM', 'Outillage manuel pour les Travaux de Menuiserie (TM) avec pointage unitaire', true, true, true, true, 'Responsable TM'],
    ['MAG-028', 'Salle d’Exposition', 'SAL-EXPO', 'Showroom de vente et exposition permanente des réalisations menuiserie', false, false, false, false, 'Responsable Commercial / Expo'],
    ['MAG-029', 'Appartement Stagiaires Suisses', 'APP-SUIS', 'Logement résidentiel et équipements d’accueil des coopérants suisses', false, false, false, false, 'Intendance Monastère'],
  ] as const;
  for (const [id, name, code, description, canLend, canRecv, canDeliv, canTrans, managerName] of magasins) {
    await db.query(
      `INSERT INTO magasins (id, name, code, description, can_lend, can_receive_in, can_deliver_out, can_transfer, manager_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, name, code, description, canLend, canRecv, canDeliv, canTrans, managerName],
    );
  }

  await db.query(
    `INSERT INTO terminals (id, name) VALUES
       ('TERM-ATELIER', 'Tablette d’atelier — pointage arrivée'),
       ('TERM-MAGASIN', 'Téléphone magasin — pointage entrée')`,
  );

  const employees: [string, string, string, string][] = [
    // 1. DIRECTION & ENCADREMENT
    ['EMP-001', 'Père Elie TEKAM TAGHUEN, OSB', 'Directeur Général', 'H4K7M'],
    ['EMP-002', 'Frère François MEKELI, OSB', 'Surveillant Général', 'R9T2W'],
    ['EMP-003', 'M. KOUOMOU Désiré', 'Directeur de Formation & Informaticien', 'P3N8D'],
    ['EMP-004', 'M. KAMGA Innocent', 'Directeur des Projets', 'X6V5J'],
    ['EMP-005', 'Mme ÉTOGA Joséphine', 'Caissière / Économe', 'M2Q9F'],

    // 2. CONTRÔLE DES TRAVAUX & LOGISTIQUE
    ['EMP-006', 'M. LAWSON ADODO François', 'Chef Contrôleur des Travaux', 'T7B4K'],
    ['EMP-007', 'M. MVOGO Médard', 'Adj. Contrôleur des Travaux', 'C5R8H'],
    ['EMP-008', 'M. MINKOUMBA ABONDO Clément', 'Coursier & Resp. Livraisons', 'W3J6N'],

    // 3. COMPTABILITÉ & GESTION
    ['EMP-009', 'Prof. Robert SANGUE', 'Expert-Comptable, Vérificateur des Comptes', 'K8M3X'],
    ['EMP-010', 'M. SANDJO Salvador', 'Comptable', 'F2L9P'],
    ['EMP-011', 'M. BAHOYA Daniel', 'Aide-Comptable', 'Y5N1V'],

    // 4. FORMATEURS PÉDAGOGIQUES
    ['EMP-012', 'Mr Bean', 'Formateur (Anglais)', 'Q7Z4A'],
    ['EMP-013', 'M. MBALLA ATANGANA', 'Formateur', 'B9C2D'],
    ['EMP-014', 'M. MBAMBAND Jean Marc', 'Formateur', 'G6E8H'],
    ['EMP-015', 'M. NZAZE DEUGOUE Elias', 'Formateur', 'J4K1M'],

    // 5. TECHNICIENS DE MENUISERIE & PRODUCTION
    ['EMP-016', 'M. AHANGA EMARAM Sylvain', 'Technicien Menuisier', 'L7P3R'],
    ['EMP-017', 'M. BAHETEN Jean Marcel', 'Technicien Menuisier', 'S2T5V'],
    ['EMP-018', 'M. EVA Michel', 'Technicien Menuisier', 'W8X1Y'],
    ['EMP-019', 'M. MVOMO Frédéric', 'Technicien Menuisier', 'Z3A6B'],
    ['EMP-020', 'M. NDOE ATEBA Pierre Désiré', 'Technicien Menuisier', 'C9D2E'],
    ['EMP-021', 'Mme NGO NDOGO Juliette', 'Technicienne Menuisière', 'F5G8H'],
    ['EMP-022', 'M. NLEND Dagobert', 'Technicien Menuisier', 'J1K4M'],
    ['EMP-023', 'M. NTSAMA FOUDA Paul Olivier', 'Technicien Menuisier', 'N7P2R'],
    ['EMP-024', 'M. NYA NJONWE Douglas', 'Technicien Menuisier', 'S6T9V'],
    ['EMP-025', 'M. OBIONDA Claude François', 'Technicien Menuisier', 'W2X5Y'],
    ['EMP-026', 'M. OLAMA TSALA Philippe', 'Technicien Menuisier', 'Z8A1B'],
    ['EMP-027', 'M. TASSIE Patrice', 'Technicien Menuisier', 'C4D7E'],
    ['EMP-028', 'M. TIEMBOMBA Mohammed', 'Technicien Menuisier', 'F1G3H'],
    ['EMP-029', 'M. TOUNA ONGUENE Adolphe', 'Technicien Menuisier', 'J6K9M'],

    // 6. TÂCHERONS DU CFTM
    ['EMP-030', 'M. BIYIHA Jean Roussel', 'Tâcheron', 'N2P5R'],
    ['EMP-031', 'M. ESSOMBA Georges Francis', 'Tâcheron', 'S8T1V'],
    ['EMP-032', 'M. ÉTOUNDI ESSOMBA Patrick', 'Tâcheron', 'W4X7Y'],
    ['EMP-033', 'M. ZIBI Etienne', 'Tâcheron', 'Z1A3B'],
    ['EMP-034', 'M. NOUTAT Jérémie', 'Tâcheron', 'C6D9E'],

    // 7. MAINTENANCE, ENTRETIEN & MÉTIERS SPÉCIALISÉS
    ['EMP-035', 'M. Aristide', 'Maintenance Machines', 'F2G5H'],
    ['EMP-036', 'M. Bernard', 'Électricité Véhicules', 'J8K1M'],
    ['EMP-037', 'M. Élisée', 'Maintenance imprimantes et consommables', 'N4P7R'],
    ['EMP-038', 'M. GUIAKAM Isidore', 'Boite Électricité & Aspirateur', 'S1T3V'],
    ['EMP-039', 'M. KAMGA Paulin', 'Maintenance Imprimante Canon', 'W6X9Y'],
    ['EMP-040', 'M. Léandry NDOGMO', 'Plombier', 'Z2A5B'],
    ['EMP-041', 'Mr KENNETT', 'Froid, Clim / Séchoir, Machines CFTM', 'C8D1E'],
    ['EMP-042', 'M. DONFACK TONLEU', 'Sculpteur', 'F4G7H'],
    ['EMP-043', 'M. KUATE Christian', 'Sculpteur', 'J1K3M'],
    ['EMP-044', 'M. NANFACK Carlos', 'Tourneur', 'N6P9R'],
    ['EMP-045', 'M. ZAMBOU Alex', 'Soudeur', 'S2T4V'],
    ['EMP-046', 'M. NANTCHOUANG Éric', 'Électricité Climatisation', 'W7X1Y'],
    ['EMP-047', 'M. NOUAYE Alain', 'Électricité Ateliers', 'Z3A5B'],
    ['EMP-048', 'M. NZAKOU Ronel', 'Frigoriste', 'C9D1E'],
    ['EMP-049', 'M. SEGNOU Clovis', 'Tapissier', 'F5G7H'],
    ['EMP-050', 'M. TAKOUDJOU TACHE Francis', 'Plafoniste', 'J2K4M'],
    ['EMP-051', 'M. TAKOUGOUM Noël', 'Tapissier Cercueil', 'N8P1R'],
    ['EMP-052', 'M. TALOM Pascal', 'Mécanicien Véhicules', 'S4T6V'],
    ['EMP-053', 'M. TANKOUA Romuald', 'Technicien Copieur', 'W1X3Y'],
    ['EMP-054', 'M. WAMBO Jules', 'Technicien Autocom', 'Z6A8B'],

    // 8. SÉCURITÉ & RESTAURATION / INTENDANCE
    ['EMP-055', 'M. ABDOULAYE NJARAYAM', 'Vigile', 'C2D4E'],
    ['EMP-056', 'M. NDOUBAIDI Zachée', 'Veilleur (nuit)', 'F8G1H'],
    ['EMP-057', 'Mme AWONO BELLA Marie Évelyne', 'Cuisinière', 'J5K7M'],
    ['EMP-058', 'Mlle CHEKAM Audrey', 'Cuisinière', 'N1P3R'],
  ] as const;
  const defaultPin = hashPassword('1234');
  for (const [id, name, job, badge] of employees) {
    await db.query(
      'INSERT INTO employees (id, full_name, job_title, badge_token, pin_hash) VALUES ($1, $2, $3, $4, $5)',
      [id, name, job, badge, defaultPin],
    );
  }

  const users: [string, string, string, string, string | null][] = [
    ['direction', 'direction226', 'Père Elie TEKAM TAGHUEN (DG)', 'direction', 'EMP-001'],
    ['mekeli', 'cftm2026', 'Frère François MEKELI (SG)', 'direction', 'EMP-002'],
    ['kouomou', 'cftm2026', 'M. KOUOMOU Désiré (DF & IT)', 'direction', 'EMP-003'],
    ['kamga', 'cftm2026', 'M. KAMGA Innocent (DP)', 'direction', 'EMP-004'],
    ['etoga', 'cftm2026', 'Mme ÉTOGA Joséphine (Économe)', 'direction', 'EMP-005'],
    ['chef', 'atelier226', 'M. LAWSON ADODO François (Chef CT)', 'chef_atelier', 'EMP-006'],
    ['mvogo', 'cftm2026', 'M. MVOGO Médard (Adj. CT)', 'chef_atelier', 'EMP-007'],
    ['magasinier', 'magasin226', 'M. MINKOUMBA ABONDO Clément (Logistique)', 'magasinier', 'EMP-008'],
    ['sangue', 'cftm2026', 'Prof. Robert SANGUE (Expert-Comptable)', 'direction', 'EMP-009'],
    ['sandjo', 'cftm2026', 'M. SANDJO Salvador (Comptable)', 'direction', 'EMP-010'],
    ['ouvrier', 'atelier226', 'M. AHANGA EMARAM Sylvain', 'travailleur', 'EMP-016'],
  ];
  for (const [login, password, displayName, role, employeeId] of users) {
    await db.query(
      'INSERT INTO users (login, password_hash, display_name, role, employee_id) VALUES ($1, $2, $3, $4, $5)',
      [login, hashPassword(password), displayName, role, employeeId],
    );
  }

  const tools: [string, string, string, string, string, string, string | null][] = [
    ['RBT-001', 'Rabot électrique 900 W', 'Rabot', 'Atelier de Production', 'disponible', 'bon', 'MAG-012'],
    ['RBT-002', 'Rabot à main 45 mm', 'Rabot', 'Atelier de Production', 'en_pret', 'bon', 'MAG-012'],
    ['SCI-001', 'Scie circulaire 180 mm', 'Scie', 'Atelier de Formation', 'disponible', 'bon', 'MAG-014'],
    ['SCI-002', 'Scie à onglet 216 mm', 'Scie', 'Atelier de Formation', 'maintenance', 'a_reparer', 'MAG-014'],
    ['SCI-003', 'Scie sauteuse', 'Scie', 'Atelier de Formation', 'disponible', 'bon', 'MAG-014'],
    ['PER-001', 'Perceuse à percussion', 'Perceuse', 'Atelier de Production', 'en_pret', 'bon', 'MAG-012'],
    ['PER-002', 'Perceuse-visseuse 18 V', 'Perceuse', 'Grand Magasin', 'disponible', 'bon', 'MAG-013'],
    ['VIS-001', 'Visseuse à choc', 'Visseuse', 'Grand Magasin', 'disponible', 'bon', 'MAG-013'],
    ['MAR-001', 'Marteau arrache-clou', 'Marteau', 'Atelier de Production', 'disponible', 'bon', 'MAG-012'],
    ['MEU-001', 'Meuleuse 125 mm', 'Meuleuse', 'Atelier de Formation', 'manquant', 'bon', 'MAG-014'],
    ['PIN-001', 'Pince universelle', 'Pince', 'Atelier de Production', 'disponible', 'bon', 'MAG-012'],
    ['MET-001', 'Mètre ruban 5 m', 'Mesure', 'Atelier de Production', 'disponible', 'bon', 'MAG-012'],
    ['MET-002', 'Niveau à bulle 60 cm', 'Mesure', 'Magasin Machines Défectueuses', 'reforme', 'hors_service', 'MAG-018'],
    ['TOU-001', 'Jeu de tournevis isolés', 'Tournevis', 'Magasin des Outils Manuels pour le TM', 'disponible', 'bon', 'MAG-027'],
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
    ['Vis inox 4×40 (boîte 200)', 'Visserie', 'boîte', 5, 2, 'MAG-019'],
    ['Vis inox 5×60 (boîte 200)', 'Visserie', 'boîte', 4, 0, 'MAG-019'],
    ['Tasseaux chêne 40×30 (m)', 'Bois', 'm', 50, 180, 'MAG-017'],
    ['Plaque OSB 18 mm (feuille)', 'Panneau', 'feuille', 6, 9, 'MAG-022'],
    ['Colle polyuréthane (cartouche)', 'Consommable', 'cartouche', 8, 3, 'MAG-004'],
    ['Disque à tronçonner 125 mm', 'Consommable', 'u', 10, 12, 'MAG-013'],
    ['Charnière laiton (paire)', 'Quincaillerie', 'paire', 12, 6, 'MAG-019'],
    ['Poignée intérieure laiton', 'Quincaillerie', 'u', 4, 1, 'MAG-019'],
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
  console.log('[seed] comptes : direction/direction226 · magasinier/magasin226 · chef/atelier226 · ouvrier/atelier226');
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed] échec', err);
    process.exit(1);
  });
