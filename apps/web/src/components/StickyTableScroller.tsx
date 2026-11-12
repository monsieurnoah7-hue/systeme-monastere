import { Children, cloneElement, isValidElement, useRef, useState, useEffect, useCallback, type CSSProperties, type ReactElement, type ReactNode } from 'react';
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
 * Wrapper de tableur avec barre de navigation horizontale permanente ancrée au bas de l'écran.
 * Permet un défilement horizontal fluide et immédiat sur PC (Windows/Mac) et tablette,
 * sans jamais avoir à scroller tout en bas des 400 lignes de données.
 */
export function StickyTableScroller({
  children,
  className,
  tableClassName,
  stickyBelow,
}: StickyTableScrollerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [hasOverflow, setHasOverflow] = useState(true);
  const [isTableVisible, setIsTableVisible] = useState(false);
  const [stickyHeaderLayout, setStickyHeaderLayout] = useState<StickyHeaderLayout | null>(null);

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
    setStickyHeaderLayout((current) => current ? { ...current, scrollLeft } : current);
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

  useEffect(() => {
    if (!stickyBelow) {
      setStickyHeaderLayout(null);
      return;
    }

    const container = containerRef.current;
    const toolbar = document.querySelector<HTMLElement>(stickyBelow);
    const main = container?.closest('main');
    if (!container || !toolbar || !main) return;

    let frame = 0;
    const updateStickyHeader = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const table = container.querySelector('table');
        const thead = table?.tHead;
        if (!table || !thead) {
          setStickyHeaderLayout(null);
          return;
        }

        const toolbarTop = Number.parseFloat(window.getComputedStyle(toolbar).top) || 0;
        const top = Math.ceil(toolbarTop + toolbar.getBoundingClientRect().height);
        const containerRect = container.getBoundingClientRect();
        const mainRect = main.getBoundingClientRect();
        const headerRect = thead.getBoundingClientRect();
        const visible = containerRect.top < top && containerRect.bottom > top + headerRect.height
          && mainRect.top <= top && mainRect.bottom > top + headerRect.height;
        if (!visible) {
          setStickyHeaderLayout(null);
          return;
        }

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
          if (current && current.top === layout.top && current.left === layout.left
            && current.width === layout.width && current.height === layout.height
            && current.tableWidth === layout.tableWidth
            && current.columnWidths.every((width, index) => width === layout.columnWidths[index])) return current;
          return layout;
        });
      });
    };

    updateStickyHeader();
    const observer = new ResizeObserver(updateStickyHeader);
    observer.observe(container);
    observer.observe(toolbar);
    const table = container.querySelector('table');
    if (table) observer.observe(table);
    const mutationObserver = new MutationObserver(updateStickyHeader);
    mutationObserver.observe(container, { childList: true, subtree: true });
    container.addEventListener('scroll', updateStickyHeader, { passive: true });
    main.addEventListener('scroll', updateStickyHeader, { passive: true });
    window.addEventListener('resize', updateStickyHeader, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      mutationObserver.disconnect();
      container.removeEventListener('scroll', updateStickyHeader);
      main.removeEventListener('scroll', updateStickyHeader);
      window.removeEventListener('resize', updateStickyHeader);
    };
  }, [stickyBelow]);

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

  const tableElement = Children.toArray(children).find((child) => isValidElement(child) && child.type === 'table') as ReactElement<Record<string, unknown>> | undefined;
  const tableChildren = tableElement ? (tableElement.props as { children?: ReactNode }).children : null;
  const headerElement = Children.toArray(tableChildren).find((child) => isValidElement(child) && child.type === 'thead') as ReactElement | undefined;
  const stickyHeader = tableElement && headerElement && stickyHeaderLayout
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
      {/* Conteneur défilant du tableau */}
      <div
        ref={containerRef}
        className={cx(
          'table-scroll-viewport overflow-auto scroll-smooth focus:outline-none max-h-[calc(100dvh-200px)] min-h-[440px] scroll-thin',
          hasOverflow && 'pb-16',
          tableClassName,
        )}
        tabIndex={0}
      >
        {children}
      </div>

      {stickyHeader && stickyHeaderLayout && createPortal(
        <div
          className="no-print pointer-events-auto fixed z-30 overflow-hidden bg-paper-2 shadow-md"
          style={{
            top: stickyHeaderLayout.top,
            left: stickyHeaderLayout.left,
            width: stickyHeaderLayout.width,
            height: stickyHeaderLayout.height,
          }}
        >
          <div style={{ width: stickyHeaderLayout.tableWidth, transform: `translateX(-${stickyHeaderLayout.scrollLeft}px)` }}>
            {stickyHeader}
          </div>
        </div>,
        document.body,
      )}

      {/* Barre de navigation horizontale permanente collée au bas du viewport */}
      {hasOverflow && isTableVisible && (
        <div className="no-print fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 flex w-full items-center justify-between gap-2.5 border-t-2 border-amber/50 bg-paper/98 px-2.5 py-2 text-xs shadow-[0_-6px_20px_rgba(0,0,0,0.45)] backdrop-blur-md sm:px-3.5 sm:py-2.5 lg:bottom-0 lg:left-60 lg:right-0 lg:w-auto">
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
              <span className="hidden sm:inline">Colonnes gauche</span>
            </button>
          </div>

          {/* Curseur & Jauge de Défilement Synchronisés */}
          <div className="flex min-w-0 flex-1 items-center gap-2.5 px-1 sm:px-3">
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
              <span className="hidden sm:inline">Colonnes droite</span>
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
