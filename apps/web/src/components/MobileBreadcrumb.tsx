import { type ReactNode } from 'react';
import { ChevronRight, Home } from 'lucide-react';
import { NAV, type ViewId } from './Shell';
import { cx } from './ui';

export interface MobileBreadcrumbProps {
  currentView: ViewId;
  subSection?: string | null;
  onNavigateHome?: () => void;
  onNavigateView?: (view: ViewId) => void;
  rightAction?: ReactNode;
  className?: string;
}

export function MobileBreadcrumb({
  currentView,
  subSection,
  onNavigateHome,
  onNavigateView,
  rightAction,
  className,
}: MobileBreadcrumbProps) {
  const activeNav = NAV.find((n) => n.id === currentView);
  const IconComponent = activeNav?.icon ?? Home;
  const viewLabel = activeNav?.label ?? currentView;

  // Déduplication intelligente du fil d'Ariane
  const isDuplicateSubSection =
    !subSection ||
    subSection.trim().toLowerCase() === viewLabel.trim().toLowerCase() ||
    subSection.trim().toLowerCase() === (activeNav?.short ?? '').trim().toLowerCase();

  const cleanSubSection = isDuplicateSubSection ? null : subSection.trim();

  return (
    <nav
      aria-label="Fil d'Ariane mobile"
      className={cx(
        'no-print lg:hidden sticky top-14 z-15 flex min-h-10 h-10 w-full items-center justify-between gap-2 border-b border-line bg-paper/98 px-3 sm:px-4 backdrop-blur-md shadow-2xs transition-all',
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
        {/* Racine CFTM */}
        <button
          type="button"
          onClick={onNavigateHome}
          className="flex shrink-0 min-h-8 items-center gap-1.5 text-xs font-bold text-ink hover:text-amber transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber rounded-md px-1"
          title="Retour au Tableau de bord"
        >
          <span className="tracking-tight">CFTM</span>
        </button>

        <ChevronRight size={13} className="shrink-0 text-ink-faint/60" />

        {/* Module Actif */}
        <button
          type="button"
          onClick={() => onNavigateView?.(currentView)}
          className={cx(
            'flex shrink-0 min-h-8 items-center gap-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber rounded-md px-1',
            cleanSubSection ? 'text-ink-soft hover:text-ink' : 'text-amber',
          )}
          title={`Module ${viewLabel}`}
        >
          <IconComponent size={14} className={cleanSubSection ? 'text-ink-soft' : 'text-amber shrink-0'} />
          <span className="truncate max-w-[150px] sm:max-w-none">{viewLabel}</span>
        </button>

        {/* Sous-section / Onglet Actif (affiché seulement si différent du module) */}
        {cleanSubSection && (
          <>
            <ChevronRight size={13} className="shrink-0 text-ink-faint/60" />
            <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-amber truncate max-w-[160px] sm:max-w-[240px]">
              {cleanSubSection}
            </span>
          </>
        )}
      </div>

      {rightAction && (
        <div className="flex shrink-0 items-center gap-1.5 pl-1">
          {rightAction}
        </div>
      )}
    </nav>
  );
}
