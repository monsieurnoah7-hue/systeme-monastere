import { useRef, useState, useEffect, useCallback, type ReactNode, type WheelEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cx } from './ui';

interface ScrollableChipRailProps {
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}

/**
 * Rail de navigation horizontale fluide (Style YouTube)
 * - Navigation par flèches gauche/droite pour desktop Windows / souris classiques
 * - Défilement à la molette verticale convertie automatiquement en translation horizontale
 * - Glissement tactile natif pour smartphones et tablettes
 */
export function ScrollableChipRail({
  children,
  className,
  ariaLabel = 'Filtres et options',
}: ScrollableChipRailProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 6);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 6);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    checkScroll();

    const handleResize = () => checkScroll();
    window.addEventListener('resize', handleResize);
    el.addEventListener('scroll', checkScroll, { passive: true });

    // Observer les changements de contenu pour réajuster les flèches
    const observer = new MutationObserver(() => checkScroll());
    observer.observe(el, { childList: true, subtree: true });

    return () => {
      window.removeEventListener('resize', handleResize);
      el.removeEventListener('scroll', checkScroll);
      observer.disconnect();
    };
  }, [checkScroll]);

  // Support de la molette classique Windows (défilement vertical -> horizontal)
  const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollWidth > el.clientWidth) {
      el.scrollLeft += e.deltaY;
      checkScroll();
    }
  };

  const scrollByAmount = (amount: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: amount, behavior: 'smooth' });
    setTimeout(checkScroll, 250);
  };

  return (
    <div
      className={cx('group/rail relative flex items-center w-full min-w-0', className)}
      role="region"
      aria-label={ariaLabel}
    >
      {/* Bouton défilement Gauche avec masque de dégradé */}
      {canScrollLeft && (
        <div className="absolute left-0 top-0 bottom-0 z-10 flex items-center pr-6 bg-gradient-to-r from-paper via-paper/90 to-transparent pointer-events-none">
          <button
            type="button"
            onClick={() => scrollByAmount(-240)}
            className="pointer-events-auto grid h-7 w-7 place-items-center rounded-full bg-surface border border-line text-ink-soft hover:text-ink hover:bg-paper-2 hover:border-amber/50 shadow-sm transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
            aria-label="Faire défiler vers la gauche"
          >
            <ChevronLeft size={16} />
          </button>
        </div>
      )}

      {/* Conteneur défilant */}
      <div
        ref={scrollRef}
        onWheel={handleWheel}
        className="flex items-center gap-1.5 overflow-x-auto w-full py-0.5 scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>

      {/* Bouton défilement Droite avec masque de dégradé */}
      {canScrollRight && (
        <div className="absolute right-0 top-0 bottom-0 z-10 flex items-center pl-6 bg-gradient-to-l from-paper via-paper/90 to-transparent pointer-events-none">
          <button
            type="button"
            onClick={() => scrollByAmount(240)}
            className="pointer-events-auto grid h-7 w-7 place-items-center rounded-full bg-surface border border-line text-ink-soft hover:text-ink hover:bg-paper-2 hover:border-amber/50 shadow-sm transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
            aria-label="Faire défiler vers la droite"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
