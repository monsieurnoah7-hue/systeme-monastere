import type { ComponentType } from 'react';
import {
  Briefcase,
  GraduationCap,
  FolderKanban,
  FileText,
  Calculator,
  ShieldCheck,
  ClipboardCheck,
  Hammer,
  Wrench,
  Boxes,
  PackageCheck,
  Package,
  Paintbrush,
  Disc,
  Trees,
  Layers,
  Archive,
  Monitor,
  Users,
  BookOpen,
  Building2,
  Store,
  UtensilsCrossed,
  BedDouble,
  Home,
  AlertTriangle,
  Coins,
  Warehouse,
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
  { id: 'salle', label: 'Salles & Pédagogie', shortLabel: 'Salles' },
  { id: 'economat', label: 'Économat & Réserves', shortLabel: 'Économat' },
  { id: 'hebergement', label: 'Vie & Hébergement', shortLabel: 'Hébergement' },
  { id: 'maintenance', label: 'SAV & Défectueux', shortLabel: 'Maintenance' },
];

export interface VisualTheme {
  category: LocationCategory;
  categoryLabel: string;
  Icon: ComponentType<{ size?: number; className?: string }>;
  gradient: string;
  shadow: string;
  softBg: string;
  text: string;
  border: string;
  borderHover: string;
  ring: string;
}

const THEMES: Record<
  LocationCategory,
  Omit<VisualTheme, 'category' | 'categoryLabel' | 'Icon'>
> = {
  all: {
    gradient: 'from-amber-500 to-amber-600',
    shadow: 'shadow-amber-500/25',
    softBg: 'bg-amber-500/10',
    text: 'text-amber-500 dark:text-amber-400',
    border: 'border-amber-500/25',
    borderHover: 'hover:border-amber-500/50',
    ring: 'focus-visible:ring-amber-500',
  },
  bureau: {
    // Apple iOS System Blue
    gradient: 'from-blue-500 to-indigo-600',
    shadow: 'shadow-blue-500/25',
    softBg: 'bg-blue-500/10',
    text: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-500/25',
    borderHover: 'hover:border-blue-500/50',
    ring: 'focus-visible:ring-blue-500',
  },
  atelier: {
    // Apple iOS System Orange / Craft
    gradient: 'from-amber-500 to-orange-600',
    shadow: 'shadow-orange-500/25',
    softBg: 'bg-orange-500/10',
    text: 'text-orange-600 dark:text-orange-400',
    border: 'border-orange-500/25',
    borderHover: 'hover:border-orange-500/50',
    ring: 'focus-visible:ring-orange-500',
  },
  magasin: {
    // Apple iOS System Purple / Inventory
    gradient: 'from-violet-500 to-purple-600',
    shadow: 'shadow-purple-500/25',
    softBg: 'bg-purple-500/10',
    text: 'text-purple-600 dark:text-purple-400',
    border: 'border-purple-500/25',
    borderHover: 'hover:border-purple-500/50',
    ring: 'focus-visible:ring-purple-500',
  },
  matiere: {
    // Apple iOS System Green / Natural Wood & Panels
    gradient: 'from-emerald-500 to-teal-600',
    shadow: 'shadow-emerald-500/25',
    softBg: 'bg-emerald-500/10',
    text: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-500/25',
    borderHover: 'hover:border-emerald-500/50',
    ring: 'focus-visible:ring-emerald-500',
  },
  salle: {
    // Apple iOS System Cyan / Education & Knowledge
    gradient: 'from-cyan-500 to-blue-500',
    shadow: 'shadow-cyan-500/25',
    softBg: 'bg-cyan-500/10',
    text: 'text-cyan-600 dark:text-cyan-400',
    border: 'border-cyan-500/25',
    borderHover: 'hover:border-cyan-500/50',
    ring: 'focus-visible:ring-cyan-500',
  },
  economat: {
    // Apple iOS System Yellow / Gold Provisions & Treasury
    gradient: 'from-amber-400 to-yellow-600',
    shadow: 'shadow-yellow-500/25',
    softBg: 'bg-yellow-500/10',
    text: 'text-yellow-600 dark:text-yellow-400',
    border: 'border-yellow-500/25',
    borderHover: 'hover:border-yellow-500/50',
    ring: 'focus-visible:ring-yellow-500',
  },
  hebergement: {
    // Apple iOS System Rose / Coral Living & Dining
    gradient: 'from-rose-500 to-pink-600',
    shadow: 'shadow-rose-500/25',
    softBg: 'bg-rose-500/10',
    text: 'text-rose-600 dark:text-rose-400',
    border: 'border-rose-500/25',
    borderHover: 'hover:border-rose-500/50',
    ring: 'focus-visible:ring-rose-500',
  },
  maintenance: {
    // Apple iOS System Red / Defective & Urgent repair
    gradient: 'from-red-500 to-rose-600',
    shadow: 'shadow-red-500/25',
    softBg: 'bg-red-500/10',
    text: 'text-red-600 dark:text-red-400',
    border: 'border-red-500/25',
    borderHover: 'hover:border-red-500/50',
    ring: 'focus-visible:ring-red-500',
  },
};

export function getLocationVisuals(m: { code?: string | null; name: string }): VisualTheme {
  const code = (m.code ?? '').toUpperCase();
  const name = m.name.toLowerCase();

  // 1. Catégorie & Icône spécifique par code ou libellé
  if (code === 'BUR-DG') {
    return { category: 'bureau', categoryLabel: 'Direction Générale', Icon: Briefcase, ...THEMES.bureau };
  }
  if (code === 'BUR-DF') {
    return { category: 'bureau', categoryLabel: 'Direction Formation', Icon: GraduationCap, ...THEMES.bureau };
  }
  if (code === 'BUR-DPC') {
    return { category: 'bureau', categoryLabel: 'Direction Projets', Icon: FolderKanban, ...THEMES.bureau };
  }
  if (code === 'BUR-ECO' || name.includes('économat') || name.includes('economat')) {
    return { category: 'economat', categoryLabel: 'Économat', Icon: Coins, ...THEMES.economat };
  }
  if (code === 'BUR-SEC' || name.includes('secrétariat') || name.includes('secretariat')) {
    return { category: 'bureau', categoryLabel: 'Secrétariat', Icon: FileText, ...THEMES.bureau };
  }
  if (code === 'BUR-CPT' || name.includes('compta')) {
    return { category: 'bureau', categoryLabel: 'Comptabilité', Icon: Calculator, ...THEMES.bureau };
  }
  if (code === 'BUR-SG' || name.includes('surveillant')) {
    return { category: 'bureau', categoryLabel: 'Surveillance Générale', Icon: ShieldCheck, ...THEMES.bureau };
  }
  if (code === 'BUR-CT' || name.includes('contrôleur') || name.includes('controleur')) {
    return { category: 'bureau', categoryLabel: 'Contrôle des Travaux', Icon: ClipboardCheck, ...THEMES.bureau };
  }
  if (code.startsWith('BUR-') || name.startsWith('bureau')) {
    return { category: 'bureau', categoryLabel: 'Bureau Administratif', Icon: Briefcase, ...THEMES.bureau };
  }

  // 2. Ateliers & Finitions
  if (code === 'ATE-PROD' || name.includes('atelier de production')) {
    return { category: 'atelier', categoryLabel: 'Atelier de Production', Icon: Hammer, ...THEMES.atelier };
  }
  if (code === 'ATE-FORM' || name.includes('atelier de formation')) {
    return { category: 'atelier', categoryLabel: 'Atelier Pédagogique', Icon: Wrench, ...THEMES.atelier };
  }
  if (code === 'MAG-VERN' || name.includes('vernissage')) {
    return { category: 'atelier', categoryLabel: 'Cabine de Vernissage', Icon: Paintbrush, ...THEMES.atelier };
  }
  if (code === 'SAL-AFF' || name.includes('affûtage') || name.includes('affutage')) {
    return { category: 'atelier', categoryLabel: 'Salle d’Affûtage', Icon: Disc, ...THEMES.atelier };
  }
  if (code.startsWith('ATE-') || name.includes('atelier')) {
    return { category: 'atelier', categoryLabel: 'Atelier Technique', Icon: Hammer, ...THEMES.atelier };
  }

  // 3. Parc à Bois & Matières premières
  if (code === 'MAG-BOIS' || name.includes('parc à bois') || name.includes('parc a bois')) {
    return { category: 'matiere', categoryLabel: 'Parc à Bois', Icon: Trees, ...THEMES.matiere };
  }
  if (code === 'MAG-PAN' || name.includes('panneaux')) {
    return { category: 'matiere', categoryLabel: 'Dépôt Panneaux', Icon: Layers, ...THEMES.matiere };
  }
  if (code === 'MAG-MOUS' || name.includes('mousses')) {
    return { category: 'matiere', categoryLabel: 'Dépôt Mousses', Icon: Boxes, ...THEMES.matiere };
  }

  // 4. Maintenance / Défectueux
  if (code === 'MAG-DEF' || name.includes('défectueuses') || name.includes('defectueuse') || name.includes('panne')) {
    return { category: 'maintenance', categoryLabel: 'Machines Défectueuses', Icon: AlertTriangle, ...THEMES.maintenance };
  }

  // 5. Magasins & Outillage
  if (code === 'MAG-GRD' || name.includes('grand magasin')) {
    return { category: 'magasin', categoryLabel: 'Grand Magasin', Icon: Boxes, ...THEMES.magasin };
  }
  if (code === 'MAG-LEO' || name.includes('léo') || name.includes('leo')) {
    return { category: 'magasin', categoryLabel: 'Magasin Léo (Quincaillerie)', Icon: PackageCheck, ...THEMES.magasin };
  }
  if (code === 'MAG-TM' || name.includes('outils manuels')) {
    return { category: 'magasin', categoryLabel: 'Outillage Manuel TM', Icon: Package, ...THEMES.magasin };
  }
  if (code === 'MAG-GREN' || name.includes('grenier')) {
    return { category: 'economat', categoryLabel: 'Grenier Monastère', Icon: Archive, ...THEMES.economat };
  }
  if (code.startsWith('MAG-')) {
    return { category: 'magasin', categoryLabel: 'Magasin & Dépôt', Icon: Boxes, ...THEMES.magasin };
  }

  // 6. Salles & Enseignement
  if (code === 'SAL-DAO' || name.includes('multimédia') || name.includes('dao')) {
    return { category: 'salle', categoryLabel: 'Formation DAO', Icon: Monitor, ...THEMES.salle };
  }
  if (code === 'SAL-PROF' || name.includes('profs') || name.includes('professeurs')) {
    return { category: 'salle', categoryLabel: 'Salle des Enseignants', Icon: Users, ...THEMES.salle };
  }
  if (code === 'SAL-BIB' || name.includes('bibliothèque') || name.includes('bibliotheque')) {
    return { category: 'salle', categoryLabel: 'Bibliothèque & Archives', Icon: BookOpen, ...THEMES.salle };
  }
  if (code === 'SAL-CLAS' || name.includes('classes') || name.includes('classe')) {
    return { category: 'salle', categoryLabel: 'Salles de Cours', Icon: GraduationCap, ...THEMES.salle };
  }
  if (code === 'SAL-POLY' || name.includes('polyvalente')) {
    return { category: 'salle', categoryLabel: 'Salle Polyvalente', Icon: Building2, ...THEMES.salle };
  }
  if (code === 'SAL-EXPO' || name.includes('exposition') || name.includes('showroom')) {
    return { category: 'salle', categoryLabel: 'Showroom d’Exposition', Icon: Store, ...THEMES.salle };
  }
  if (code.startsWith('SAL-') || name.includes('salle')) {
    return { category: 'salle', categoryLabel: 'Salle Didactique', Icon: Building2, ...THEMES.salle };
  }

  // 7. Vie Collective & Hébergement
  if (code === 'MAG-CANT' || name.includes('cantine') || name.includes('restaurant')) {
    return { category: 'hebergement', categoryLabel: 'Cantine & Restauration', Icon: UtensilsCrossed, ...THEMES.hebergement };
  }
  if (code === 'DIV-INT' || name.includes('internat') || name.includes('dortoir')) {
    return { category: 'hebergement', categoryLabel: 'Internat & Dortoirs', Icon: BedDouble, ...THEMES.hebergement };
  }
  if (code === 'APP-SUIS' || name.includes('appartement') || name.includes('suisses') || name.includes('logement')) {
    return { category: 'hebergement', categoryLabel: 'Résidence Stagiaires', Icon: Home, ...THEMES.hebergement };
  }

  return { category: 'magasin', categoryLabel: 'Emplacement', Icon: Warehouse, ...THEMES.magasin };
}
