import {
  Children,
  cloneElement,
  isValidElement,
  useRef,
  useState,
  useEffect,
  useCallback,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { cx } from './ui';

interface StickyTableScrollerProps {
  children: ReactNode;
  className?: string;
  tableClassName?: string;
  /** Keep the table viewport pinned immediately below a screen toolbar while the page scrolls. */
  stickyBelow?: string;
}

type StickyHeaderLayout = {
  top: number;
  left: number;
  width: number;
  height: number;
  tableWidth: number;
  scrollLeft: number;
  columnWidths: number[];
};

type VerticalTrackLayout = {
  top: number;
  left: number;
  height: number;
  thumbHeight: number;
  scrollRange: number;
};

function cloneHeaderWithWidths(header: ReactElement, widths: number[]): ReactNode {
  const headerChildren = (header.props as { children?: ReactNode }).children;
  return cloneElement(header as ReactElement<Record<string, unknown>>, {
    children: Children.map(headerChildren, (row) => {
      if (!isValidElement(row)) return row;
      const rowChildren = (row.props as { children?: ReactNode }).children;
      let columnIndex = 0;
      return cloneElement(row as ReactElement<Record<string, unknown>>, {
        children: Children.map(rowChildren, (cell) => {
          if (!isValidElement(cell) || cell.type !== 'th') return cell;
          const width = widths[columnIndex++];
          if (!width) return cell;
          const props = cell.props as { style?: CSSProperties };
          return cloneElement(cell as ReactElement<Record<string, unknown>>, {
            style: { ...props.style, width, minWidth: width, maxWidth: width },
          });
        }),
      });
    }),
  });
}

/**
 * Wrapper de tableur haute performance.
 * - Sur PC / Laptop (large écran) : ascenseur vertical fixe synchronisé à 120 FPS via GPU (translate3d)
 *   et barre horizontale permanente ancrée au bas pour un contrôle au pixel près.
 * - Sur Mobile / Tablette : suppression complète des barres flottantes superflues au profit
 *   du défilement tactile natif et fluide, sans obstruction de l'interface ni chevauchement.
 */
export function StickyTableScroller({
  children,
  className,
  tableClassName,
  stickyBelow,
}: StickyTableScrollerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const trackLayoutRef = useRef<VerticalTrackLayout | null>(null);

  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [hasOverflow, setHasOverflow] = useState(true);
  const [isTableVisible, setIsTableVisible] = useState(false);
  const [stickyHeaderLayout, setStickyHeaderLayout] = useState<StickyHeaderLayout | null>(null);
  const [verticalTrack, setVerticalTrack] = useState<VerticalTrackLayout | null>(null);

  const verticalDrag = useRef<{
    pointerId: number;
    offsetInThumb: number;
    trackTop: number;
    maxScroll: number;
    maxThumbTop: number;
  } | null>(null);

  // Synchronisation ultra-fluide du thumb sans re-render React du tableau entier (GPU accelerated)
  const syncThumbPosition = useCallback(() => {
    const el = containerRef.current;
    const thumb = thumbRef.current;
    const layout = trackLayoutRef.current;
    if (!el || !thumb || !layout) return;

    const maxScroll = Math.max(1, el.scrollHeight - el.clientHeight);
    const maxThumbTop = Math.max(0, layout.height - layout.thumbHeight);
    const currentThumbTop = Math.max(0, Math.min(maxThumbTop, (el.scrollTop / maxScroll) * maxThumbTop));
    thumb.style.transform = `translate3d(0, ${currentThumbTop}px, 0)`;
  }, []);

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
    setStickyHeaderLayout((current) => (current ? { ...current, scrollLeft } : current));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    checkScroll();
    syncThumbPosition();

    const handleResize = () => {
      checkScroll();
      syncThumbPosition();
    };

    window.addEventListener('resize', handleResize);
    el.addEventListener('scroll', checkScroll, { passive: true });
    el.addEventListener('scroll', syncThumbPosition, { passive: true });

    const observer = new MutationObserver(() => {
      checkScroll();
      syncThumbPosition();
    });
    observer.observe(el, { childList: true, subtree: true });

    const t1 = setTimeout(() => {
      checkScroll();
      syncThumbPosition();
    }, 150);
    const t2 = setTimeout(() => {
      checkScroll();
      syncThumbPosition();
    }, 600);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('resize', handleResize);
      el.removeEventListener('scroll', checkScroll);
      el.removeEventListener('scroll', syncThumbPosition);
      observer.disconnect();
    };
  }, [checkScroll, syncThumbPosition]);

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

  // Calcul géométrique du sticky header et du rail vertical (actif uniquement sur Desktop >= 1024px)
  useEffect(() => {
    const container = containerRef.current;
    const toolbar = stickyBelow ? document.querySelector<HTMLElement>(stickyBelow) : null;
    const main = container?.closest('main');
    if (!container || !main) return;

    let frame = 0;
    const updateStickyLayout = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
        const table = container.querySelector('table');
        const thead = table?.tHead;

        if (!table) {
          setStickyHeaderLayout(null);
          setVerticalTrack(null);
          trackLayoutRef.current = null;
          return;
        }

        const toolbarTop = toolbar
          ? Number.parseFloat(window.getComputedStyle(toolbar).top) || 0
          : main.getBoundingClientRect().top;
        const top = Math.ceil(toolbar ? toolbarTop + toolbar.getBoundingClientRect().height : toolbarTop);
        const containerRect = container.getBoundingClientRect();
        const mainRect = main.getBoundingClientRect();

        // 1. En-tête collant (sticky header) sous la barre d'outils
        if (thead && toolbar) {
          const headerRect = thead.getBoundingClientRect();
          const stickyHeaderVisible =
            containerRect.top < top &&
            containerRect.bottom > top + headerRect.height &&
            mainRect.top <= top &&
            mainRect.bottom > top + headerRect.height;

          if (stickyHeaderVisible) {
            const headerCells = Array.from(thead.rows[0]?.cells ?? []);
            const layout: StickyHeaderLayout = {
              top,
              left: containerRect.left,
              width: container.clientWidth,
              height: headerRect.height,
              tableWidth: table.getBoundingClientRect().width,
              scrollLeft: container.scrollLeft,
              columnWidths: headerCells.map((cell) => cell.getBoundingClientRect().width),
            };
            setStickyHeaderLayout((current) => {
              if (
                current &&
                current.top === layout.top &&
                current.left === layout.left &&
                current.width === layout.width &&
                current.height === layout.height &&
                current.tableWidth === layout.tableWidth &&
                current.scrollLeft === layout.scrollLeft &&
                current.columnWidths.every((width, index) => width === layout.columnWidths[index])
              ) {
                return current;
              }
              return layout;
            });
          } else {
            setStickyHeaderLayout(null);
          }
        } else {
          setStickyHeaderLayout(null);
        }

        // 2. Ascenseur vertical fixe : STRICTEMENT RÉSERVÉ AU DESKTOP (PC / Laptop)
        // Sur mobile, le défilement tactile naturel s'applique sans encombrement visuel.
        if (!isDesktop) {
          setVerticalTrack(null);
          trackLayoutRef.current = null;
          return;
        }

        const scrollRange = Math.max(0, container.scrollHeight - container.clientHeight);
        const horizontalBarHeight = hasOverflow ? 48 : 0;
        const trackTop = Math.max(containerRect.top, mainRect.top, top);
        const trackBottom = Math.min(containerRect.bottom, window.innerHeight - horizontalBarHeight);
        const trackHeight = trackBottom - trackTop;

        if (scrollRange <= 4 || trackHeight < 32 || containerRect.bottom <= top || containerRect.top >= trackBottom) {
          setVerticalTrack(null);
          trackLayoutRef.current = null;
          return;
        }

        const thumbHeight = Math.min(
          trackHeight,
          Math.max(32, (trackHeight * container.clientHeight) / container.scrollHeight),
        );

        const verticalLayout: VerticalTrackLayout = {
          top: trackTop,
          left: Math.min(containerRect.right - 14, mainRect.right - 14),
          height: trackHeight,
          thumbHeight,
          scrollRange,
        };

        trackLayoutRef.current = verticalLayout;
        setVerticalTrack((current) => {
          if (
            current &&
            current.top === verticalLayout.top &&
            current.left === verticalLayout.left &&
            current.height === verticalLayout.height &&
            current.thumbHeight === verticalLayout.thumbHeight &&
            current.scrollRange === verticalLayout.scrollRange
          ) {
            return current;
          }
          return verticalLayout;
        });

        syncThumbPosition();
      });
    };

    updateStickyLayout();
    const observer = new ResizeObserver(updateStickyLayout);
    observer.observe(container);
    if (toolbar) observer.observe(toolbar);
    const table = container.querySelector('table');
    if (table) observer.observe(table);
    const mutationObserver = new MutationObserver(updateStickyLayout);
    mutationObserver.observe(container, { childList: true, subtree: true });
    container.addEventListener('scroll', updateStickyLayout, { passive: true });
    main.addEventListener('scroll', updateStickyLayout, { passive: true });
    window.addEventListener('resize', updateStickyLayout, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      mutationObserver.disconnect();
      container.removeEventListener('scroll', updateStickyLayout);
      main.removeEventListener('scroll', updateStickyLayout);
      window.removeEventListener('resize', updateStickyLayout);
    };
  }, [stickyBelow, hasOverflow, syncThumbPosition]);

  // Réaligner immédiatement le thumb lorsque le layout du track est initialisé ou mis à jour
  useEffect(() => {
    syncThumbPosition();
  }, [verticalTrack, syncThumbPosition]);

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

  // Interactions sur le rail vertical (clic direct, glisser-déposer réactif, molette et clavier)
  const handleTrackPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    const track = trackRef.current;
    const thumb = thumbRef.current;
    const layout = trackLayoutRef.current;
    if (!el || !track || !thumb || !layout) return;

    event.preventDefault();
    event.stopPropagation();
    track.setPointerCapture(event.pointerId);

    const trackRect = track.getBoundingClientRect();
    const thumbRect = thumb.getBoundingClientRect();
    const maxScroll = Math.max(1, el.scrollHeight - el.clientHeight);
    const maxThumbTop = Math.max(1, layout.height - layout.thumbHeight);

    const isThumbClick = event.clientY >= thumbRect.top && event.clientY <= thumbRect.bottom;

    if (isThumbClick) {
      verticalDrag.current = {
        pointerId: event.pointerId,
        offsetInThumb: event.clientY - thumbRect.top,
        trackTop: trackRect.top,
        maxScroll,
        maxThumbTop,
      };
    } else {
      const targetThumbTop = Math.max(0, Math.min(maxThumbTop, event.clientY - trackRect.top - layout.thumbHeight / 2));
      el.scrollTop = (targetThumbTop / maxThumbTop) * maxScroll;
      thumb.style.transform = `translate3d(0, ${targetThumbTop}px, 0)`;
      verticalDrag.current = {
        pointerId: event.pointerId,
        offsetInThumb: layout.thumbHeight / 2,
        trackTop: trackRect.top,
        maxScroll,
        maxThumbTop,
      };
    }
  };

  const handleTrackPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = verticalDrag.current;
    const el = containerRef.current;
    const thumb = thumbRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !el || !thumb) return;

    const rawThumbTop = event.clientY - drag.trackTop - drag.offsetInThumb;
    const thumbTop = Math.max(0, Math.min(drag.maxThumbTop, rawThumbTop));
    el.scrollTop = (thumbTop / drag.maxThumbTop) * drag.maxScroll;
    thumb.style.transform = `translate3d(0, ${thumbTop}px, 0)`;
  };

  const handleTrackPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (verticalDrag.current?.pointerId === event.pointerId) {
      verticalDrag.current = null;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {}
    }
  };

  const handleTrackWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop += event.deltaY;
  };

  const handleVerticalKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    const step = Math.max(80, Math.round(el.clientHeight * 0.8));
    if (event.key === 'ArrowUp') el.scrollBy({ top: -48, behavior: 'smooth' });
    else if (event.key === 'ArrowDown') el.scrollBy({ top: 48, behavior: 'smooth' });
    else if (event.key === 'PageUp') el.scrollBy({ top: -step, behavior: 'smooth' });
    else if (event.key === 'PageDown') el.scrollBy({ top: step, behavior: 'smooth' });
    else if (event.key === 'Home') el.scrollTo({ top: 0, behavior: 'smooth' });
    else if (event.key === 'End') el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    else return;
    event.preventDefault();
  };

  const tableElement = Children.toArray(children).find(
    (child) => isValidElement(child) && child.type === 'table',
  ) as ReactElement<Record<string, unknown>> | undefined;
  const tableChildren = tableElement ? (tableElement.props as { children?: ReactNode }).children : null;
  const headerElement = Children.toArray(tableChildren).find(
    (child) => isValidElement(child) && child.type === 'thead',
  ) as ReactElement | undefined;
  const stickyHeader =
    tableElement && headerElement && stickyHeaderLayout
      ? cloneElement(tableElement, {
          style: {
            ...((tableElement.props as { style?: CSSProperties }).style),
            width: stickyHeaderLayout.tableWidth,
            minWidth: stickyHeaderLayout.tableWidth,
            tableLayout: 'fixed',
          },
          children: cloneHeaderWithWidths(headerElement, stickyHeaderLayout.columnWidths),
        })
      : null;

  return (
    <div className={cx('relative flex flex-col', className)}>
      {/* Conteneur défilant du tableau : défilement fluide sans barres natives */}
      <div
        ref={containerRef}
        className={cx(
          'table-scroll-viewport overflow-auto scroll-smooth focus:outline-none max-h-[calc(100dvh-200px)] min-h-[440px]',
          hasOverflow && 'lg:pb-16',
          tableClassName,
        )}
        tabIndex={0}
      >
        {children}
      </div>

      {stickyHeader &&
        stickyHeaderLayout &&
        createPortal(
          <div
            className="no-print pointer-events-auto fixed z-30 overflow-hidden bg-paper-2 shadow-md"
            style={{
              top: stickyHeaderLayout.top,
              left: stickyHeaderLayout.left,
              width: stickyHeaderLayout.width,
              height: stickyHeaderLayout.height,
            }}
          >
            <div
              style={{
                width: stickyHeaderLayout.tableWidth,
                transform: `translateX(-${stickyHeaderLayout.scrollLeft}px)`,
              }}
            >
              {stickyHeader}
            </div>
          </div>,
          document.body,
        )}

      {/* Ascenseur vertical synchronisé à 120 FPS via GPU (PC / Laptop uniquement) */}
      {verticalTrack &&
        isTableVisible &&
        createPortal(
          <div
            ref={trackRef}
            role="scrollbar"
            aria-label="Défilement vertical du tableau"
            aria-orientation="vertical"
            aria-valuemin={0}
            aria-valuemax={100}
            tabIndex={0}
            onWheel={handleTrackWheel}
            onKeyDown={handleVerticalKeyDown}
            onPointerDown={handleTrackPointerDown}
            onPointerMove={handleTrackPointerMove}
            onPointerUp={handleTrackPointerUp}
            onPointerCancel={handleTrackPointerUp}
            className="no-print hidden lg:block fixed z-35 w-2.5 hover:w-3.5 touch-none cursor-pointer rounded-full bg-ink/10 dark:bg-white/10 hover:bg-ink/20 dark:hover:bg-white/20 p-[1.5px] shadow-2xs outline-none focus-visible:ring-2 focus-visible:ring-amber transition-all duration-150"
            style={{
              top: verticalTrack.top,
              left: verticalTrack.left,
              height: verticalTrack.height,
            }}
            title="Ascenseur vertical du tableau (glisser ou cliquer pour faire défiler)"
          >
            <div
              ref={thumbRef}
              className="absolute left-[1.5px] right-[1.5px] rounded-full bg-amber/80 hover:bg-amber active:bg-amber-strong transition-colors shadow-2xs will-change-transform"
              style={{
                height: verticalTrack.thumbHeight,
              }}
            />
          </div>,
          document.body,
        )}

      {/* Barre de navigation horizontale permanente : strictement Desktop (PC / Laptop uniquement) */}
      {hasOverflow && isTableVisible && (
        <div className="no-print hidden lg:flex fixed inset-x-0 bottom-0 left-60 right-0 z-40 items-center justify-between gap-2.5 border-t-2 border-amber/50 bg-paper/98 px-3.5 py-2.5 text-xs shadow-[0_-6px_20px_rgba(0,0,0,0.45)] backdrop-blur-md">
          {/* Déplacement horizontal par pas */}
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
