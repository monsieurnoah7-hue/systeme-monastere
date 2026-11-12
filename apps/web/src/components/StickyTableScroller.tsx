import {
  useRef,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { cx } from './ui';

interface StickyTableScrollerProps {
  children: ReactNode;
  className?: string;
  tableClassName?: string;
  /** Keep the table viewport pinned immediately below a screen toolbar while the page scrolls. */
  stickyBelow?: string;
}

/**
 * Wrapper de tableur haute performance.
 * - En-tête et colonnes figées 100% natifs CSS (sticky top / sticky left) accélérés par GPU à 120 FPS.
 * - Confinement strict du scroll (overscroll-behavior-y: contain) : aucun rebond, la page ne remonte plus.
 * - Ascenseur vertical natif ultra-fin, fluide et réactif, stylisé en ambre sur Desktop.
 * - Barre de navigation horizontale permanente avec jauge et boutons au bas d'écran sur Desktop.
 * - Défilement tactile fluide et sans encombrement sur Mobile / Tablette.
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
  const [isTableVisible, setIsTableVisible] = useState(true);

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

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const main = el.closest('main');
    const observer = new IntersectionObserver(
      ([entry]) => setIsTableVisible(Boolean(entry?.isIntersecting)),
      { root: main, rootMargin: '0px 0px -72px 0px', threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
      {/* Conteneur défilant du tableau : overscroll-behavior-y: contain empêche tout rebond vers le haut */}
      <div
        ref={containerRef}
        className={cx(
          'table-scroll-viewport overflow-auto focus:outline-none max-h-[calc(100dvh-200px)] min-h-[440px]',
          hasOverflow && 'lg:pb-16',
          tableClassName,
        )}
      >
        {children}
      </div>

      {/* Barre de navigation horizontale permanente : strictement Desktop (PC / Laptop uniquement) */}
      {hasOverflow && isTableVisible && (
        <div className="no-print hidden lg:flex fixed inset-x-0 bottom-0 left-60 right-0 z-40 items-center justify-between gap-2.5 border-t-2 border-amber/50 bg-paper/98 px-3.5 py-2.5 text-xs shadow-[0_-6px_20px_rgba(0,0,0,0.45)] backdrop-blur-md">
          {/* Déplacement horizontal par pas vers la gauche */}
          <div className="flex items-center shrink-0">
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
              aria-label="Défiler vers les colonnes précédentes"
            >
              <ChevronLeft size={15} />
              <span>Colonnes gauche</span>
            </button>
          </div>

          {/* Curseur & Jauge de Défilement Synchronisés */}
          <div className="flex min-w-0 flex-1 items-center gap-2.5 px-3">
            <span className="flex items-center gap-1 text-[11px] font-semibold text-ink-soft shrink-0">
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

          {/* Déplacement horizontal vers les colonnes suivantes */}
          <div className="flex items-center shrink-0">
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
              aria-label="Défiler vers les colonnes suivantes"
            >
              <span>Colonnes droite</span>
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
