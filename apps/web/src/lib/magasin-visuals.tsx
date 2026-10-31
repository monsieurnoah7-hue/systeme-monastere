import type { ComponentType } from 'react';
import {
  Briefcase,
  Wrench,
  Package,
  Layers,
  GraduationCap,
  Archive,
  Home,
  AlertTriangle,
  LayoutGrid,
} from 'lucide-react';

export type LocationCategory =
  | 'all'
  | 'bureau'
  | 'atelier'
  | 'magasin'
  | 'matiere'
  | 'salle'
  | 'economat'
  | 'hebergement'
  | 'maintenance';

export interface LocationCategoryMeta {
  id: LocationCategory;
  label: string;
  shortLabel: string;
}

export const LOCATION_CATEGORIES: LocationCategoryMeta[] = [
  { id: 'all', label: 'Tous les emplacements', shortLabel: 'Tous' },
  { id: 'bureau', label: 'Bureaux & Direction', shortLabel: 'Bureaux' },
  { id: 'atelier', label: 'Ateliers & Finition', shortLabel: 'Ateliers' },
  { id: 'magasin', label: 'Magasins & Outillage', shortLabel: 'Magasins' },
  { id: 'matiere', label: 'Parc à Bois & Débits', shortLabel: 'Matières' },
  { id: 'salle', label: 'Salles & Enseignement', shortLabel: 'Salles' },
  { id: 'economat', label: 'Économat & Réserves', shortLabel: 'Économat' },
  { id: 'hebergement', label: 'Vie & Résidence', shortLabel: 'Hébergement' },
  { id: 'maintenance', label: 'SAV & Maintenance', shortLabel: 'Maintenance' },
];

export interface VisualTheme {
  category: LocationCategory;
  categoryLabel: string;
  Icon: ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  iconBg: string;
  iconText: string;
  dotColor: string;
  pillBg: string;
  pillText: string;
  borderHover: string;
  watermarkColor: string;
}

/**
 * Palette Apple Human Interface Guidelines :
 * Couleurs sobres, douces et désaturées. Zéro néon, zéro dégradé agressif,
 * zéro ombre lourde. Affordance épurée et reposante pour les yeux.
 * Une seule icône canonique et minimaliste par type d'emplacement.
 */
const CATEGORY_DEFINITIONS: Record<
  LocationCategory,
  {
    label: string;
    Icon: ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
    iconBg: string;
    iconText: string;
    dotColor: string;
    pillBg: string;
    pillText: string;
    borderHover: string;
  }
> = {
  all: {
    label: 'Tous les emplacements',
    Icon: LayoutGrid,
    iconBg: 'bg-slate-500/[0.08] dark:bg-white/[0.06]',
    iconText: 'text-slate-700 dark:text-slate-200',
    dotColor: 'bg-slate-400',
    pillBg: 'bg-slate-100 dark:bg-white/[0.06]',
    pillText: 'text-slate-600 dark:text-slate-300',
    borderHover: 'hover:border-slate-300 dark:hover:border-white/20',
  },
  bureau: {
    // Apple System Blue (soft pastel)
    label: 'Bureau & Direction',
    Icon: Briefcase,
    iconBg: 'bg-sky-500/[0.08] dark:bg-sky-400/10',
    iconText: 'text-sky-600 dark:text-sky-400',
    dotColor: 'bg-sky-500',
    pillBg: 'bg-sky-500/[0.06] dark:bg-sky-400/10',
    pillText: 'text-sky-700 dark:text-sky-300',
    borderHover: 'hover:border-sky-500/30',
  },
  atelier: {
    // Apple System Amber / Warm Craft
    label: 'Atelier & Finition',
    Icon: Wrench,
    iconBg: 'bg-amber-500/[0.08] dark:bg-amber-400/10',
    iconText: 'text-amber-600 dark:text-amber-400',
    dotColor: 'bg-amber-500',
    pillBg: 'bg-amber-500/[0.06] dark:bg-amber-400/10',
    pillText: 'text-amber-700 dark:text-amber-300',
    borderHover: 'hover:border-amber-500/30',
  },
  magasin: {
    // Apple System Indigo / Inventory
    label: 'Magasin & Outillage',
    Icon: Package,
    iconBg: 'bg-indigo-500/[0.08] dark:bg-indigo-400/10',
    iconText: 'text-indigo-600 dark:text-indigo-400',
    dotColor: 'bg-indigo-500',
    pillBg: 'bg-indigo-500/[0.06] dark:bg-indigo-400/10',
    pillText: 'text-indigo-700 dark:text-indigo-300',
    borderHover: 'hover:border-indigo-500/30',
  },
  matiere: {
    // Apple System Emerald / Raw Wood & Materials
    label: 'Parc & Matières',
    Icon: Layers,
    iconBg: 'bg-emerald-500/[0.08] dark:bg-emerald-400/10',
    iconText: 'text-emerald-600 dark:text-emerald-400',
    dotColor: 'bg-emerald-500',
    pillBg: 'bg-emerald-500/[0.06] dark:bg-emerald-400/10',
    pillText: 'text-emerald-700 dark:text-emerald-300',
    borderHover: 'hover:border-emerald-500/30',
  },
  salle: {
    // Apple System Teal / Learning & Pedagogy
    label: 'Salle & Enseignement',
    Icon: GraduationCap,
    iconBg: 'bg-teal-500/[0.08] dark:bg-teal-400/10',
    iconText: 'text-teal-600 dark:text-teal-400',
    dotColor: 'bg-teal-500',
    pillBg: 'bg-teal-500/[0.06] dark:bg-teal-400/10',
    pillText: 'text-teal-700 dark:text-teal-300',
    borderHover: 'hover:border-teal-500/30',
  },
  economat: {
    // Apple System Warm Ochre / Provisions & Reserves
    label: 'Économat & Réserves',
    Icon: Archive,
    iconBg: 'bg-yellow-600/[0.08] dark:bg-yellow-500/10',
    iconText: 'text-yellow-700 dark:text-yellow-300',
    dotColor: 'bg-yellow-600',
    pillBg: 'bg-yellow-600/[0.06] dark:bg-yellow-500/10',
    pillText: 'text-yellow-800 dark:text-yellow-200',
    borderHover: 'hover:border-yellow-600/30',
  },
  hebergement: {
    // Apple System Rose / Community Living
    label: 'Vie & Résidence',
    Icon: Home,
    iconBg: 'bg-rose-500/[0.08] dark:bg-rose-400/10',
    iconText: 'text-rose-600 dark:text-rose-400',
    dotColor: 'bg-rose-500',
    pillBg: 'bg-rose-500/[0.06] dark:bg-rose-400/10',
    pillText: 'text-rose-700 dark:text-rose-300',
    borderHover: 'hover:border-rose-500/30',
  },
  maintenance: {
    // Apple System Coral Red / Maintenance & SAV
    label: 'SAV & Maintenance',
    Icon: AlertTriangle,
    iconBg: 'bg-rose-500/[0.08] dark:bg-rose-400/10',
    iconText: 'text-rose-600 dark:text-rose-400',
    dotColor: 'bg-rose-500',
    pillBg: 'bg-rose-500/[0.06] dark:bg-rose-400/10',
    pillText: 'text-rose-700 dark:text-rose-300',
    borderHover: 'hover:border-rose-500/30',
  },
};

/**
 * Détermine la catégorie principale d'un emplacement à partir de son code ou nom.
 * Chaque catégorie possède UNE SEULE icône canonique minimaliste et UNE palette sobre.
 */
export function getLocationCategory(m: { code?: string | null; name: string }): LocationCategory {
  const code = (m.code ?? '').toUpperCase();
  const name = m.name.toLowerCase();

  // 1. Économat & Réserves
  if (code === 'BUR-ECO' || code === 'MAG-GREN' || name.includes('économat') || name.includes('economat') || name.includes('grenier')) {
    return 'economat';
  }

  // 2. Bureaux & Administration
  if (
    code.startsWith('BUR-') ||
    name.startsWith('bureau') ||
    name.includes('direction') ||
    name.includes('secrétariat') ||
    name.includes('secretariat') ||
    name.includes('compta') ||
    name.includes('surveillant') ||
    name.includes('contrôleur')
  ) {
    return 'bureau';
  }

  // 3. Maintenance / SAV Défectueux
  if (code === 'MAG-DEF' || name.includes('défectueuses') || name.includes('defectueuse') || name.includes('panne')) {
    return 'maintenance';
  }

  // 4. Ateliers & Finitions
  if (
    code.startsWith('ATE-') ||
    code === 'MAG-VERN' ||
    code === 'SAL-AFF' ||
    name.includes('atelier') ||
    name.includes('vernissage') ||
    name.includes('affûtage') ||
    name.includes('affutage')
  ) {
    return 'atelier';
  }

  // 5. Parc à bois & Matières premières
  if (
    code === 'MAG-BOIS' ||
    code === 'MAG-PAN' ||
    code === 'MAG-MOUS' ||
    name.includes('bois') ||
    name.includes('panneaux') ||
    name.includes('mousses') ||
    name.includes('matière')
  ) {
    return 'matiere';
  }

  // 6. Salles & Pédagogie / Espaces collectifs
  if (
    code.startsWith('SAL-') ||
    name.includes('salle') ||
    name.includes('dao') ||
    name.includes('cours') ||
    name.includes('profs') ||
    name.includes('bibliothèque') ||
    name.includes('polyvalente') ||
    name.includes('exposition') ||
    name.includes('showroom')
  ) {
    return 'salle';
  }

  // 7. Hébergement & Vie
  if (
    code === 'MAG-CANT' ||
    code === 'DIV-INT' ||
    code === 'APP-SUIS' ||
    name.includes('cantine') ||
    name.includes('internat') ||
    name.includes('appartement') ||
    name.includes('suisses') ||
    name.includes('résidence')
  ) {
    return 'hebergement';
  }

  // 8. Magasins & Outillage
  return 'magasin';
}

export function getLocationVisuals(m: { code?: string | null; name: string }): VisualTheme {
  const category = getLocationCategory(m);
  const def = CATEGORY_DEFINITIONS[category];
  return {
    category,
    categoryLabel: def.label,
    Icon: def.Icon,
    iconBg: def.iconBg,
    iconText: def.iconText,
    dotColor: def.dotColor,
    pillBg: def.pillBg,
    pillText: def.pillText,
    borderHover: def.borderHover,
    watermarkColor: def.iconText,
  };
}
