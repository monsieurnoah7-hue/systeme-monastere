import { useState } from 'react';
import { ChevronDown, ChevronRight, Package, ArrowDownLeft, ArrowUpRight, ArrowRightLeft } from 'lucide-react';
import type { StockRef } from '../lib/api';
import { cx } from './ui';

export interface StockListRowProps {
  item: StockRef;
  isSelected?: boolean;
  onSelect?: () => void;
  onClick: () => void;
  onMoveIn?: () => void;
  onMoveOut?: () => void;
  onTransfer?: () => void;
  canManage?: boolean;
  canMove?: boolean;
  className?: string;
}

export function StockListRow({
  item,
  isSelected,
  onSelect,
  onClick,
  onMoveIn,
  onMoveOut,
  onTransfer,
  canManage,
  canMove,
  className,
}: StockListRowProps) {
  const [expanded, setExpanded] = useState(false);
  const isOutOfStock = item.qty <= 0;
  const isLowStock = !isOutOfStock && item.qty <= item.min_qty;

  return (
    <div
      className={cx(
        'group relative rounded-xl border border-line/80 bg-surface shadow-xs transition-all',
        isSelected ? 'border-amber/60 bg-amber-wash/30' : 'hover:border-amber/40',
        className,
      )}
    >
      {/* Ligne tactile principale (58px) */}
      <div
        onClick={onClick}
        className="flex min-h-[58px] items-center justify-between gap-2.5 p-2.5 sm:px-3.5 cursor-pointer active:bg-surface-2/60 select-none"
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {canManage && onSelect && (
            <div
              className="pt-0.5 shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onSelect();
              }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => {}}
                className="h-4 w-4 rounded accent-amber cursor-pointer"
              />
            </div>
          )}

          {/* Vignette Photo */}
          <div className="relative h-10 w-10 shrink-0 rounded-xl overflow-hidden border border-line bg-paper grid place-items-center">
            {item.photo_path ? (
              <img src={item.photo_path} alt={item.name} className="h-full w-full object-cover" />
            ) : (
              <Package size={18} className="text-ink-faint" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-mono text-[10px] font-bold text-amber">{item.id}</span>
              <span className="truncate text-xs font-bold text-ink group-hover:text-amber transition-colors">
                {item.name}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-ink-soft truncate">
              <span className="truncate">{item.category}</span>
              {item.brand && (
                <>
                  <span className="text-ink-faint">·</span>
                  <span className="font-medium text-ink-faint shrink-0">{item.brand}</span>
                </>
              )}
              {item.magasin_name && (
                <>
                  <span className="text-ink-faint">·</span>
                  <span className="truncate text-ink-faint">{item.magasin_name}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Ancrage Droite : Quantité + Statut seuil + Accordéon */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <span
              className={cx(
                'font-mono text-xs font-bold tabular-nums block',
                isOutOfStock ? 'text-red' : isLowStock ? 'text-amber' : 'text-green',
              )}
            >
              {item.qty} <span className="text-[10px] font-normal text-ink-soft">{item.unit}</span>
            </span>
          </div>

          <span
            className={cx(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0',
              isOutOfStock
                ? 'bg-red-wash text-red'
                : isLowStock
                  ? 'bg-amber-wash text-amber'
                  : 'bg-green-wash text-green',
            )}
          >
            <span
              className={cx(
                'h-1.5 w-1.5 rounded-full',
                isOutOfStock ? 'bg-red' : isLowStock ? 'bg-amber' : 'bg-green',
              )}
            />
            <span className="hidden sm:inline">
              {isOutOfStock ? 'Rupture' : isLowStock ? 'Alerte' : 'Normal'}
            </span>
          </span>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="grid h-8 w-8 place-items-center rounded-lg text-ink-faint hover:bg-paper hover:text-ink transition-colors"
            aria-label={expanded ? 'Réduire' : 'Déplier'}
          >
            {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
        </div>
      </div>

      {/* Accordéon Déplié pour Actions Rapides Tactiles */}
      {expanded && (
        <div className="border-t border-line/60 bg-surface-2/40 px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2 animate-in fade-in-50 duration-150">
          <div className="flex items-center gap-2 text-[11px] text-ink-faint">
            <span>Seuil min : <strong className="text-ink">{item.min_qty} {item.unit}</strong></span>
            {item.supplier && <span>· Fournisseur : <strong className="text-ink-soft">{item.supplier}</strong></span>}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={onClick}
              className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-ink hover:border-amber/40 shadow-2xs"
            >
              Fiche article
            </button>

            {canMove && onMoveOut && (
              <button
                type="button"
                onClick={onMoveOut}
                className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-amber/30 bg-amber-wash px-2.5 py-1 text-xs font-bold text-amber hover:bg-amber hover:text-white shadow-2xs"
              >
                <ArrowUpRight size={12} />
                - Sortie
              </button>
            )}

            {canMove && onMoveIn && (
              <button
                type="button"
                onClick={onMoveIn}
                className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-green/30 bg-green/10 px-2.5 py-1 text-xs font-bold text-green hover:bg-green hover:text-white shadow-2xs"
              >
                <ArrowDownLeft size={12} />
                + Entrée
              </button>
            )}

            {canManage && onTransfer && (
              <button
                type="button"
                onClick={onTransfer}
                className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1 text-xs font-semibold text-ink-soft hover:text-amber shadow-2xs"
                title="Transférer"
              >
                <ArrowRightLeft size={12} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
