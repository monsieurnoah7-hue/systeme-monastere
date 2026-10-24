import type { Role } from '../types.js';

export const PERMISSION_ACTIONS = [
  'tools.view',
  'tools.create',
  'tools.edit',
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
  'dashboard.view',
  'settings.view',
  'settings.edit',
  'users.view',
  'users.manage',
  'profile.photo_edit_self',
  'terminals.manage',
  'permissions.manage',
] as const;

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export const PERMISSION_LABELS: Record<PermissionAction, string> = {
  'tools.view': 'Consulter les outils',
  'tools.create': 'Créer des outils',
  'tools.edit': 'Modifier un outil (fiche, magasin)',
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
  'dashboard.view': 'Voir le tableau de bord',
  'settings.view': 'Voir les paramètres',
  'settings.edit': 'Modifier les paramètres',
  'users.view': 'Consulter les comptes',
  'users.manage': 'Gérer les comptes',
  'profile.photo_edit_self': 'Modifier sa propre photo de profil',
  'terminals.manage': 'Gérer les terminaux',
  'permissions.manage': 'Gérer les permissions',
};

export const PERMISSION_GROUPS: { label: string; actions: PermissionAction[] }[] = [
  {
    label: 'Outils & prêts',
    actions: ['tools.view', 'tools.create', 'tools.edit', 'tools.edit_status', 'tools.photo_edit', 'loans.view', 'loans.create', 'loans.return'],
  },
  {
    label: 'Magasins',
    actions: ['magasins.view', 'magasins.manage'],
  },
  {
    label: 'Stock & quincaillerie',
    actions: ['stock.view', 'stock.create_ref', 'stock.edit_ref', 'stock.photo_edit', 'stock.move', 'stock.correct'],
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
  'dashboard.view': ['direction', 'magasinier', 'chef_atelier'],
  'settings.view': ['direction', 'magasinier'],
  'settings.edit': ['direction'],
  'users.view': ['direction'],
  'users.manage': ['direction'],
  'profile.photo_edit_self': ['direction', 'magasinier', 'chef_atelier', 'travailleur'],
  'terminals.manage': ['direction'],
  'permissions.manage': ['direction'],
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

export function isSuperAdmin(role: Role): boolean {
  return role === 'direction';
}
