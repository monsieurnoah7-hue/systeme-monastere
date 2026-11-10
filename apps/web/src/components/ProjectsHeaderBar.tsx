import { useState } from 'react';
import {
  Search,
  X,
  Plus,
  LayoutGrid,
  List,
  SlidersHorizontal,
  Wrench,
  Calendar,
  AlertTriangle,
  ChevronDown,
} from 'lucide-react';
import { Button, cx } from './ui';

export interface ProjectsHeaderBarProps {
  activeTab: 'production' | 'planning';
  onTabChange: (tab: 'production' | 'planning') => void;
  viewMode: 'list' | 'grid';
  onViewModeChange: (mode: 'list' | 'grid') => void;
  search: string;
  onSearchChange: (query: string) => void;
  filterCat: string;
  onFilterCatChange: (category: string) => void;
  filterDelayedOnly: boolean;
  onFilterDelayedOnlyChange: (delayedOnly: boolean) => void;
  categories: string[];
  canCreate: boolean;
  onCreate: () => void;
  totalCount: number;
  delayedCount: number;
}

export function ProjectsHeaderBar({
  activeTab,
  onTabChange,
  viewMode,
  onViewModeChange,
  search,
  onSearchChange,
  filterCat,
  onFilterCatChange,
  filterDelayedOnly,
  onFilterDelayedOnlyChange,
  categories,
  canCreate,
  onCreate,
  totalCount,
  delayedCount,
}: ProjectsHeaderBarProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);

  const hasActiveFilters = filterCat !== 'all' || filterDelayedOnly;

  return (
    <div className="sticky top-0 lg:top-11 z-10 -mx-3 sm:-mx-6 lg:mx-0 bg-paper border-b border-line px-3 sm:px-6 lg:px-0 py-2 sm:py-2.5 transition-all shadow-xs">
      {/* Ligne 1 : Navigation Onglets Principaux + Bouton Création CTA */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1 p-1 bg-surface-2 rounded-xl border border-line">
          <button
            type="button"
            onClick={() => onTabChange('production')}
            className={cx(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer',
              activeTab === 'production'
                ? 'bg-ink text-paper shadow-xs font-bold'
                : 'text-ink-soft hover:text-ink hover:bg-surface-3/50'
            )}
          >
            <Wrench size={14} className={cx(activeTab === 'production' ? 'text-amber' : 'text-ink-faint')} />
            <span>Commandes &amp; Chantiers</span>
            <span className={cx(
              'ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono tabular-nums',
              activeTab === 'production' ? 'bg-paper text-ink font-bold' : 'bg-surface text-ink-faint'
            )}>
              {totalCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onTabChange('planning')}
            className={cx(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer',
              activeTab === 'planning'
                ? 'bg-ink text-paper shadow-xs font-bold'
                : 'text-ink-soft hover:text-ink hover:bg-surface-3/50'
            )}
          >
            <Calendar size={14} className={cx(activeTab === 'planning' ? 'text-blue' : 'text-ink-faint')} />
            <span>Charge &amp; Planning</span>
          </button>
        </div>

        {canCreate && (
          <Button
            size="sm"
            variant="primary"
            icon={<Plus size={14} />}
            onClick={onCreate}
            className="h-9 px-3 text-xs font-bold shadow-xs whitespace-nowrap !bg-amber !text-white hover:!bg-amber-2"
          >
            <span className="hidden sm:inline">Nouveau projet</span>
            <span className="sm:hidden">Créer</span>
          </Button>
        )}
      </div>

      {/* Ligne 2 : Barre d'action unifiée (Recherche + Filtre Tiroir + Sélecteur Mode Dual) */}
      <div className="flex items-center gap-2">
        {/* Champ de recherche compact avec auto-clear */}
        <div className="relative flex-1 min-w-0">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Rechercher code, client, lieu..."
            className="h-9 w-full rounded-xl border border-line bg-surface-2 pl-9 pr-8 text-xs text-ink placeholder:text-ink-faint focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber shadow-2xs transition-colors"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-ink-faint hover:text-ink rounded-md transition-colors"
              title="Effacer la recherche"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Bouton de bascule Tiroir Filtres */}
        <button
          type="button"
          onClick={() => setFiltersOpen((prev) => !prev)}
          className={cx(
            'inline-flex items-center gap-1.5 h-9 px-2.5 sm:px-3 rounded-xl border text-xs font-medium transition-all cursor-pointer shadow-2xs shrink-0',
            hasActiveFilters
              ? 'border-amber/50 bg-amber-wash text-amber font-semibold'
              : 'border-line bg-surface-2 text-ink-soft hover:text-ink hover:border-line-strong'
          )}
          title="Afficher les options de filtrage"
        >
          <SlidersHorizontal size={13} />
          <span className="hidden sm:inline">Filtres</span>
          {hasActiveFilters && (
            <span className="h-1.5 w-1.5 rounded-full bg-amber animate-pulse" />
          )}
          <ChevronDown size={12} className={cx('transition-transform duration-200', filtersOpen && 'rotate-180')} />
        </button>

        {/* Sélecteur de vue tactile Dual-Mode : Liste vs Fiches Bento */}
        {activeTab === 'production' && (
          <div className="inline-flex items-center p-0.5 rounded-xl border border-line bg-surface-2 shrink-0 shadow-2xs">
            <button
              type="button"
              onClick={() => onViewModeChange('list')}
              className={cx(
                'inline-flex items-center justify-center h-8 w-8 rounded-lg transition-all cursor-pointer',
                viewMode === 'list'
                  ? 'bg-ink text-paper shadow-xs font-bold'
                  : 'text-ink-soft hover:text-ink hover:bg-surface-3/50'
              )}
              title="Vue Liste Synthétique Tactile"
              aria-label="Vue Liste"
            >
              <List size={15} />
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('grid')}
              className={cx(
                'inline-flex items-center justify-center h-8 w-8 rounded-lg transition-all cursor-pointer',
                viewMode === 'grid'
                  ? 'bg-ink text-paper shadow-xs font-bold'
                  : 'text-ink-soft hover:text-ink hover:bg-surface-3/50'
              )}
              title="Vue Fiches Bento Élevées"
              aria-label="Vue Fiches Bento"
            >
              <LayoutGrid size={15} />
            </button>
          </div>
        )}
      </div>

      {/* Ligne 3 (Déroulante) : Tiroir de filtres rapides */}
      {filtersOpen && (
        <div className="mt-2 pt-2 border-t border-line/60 flex flex-wrap items-center gap-2 text-xs animate-in fade-in slide-in-from-top-1 duration-150">
          <label className="flex items-center gap-1.5 text-ink-soft text-[11px] font-medium">
            <span>Catégorie :</span>
            <select
              value={filterCat}
              onChange={(e) => onFilterCatChange(e.target.value)}
              className="h-8 rounded-lg border border-line bg-surface px-2.5 text-xs text-ink focus:border-amber focus:outline-none shadow-2xs"
            >
              <option value="all">Toutes les catégories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => onFilterDelayedOnlyChange(!filterDelayedOnly)}
            className={cx(
              'inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-xs font-medium transition-all cursor-pointer shadow-2xs',
              filterDelayedOnly
                ? 'border-red/50 bg-red-wash text-red font-semibold'
                : 'border-line bg-surface text-ink-soft hover:text-ink'
            )}
          >
            <AlertTriangle size={12} className={cx(filterDelayedOnly ? 'text-red' : 'text-ink-faint')} />
            <span>En retard uniquement {delayedCount > 0 && `(${delayedCount})`}</span>
          </button>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                onFilterCatChange('all');
                onFilterDelayedOnlyChange(false);
              }}
              className="text-[11px] text-amber hover:underline font-semibold ml-auto"
            >
              Réinitialiser les filtres
            </button>
          )}
        </div>
      )}
    </div>
  );
}
