// Script officiel CFTM - Intégration complète des 58 employés et collaborateurs du CFTM
// Centre de Formation Technique Menuiserie — Monastère des Bénédictins du Mont Fébé

import { PGlite } from '@electric-sql/pglite';
import { hashPassword } from '../apps/api/dist/lib/crypto.js';

const BADGE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateBadge(index) {
  // Générer des badges déterministes et uniques pour chaque employé
  let code = '';
  let n = (index + 1) * 7919;
  for (let i = 0; i < 5; i++) {
    code += BADGE_ALPHABET[n % BADGE_ALPHABET.length];
    n = Math.floor(n / 31) + (i + 1) * 313;
  }
  return code;
}

export const CFTM_STAFF = [
  // 1. DIRECTION & ENCADREMENT
  {
    id: 'EMP-001',
    name: 'Père Elie TEKAM TAGHUEN, OSB',
    job: 'Directeur Général',
    category: 'Direction',
    login: 'direction',
    role: 'direction',
    userDisplay: 'Père Elie TEKAM TAGHUEN (DG)',
  },
  {
    id: 'EMP-002',
    name: 'Frère François MEKELI, OSB',
    job: 'Surveillant Général',
    category: 'Direction',
    login: 'mekeli',
    role: 'direction',
    userDisplay: 'Frère François MEKELI (SG)',
  },
  {
    id: 'EMP-003',
    name: 'M. KOUOMOU Désiré',
    job: 'Directeur de Formation & Informaticien',
    category: 'Direction Pédagogique',
    login: 'kouomou',
    role: 'direction',
    userDisplay: 'M. KOUOMOU Désiré (DF & IT)',
  },
  {
    id: 'EMP-004',
    name: 'M. KAMGA Innocent',
    job: 'Directeur des Projets',
    category: 'Direction',
    login: 'kamga',
    role: 'direction',
    userDisplay: 'M. KAMGA Innocent (DP)',
  },
  {
    id: 'EMP-005',
    name: 'Mme ÉTOGA Joséphine',
    job: 'Caissière / Économe',
    category: 'Administration',
    login: 'etoga',
    role: 'direction',
    userDisplay: 'Mme ÉTOGA Joséphine (Économe)',
  },

  // 2. CONTRÔLE DES TRAVAUX & LOGISTIQUE
  {
    id: 'EMP-006',
    name: 'M. LAWSON ADODO François',
    job: 'Chef Contrôleur des Travaux',
    category: 'Production',
    login: 'chef',
    role: 'chef_atelier',
    userDisplay: 'M. LAWSON ADODO François (Chef CT)',
  },
  {
    id: 'EMP-007',
    name: 'M. MVOGO Médard',
    job: 'Adj. Contrôleur des Travaux',
    category: 'Production',
    login: 'mvogo',
    role: 'chef_atelier',
    userDisplay: 'M. MVOGO Médard (Adj. CT)',
  },
  {
    id: 'EMP-008',
    name: 'M. MINKOUMBA ABONDO Clément',
    job: 'Coursier & Resp. Livraisons',
    category: 'Logistique',
    login: 'magasinier',
    role: 'magasinier',
    userDisplay: 'M. MINKOUMBA ABONDO Clément (Logistique)',
  },

  // 3. COMPTABILITÉ & GESTION
  {
    id: 'EMP-009',
    name: 'Prof. Robert SANGUE',
    job: 'Expert-Comptable, Vérificateur des Comptes',
    category: 'Comptabilité',
    login: 'sangue',
    role: 'direction',
    userDisplay: 'Prof. Robert SANGUE (Expert-Comptable)',
  },
  {
    id: 'EMP-010',
    name: 'M. SANDJO Salvador',
    job: 'Comptable',
    category: 'Comptabilité',
    login: 'sandjo',
    role: 'direction',
    userDisplay: 'M. SANDJO Salvador (Comptable)',
  },
  {
    id: 'EMP-011',
    name: 'M. BAHOYA Daniel',
    job: 'Aide-Comptable',
    category: 'Comptabilité',
  },

  // 4. FORMATEURS PÉDAGOGIQUES
  {
    id: 'EMP-012',
    name: 'Mr Bean',
    job: 'Formateur (Anglais)',
    category: 'Formation',
  },
  {
    id: 'EMP-013',
    name: 'M. MBALLA ATANGANA',
    job: 'Formateur',
    category: 'Formation',
  },
  {
    id: 'EMP-014',
    name: 'M. MBAMBAND Jean Marc',
    job: 'Formateur',
    category: 'Formation',
  },
  {
    id: 'EMP-015',
    name: 'M. NZAZE DEUGOUE Elias',
    job: 'Formateur',
    category: 'Formation',
  },

  // 5. TECHNICIENS DE MENUISERIE & PRODUCTION
  {
    id: 'EMP-016',
    name: 'M. AHANGA EMARAM Sylvain',
    job: 'Technicien Menuisier',
    category: 'Technique',
    login: 'ouvrier',
    role: 'travailleur',
    userDisplay: 'M. AHANGA EMARAM Sylvain',
  },
  { id: 'EMP-017', name: 'M. BAHETEN Jean Marcel', job: 'Technicien Menuisier', category: 'Technique' },
  { id: 'EMP-018', name: 'M. EVA Michel', job: 'Technicien Menuisier', category: 'Technique' },
  { id: 'EMP-019', name: 'M. MVOMO Frédéric', job: 'Technicien Menuisier', category: 'Technique' },
  { id: 'EMP-020', name: 'M. NDOE ATEBA Pierre Désiré', job: 'Technicien Menuisier', category: 'Technique' },
  { id: 'EMP-021', name: 'Mme NGO NDOGO Juliette', job: 'Technicienne Menuisière', category: 'Technique' },
  { id: 'EMP-022', name: 'M. NLEND Dagobert', job: 'Technicien Menuisier', category: 'Technique' },
  { id: 'EMP-023', name: 'M. NTSAMA FOUDA Paul Olivier', job: 'Technicien Menuisier', category: 'Technique' },
  { id: 'EMP-024', name: 'M. NYA NJONWE Douglas', job: 'Technicien Menuisier', category: 'Technique' },
  { id: 'EMP-025', name: 'M. OBIONDA Claude François', job: 'Technicien Menuisier', category: 'Technique' },
  { id: 'EMP-026', name: 'M. OLAMA TSALA Philippe', job: 'Technicien Menuisier', category: 'Technique' },
  { id: 'EMP-027', name: 'M. TASSIE Patrice', job: 'Technicien Menuisier', category: 'Technique' },
  { id: 'EMP-028', name: 'M. TIEMBOMBA Mohammed', job: 'Technicien Menuisier', category: 'Technique' },
  { id: 'EMP-029', name: 'M. TOUNA ONGUENE Adolphe', job: 'Technicien Menuisier', category: 'Technique' },

  // 6. TÂCHERONS DU CFTM
  { id: 'EMP-030', name: 'M. BIYIHA Jean Roussel', job: 'Tâcheron', category: 'Tâcheron' },
  { id: 'EMP-031', name: 'M. ESSOMBA Georges Francis', job: 'Tâcheron', category: 'Tâcheron' },
  { id: 'EMP-032', name: 'M. ÉTOUNDI ESSOMBA Patrick', job: 'Tâcheron', category: 'Tâcheron' },
  { id: 'EMP-033', name: 'M. ZIBI Etienne', job: 'Tâcheron', category: 'Tâcheron' },
  { id: 'EMP-034', name: 'M. NOUTAT Jérémie', job: 'Tâcheron', category: 'Tâcheron' },

  // 7. MAINTENANCE, ENTRETIEN & MÉTIERS SPÉCIALISÉS
  { id: 'EMP-035', name: 'M. Aristide', job: 'Maintenance Machines', category: 'Maintenance' },
  { id: 'EMP-036', name: 'M. Bernard', job: 'Électricité Véhicules', category: 'Maintenance' },
  { id: 'EMP-037', name: 'M. Élisée', job: 'Maintenance imprimantes et consommables', category: 'Maintenance' },
  { id: 'EMP-038', name: 'M. GUIAKAM Isidore', job: 'Boite Électricité & Aspirateur', category: 'Maintenance' },
  { id: 'EMP-039', name: 'M. KAMGA Paulin', job: 'Maintenance Imprimante Canon', category: 'Maintenance' },
  { id: 'EMP-040', name: 'M. Léandry NDOGMO', job: 'Plombier', category: 'Maintenance' },
  { id: 'EMP-041', name: 'Mr KENNETT', job: 'Froid, Clim / Séchoir, Machines CFTM', category: 'Maintenance' },
  { id: 'EMP-042', name: 'M. DONFACK TONLEU', job: 'Sculpteur', category: 'Artisanat' },
  { id: 'EMP-043', name: 'M. KUATE Christian', job: 'Sculpteur', category: 'Artisanat' },
  { id: 'EMP-044', name: 'M. NANFACK Carlos', job: 'Tourneur', category: 'Usinage' },
  { id: 'EMP-045', name: 'M. ZAMBOU Alex', job: 'Soudeur', category: 'Soudure' },
  { id: 'EMP-046', name: 'M. NANTCHOUANG Éric', job: 'Électricité Climatisation', category: 'Maintenance' },
  { id: 'EMP-047', name: 'M. NOUAYE Alain', job: 'Électricité Ateliers', category: 'Maintenance' },
  { id: 'EMP-048', name: 'M. NZAKOU Ronel', job: 'Frigoriste', category: 'Maintenance' },
  { id: 'EMP-049', name: 'M. SEGNOU Clovis', job: 'Tapissier', category: 'Tapisserie' },
  { id: 'EMP-050', name: 'M. TAKOUDJOU TACHE Francis', job: 'Plafoniste', category: 'Finition' },
  { id: 'EMP-051', name: 'M. TAKOUGOUM Noël', job: 'Tapissier Cercueil', category: 'Tapisserie' },
  { id: 'EMP-052', name: 'M. TALOM Pascal', job: 'Mécanicien Véhicules', category: 'Maintenance' },
  { id: 'EMP-053', name: 'M. TANKOUA Romuald', job: 'Technicien Copieur', category: 'Maintenance' },
  { id: 'EMP-054', name: 'M. WAMBO Jules', job: 'Technicien Autocom', category: 'Maintenance' },

  // 8. SÉCURITÉ & RESTAURATION / INTENDANCE
  { id: 'EMP-055', name: 'M. ABDOULAYE NJARAYAM', job: 'Vigile', category: 'Sécurité' },
  { id: 'EMP-056', name: 'M. NDOUBAIDI Zachée', job: 'Veilleur (nuit)', category: 'Sécurité' },
  { id: 'EMP-057', name: 'Mme AWONO BELLA Marie Évelyne', job: 'Cuisinière', category: 'Restauration' },
  { id: 'EMP-058', name: 'Mlle CHEKAM Audrey', job: 'Cuisinière', category: 'Restauration' },
];

async function main() {
  const db = new PGlite('./data/pglite');
  console.log('[CFTM] Intégration des 58 employés officiels du CFTM...');

  const defaultPinHash = hashPassword('1234');

  // Insérer ou mettre à jour chaque employé officiel avec badge et PIN
  let idx = 0;
  for (const emp of CFTM_STAFF) {
    const badge = generateBadge(idx);
    await db.query(
      `INSERT INTO employees (id, full_name, job_title, badge_token, pin_hash, active)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (id) DO UPDATE
       SET full_name = EXCLUDED.full_name,
           job_title = EXCLUDED.job_title,
           badge_token = EXCLUDED.badge_token,
           pin_hash = EXCLUDED.pin_hash,
           active = true`,
      [emp.id, emp.name, emp.job, badge, defaultPinHash],
    );
    idx++;
  }

  // Mettre à jour les prêts de démonstration vers les nouveaux techniciens officiels
  await db.query(`UPDATE loans SET employee_id = 'EMP-016' WHERE employee_id NOT IN (SELECT id FROM employees)`);
  await db.query(`UPDATE attendance SET employee_id = 'EMP-016' WHERE employee_id NOT IN (SELECT id FROM employees)`);

  // Mettre à jour ou créer les utilisateurs du système
  for (const emp of CFTM_STAFF) {
    if (emp.login) {
      let pwd = 'cftm2026';
      if (emp.login === 'direction') pwd = 'direction226';
      if (emp.login === 'chef') pwd = 'atelier226';
      if (emp.login === 'magasinier') pwd = 'magasin226';
      if (emp.login === 'ouvrier') pwd = 'atelier226';

      const pwdHash = hashPassword(pwd);
      await db.query(
        `INSERT INTO users (login, password_hash, display_name, role, employee_id, active)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (login) DO UPDATE
         SET display_name = EXCLUDED.display_name,
             role = EXCLUDED.role,
             employee_id = EXCLUDED.employee_id,
             password_hash = EXCLUDED.password_hash`,
        [emp.login, pwdHash, emp.userDisplay || emp.name, emp.role || 'direction', emp.id],
      );
    }
  }

  // Mettre à jour les responsables officiels des 29 magasins
  const managerUpdates = [
    ['BUR-DG', 'Père Elie TEKAM TAGHUEN, OSB'],
    ['BUR-DF', 'M. KOUOMOU Désiré'],
    ['BUR-DPC', 'M. KAMGA Innocent'],
    ['BUR-ECO', 'Mme ÉTOGA Joséphine'],
    ['BUR-SEC', 'Secrétariat CFTM'],
    ['BUR-CPT', 'M. SANDJO Salvador'],
    ['SAL-DAO', 'M. KOUOMOU Désiré'],
    ['SAL-PROF', 'M. MBALLA ATANGANA'],
    ['SAL-BIB', 'Direction Pédagogique'],
    ['BUR-SG', 'Frère François MEKELI, OSB'],
    ['BUR-CT', 'M. LAWSON ADODO François'],
    ['ATE-PROD', 'M. LAWSON ADODO François'],
    ['MAG-GRD', 'M. MINKOUMBA ABONDO Clément'],
    ['ATE-FORM', 'M. KOUOMOU Désiré'],
    ['MAG-VERN', 'M. TAKOUDJOU TACHE Francis'],
    ['SAL-AFF', 'M. NANFACK Carlos'],
    ['MAG-BOIS', 'M. MINKOUMBA ABONDO Clément'],
    ['MAG-DEF', 'M. Aristide'],
    ['MAG-LEO', 'M. MINKOUMBA ABONDO Clément'],
    ['MAG-GREN', 'Frère François MEKELI, OSB'],
    ['MAG-MOUS', 'M. SEGNOU Clovis'],
    ['MAG-PAN', 'M. MINKOUMBA ABONDO Clément'],
    ['DIV-INT', 'Frère François MEKELI, OSB'],
    ['MAG-CANT', 'Mme AWONO BELLA Marie Évelyne'],
    ['SAL-CLAS', 'M. KOUOMOU Désiré'],
    ['SAL-POLY', 'Frère François MEKELI, OSB'],
    ['MAG-TM', 'M. LAWSON ADODO François'],
    ['SAL-EXPO', 'M. KAMGA Innocent'],
    ['APP-SUIS', 'Frère François MEKELI, OSB'],
  ];

  for (const [code, mgr] of managerUpdates) {
    await db.query(`UPDATE magasins SET manager_name = $1 WHERE code = $2`, [mgr, code]);
  }

  const count = await db.query('SELECT count(*) FROM employees');
  console.log(`\nSuccès : ${count.rows[0].count} employés officiels enregistrés dans le système CFTM.`);
  await db.close();
}

if (process.argv[1] && process.argv[1].includes('setup-cftm-employees')) {
  main().catch((err) => {
    console.error('Erreur :', err);
    process.exit(1);
  });
}
