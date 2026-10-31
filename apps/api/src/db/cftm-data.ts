import type { Sql } from './index.js';
import { hashPassword } from '../lib/crypto.js';
import { CFTM_TOOLS, CFTM_STOCK_REFS } from './cftm-inventory-data.js';

const BADGE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateBadge(index: number): string {
  let code = '';
  let n = (index + 1) * 7919;
  for (let i = 0; i < 5; i++) {
    code += BADGE_ALPHABET[n % BADGE_ALPHABET.length];
    n = Math.floor(n / 31) + (i + 1) * 313;
  }
  return code;
}

export const CFTM_LOCATIONS: {
  id: string;
  name: string;
  code: string;
  description: string;
  can_lend: boolean;
  can_receive_in: boolean;
  can_deliver_out: boolean;
  can_transfer: boolean;
  manager_name: string;
}[] = [
  {
    id: 'MAG-001',
    name: 'Bureau Directeur Général',
    code: 'BUR-DG',
    description: 'Direction Générale — Mobilier, équipements informatiques et de direction',
    can_lend: false,
    can_receive_in: false,
    can_deliver_out: false,
    can_transfer: false,
    manager_name: 'Père Elie TEKAM TAGHUEN, OSB',
  },
  {
    id: 'MAG-002',
    name: 'Bureau Directeur Formation',
    code: 'BUR-DF',
    description: 'Direction Pédagogique et Formation — Documents de formation et matériel didactique',
    can_lend: false,
    can_receive_in: false,
    can_deliver_out: false,
    can_transfer: false,
    manager_name: 'M. KOUOMOU Désiré',
  },
  {
    id: 'MAG-003',
    name: 'Bureau Directeur Projets et Caissière',
    code: 'BUR-DPC',
    description: 'Direction des Projets et Caisse — Dossiers clients, suivi des commandes et caisse',
    can_lend: false,
    can_receive_in: false,
    can_deliver_out: false,
    can_transfer: false,
    manager_name: 'M. KAMGA Innocent',
  },
  {
    id: 'MAG-004',
    name: 'Économat',
    code: 'BUR-ECO',
    description: 'Autocom, Réseau, Matériel Didactique, Outils Divers et Produits Hygiène',
    can_lend: true,
    can_receive_in: true,
    can_deliver_out: true,
    can_transfer: true,
    manager_name: 'Mme ÉTOGA Joséphine',
  },
  {
    id: 'MAG-005',
    name: 'Bureau Secrétariat',
    code: 'BUR-SEC',
    description: 'Machines de bureau, matériel d’impression, reliures et consommables administratifs',
    can_lend: false,
    can_receive_in: false,
    can_deliver_out: true,
    can_transfer: false,
    manager_name: 'Secrétariat CFTM',
  },
  {
    id: 'MAG-006',
    name: 'Bureau Compta et Stagiaires Suisses',
    code: 'BUR-CPT',
    description: 'Machines bureautiques, archives comptables et espace de travail stagiaires suisses',
    can_lend: false,
    can_receive_in: false,
    can_deliver_out: false,
    can_transfer: false,
    manager_name: 'M. SANDJO Salvador',
  },
  {
    id: 'MAG-007',
    name: 'Salle Multimédia',
    code: 'SAL-DAO',
    description: 'Postes informatiques et machines pour la formation en Dessin Assisté par Ordinateur (DAO)',
    can_lend: false,
    can_receive_in: false,
    can_deliver_out: false,
    can_transfer: false,
    manager_name: 'M. KOUOMOU Désiré',
  },
  {
    id: 'MAG-008',
    name: 'Salle des Profs',
    code: 'SAL-PROF',
    description: 'Machines, ordinateurs et autres documents didactiques du corps professoral',
    can_lend: false,
    can_receive_in: false,
    can_deliver_out: false,
    can_transfer: false,
    manager_name: 'M. MBALLA ATANGANA',
  },
  {
    id: 'MAG-009',
    name: 'Bibliothèque',
    code: 'SAL-BIB',
    description: 'Archives techniques, machines de consultation et documentation de menuiserie',
    can_lend: true,
    can_receive_in: false,
    can_deliver_out: false,
    can_transfer: false,
    manager_name: 'Direction Pédagogique',
  },
  {
    id: 'MAG-010',
    name: 'Bureau Surveillant Général',
    code: 'BUR-SG',
    description: 'Machines, matériel didactique et dossiers de surveillance générale',
    can_lend: false,
    can_receive_in: false,
    can_deliver_out: false,
    can_transfer: false,
    manager_name: 'Frère François MEKELI, OSB',
  },
  {
    id: 'MAG-011',
    name: 'Bureau Contrôleurs des Travaux',
    code: 'BUR-CT',
    description: 'Contrôle technique des chantiers et magasin de secours pour les ateliers',
    can_lend: true,
    can_receive_in: true,
    can_deliver_out: true,
    can_transfer: true,
    manager_name: 'M. LAWSON ADODO François',
  },
  {
    id: 'MAG-012',
    name: 'Atelier de Production',
    code: 'ATE-PROD',
    description: 'Machines stationnaires et petits outils pour les établis des employés',
    can_lend: true,
    can_receive_in: false,
    can_deliver_out: false,
    can_transfer: true,
    manager_name: 'M. LAWSON ADODO François',
  },
  {
    id: 'MAG-013',
    name: 'Grand Magasin',
    code: 'MAG-GRD',
    description: 'Outils de coupe, lames, fraises et machines électroportatives',
    can_lend: true,
    can_receive_in: true,
    can_deliver_out: true,
    can_transfer: true,
    manager_name: 'M. MINKOUMBA ABONDO Clément',
  },
  {
    id: 'MAG-014',
    name: 'Atelier de Formation',
    code: 'ATE-FORM',
    description: 'Machines pédagogiques et magasin d’outillage pour les apprenants',
    can_lend: true,
    can_receive_in: false,
    can_deliver_out: false,
    can_transfer: true,
    manager_name: 'M. KOUOMOU Désiré',
  },
  {
    id: 'MAG-015',
    name: 'Cabine de Vernissage',
    code: 'MAG-VERN',
    description: 'Magasin pour outils de vernissage, pistolets pneumatiques et produits de finition',
    can_lend: true,
    can_receive_in: true,
    can_deliver_out: true,
    can_transfer: true,
    manager_name: 'M. TAKOUDJOU TACHE Francis',
  },
  {
    id: 'MAG-016',
    name: 'Salle d’Affûtage',
    code: 'SAL-AFF',
    description: 'Machines et outils spécialisés d’affûtage (meules, fers, rubans, lames)',
    can_lend: true,
    can_receive_in: false,
    can_deliver_out: false,
    can_transfer: true,
    manager_name: 'M. NANFACK Carlos',
  },
  {
    id: 'MAG-017',
    name: 'Parc à Bois',
    code: 'MAG-BOIS',
    description: 'Stock de bois massif — diverses essences de bois locales et quantités en cubage',
    can_lend: false,
    can_receive_in: true,
    can_deliver_out: true,
    can_transfer: true,
    manager_name: 'M. MINKOUMBA ABONDO Clément',
  },
  {
    id: 'MAG-018',
    name: 'Magasin de Machines Défectueuses',
    code: 'MAG-DEF',
    description: 'Stock d’outils et machines défectueuses en attente de diagnostic, maintenance ou réforme',
    can_lend: false,
    can_receive_in: true,
    can_deliver_out: false,
    can_transfer: true,
    manager_name: 'M. Aristide',
  },
  {
    id: 'MAG-019',
    name: 'Magasin Léo',
    code: 'MAG-LEO',
    description: 'Quincaillerie complète, visserie, accessoires, autres outils et machines spécifiques',
    can_lend: true,
    can_receive_in: true,
    can_deliver_out: true,
    can_transfer: true,
    manager_name: 'M. MINKOUMBA ABONDO Clément',
  },
  {
    id: 'MAG-020',
    name: 'Grenier Monastère',
    code: 'MAG-GREN',
    description: 'Magasin de réserve générale et stockage patrimonial du Monastère',
    can_lend: false,
    can_receive_in: true,
    can_deliver_out: true,
    can_transfer: true,
    manager_name: 'Frère François MEKELI, OSB',
  },
  {
    id: 'MAG-021',
    name: 'Magasin des Mousses',
    code: 'MAG-MOUS',
    description: 'Mousses de garnissage — Divers types, densités et quantités pour ameublement',
    can_lend: false,
    can_receive_in: true,
    can_deliver_out: true,
    can_transfer: true,
    manager_name: 'M. SEGNOU Clovis',
  },
  {
    id: 'MAG-022',
    name: 'Magasin des Panneaux',
    code: 'MAG-PAN',
    description: 'Panneaux dérivés du bois (contreplaqué, MDF, latté, mélaminé) — divers types et formats',
    can_lend: false,
    can_receive_in: true,
    can_deliver_out: true,
    can_transfer: true,
    manager_name: 'M. MINKOUMBA ABONDO Clément',
  },
  {
    id: 'MAG-023',
    name: 'Internat',
    code: 'DIV-INT',
    description: 'Studio, salle d’étude et de TV, dortoirs Niveaux I, II et III',
    can_lend: false,
    can_receive_in: false,
    can_deliver_out: false,
    can_transfer: false,
    manager_name: 'Frère François MEKELI, OSB',
  },
  {
    id: 'MAG-024',
    name: 'Cantine',
    code: 'MAG-CANT',
    description: 'Magasins de réserve intérieure et de réserve extérieure pour la restauration',
    can_lend: false,
    can_receive_in: true,
    can_deliver_out: true,
    can_transfer: false,
    manager_name: 'Mme AWONO BELLA Marie Évelyne',
  },
  {
    id: 'MAG-025',
    name: 'Salles de Classes',
    code: 'SAL-CLAS',
    description: 'Salles d’enseignement théorique et professionnel (Niveaux I, II et III)',
    can_lend: false,
    can_receive_in: false,
    can_deliver_out: false,
    can_transfer: false,
    manager_name: 'M. KOUOMOU Désiré',
  },
  {
    id: 'MAG-026',
    name: 'Salle Polyvalente',
    code: 'SAL-POLY',
    description: 'Salle des fêtes, conférences, remises de diplômes et réunions institutionnelles',
    can_lend: false,
    can_receive_in: false,
    can_deliver_out: false,
    can_transfer: false,
    manager_name: 'Frère François MEKELI, OSB',
  },
  {
    id: 'MAG-027',
    name: 'Magasin des Outils Manuels pour le TM',
    code: 'MAG-TM',
    description: 'Outillage manuel individuel et collectif pour les Travaux de Menuiserie (TM)',
    can_lend: true,
    can_receive_in: true,
    can_deliver_out: true,
    can_transfer: true,
    manager_name: 'M. LAWSON ADODO François',
  },
  {
    id: 'MAG-028',
    name: 'Salle d’Exposition',
    code: 'SAL-EXPO',
    description: 'Showroom de vente et exposition permanente des réalisations menuiserie du CFTM',
    can_lend: false,
    can_receive_in: false,
    can_deliver_out: false,
    can_transfer: false,
    manager_name: 'M. KAMGA Innocent',
  },
  {
    id: 'MAG-029',
    name: 'Appartement Stagiaires Suisses',
    code: 'APP-SUIS',
    description: 'Logement résidentiel et équipements dédiés à l’accueil des coopérants et stagiaires suisses',
    can_lend: false,
    can_receive_in: false,
    can_deliver_out: false,
    can_transfer: false,
    manager_name: 'Frère François MEKELI, OSB',
  },
];

export const CFTM_STAFF: {
  id: string;
  name: string;
  job: string;
  category: string;
  photo_path?: string;
  login?: string;
  role?: string;
  userDisplay?: string;
}[] = [
  // 1. DIRECTION & ENCADREMENT
  {
    id: 'EMP-001',
    name: 'Père Elie TEKAM TAGHUEN, OSB',
    job: 'Directeur Général',
    category: 'Direction',
    photo_path: '/photos/employees/EMP-001.webp',
    login: 'direction',
    role: 'direction',
    userDisplay: 'Père Elie TEKAM TAGHUEN (DG)',
  },
  {
    id: 'EMP-002',
    name: 'Frère François MEKELI, OSB',
    job: 'Surveillant Général',
    category: 'Direction',
    photo_path: '/photos/employees/EMP-002.webp',
    login: 'mekeli',
    role: 'direction',
    userDisplay: 'Frère François MEKELI (SG)',
  },
  {
    id: 'EMP-003',
    name: 'M. KOUOMOU Désiré',
    job: 'Directeur de Formation & Informaticien',
    category: 'Direction Pédagogique',
    photo_path: '/photos/employees/EMP-003.webp',
    login: 'kouomou',
    role: 'direction',
    userDisplay: 'M. KOUOMOU Désiré (DF & IT)',
  },
  {
    id: 'EMP-004',
    name: 'M. KAMGA Innocent',
    job: 'Directeur des Projets',
    category: 'Direction',
    photo_path: '/photos/employees/EMP-004.webp',
    login: 'kamga',
    role: 'direction',
    userDisplay: 'M. KAMGA Innocent (DP)',
  },
  {
    id: 'EMP-005',
    name: 'Mme ÉTOGA Joséphine',
    job: 'Caissière / Économe',
    category: 'Administration',
    photo_path: '/photos/employees/EMP-005.webp',
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
    photo_path: '/photos/employees/EMP-006.webp',
    login: 'chef',
    role: 'chef_atelier',
    userDisplay: 'M. LAWSON ADODO François (Chef CT)',
  },
  {
    id: 'EMP-007',
    name: 'M. MVOGO Médard',
    job: 'Adj. Contrôleur des Travaux',
    category: 'Production',
    photo_path: '/photos/employees/EMP-007.webp',
    login: 'mvogo',
    role: 'chef_atelier',
    userDisplay: 'M. MVOGO Médard (Adj. CT)',
  },
  {
    id: 'EMP-008',
    name: 'M. MINKOUMBA ABONDO Clément',
    job: 'Coursier & Resp. Livraisons',
    category: 'Logistique',
    photo_path: '/photos/employees/EMP-008.webp',
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
    photo_path: '/photos/employees/EMP-016.webp',
    login: 'ouvrier',
    role: 'travailleur',
    userDisplay: 'M. AHANGA EMARAM Sylvain',
  },
  { id: 'EMP-017', name: 'M. BAHETEN Jean Marcel', job: 'Technicien Menuisier', category: 'Technique', photo_path: '/photos/employees/EMP-017.webp' },
  { id: 'EMP-018', name: 'M. EVA Michel', job: 'Technicien Menuisier', category: 'Technique', photo_path: '/photos/employees/EMP-018.webp' },
  { id: 'EMP-019', name: 'M. MVOMO Frédéric', job: 'Technicien Menuisier', category: 'Technique', photo_path: '/photos/employees/EMP-019.webp' },
  { id: 'EMP-020', name: 'M. NDOE ATEBA Pierre Désiré', job: 'Technicien Menuisier', category: 'Technique', photo_path: '/photos/employees/EMP-020.webp' },
  { id: 'EMP-021', name: 'Mme NGO NDOGO Juliette', job: 'Technicienne Menuisière', category: 'Technique', photo_path: '/photos/employees/EMP-021.webp' },
  { id: 'EMP-022', name: 'M. NLEND Dagobert', job: 'Technicien Menuisier', category: 'Technique', photo_path: '/photos/employees/EMP-022.webp' },
  { id: 'EMP-023', name: 'M. NTSAMA FOUDA Paul Olivier', job: 'Technicien Menuisier', category: 'Technique', photo_path: '/photos/employees/EMP-023.webp' },
  { id: 'EMP-024', name: 'M. NYA NJONWE Douglas', job: 'Technicien Menuisier', category: 'Technique', photo_path: '/photos/employees/EMP-024.webp' },
  { id: 'EMP-025', name: 'M. OBIONDA Claude François', job: 'Technicien Menuisier', category: 'Technique', photo_path: '/photos/employees/EMP-025.webp' },
  { id: 'EMP-026', name: 'M. OLAMA TSALA Philippe', job: 'Technicien Menuisier', category: 'Technique', photo_path: '/photos/employees/EMP-026.webp' },
  { id: 'EMP-027', name: 'M. TASSIE Patrice', job: 'Technicien Menuisier', category: 'Technique', photo_path: '/photos/employees/EMP-027.webp' },
  { id: 'EMP-028', name: 'M. TIEMBOMBA Mohammed', job: 'Technicien Menuisier', category: 'Technique', photo_path: '/photos/employees/EMP-028.webp' },
  { id: 'EMP-029', name: 'M. TOUNA ONGUENE Adolphe', job: 'Technicien Menuisier', category: 'Technique', photo_path: '/photos/employees/EMP-029.webp' },

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
  { id: 'EMP-055', name: 'M. ABDOULAYE NJARAYAM', job: 'Vigile', category: 'Sécurité', photo_path: '/photos/employees/EMP-055.webp' },
  { id: 'EMP-056', name: 'M. NDOUBAIDI Zachée', job: 'Veilleur (nuit)', category: 'Sécurité' },
  { id: 'EMP-057', name: 'Mme AWONO BELLA Marie Évelyne', job: 'Cuisinière', category: 'Restauration' },
  { id: 'EMP-058', name: 'Mlle CHEKAM Audrey', job: 'Cuisinière', category: 'Restauration' },
];

export async function syncOfficialCftmData(db: Sql): Promise<void> {
  // 1. Synchroniser les 29 magasins
  for (const loc of CFTM_LOCATIONS) {
    await db.query(
      `INSERT INTO magasins (id, name, code, description, active, can_lend, can_receive_in, can_deliver_out, can_transfer, manager_name)
       VALUES ($1, $2, $3, $4, true, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name,
           code = EXCLUDED.code,
           description = EXCLUDED.description,
           active = true,
           can_lend = EXCLUDED.can_lend,
           can_receive_in = EXCLUDED.can_receive_in,
           can_deliver_out = EXCLUDED.can_deliver_out,
           can_transfer = EXCLUDED.can_transfer,
           manager_name = EXCLUDED.manager_name`,
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
  }

  // 2. Synchroniser les 58 employés
  const defaultPinHash = hashPassword('1234');
  let idx = 0;
  for (const emp of CFTM_STAFF) {
    const badge = generateBadge(idx);
    await db.query(
      `INSERT INTO employees (id, full_name, job_title, photo_path, badge_token, pin_hash, active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       ON CONFLICT (id) DO UPDATE
       SET full_name = EXCLUDED.full_name,
           job_title = EXCLUDED.job_title,
           photo_path = CASE WHEN EXCLUDED.photo_path IS NOT NULL THEN EXCLUDED.photo_path ELSE employees.photo_path END,
           badge_token = EXCLUDED.badge_token,
           pin_hash = COALESCE(employees.pin_hash, EXCLUDED.pin_hash),
           active = true`,
      [emp.id, emp.name, emp.job, emp.photo_path || null, badge, defaultPinHash],
    );
    idx++;
  }

  // 3. Synchroniser les utilisateurs pour l'accès application
  for (const emp of CFTM_STAFF) {
    if (emp.login) {
      let pwd = 'cftm2026';
      if (emp.login === 'direction') pwd = 'direction226';
      if (emp.login === 'chef') pwd = 'atelier226';
      if (emp.login === 'magasinier') pwd = 'magasin226';
      if (emp.login === 'ouvrier') pwd = 'atelier226';

      const pwdHash = hashPassword(pwd);
      await db.query(
        `INSERT INTO users (login, password_hash, display_name, role, employee_id, photo_path, active)
         VALUES ($1, $2, $3, $4, $5, $6, true)
         ON CONFLICT (login) DO UPDATE
         SET display_name = EXCLUDED.display_name,
             role = EXCLUDED.role,
             employee_id = EXCLUDED.employee_id,
             photo_path = CASE WHEN EXCLUDED.photo_path IS NOT NULL THEN EXCLUDED.photo_path ELSE users.photo_path END`,
        [emp.login, pwdHash, emp.userDisplay || emp.name, emp.role || 'direction', emp.id, emp.photo_path || null],
      );
    }
  }

  // 4. Synchroniser le parc d'outillage & machines officielles (CFTM_TOOLS)
  for (const t of CFTM_TOOLS) {
    await db.query(
      `INSERT INTO tools (id, name, category, location, magasin_id, condition, status, brand, model)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name,
           category = EXCLUDED.category,
           location = EXCLUDED.location,
           magasin_id = EXCLUDED.magasin_id,
           condition = EXCLUDED.condition,
           status = EXCLUDED.status,
           brand = EXCLUDED.brand,
           model = EXCLUDED.model`,
      [t.id, t.name, t.category, t.location, t.magasin_id, t.condition, t.status, t.brand || null, t.model || null],
    );
  }

  // 5. Synchroniser le catalogue et stock de consommables / matières premières (CFTM_STOCK_REFS)
  for (const s of CFTM_STOCK_REFS) {
    const existing = await db.query<{ id: number }>(
      `SELECT id FROM stock_refs WHERE name = $1 AND magasin_id = $2 LIMIT 1`,
      [s.name, s.magasin_id],
    );
    const existingRef = existing[0];
    if (existingRef) {
      await db.query(
        `UPDATE stock_refs
            SET category = $1, unit = $2, location = $3, min_qty = $4, brand = $5, supplier = $6
          WHERE id = $7`,
        [s.category, s.unit, s.location, s.min_qty, s.brand || null, s.supplier || null, existingRef.id],
      );
    } else {
      await db.query(
        `INSERT INTO stock_refs (name, category, unit, location, magasin_id, min_qty, initial_qty, brand, supplier)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [s.name, s.category, s.unit, s.location, s.magasin_id, s.min_qty, s.initial_qty, s.brand || null, s.supplier || null],
      );
    }
  }
}
