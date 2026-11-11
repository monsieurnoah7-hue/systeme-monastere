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

  return (
    <nav
      aria-label="Fil d'Ariane mobile"
      className={cx(
        'no-print lg:hidden sticky top-14 z-15 flex h-9 w-full items-center justify-between gap-2 border-b border-line/70 bg-paper/95 px-3 sm:px-4 backdrop-blur-md shadow-2xs transition-all',
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto scroll-none py-0.5">
        {/* Racine CFTM */}
        <button
          type="button"
          onClick={onNavigateHome}
          className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-ink hover:text-amber transition-colors focus-visible:outline-none"
          title="Retour au Tableau de bord"
        >
          <span className="tracking-tight">CFTM</span>
        </button>

        <ChevronRight size={11} className="shrink-0 text-ink-faint/60" />

        {/* Module Actif */}
        <button
          type="button"
          onClick={() => onNavigateView?.(currentView)}
          className={cx(
            'flex shrink-0 items-center gap-1 text-[11px] font-medium transition-colors focus-visible:outline-none',
            subSection ? 'text-ink-soft hover:text-ink' : 'font-bold text-ink',
          )}
          title={`Module ${viewLabel}`}
        >
          <IconComponent size={13} className={subSection ? 'text-ink-soft' : 'text-amber shrink-0'} />
          <span className="truncate max-w-[130px] sm:max-w-none">{viewLabel}</span>
        </button>

        {/* Sous-section / Onglet Actif */}
        {subSection && (
          <>
            <ChevronRight size={11} className="shrink-0 text-ink-faint/60" />
            <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-amber truncate max-w-[140px] sm:max-w-[220px]">
              {subSection}
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
