import type { Role } from '../types.js';

export const PERMISSION_ACTIONS = [
  'tools.view',
  'tools.create',
  'tools.edit',
  'tools.delete',
  'tools.edit_status',
  'tools.photo_edit',
  'loans.view',
  'loans.create',
  'loans.return',
  'magasins.view',
  'magasins.manage',
  'stock.view',
  'stock.create_ref',
  'stock.edit_ref',
  'stock.delete_ref',
  'stock.photo_edit',
  'stock.move',
  'stock.correct',
  'attendance.view',
  'attendance.correct',
  'leaves.view',
  'leaves.manage',
  'employees.view',
  'employees.create',
  'employees.edit',
  'employees.photo_edit',
  'employees.print_badge',
  'financial.view',
  'reports.view',
  'reports.export',
  'dashboard.view',
  'settings.view',
  'settings.edit',
  'users.view',
  'users.manage',
  'profile.photo_edit_self',
  'terminals.manage',
  'permissions.manage',
  'scanner.use',
] as const;

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export const PERMISSION_LABELS: Record<PermissionAction, string> = {
  'tools.view': 'Consulter les outils',
  'tools.create': 'Créer des outils',
  'tools.edit': 'Modifier un outil (fiche, magasin)',
  'tools.delete': 'Supprimer des outils & matériels',
  'tools.edit_status': 'Modifier le statut d’un outil',
  'tools.photo_edit': 'Modifier la photo des outils & matériels',
  'loans.view': 'Voir les prêts',
  'loans.create': 'Enregistrer un prêt',
  'loans.return': 'Enregistrer un retour',
  'magasins.view': 'Consulter les magasins',
  'magasins.manage': 'Créer / modifier les magasins',
  'stock.view': 'Consulter le stock',
  'stock.create_ref': 'Créer une référence',
  'stock.edit_ref': 'Modifier une référence',
  'stock.delete_ref': 'Supprimer des références de stock & quincaillerie',
  'stock.photo_edit': 'Modifier la photo de quincaillerie / stock',
  'stock.move': 'Enregistrer un mouvement',
  'stock.correct': 'Corriger le stock',
  'attendance.view': 'Consulter les présences',
  'attendance.correct': 'Corriger une présence',
  'leaves.view': 'Consulter les congés & permissions',
  'leaves.manage': 'Approuver / gérer les congés',
  'employees.view': 'Consulter les fiches travailleurs',
  'employees.create': 'Créer un travailleur',
  'employees.edit': 'Modifier un travailleur',
  'employees.photo_edit': 'Modifier la photo de profil des travailleurs',
  'employees.print_badge': 'Imprimer les badges',
  'financial.view': 'Consulter la valorisation financière & coûts d’acquisition',
  'reports.view': 'Consulter les synthèses & rapports d’audit',
  'reports.export': 'Tirer et exporter les rapports (Excel, PDF, Audit patrimonial)',
  'dashboard.view': 'Voir le tableau de bord',
  'settings.view': 'Voir les paramètres',
  'settings.edit': 'Modifier les paramètres',
  'users.view': 'Consulter les comptes',
  'users.manage': 'Gérer les comptes',
  'profile.photo_edit_self': 'Modifier sa propre photo de profil',
  'terminals.manage': 'Gérer les terminaux',
  'permissions.manage': 'Gérer les permissions',
  'scanner.use': 'Utiliser le scanner QR & codes-barres (App)',
};

export const PERMISSION_KINDS: Record<PermissionAction, 'view' | 'action'> = {
  'tools.view': 'view',
  'tools.create': 'action',
  'tools.edit': 'action',
  'tools.delete': 'action',
  'tools.edit_status': 'action',
  'tools.photo_edit': 'action',
  'loans.view': 'view',
  'loans.create': 'action',
  'loans.return': 'action',
  'magasins.view': 'view',
  'magasins.manage': 'action',
  'stock.view': 'view',
  'stock.create_ref': 'action',
  'stock.edit_ref': 'action',
  'stock.delete_ref': 'action',
  'stock.photo_edit': 'action',
  'stock.move': 'action',
  'stock.correct': 'action',
  'attendance.view': 'view',
  'attendance.correct': 'action',
  'leaves.view': 'view',
  'leaves.manage': 'action',
  'employees.view': 'view',
  'employees.create': 'action',
  'employees.edit': 'action',
  'employees.photo_edit': 'action',
  'employees.print_badge': 'action',
  'financial.view': 'view',
  'reports.view': 'view',
  'reports.export': 'action',
  'dashboard.view': 'view',
  'settings.view': 'view',
  'settings.edit': 'action',
  'users.view': 'view',
  'users.manage': 'action',
  'profile.photo_edit_self': 'action',
  'terminals.manage': 'action',
  'permissions.manage': 'action',
  'scanner.use': 'action',
};

export const PERMISSION_GROUPS: { label: string; actions: PermissionAction[] }[] = [
  {
    label: 'Outils & prêts',
    actions: ['tools.view', 'tools.create', 'tools.edit', 'tools.delete', 'tools.edit_status', 'tools.photo_edit', 'loans.view', 'loans.create', 'loans.return', 'scanner.use'],
  },
  {
    label: 'Magasins',
    actions: ['magasins.view', 'magasins.manage'],
  },
  {
    label: 'Stock & quincaillerie',
    actions: ['stock.view', 'stock.create_ref', 'stock.edit_ref', 'stock.delete_ref', 'stock.photo_edit', 'stock.move', 'stock.correct'],
  },
  {
    label: 'Présences & congés',
    actions: ['attendance.view', 'attendance.correct', 'leaves.view', 'leaves.manage'],
  },
  {
    label: 'Travailleurs',
    actions: ['employees.view', 'employees.create', 'employees.edit', 'employees.photo_edit', 'employees.print_badge'],
  },
  {
    label: 'Finances & Rapports d’audit',
    actions: ['financial.view', 'reports.view', 'reports.export'],
  },
  {
    label: 'Pilotage',
    actions: ['dashboard.view', 'settings.view', 'settings.edit'],
  },
  {
    label: 'Administration & profil',
    actions: ['users.view', 'users.manage', 'profile.photo_edit_self', 'terminals.manage', 'permissions.manage'],
  },
];

export const DEFAULT_PERMISSIONS: Record<PermissionAction, Role[]> = {
  'tools.view': ['direction', 'magasinier', 'chef_atelier'],
  'tools.create': ['magasinier'],
  'tools.edit': ['magasinier'],
  'tools.delete': ['direction', 'magasinier'],
  'tools.edit_status': ['magasinier'],
  'tools.photo_edit': ['direction', 'magasinier'],
  'loans.view': ['direction', 'magasinier', 'chef_atelier'],
  'loans.create': ['magasinier'],
  'loans.return': ['magasinier'],
  'magasins.view': ['direction', 'magasinier', 'chef_atelier'],
  'magasins.manage': ['magasinier'],
  'stock.view': ['direction', 'magasinier', 'chef_atelier'],
  'stock.create_ref': ['magasinier'],
  'stock.edit_ref': ['magasinier'],
  'stock.delete_ref': ['direction', 'magasinier'],
  'stock.photo_edit': ['direction', 'magasinier'],
  'stock.move': ['direction', 'magasinier', 'chef_atelier'],
  'stock.correct': ['magasinier'],
  'attendance.view': ['direction', 'magasinier', 'chef_atelier'],
  'attendance.correct': ['direction'],
  'leaves.view': ['direction', 'magasinier', 'chef_atelier'],
  'leaves.manage': ['direction', 'magasinier'],
  'employees.view': ['direction', 'magasinier', 'chef_atelier'],
  'employees.create': ['magasinier'],
  'employees.edit': ['magasinier'],
  'employees.photo_edit': ['direction', 'chef_atelier'],
  'employees.print_badge': ['magasinier'],
  'financial.view': ['direction'],
  'reports.view': ['direction', 'chef_atelier'],
  'reports.export': ['direction'],
  'dashboard.view': ['direction', 'magasinier', 'chef_atelier'],
  'settings.view': ['direction', 'magasinier'],
  'settings.edit': ['direction'],
  'users.view': ['direction'],
  'users.manage': ['direction'],
  'profile.photo_edit_self': ['direction', 'magasinier', 'chef_atelier', 'travailleur'],
  'terminals.manage': ['direction'],
  'permissions.manage': ['direction'],
  'scanner.use': ['direction'],
};

export function emptyPermissionMap(): Record<PermissionAction, boolean> {
  const map = {} as Record<PermissionAction, boolean>;
  for (const action of PERMISSION_ACTIONS) map[action] = false;
  return map;
}

export function defaultPermissionMap(): Record<PermissionAction, boolean> {
  const map = emptyPermissionMap();
  for (const action of PERMISSION_ACTIONS) {
    map[action] = DEFAULT_PERMISSIONS[action].length > 0;
  }
  return map;
}

export const DEFAULT_MATRIX_ROLES: Role[] = ['direction', 'magasinier', 'chef_atelier', 'travailleur'];

export function buildMatrix(
  overrides: { role: string; action: string; allowed: boolean }[],
  roles: string[] = DEFAULT_MATRIX_ROLES,
): Record<PermissionAction, Record<string, boolean>> {
  const matrix = {} as Record<PermissionAction, Record<string, boolean>>;
  for (const action of PERMISSION_ACTIONS) {
    const row = {} as Record<string, boolean>;
    for (const role of roles) {
      const allowed = DEFAULT_PERMISSIONS[action]?.includes(role) ?? false;
      const override = overrides.find((o) => o.action === action && o.role === role);
      row[role] = override ? override.allowed : allowed;
    }
    matrix[action] = row;
  }
  return matrix;
}

export const ROLE_ARCHETYPES: Record<
  string,
  { label: string; description: string; actions: PermissionAction[] }
> = {
  menuisier: {
    label: 'Menuisier Atelier',
    description: 'Consultation du catalogue d’outillage, badge QR et espace personnel (Lecture seule).',
    actions: ['profile.photo_edit_self', 'tools.view', 'loans.view'],
  },
  ouvrier: {
    label: 'Menuisier Atelier',
    description: 'Consultation du catalogue d’outillage, badge QR et espace personnel (Lecture seule).',
    actions: ['profile.photo_edit_self', 'tools.view', 'loans.view'],
  },
  magasinier: {
    label: 'Magasinier & Quincaillerie',
    description: 'Gestion intégrale de l’outillage, dépôts, consommables, quincaillerie et mouvements.',
    actions: [
      'profile.photo_edit_self',
      'tools.view',
      'tools.create',
      'tools.edit',
      'tools.edit_status',
      'tools.photo_edit',
      'loans.view',
      'loans.create',
      'loans.return',
      'stock.view',
      'stock.create_ref',
      'stock.edit_ref',
      'stock.photo_edit',
      'stock.move',
      'stock.correct',
      'magasins.view',
      'magasins.manage',
      'employees.view',
      'employees.print_badge',
      'dashboard.view',
    ],
  },
  chef_equipe: {
    label: 'Chef d’équipe / Superviseur',
    description: 'Supervision des travailleurs, pointages de présence, congés, prêts et mouvements d’atelier.',
    actions: [
      'profile.photo_edit_self',
      'dashboard.view',
      'attendance.view',
      'attendance.correct',
      'leaves.view',
      'leaves.manage',
      'employees.view',
      'employees.create',
      'employees.edit',
      'employees.photo_edit',
      'employees.print_badge',
      'tools.view',
      'loans.view',
      'loans.create',
      'loans.return',
      'stock.view',
      'stock.move',
      'reports.view',
    ],
  },
  superviseur: {
    label: 'Chef d’équipe / Superviseur',
    description: 'Supervision des travailleurs, pointages de présence, congés, prêts et mouvements d’atelier.',
    actions: [
      'profile.photo_edit_self',
      'dashboard.view',
      'attendance.view',
      'attendance.correct',
      'leaves.view',
      'leaves.manage',
      'employees.view',
      'employees.create',
      'employees.edit',
      'employees.photo_edit',
      'employees.print_badge',
      'tools.view',
      'loans.view',
      'loans.create',
      'loans.return',
      'stock.view',
      'stock.move',
      'reports.view',
    ],
  },
  auditeur: {
    label: 'Auditeur / Contrôleur (Lecture seule)',
    description: 'Consultation complète de l’outillage, stocks, dépôts, présences, VNC et KPI d’audit (sans modification ni tirage de rapports).',
    actions: [
      'profile.photo_edit_self',
      'dashboard.view',
      'tools.view',
      'loans.view',
      'stock.view',
      'magasins.view',
      'attendance.view',
      'leaves.view',
      'employees.view',
      'settings.view',
      'financial.view',
      'reports.view',
    ],
  },
  maintenance: {
    label: 'Maintenance & Affûtage',
    description: 'Entretien des machines, réparation, diagnostic et mise à jour de l’état de l’outillage.',
    actions: [
      'profile.photo_edit_self',
      'tools.view',
      'tools.edit',
      'tools.edit_status',
      'tools.photo_edit',
      'loans.view',
      'loans.return',
      'stock.view',
      'stock.move',
    ],
  },
  responsable_stock: {
    label: 'Gestionnaire des Stocks & Quincaillerie',
    description: 'Suivi exclusif des matières premières, consommables, quincaillerie et mouvements.',
    actions: [
      'profile.photo_edit_self',
      'stock.view',
      'stock.create_ref',
      'stock.edit_ref',
      'stock.delete_ref',
      'stock.photo_edit',
      'stock.move',
      'stock.correct',
      'magasins.view',
      'dashboard.view',
    ],
  },
};

export function isSuperAdmin(role: Role): boolean {
  return role === 'direction';
}
