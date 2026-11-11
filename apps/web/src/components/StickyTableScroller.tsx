import { useRef, useState, useEffect, useCallback, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cx } from './ui';

interface StickyTableScrollerProps {
  children: ReactNode;
  className?: string;
  tableClassName?: string;
}

/**
 * Wrapper de tableur avec barre de défilement horizontal permanente fixée au bas de l'écran.
 * Résout le problème des tables à 100+ lignes où la scrollbar native est enfouie tout en bas.
 */
export function StickyTableScroller({
  children,
  className,
  tableClassName,
}: StickyTableScrollerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [hasOverflow, setHasOverflow] = useState(false);

  const checkScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const maxScroll = scrollWidth - clientWidth;
    const overflow = maxScroll > 8;
    setHasOverflow(overflow);
    setCanScrollLeft(scrollLeft > 6);
    setCanScrollRight(scrollLeft < maxScroll - 6);
    setScrollProgress(maxScroll > 0 ? (scrollLeft / maxScroll) * 100 : 0);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    checkScroll();

    const handleResize = () => checkScroll();
    window.addEventListener('resize', handleResize);
    el.addEventListener('scroll', checkScroll, { passive: true });

    const observer = new MutationObserver(() => checkScroll());
    observer.observe(el, { childList: true, subtree: true });

    return () => {
      window.removeEventListener('resize', handleResize);
      el.removeEventListener('scroll', checkScroll);
      observer.disconnect();
    };
  }, [checkScroll]);

  const scrollByAmount = (amount: number) => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollBy({ left: amount, behavior: 'smooth' });
    setTimeout(checkScroll, 200);
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = containerRef.current;
    if (!el) return;
    const percent = Number(e.target.value);
    const maxScroll = el.scrollWidth - el.clientWidth;
    el.scrollLeft = (percent / 100) * maxScroll;
    setScrollProgress(percent);
    checkScroll();
  };

  return (
    <div className={cx('relative flex flex-col', className)}>
      {/* Conteneur défilant du tableau */}
      <div
        ref={containerRef}
        className={cx('overflow-x-auto scroll-smooth', tableClassName)}
      >
        {children}
      </div>

      {/* Barre de navigation horizontale flottante permanente au bas */}
      {hasOverflow && (
        <div className="sticky bottom-0 z-20 flex items-center justify-between gap-3 border-t border-line bg-surface/95 px-3 py-2 text-xs backdrop-blur-md shadow-md rounded-b-xl">
          {/* Bouton Défiler vers la gauche */}
          <button
            type="button"
            onClick={() => scrollByAmount(-280)}
            disabled={!canScrollLeft}
            className={cx(
              'flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-all active:scale-95',
              canScrollLeft
                ? 'border-line bg-paper-2 text-ink hover:border-amber/50 hover:bg-paper hover:text-amber shadow-2xs'
                : 'border-transparent text-ink-faint/40 cursor-not-allowed opacity-50',
            )}
            title="Défiler vers les premières colonnes"
          >
            <ChevronLeft size={14} />
            <span className="hidden sm:inline">Colonnes gauche</span>
          </button>

          {/* Curseur de défilement horizontal synchronisé */}
          <div className="flex flex-1 items-center gap-2 max-w-md mx-auto">
            <span className="hidden md:inline text-[11px] font-semibold text-ink-faint shrink-0">
              Défilement :
            </span>
            <input
              type="range"
              min="0"
              max="100"
              value={scrollProgress}
              onChange={handleSliderChange}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-line accent-amber focus:outline-none"
              title="Faire glisser pour parcourir les colonnes du tableau"
            />
            <span className="font-mono text-[11px] font-bold text-amber shrink-0 tabular-nums">
              {Math.round(scrollProgress)}%
            </span>
          </div>

          {/* Bouton Défiler vers la droite */}
          <button
            type="button"
            onClick={() => scrollByAmount(280)}
            disabled={!canScrollRight}
            className={cx(
              'flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-all active:scale-95',
              canScrollRight
                ? 'border-line bg-paper-2 text-ink hover:border-amber/50 hover:bg-paper hover:text-amber shadow-2xs'
                : 'border-transparent text-ink-faint/40 cursor-not-allowed opacity-50',
            )}
            title="Défiler vers les colonnes d'actions et de statut"
          >
            <span className="hidden sm:inline">Colonnes droite</span>
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
