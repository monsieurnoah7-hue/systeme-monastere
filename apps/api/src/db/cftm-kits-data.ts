// Données certifiées des Kits d'Établis du CFTM
// Rattachées exclusivement aux techniciens, artisans et encadrants d'ateliers ayant droit
// selon les documents officiels du 26/10/2026

export interface CftmKitDef {
  emp_id: string;
  name: string;
  job: string;
  etabli_num: number;
  code: string;
  location: string;
  source_mag: string;
  type: 'standard' | 'finition';
  items: {
    item_num: number;
    name: string;
    qty: number;
    unit: string;
    tool_code: string;
  }[];
}

const STANDARD_ITEMS = [
  { item_num: 1, name: 'Marteau de 30gr ou 40gr', qty: 1, unit: 'pièce', code: 'MAR' },
  { item_num: 2, name: 'Tenailles de menuisier', qty: 1, unit: 'pièce', code: 'TEN' },
  { item_num: 3, name: 'Jeu de 4 ciseaux à bois', qty: 1, unit: 'jeu', code: 'CIS' },
  { item_num: 4, name: 'Râpe ronde', qty: 1, unit: 'pièce', code: 'RAP-RND' },
  { item_num: 5, name: 'Râpe plate', qty: 1, unit: 'pièce', code: 'RAP-PLT' },
  { item_num: 6, name: 'Lime ronde', qty: 1, unit: 'pièce', code: 'LIM-RND' },
  { item_num: 7, name: 'Lime à trois côtés', qty: 1, unit: 'pièce', code: 'LIM-TRI' },
  { item_num: 8, name: 'Embouts de vissage', qty: 2, unit: 'embouts', code: 'EMB' },
  { item_num: 9, name: 'Lunettes de sécurité', qty: 1, unit: 'pièce', code: 'LUN' },
  { item_num: 10, name: 'Équerre de menuisier', qty: 1, unit: 'pièce', code: 'EQU' },
  { item_num: 11, name: 'Racloir d’ébéniste', qty: 1, unit: 'pièce', code: 'RAC' },
  { item_num: 12, name: 'Mèches de perçage (Ø 5, 6, 8, 10, 12 mm)', qty: 5, unit: 'pièces', code: 'MEC' },
  { item_num: 13, name: 'Rabot à bois CFTM', qty: 1, unit: 'pièce', code: 'RAB' },
  { item_num: 14, name: 'Scie égoïne', qty: 1, unit: 'pièce', code: 'SCI-EGO' },
  { item_num: 15, name: 'Scie à dos', qty: 1, unit: 'pièce', code: 'SCI-DOS' },
  { item_num: 16, name: 'Chasse-pointe', qty: 1, unit: 'pièce', code: 'CHA' },
  { item_num: 17, name: 'Jeu de 6 tournevis EMTOP', qty: 1, unit: 'jeu', code: 'TOU' },
  { item_num: 18, name: 'Crayons de menuisier', qty: 5, unit: 'pièces', code: 'CRA' },
  { item_num: 19, name: 'Mètre ruban / Mètre pliant', qty: 1, unit: 'pièce', code: 'MET' },
  { item_num: 20, name: "Gants de protection d'atelier", qty: 2, unit: 'paires', code: 'GAN' },
  { item_num: 21, name: 'Casque anti-bruit', qty: 1, unit: 'pièce', code: 'CAS' },
  { item_num: 22, name: 'Masque respiratoire', qty: 1, unit: 'pièce', code: 'MAS' },
];

const FINITION_ITEMS = [
  { item_num: 1, name: 'Marteau de 30gr ou 40gr', qty: 1, unit: 'pièce', code: 'MAR' },
  { item_num: 2, name: 'Tenailles de menuisier', qty: 1, unit: 'pièce', code: 'TEN' },
  { item_num: 3, name: 'Jeu de 4 ciseaux à bois', qty: 1, unit: 'jeu', code: 'CIS' },
  { item_num: 4, name: 'Râpe ronde', qty: 1, unit: 'pièce', code: 'RAP-RND' },
  { item_num: 5, name: 'Râpe plate', qty: 1, unit: 'pièce', code: 'RAP-PLT' },
  { item_num: 6, name: 'Lime ronde', qty: 1, unit: 'pièce', code: 'LIM-RND' },
  { item_num: 7, name: 'Lime à trois côtés', qty: 1, unit: 'pièce', code: 'LIM-TRI' },
  { item_num: 8, name: 'Embouts de vissage', qty: 2, unit: 'embouts', code: 'EMB' },
  { item_num: 9, name: 'Lunettes de sécurité', qty: 1, unit: 'pièce', code: 'LUN' },
  { item_num: 10, name: 'Racloir d’ébéniste', qty: 1, unit: 'pièce', code: 'RAC' },
  { item_num: 11, name: 'Scie égoïne', qty: 1, unit: 'pièce', code: 'SCI-EGO' },
  { item_num: 12, name: 'Scie à dos', qty: 1, unit: 'pièce', code: 'SCI-DOS' },
  { item_num: 13, name: 'Chasse-pointe', qty: 1, unit: 'pièce', code: 'CHA' },
  { item_num: 14, name: 'Crayons de menuisier', qty: 5, unit: 'pièces', code: 'CRA' },
  { item_num: 15, name: 'Mètre ruban / Mètre pliant', qty: 1, unit: 'pièce', code: 'MET' },
  { item_num: 16, name: "Gants de protection d'atelier", qty: 2, unit: 'paires', code: 'GAN' },
  { item_num: 17, name: 'Casque anti-bruit', qty: 1, unit: 'pièce', code: 'CAS' },
  { item_num: 18, name: 'Masque respiratoire', qty: 1, unit: 'pièce', code: 'MAS' },
];

function buildItems(code: string, num: number, isFinition: boolean) {
  const base = isFinition ? FINITION_ITEMS : STANDARD_ITEMS;
  return base.map((it) => ({
    item_num: it.item_num,
    name: it.name,
    qty: it.qty,
    unit: it.unit,
    tool_code: `CFTM-${code}-${it.code}-${String(num).padStart(2, '0')}`,
  }));
}

// SEULS LES AYANTS DROIT LÉGITIMES DES ATELIERS & ÉTABLIS SONT INCLUS :
export const CFTM_KITS: CftmKitDef[] = [
  // 11 Établis Menuiserie de l'Atelier de Production
  {
    emp_id: 'EMP-016',
    name: 'M. AHANGA EMARAM Sylvain',
    job: 'Technicien Menuisier',
    etabli_num: 1,
    code: 'AES',
    location: 'Atelier de Production — Établi 01',
    source_mag: 'MAG-019',
    type: 'standard',
    items: buildItems('AES', 1, false),
  },
  {
    emp_id: 'EMP-017',
    name: 'M. BAHETEN Jean Marcel',
    job: 'Technicien Menuisier',
    etabli_num: 2,
    code: 'BJM',
    location: 'Atelier de Production — Établi 02',
    source_mag: 'MAG-019',
    type: 'standard',
    items: buildItems('BJM', 2, false),
  },
  {
    emp_id: 'EMP-018',
    name: 'M. EVA Michel',
    job: 'Technicien Menuisier',
    etabli_num: 3,
    code: 'EM',
    location: 'Atelier de Production — Établi 03',
    source_mag: 'MAG-019',
    type: 'standard',
    items: buildItems('EM', 3, false),
  },
  {
    emp_id: 'EMP-019',
    name: 'M. MVOMO Frédéric',
    job: 'Technicien Menuisier',
    etabli_num: 4,
    code: 'MF',
    location: 'Atelier de Production — Établi 04',
    source_mag: 'MAG-019',
    type: 'standard',
    items: buildItems('MF', 4, false),
  },
  {
    emp_id: 'EMP-022',
    name: 'M. NLEND Dagobert',
    job: 'Technicien Menuisier',
    etabli_num: 5,
    code: 'ND',
    location: 'Atelier de Production — Établi 05',
    source_mag: 'MAG-019',
    type: 'standard',
    items: buildItems('ND', 5, false),
  },
  {
    emp_id: 'EMP-023',
    name: 'M. NTSAMA FOUDA Paul Olivier',
    job: 'Technicien Menuisier',
    etabli_num: 6,
    code: 'NFPO',
    location: 'Atelier de Production — Établi 06',
    source_mag: 'MAG-019',
    type: 'standard',
    items: buildItems('NFPO', 6, false),
  },
  {
    emp_id: 'EMP-024',
    name: 'M. NYA NJONWE Douglas',
    job: 'Technicien Menuisier',
    etabli_num: 7,
    code: 'NND',
    location: 'Atelier de Production — Établi 07',
    source_mag: 'MAG-019',
    type: 'standard',
    items: buildItems('NND', 7, false),
  },
  {
    emp_id: 'EMP-026',
    name: 'M. OLAMA TSALA Philippe',
    job: 'Technicien Menuisier',
    etabli_num: 8,
    code: 'OTP',
    location: 'Atelier de Production — Établi 08',
    source_mag: 'MAG-019',
    type: 'standard',
    items: buildItems('OTP', 8, false),
  },
  {
    emp_id: 'EMP-027',
    name: 'M. TASSIE Patrice',
    job: 'Technicien Menuisier',
    etabli_num: 9,
    code: 'TP',
    location: 'Atelier de Production — Établi 09',
    source_mag: 'MAG-019',
    type: 'standard',
    items: buildItems('TP', 9, false),
  },
  {
    emp_id: 'EMP-028',
    name: 'M. TIEMBOMBA Mohammed',
    job: 'Technicien Menuisier',
    etabli_num: 10,
    code: 'TM',
    location: 'Atelier de Production — Établi 10',
    source_mag: 'MAG-019',
    type: 'standard',
    items: buildItems('TM', 10, false),
  },
  {
    emp_id: 'EMP-029',
    name: 'M. TOUNA ONGUENE Adolphe',
    job: 'Technicien Menuisier',
    etabli_num: 11,
    code: 'TOA',
    location: 'Atelier de Production — Établi 11',
    source_mag: 'MAG-019',
    type: 'standard',
    items: buildItems('TOA', 11, false),
  },

  // 3 Postes Finition de la Cabine de Vernissage
  {
    emp_id: 'EMP-020',
    name: 'M. NDOE ATEBA Pierre Désiré',
    job: 'Technicien Finition',
    etabli_num: 12,
    code: 'NAPD',
    location: 'Cabine de Vernissage — Poste Finition 01',
    source_mag: 'MAG-015',
    type: 'finition',
    items: buildItems('NAPD', 12, true),
  },
  {
    emp_id: 'EMP-021',
    name: 'Mme NGO NDOGO Juliette',
    job: 'Technicienne Finition',
    etabli_num: 13,
    code: 'NNJ',
    location: 'Cabine de Vernissage — Poste Finition 02',
    source_mag: 'MAG-015',
    type: 'finition',
    items: buildItems('NNJ', 13, true),
  },
  {
    emp_id: 'EMP-025',
    name: 'M. OBIONDA Claude François',
    job: 'Technicien Finition',
    etabli_num: 14,
    code: 'OCF',
    location: 'Cabine de Vernissage — Poste Finition 03',
    source_mag: 'MAG-015',
    type: 'finition',
    items: buildItems('OCF', 14, true),
  },

  // 3 Encadrants Techniques & Formation
  {
    emp_id: 'EMP-006',
    name: 'M. LAWSON ADODO François',
    job: 'Chef Contrôleur des Travaux',
    etabli_num: 15,
    code: 'LAF',
    location: 'Bureau Contrôleur des Travaux / Atelier',
    source_mag: 'MAG-019',
    type: 'standard',
    items: buildItems('LAF', 15, false),
  },
  {
    emp_id: 'EMP-007',
    name: 'M. MVOGO Médard',
    job: 'Adj. Contrôleur des Travaux',
    etabli_num: 16,
    code: 'MM',
    location: 'Bureau Contrôleur des Travaux / Atelier',
    source_mag: 'MAG-019',
    type: 'standard',
    items: buildItems('MM', 16, false),
  },
  {
    emp_id: 'EMP-003',
    name: 'M. KOUOMOU Désiré',
    job: 'Directeur de Formation & Informaticien',
    etabli_num: 17,
    code: 'KD',
    location: 'Atelier de Formation',
    source_mag: 'MAG-019',
    type: 'standard',
    items: buildItems('KD', 17, false),
  },
];
