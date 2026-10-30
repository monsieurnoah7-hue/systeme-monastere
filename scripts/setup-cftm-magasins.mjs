// Script officiel CFTM - Enregistrement et structuration des 29 lieux d'inventaire
// Direction Générale du Centre de Formation Technique Menuiserie (CFTM)
// Monastère des Bénédictins du Mont Fébé

import { PGlite } from '@electric-sql/pglite';

export const CFTM_LOCATIONS = [
  {
    num: 1,
    id: 'MAG-001',
    name: 'Bureau Directeur Général',
    code: 'BUR-DG',
    description: 'Direction Générale — Mobilier, équipements informatiques et de direction',
    can_lend: false,
    can_receive_in: false,
    can_deliver_out: false,
    can_transfer: false,
    manager_name: 'Directeur Général',
  },
  {
    num: 2,
    id: 'MAG-002',
    name: 'Bureau Directeur Formation',
    code: 'BUR-DF',
    description: 'Direction Pédagogique et Formation — Documents de formation et matériel didactique',
    can_lend: false,
    can_receive_in: false,
    can_deliver_out: false,
    can_transfer: false,
    manager_name: 'Directeur de Formation',
  },
  {
    num: 3,
    id: 'MAG-003',
    name: 'Bureau Directeur Projets et Caissière',
    code: 'BUR-DPC',
    description: 'Direction des Projets et Caisse — Dossiers clients, suivi des commandes et caisse',
    can_lend: false,
    can_receive_in: false,
    can_deliver_out: false,
    can_transfer: false,
    manager_name: 'Directeur Projets & Caissière',
  },
  {
    num: 4,
    id: 'MAG-004',
    name: 'Économat',
    code: 'BUR-ECO',
    description: 'Autocom, Réseau, Matériel Didactique, Outils Divers et Produits Hygiène',
    can_lend: true,
    can_receive_in: true,
    can_deliver_out: true,
    can_transfer: true,
    manager_name: 'Économe',
  },
  {
    num: 5,
    id: 'MAG-005',
    name: 'Bureau Secrétariat',
    code: 'BUR-SEC',
    description: 'Machines de bureau, matériel d’impression, reliures et consommables administratifs',
    can_lend: false,
    can_receive_in: false,
    can_deliver_out: true,
    can_transfer: false,
    manager_name: 'Secrétariat',
  },
  {
    num: 6,
    id: 'MAG-006',
    name: 'Bureau Compta et Stagiaires Suisses',
    code: 'BUR-CPT',
    description: 'Machines bureautiques, archives comptables et espace de travail stagiaires suisses',
    can_lend: false,
    can_receive_in: false,
    can_deliver_out: false,
    can_transfer: false,
    manager_name: 'Comptable',
  },
  {
    num: 7,
    id: 'MAG-007',
    name: 'Salle Multimédia',
    code: 'SAL-DAO',
    description: 'Postes informatiques et machines pour la formation en Dessin Assisté par Ordinateur (DAO)',
    can_lend: false,
    can_receive_in: false,
    can_deliver_out: false,
    can_transfer: false,
    manager_name: 'Responsable DAO / Multimédia',
  },
  {
    num: 8,
    id: 'MAG-008',
    name: 'Salle des Profs',
    code: 'SAL-PROF',
    description: 'Machines, ordinateurs et autres documents didactiques du corps professoral',
    can_lend: false,
    can_receive_in: false,
    can_deliver_out: false,
    can_transfer: false,
    manager_name: 'Corps Professoral',
  },
  {
    num: 9,
    id: 'MAG-009',
    name: 'Bibliothèque',
    code: 'SAL-BIB',
    description: 'Archives techniques, machines de consultation et documentation de menuiserie',
    can_lend: true,
    can_receive_in: false,
    can_deliver_out: false,
    can_transfer: false,
    manager_name: 'Bibliothécaire / Archiviste',
  },
  {
    num: 10,
    id: 'MAG-010',
    name: 'Bureau Surveillant Général',
    code: 'BUR-SG',
    description: 'Machines, matériel didactique et dossiers de surveillance générale',
    can_lend: false,
    can_receive_in: false,
    can_deliver_out: false,
    can_transfer: false,
    manager_name: 'Surveillant Général',
  },
  {
    num: 11,
    id: 'MAG-011',
    name: 'Bureau Contrôleurs des Travaux',
    code: 'BUR-CT',
    description: 'Contrôle technique des chantiers et magasin de secours pour les ateliers',
    can_lend: true,
    can_receive_in: true,
    can_deliver_out: true,
    can_transfer: true,
    manager_name: 'Contrôleur des Travaux',
  },
  {
    num: 12,
    id: 'MAG-012',
    name: 'Atelier de Production',
    code: 'ATE-PROD',
    description: 'Machines stationnaires et petits outils pour les établis des employés',
    can_lend: true,
    can_receive_in: false,
    can_deliver_out: false,
    can_transfer: true,
    manager_name: 'Chef d’Atelier Production',
  },
  {
    num: 13,
    id: 'MAG-013',
    name: 'Grand Magasin',
    code: 'MAG-GRD',
    description: 'Outils de coupe, lames, fraises et machines électroportatives',
    can_lend: true,
    can_receive_in: true,
    can_deliver_out: true,
    can_transfer: true,
    manager_name: 'Magasinier Principal',
  },
  {
    num: 14,
    id: 'MAG-014',
    name: 'Atelier de Formation',
    code: 'ATE-FORM',
    description: 'Machines pédagogiques et magasin d’outillage pour les apprenants',
    can_lend: true,
    can_receive_in: false,
    can_deliver_out: false,
    can_transfer: true,
    manager_name: 'Formateur Principal',
  },
  {
    num: 15,
    id: 'MAG-015',
    name: 'Cabine de Vernissage',
    code: 'MAG-VERN',
    description: 'Magasin pour outils de vernissage, pistolets pneumatiques et produits de finition',
    can_lend: true,
    can_receive_in: true,
    can_deliver_out: true,
    can_transfer: true,
    manager_name: 'Responsable Finitions & Vernis',
  },
  {
    num: 16,
    id: 'MAG-016',
    name: 'Salle d’Affûtage',
    code: 'SAL-AFF',
    description: 'Machines et outils spécialisés d’affûtage (meules, fers, rubans, lames)',
    can_lend: true,
    can_receive_in: false,
    can_deliver_out: false,
    can_transfer: true,
    manager_name: 'Affûteur',
  },
  {
    num: 17,
    id: 'MAG-017',
    name: 'Parc à Bois',
    code: 'MAG-BOIS',
    description: 'Stock de bois massif — diverses essences de bois locales et quantités en cubage',
    can_lend: false,
    can_receive_in: true,
    can_deliver_out: true,
    can_transfer: true,
    manager_name: 'Responsable Parc à Bois',
  },
  {
    num: 18,
    id: 'MAG-018',
    name: 'Magasin de Machines Défectueuses',
    code: 'MAG-DEF',
    description: 'Stock d’outils et machines défectueuses en attente de diagnostic, maintenance ou réforme',
    can_lend: false,
    can_receive_in: true,
    can_deliver_out: false,
    can_transfer: true,
    manager_name: 'Responsable Maintenance',
  },
  {
    num: 19,
    id: 'MAG-019',
    name: 'Magasin Léo',
    code: 'MAG-LEO',
    description: 'Quincaillerie complète, visserie, accessoires, autres outils et machines spécifiques',
    can_lend: true,
    can_receive_in: true,
    can_deliver_out: true,
    can_transfer: true,
    manager_name: 'Gestionnaire Magasin Léo',
  },
  {
    num: 20,
    id: 'MAG-020',
    name: 'Grenier Monastère',
    code: 'MAG-GREN',
    description: 'Magasin de réserve générale et stockage patrimonial du Monastère',
    can_lend: false,
    can_receive_in: true,
    can_deliver_out: true,
    can_transfer: true,
    manager_name: 'Intendant du Monastère',
  },
  {
    num: 21,
    id: 'MAG-021',
    name: 'Magasin des Mousses',
    code: 'MAG-MOUS',
    description: 'Mousses de garnissage — Divers types, densités et quantités pour ameublement',
    can_lend: false,
    can_receive_in: true,
    can_deliver_out: true,
    can_transfer: true,
    manager_name: 'Responsable Garnissage / Tapisserie',
  },
  {
    num: 22,
    id: 'MAG-022',
    name: 'Magasin des Panneaux',
    code: 'MAG-PAN',
    description: 'Panneaux dérivés du bois (contreplaqué, MDF, latté, mélaminé) — divers types et formats',
    can_lend: false,
    can_receive_in: true,
    can_deliver_out: true,
    can_transfer: true,
    manager_name: 'Gestionnaire Débits & Panneaux',
  },
  {
    num: 23,
    id: 'MAG-023',
    name: 'Internat',
    code: 'DIV-INT',
    description: 'Studio, salle d’étude et de TV, dortoirs Niveaux I, II et III',
    can_lend: false,
    can_receive_in: false,
    can_deliver_out: false,
    can_transfer: false,
    manager_name: 'Responsable Internat',
  },
  {
    num: 24,
    id: 'MAG-024',
    name: 'Cantine',
    code: 'MAG-CANT',
    description: 'Magasins de réserve intérieure et de réserve extérieure pour la restauration',
    can_lend: false,
    can_receive_in: true,
    can_deliver_out: true,
    can_transfer: false,
    manager_name: 'Gestionnaire Cantine',
  },
  {
    num: 25,
    id: 'MAG-025',
    name: 'Salles de Classes',
    code: 'SAL-CLAS',
    description: 'Salles d’enseignement théorique et professionnel (Niveaux I, II et III)',
    can_lend: false,
    can_receive_in: false,
    can_deliver_out: false,
    can_transfer: false,
    manager_name: 'Surveillance Pédagogique',
  },
  {
    num: 26,
    id: 'MAG-026',
    name: 'Salle Polyvalente',
    code: 'SAL-POLY',
    description: 'Salle des fêtes, conférences, remises de diplômes et réunions institutionnelles',
    can_lend: false,
    can_receive_in: false,
    can_deliver_out: false,
    can_transfer: false,
    manager_name: 'Intendance Générale',
  },
  {
    num: 27,
    id: 'MAG-027',
    name: 'Magasin des Outils Manuels pour le TM',
    code: 'MAG-TM',
    description: 'Outillage manuel individuel et collectif pour les Travaux de Menuiserie (TM)',
    can_lend: true,
    can_receive_in: true,
    can_deliver_out: true,
    can_transfer: true,
    manager_name: 'Responsable TM',
  },
  {
    num: 28,
    id: 'MAG-028',
    name: 'Salle d’Exposition',
    code: 'SAL-EXPO',
    description: 'Showroom de vente et exposition permanente des réalisations menuiserie du CFTM',
    can_lend: false,
    can_receive_in: false,
    can_deliver_out: false,
    can_transfer: false,
    manager_name: 'Responsable Commercial / Expo',
  },
  {
    num: 29,
    id: 'MAG-029',
    name: 'Appartement Stagiaires Suisses',
    code: 'APP-SUIS',
    description: 'Logement résidentiel et équipements dédiés à l’accueil des coopérants et stagiaires suisses',
    can_lend: false,
    can_receive_in: false,
    can_deliver_out: false,
    can_transfer: false,
    manager_name: 'Intendance Monastère',
  },
];

async function main() {
  const db = new PGlite('./data/pglite');
  console.log('[CFTM] Initialisation des 29 lieux d’inventaire officiels...');

  // 0. S'assurer que les colonnes de capacité existent
  await db.exec(`
    ALTER TABLE magasins ADD COLUMN IF NOT EXISTS can_lend boolean NOT NULL DEFAULT true;
    ALTER TABLE magasins ADD COLUMN IF NOT EXISTS can_receive_in boolean NOT NULL DEFAULT true;
    ALTER TABLE magasins ADD COLUMN IF NOT EXISTS can_deliver_out boolean NOT NULL DEFAULT true;
    ALTER TABLE magasins ADD COLUMN IF NOT EXISTS can_transfer boolean NOT NULL DEFAULT true;
    ALTER TABLE magasins ADD COLUMN IF NOT EXISTS manager_name text;
  `);

  // 1. Mettre à jour temporairement les magasins des outils et stocks vers MAG-012, MAG-013, etc.
  // Pour éviter tout conflit de code ou clé étrangère
  await db.exec(`
    UPDATE tools SET location = 'Atelier de Production' WHERE magasin_id = 'MAG-003';
    UPDATE tools SET location = 'Atelier de Formation' WHERE magasin_id = 'MAG-004';
    UPDATE tools SET location = 'Grand Magasin' WHERE magasin_id = 'MAG-002';
    UPDATE tools SET location = 'Magasin Léo' WHERE magasin_id = 'MAG-001';
    UPDATE tools SET magasin_id = NULL WHERE magasin_id IS NOT NULL;
    UPDATE stock_refs SET magasin_id = NULL WHERE magasin_id IS NOT NULL;
    DELETE FROM magasins;
  `);

  // 2. Insérer l'ensemble des 29 lieux officiels
  for (const loc of CFTM_LOCATIONS) {
    await db.query(
      `INSERT INTO magasins (id, name, code, description, active, can_lend, can_receive_in, can_deliver_out, can_transfer, manager_name)
       VALUES ($1, $2, $3, $4, true, $5, $6, $7, $8, $9)`,
      [
        loc.id,
        loc.name,
        loc.code,
        loc.description,
        loc.can_lend,
        loc.can_receive_in,
        loc.can_deliver_out,
        loc.can_transfer,
        loc.manager_name,
      ],
    );
    console.log(`✓ ${loc.num.toString().padStart(2, '0')}. [${loc.code.padEnd(8, ' ')}] ${loc.name}`);
  }

  // 3. Réaffecter logiquement les outils et stocks existants vers les vrais magasins officiels :
  // - Outils atelier de production -> MAG-012 (ATE-PROD)
  await db.query(`
    UPDATE tools
       SET magasin_id = 'MAG-012', location = 'Atelier de Production'
     WHERE id IN ('RBT-001', 'RBT-002', 'PER-001', 'MAR-001', 'PIN-001', 'MET-001')
  `);

  // - Outils atelier de formation -> MAG-014 (ATE-FORM)
  await db.query(`
    UPDATE tools
       SET magasin_id = 'MAG-014', location = 'Atelier de Formation'
     WHERE id IN ('SCI-001', 'SCI-002', 'SCI-003', 'MEU-001')
  `);

  // - Outils grand magasin (électroportatif) -> MAG-013 (MAG-GRD)
  await db.query(`
    UPDATE tools
       SET magasin_id = 'MAG-013', location = 'Grand Magasin'
     WHERE id IN ('PER-002', 'VIS-001')
  `);

  // - Outils magasin outillage manuel / réformé -> MAG-018 ou MAG-027
  await db.query(`
    UPDATE tools
       SET magasin_id = 'MAG-018', location = 'Magasin Machines Défectueuses'
     WHERE id = 'MET-002'
  `);
  await db.query(`
    UPDATE tools
       SET magasin_id = 'MAG-027', location = 'Magasin Outils Manuels TM'
     WHERE id = 'TOU-001'
  `);

  // 4. Réaffecter les stocks aux magasins officiels appropriés :
  // - Bois massif -> MAG-017 (MAG-BOIS, Parc à Bois)
  await db.query(`
    UPDATE stock_refs
       SET magasin_id = 'MAG-017', location = 'Parc à Bois'
     WHERE name LIKE '%chêne%'
  `);

  // - Panneaux -> MAG-022 (MAG-PAN, Magasin des Panneaux)
  await db.query(`
    UPDATE stock_refs
       SET magasin_id = 'MAG-022', location = 'Magasin des Panneaux'
     WHERE name LIKE '%OSB%' OR name LIKE '%Panneau%'
  `);

  // - Quincaillerie & visserie -> MAG-019 (MAG-LEO, Magasin Léo)
  await db.query(`
    UPDATE stock_refs
       SET magasin_id = 'MAG-019', location = 'Magasin Léo'
     WHERE name LIKE '%Vis%' OR name LIKE '%Charnière%' OR name LIKE '%Poignée%'
  `);

  // - Consommables & colles -> MAG-004 (Économat) ou MAG-015 (Cabine de Vernissage)
  await db.query(`
    UPDATE stock_refs
       SET magasin_id = 'MAG-004', location = 'Économat'
     WHERE name LIKE '%Colle%'
  `);
  await db.query(`
    UPDATE stock_refs
       SET magasin_id = 'MAG-013', location = 'Grand Magasin'
     WHERE name LIKE '%Disque%'
  `);

  const count = await db.query('SELECT count(*) FROM magasins');
  console.log(`\nSuccès : ${count.rows[0].count} magasins et lieux officiels enregistrés au CFTM.`);

  await db.close();
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  main().catch((err) => {
    console.error('Erreur lors de la création des magasins :', err);
    process.exit(1);
  });
}
