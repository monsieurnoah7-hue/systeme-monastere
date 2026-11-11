import { useRef, useState, useEffect, useCallback, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, SlidersHorizontal } from 'lucide-react';
import { cx } from './ui';

interface StickyTableScrollerProps {
  children: ReactNode;
  className?: string;
  tableClassName?: string;
}

/**
 * Wrapper de tableur avec barre de navigation horizontale permanente ancrée au bas de l'écran.
 * Permet un défilement horizontal fluide et immédiat sur PC (Windows/Mac) et tablette,
 * sans jamais avoir à scroller tout en bas des 400 lignes de données.
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
  const [hasOverflow, setHasOverflow] = useState(true);

  const checkScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const maxScroll = Math.max(0, scrollWidth - clientWidth);
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

    // Rafraîchir après un délai pour laisser le temps aux tables asynchrones de s'afficher
    const t1 = setTimeout(checkScroll, 150);
    const t2 = setTimeout(checkScroll, 600);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
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

  const scrollToStart = () => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ left: 0, behavior: 'smooth' });
    setTimeout(checkScroll, 200);
  };

  const scrollToEnd = () => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
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
        className={cx('overflow-x-auto scroll-smooth focus:outline-none', tableClassName)}
        tabIndex={0}
      >
        {children}
      </div>

      {/* Barre de navigation horizontale permanente collée au bas du viewport */}
      {hasOverflow && (
        <div className="sticky bottom-0 z-30 flex items-center justify-between gap-2.5 border-t-2 border-amber/50 bg-paper/98 px-3.5 py-2.5 text-xs backdrop-blur-md shadow-[0_-6px_20px_rgba(0,0,0,0.45)] rounded-b-xl">
          {/* Boutons Gauche : Début + Pas à Pas */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={scrollToStart}
              disabled={!canScrollLeft}
              className={cx(
                'flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold transition-all active:scale-95',
                canScrollLeft
                  ? 'border-line bg-surface text-ink hover:border-amber/50 hover:bg-paper hover:text-amber shadow-2xs'
                  : 'border-transparent text-ink-faint/30 cursor-not-allowed opacity-40',
              )}
              title="Revenir au début (Références / Codes QR)"
            >
              <ChevronsLeft size={14} />
              <span className="hidden xl:inline">Début</span>
            </button>

            <button
              type="button"
              onClick={() => scrollByAmount(-320)}
              disabled={!canScrollLeft}
              className={cx(
                'flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-bold transition-all active:scale-95',
                canScrollLeft
                  ? 'border-amber/40 bg-amber-wash/30 text-amber hover:bg-amber hover:text-white shadow-2xs'
                  : 'border-transparent text-ink-faint/30 cursor-not-allowed opacity-40',
              )}
              title="Défiler vers la gauche (Colonnes précédentes)"
            >
              <ChevronLeft size={15} />
              <span className="hidden sm:inline">Colonnes gauche</span>
            </button>
          </div>

          {/* Curseur & Jauge de Défilement Synchronisés */}
          <div className="flex flex-1 items-center gap-2.5 max-w-lg mx-auto px-2">
            <span className="hidden lg:flex items-center gap-1 text-[11px] font-semibold text-ink-soft shrink-0">
              <SlidersHorizontal size={12} className="text-amber" />
              <span>Vue :</span>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              value={scrollProgress}
              onChange={handleSliderChange}
              className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-line accent-amber focus:outline-none transition-all"
              title="Faire glisser pour explorer l'ensemble des colonnes du tableur"
            />
            <span className="font-mono text-xs font-bold text-amber shrink-0 tabular-nums min-w-[34px] text-right">
              {Math.round(scrollProgress)}%
            </span>
            <span className="hidden xl:inline text-[10px] text-ink-faint shrink-0">
              (ou Shift + Molette)
            </span>
          </div>

          {/* Boutons Droite : Pas à Pas + Fin (Actions) */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => scrollByAmount(320)}
              disabled={!canScrollRight}
              className={cx(
                'flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-bold transition-all active:scale-95',
                canScrollRight
                  ? 'border-amber/40 bg-amber-wash/30 text-amber hover:bg-amber hover:text-white shadow-2xs'
                  : 'border-transparent text-ink-faint/30 cursor-not-allowed opacity-40',
              )}
              title="Défiler vers la droite (Stocks, Statuts, Actions)"
            >
              <span className="hidden sm:inline">Colonnes droite</span>
              <ChevronRight size={15} />
            </button>

            <button
              type="button"
              onClick={scrollToEnd}
              disabled={!canScrollRight}
              className={cx(
                'flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold transition-all active:scale-95',
                canScrollRight
                  ? 'border-line bg-surface text-ink hover:border-amber/50 hover:bg-paper hover:text-amber shadow-2xs'
                  : 'border-transparent text-ink-faint/30 cursor-not-allowed opacity-40',
              )}
              title="Aller directement aux dernières colonnes (Actions / Détails)"
            >
              <span className="hidden xl:inline">Actions</span>
              <ChevronsRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
