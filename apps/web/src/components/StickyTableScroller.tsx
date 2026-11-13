import {
  useRef,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
  type CSSProperties,
} from 'react';
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from 'lucide-react';
import { cx } from './ui';

interface StickyTableScrollerProps {
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  tableClassName?: string;
  style?: CSSProperties;
  /** Keep the table viewport pinned immediately below a screen toolbar while the page scrolls. */
  stickyBelow?: string;
}

/**
 * Wrapper de tableur haute performance.
 * - En-tête et colonnes figées 100% natifs CSS (sticky top / sticky left) accélérés par GPU à 120 FPS.
 * - Confinement strict du scroll (overscroll-behavior-y: contain) : aucun rebond, la page ne remonte plus.
 * - Ascenseur vertical interactif ambre sur mesure : visible dès que le contenu dépasse en hauteur.
 * - Glissement fluide, clic direct sur le rail ou boutons haut/bas pour voir tous les composants.
 * - Strictement AUCUNE barre de scroll horizontal native au bas du tableau.
 * - Barre de navigation horizontale permanente avec jauge et boutons au bas d'écran sur Desktop.
 * - Verrouillage sticky au pixel près sous la barre d'outils sur Desktop.
 */
export function StickyTableScroller({
  children,
  footer,
  className,
  tableClassName,
  style,
  stickyBelow,
}: StickyTableScrollerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [toolbarBottom, setToolbarBottom] = useState<number>(0);
  const [isDesktop, setIsDesktop] = useState<boolean>(false);

  // Défilement horizontal
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [hasOverflow, setHasOverflow] = useState(false);

  // Défilement vertical interactif
  const [hasVerticalOverflow, setHasVerticalOverflow] = useState(false);
  const [thumbTop, setThumbTop] = useState(0);
  const [thumbHeight, setThumbHeight] = useState(48);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const isDraggingRef = useRef(false);
  const startDragRef = useRef<{ startY: number; startScrollTop: number }>({ startY: 0, startScrollTop: 0 });

  // Synchronisation dynamique du positionnement sticky sous la barre d'outils (au pixel près)
  useEffect(() => {
    const updateDimensions = () => {
      const desktop = window.innerWidth >= 1024;
      setIsDesktop(desktop);

      if (!stickyBelow || !desktop) {
        setToolbarBottom(0);
        return;
      }

      const toolbar = document.querySelector<HTMLElement>(stickyBelow);
      if (!toolbar) return;

      // Topbar de Shell.tsx sur desktop (h-11 = 44px)
      const topbarHeight = 44;
      const toolbarHeight = toolbar.offsetHeight;
      setToolbarBottom(topbarHeight + toolbarHeight);
    };

    updateDimensions();

    window.addEventListener('resize', updateDimensions);
    const timer = setTimeout(updateDimensions, 120);

    let observer: ResizeObserver | null = null;
    if (stickyBelow && typeof ResizeObserver !== 'undefined') {
      const toolbar = document.querySelector<HTMLElement>(stickyBelow);
      if (toolbar) {
        observer = new ResizeObserver(updateDimensions);
        observer.observe(toolbar);
      }
    }

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateDimensions);
      observer?.disconnect();
    };
  }, [stickyBelow]);

  const checkScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth, scrollTop, scrollHeight, clientHeight } = el;

    // Métriques horizontales
    const maxScroll = Math.max(0, scrollWidth - clientWidth);
    const overflow = maxScroll > 8;
    setHasOverflow(overflow);
    setCanScrollLeft(scrollLeft > 6);
    setCanScrollRight(scrollLeft < maxScroll - 6);
    setScrollProgress(maxScroll > 0 ? (scrollLeft / maxScroll) * 100 : 0);

    // Métriques verticales
    const maxScrollY = Math.max(0, scrollHeight - clientHeight);
    const vOverflow = maxScrollY > 8;
    setHasVerticalOverflow(vOverflow);
    setCanScrollUp(scrollTop > 6);
    setCanScrollDown(scrollTop < maxScrollY - 6);

    if (trackRef.current && vOverflow) {
      const trackH = trackRef.current.clientHeight;
      const tHeight = Math.max(36, Math.round((clientHeight / scrollHeight) * trackH));
      setThumbHeight(tHeight);
      const availableTrack = trackH - tHeight;
      const tTop = maxScrollY > 0 ? (scrollTop / maxScrollY) * availableTrack : 0;
      setThumbTop(Math.max(0, Math.min(availableTrack, tTop)));
    }
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

  

  const scrollByAmount = (amount: number) => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollBy({ left: amount, behavior: 'smooth' });
    setTimeout(checkScroll, 200);
  };

  const scrollVerticalByAmount = (amount: number) => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollBy({ top: amount, behavior: 'smooth' });
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

  // Gestion du glisser-déposer de l'ascenseur vertical
  const handleThumbMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = containerRef.current;
    if (!el) return;

    isDraggingRef.current = true;
    startDragRef.current = { startY: e.clientY, startScrollTop: el.scrollTop };
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current || !containerRef.current || !trackRef.current) return;
      const targetEl = containerRef.current;
      const trackH = trackRef.current.clientHeight;
      const maxScrollY = targetEl.scrollHeight - targetEl.clientHeight;
      const tHeight = Math.max(36, Math.round((targetEl.clientHeight / targetEl.scrollHeight) * trackH));
      const availableTrack = trackH - tHeight;
      if (availableTrack <= 0) return;

      const deltaY = moveEvent.clientY - startDragRef.current.startY;
      const scrollDelta = (deltaY / availableTrack) * maxScrollY;
      targetEl.scrollTop = Math.max(0, Math.min(maxScrollY, startDragRef.current.startScrollTop + scrollDelta));
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Clic direct sur la piste pour faire défiler vers la zone visée
  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    const track = trackRef.current;
    if (!el || !track) return;
    const rect = track.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const trackH = rect.height;
    const maxScrollY = el.scrollHeight - el.clientHeight;
    const tHeight = Math.max(36, Math.round((el.clientHeight / el.scrollHeight) * trackH));
    const availableTrack = trackH - tHeight;
    if (availableTrack <= 0) return;

    const targetThumbTop = Math.max(0, Math.min(availableTrack, clickY - tHeight / 2));
    el.scrollTo({ top: (targetThumbTop / availableTrack) * maxScrollY, behavior: 'smooth' });
  };

  const dynamicMaxHeight = isDesktop && toolbarBottom > 0
    ? `calc(100dvh - ${toolbarBottom + 52}px)`
    : 'calc(100dvh - 200px)';

  return (
    <div
      className={cx(
        'relative flex flex-col rounded-xl border border-line bg-surface shadow-xs overflow-hidden isolate',
        stickyBelow && 'lg:sticky',
        className,
      )}
      style={{
        ...(isDesktop && stickyBelow && toolbarBottom > 0 ? { top: `${toolbarBottom}px` } : {}),
        ...style,
      }}
    >
      {/* Conteneur principal horizontal : Tableur à gauche + Ascenseur vertical interactif à droite */}
      <div className="relative flex flex-1 flex-row min-h-0 w-full overflow-hidden">
        {/* Conteneur défilant du tableau : overscroll-behavior-y: contain empêche tout rebond vers le haut */}
        <div
          ref={containerRef}
          className={cx(
            'table-scroll-viewport no-scrollbar overflow-auto focus:outline-none min-h-[380px] flex-1',
            hasOverflow && 'lg:pb-16',
            tableClassName,
          )}
          style={{
            height: isDesktop && toolbarBottom > 0 ? dynamicMaxHeight : undefined,
            maxHeight: dynamicMaxHeight,
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {children}
        </div>

        {/* Barre d'ascenseur vertical sur mesure : visible quand le contenu dépasse en hauteur (ceci quand il le faut) */}
        {hasVerticalOverflow && (
          <div
            className="hidden lg:flex w-4 shrink-0 flex-col items-center justify-between border-l border-line/60 bg-paper/60 select-none py-1 transition-colors hover:bg-paper"
            style={{
              height: isDesktop && toolbarBottom > 0 ? dynamicMaxHeight : undefined,
              maxHeight: dynamicMaxHeight,
            }}
          >
            {/* Bouton défilement haut d'un cran */}
            <button
              type="button"
              onClick={() => scrollVerticalByAmount(-180)}
              disabled={!canScrollUp}
              className={cx(
                'flex h-4 w-3.5 items-center justify-center rounded text-ink-soft transition-colors active:scale-95',
                canScrollUp ? 'hover:bg-amber hover:text-white cursor-pointer' : 'opacity-25 cursor-default',
              )}
              title="Faire défiler vers le haut"
              aria-label="Faire défiler vers le haut"
            >
              <ChevronUp size={12} />
            </button>

            {/* Piste et Curseur vertical draggable */}
            <div
              ref={trackRef}
              onClick={handleTrackClick}
              className="relative my-1 flex-1 w-full cursor-pointer"
              title="Cliquer ou faire glisser pour défiler verticalement"
            >
              <div
                onMouseDown={handleThumbMouseDown}
                className="absolute left-1/2 -translate-x-1/2 w-2 rounded-full bg-amber/55 hover:bg-amber active:bg-amber transition-colors cursor-grab active:cursor-grabbing shadow-2xs"
                style={{
                  top: `${thumbTop}px`,
                  height: `${thumbHeight}px`,
                }}
              />
            </div>

            {/* Bouton défilement bas d'un cran */}
            <button
              type="button"
              onClick={() => scrollVerticalByAmount(180)}
              disabled={!canScrollDown}
              className={cx(
                'flex h-4 w-3.5 items-center justify-center rounded text-ink-soft transition-colors active:scale-95',
                canScrollDown ? 'hover:bg-amber hover:text-white cursor-pointer' : 'opacity-25 cursor-default',
              )}
              title="Faire défiler vers le bas"
              aria-label="Faire défiler vers le bas"
            >
              <ChevronDown size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Barre d'état inférieure unifiée (Footer) : Métriques & Chiffres clés + Contrôles horizontaux */}
      {(footer || hasOverflow) && (
        <div className="bg-paper border-t border-line px-3.5 py-2 text-xs flex flex-wrap items-center justify-between gap-3 shrink-0 z-30 shadow-[0_-2px_10px_rgba(0,0,0,0.15)]">
          {/* Section Gauche : Indicateurs textuels & Chiffres clés */}
          <div className="flex items-center gap-2.5 flex-wrap min-w-0 flex-1">
            {footer}
          </div>

          {/* Section Droite : Navigation horizontale avec jauge et boutons */}
          {hasOverflow && (
            <div className="hidden lg:flex items-center gap-2 shrink-0 bg-surface px-2.5 py-1 rounded-lg border border-line shadow-2xs">
              <button
                type="button"
                onClick={() => scrollByAmount(-320)}
                disabled={!canScrollLeft}
                className={cx(
                  'flex items-center gap-1 rounded px-2 py-0.5 text-xs font-bold transition-all',
                  canScrollLeft
                    ? 'text-amber hover:bg-amber-wash cursor-pointer active:scale-95'
                    : 'text-ink-faint/30 cursor-not-allowed',
                )}
                title="Défiler vers la gauche (Colonnes précédentes)"
              >
                <ChevronLeft size={14} />
                <span className="hidden sm:inline">Colonnes gauche</span>
              </button>

              <div className="flex items-center gap-1.5 w-28 xl:w-40">
                <span className="text-[10px] text-ink-faint hidden xl:inline shrink-0">Vue :</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={scrollProgress}
                  onChange={handleSliderChange}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-line accent-amber focus:outline-none"
                  title="Glisser pour explorer l'ensemble des colonnes"
                />
                <span className="font-mono text-xs font-bold text-amber shrink-0 tabular-nums min-w-[32px] text-right">
                  {Math.round(scrollProgress)}%
                </span>
              </div>

              <button
                type="button"
                onClick={() => scrollByAmount(320)}
                disabled={!canScrollRight}
                className={cx(
                  'flex items-center gap-1 rounded px-2 py-0.5 text-xs font-bold transition-all',
                  canScrollRight
                    ? 'text-amber hover:bg-amber-wash cursor-pointer active:scale-95'
                    : 'text-ink-faint/30 cursor-not-allowed',
                )}
                title="Défiler vers la droite (Colonnes suivantes)"
              >
                <span className="hidden sm:inline">Colonnes droite</span>
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
