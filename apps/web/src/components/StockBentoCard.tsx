import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, MoreVertical, Package, Trash2 } from 'lucide-react';
import type { StockRef } from '../lib/api';
import { formatCurrency } from '../lib/accounting';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { cx } from './ui';

export interface StockBentoCardProps {
  item: StockRef;
  isSelected?: boolean;
  onSelect?: () => void;
  onClick: () => void;
  onMoveIn?: () => void;
  onMoveOut?: () => void;
  onTransfer?: () => void;
  onDelete?: () => void;
  canManage?: boolean;
  canMove?: boolean;
  canDelete?: boolean;
  canViewFinancial?: boolean;
  className?: string;
}

export function StockBentoCard({
  item,
  isSelected,
  onSelect,
  onClick,
  onMoveIn,
  onMoveOut,
  onTransfer,
  onDelete,
  canManage,
  canMove,
  canDelete,
  canViewFinancial,
  className,
}: StockBentoCardProps) {
  const isOutOfStock = item.qty <= 0;
  const isLowStock = !isOutOfStock && item.qty <= item.min_qty;
  const target = Math.max(item.min_qty * 2, item.qty, 1);
  const pct = Math.min(100, Math.round((item.qty / target) * 100));
  const minPct = Math.min(100, Math.round((item.min_qty / target) * 100));
  const lineValuation = (item.qty || 0) * (item.unit_cost || 0);

  return (
    <div
      onClick={onClick}
      className={cx(
        'group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-line/80 bg-surface-2 p-4 shadow-card hover:border-amber/40 active:scale-[0.99] transition-all cursor-pointer',
        isSelected && 'border-amber/70 bg-amber-wash/30',
        className,
      )}
    >
      {/* Liseré latéral de statut (4mm) */}
      <span
        className={cx(
          'absolute left-0 top-0 bottom-0 w-1.5 transition-colors',
          isOutOfStock
            ? 'bg-red'
            : isLowStock
              ? 'bg-amber'
              : 'bg-green',
        )}
      />

      <div className="space-y-3 pl-1.5">
        {/* Ligne 1 : Sélection + Photo + Nom + Statut */}
        <div className="flex items-start gap-3">
          {canManage && onSelect && (
            <div
              className="pt-1 shrink-0"
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

          <div className="relative h-14 w-14 shrink-0 rounded-2xl overflow-hidden border border-line bg-paper grid place-items-center shadow-xs">
            {item.photo_path ? (
              <img src={item.photo_path} alt={item.name} className="h-full w-full object-cover" />
            ) : (
              <Package size={24} className="text-ink-faint" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <span className="font-mono text-xs font-bold text-amber">{item.id}</span>
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
                {isOutOfStock ? 'Rupture' : isLowStock ? 'Alerte seuil' : 'Normal'}
              </span>
            </div>

            <h3 className="truncate text-sm font-bold text-ink mt-0.5 group-hover:text-amber transition-colors">
              {item.name}
            </h3>

            <div className="flex items-center gap-1.5 text-xs text-ink-soft truncate mt-0.5">
              <span>{item.category}</span>
              {item.brand && (
                <>
                  <span className="text-ink-faint">·</span>
                  <span className="font-semibold text-ink-faint">{item.brand}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Ligne 2 : Jauge Graphique de Stock avec repère de seuil */}
        <div className="rounded-xl border border-line/60 bg-paper/50 p-3 text-xs space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-ink-faint text-[11px] font-medium">Stock en rayon</span>
            <div className="text-right">
              <span
                className={cx(
                  'font-mono text-base font-extrabold tabular-nums',
                  isOutOfStock ? 'text-red' : isLowStock ? 'text-amber' : 'text-green',
                )}
              >
                {item.qty}
              </span>
              <span className="ml-1 text-xs font-semibold text-ink-soft">{item.unit}</span>
            </div>
          </div>

          {/* Jauge visuelle avec repère seuil */}
          <div className="relative h-2 w-full rounded-full bg-paper overflow-hidden border border-line/40">
            <div
              className={cx(
                'h-full transition-all duration-300',
                isOutOfStock ? 'bg-red' : isLowStock ? 'bg-amber' : 'bg-green',
              )}
              style={{ width: `${pct}%` }}
            />
            {/* Repère visuel seuil min */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-ink/60 z-10"
              style={{ left: `${minPct}%` }}
              title={`Seuil min: ${item.min_qty} ${item.unit}`}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] pt-0.5 text-ink-faint">
            <span className="truncate">
              Magasin : <strong className="text-ink">{item.magasin_name || item.location || 'Atelier central'}</strong>
            </span>
            <span>
              Seuil : <strong className="text-ink-soft">{item.min_qty} {item.unit}</strong>
            </span>
          </div>

          {canViewFinancial && item.unit_cost ? (
            <div className="flex items-center justify-between pt-1 border-t border-line/40 text-[10px] text-ink-faint">
              <span>Valeur : <strong className="text-green font-mono">{formatCurrency(lineValuation)}</strong></span>
              <span>{formatCurrency(item.unit_cost)}/{item.unit}</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Barre d'action tactile directe (Boutons au pouce grands et contrastés) */}
      <div
        className="mt-3.5 pt-3 border-t border-line/60 flex items-center justify-between gap-1.5 pl-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        {canMove && (
          <>
            <button
              type="button"
              onClick={onMoveOut}
              className="flex-1 inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-amber/40 bg-amber-wash px-3 py-2 text-xs font-bold text-amber hover:bg-amber hover:text-white active:scale-95 transition-all shadow-2xs"
            >
              <ArrowUpRight size={14} />
              <span>Sortie</span>
            </button>

            <button
              type="button"
              onClick={onMoveIn}
              className="flex-1 inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-green/40 bg-green/10 px-3 py-2 text-xs font-bold text-green hover:bg-green hover:text-white active:scale-95 transition-all shadow-2xs"
            >
              <ArrowDownLeft size={14} />
              <span>Entrée</span>
            </button>
          </>
        )}

        <button
          type="button"
          onClick={onClick}
          className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink hover:border-amber/40 hover:text-amber active:scale-95 transition-all shadow-2xs"
          title="Fiche article"
        >
          Fiche
        </button>

        {(canManage || canDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-surface text-ink-faint hover:text-ink hover:border-amber/40 transition-colors shadow-2xs"
                aria-label="Options article"
              >
                <MoreVertical size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 p-1 rounded-xl border border-line bg-surface shadow-pop text-xs z-50">
              {canManage && onTransfer && (
                <DropdownMenuItem
                  onClick={onTransfer}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-paper-2 text-ink"
                >
                  <ArrowRightLeft size={13} />
                  <span>Transférer de magasin</span>
                </DropdownMenuItem>
              )}
              {canDelete && onDelete && (
                <>
                  <DropdownMenuSeparator className="my-1 border-line" />
                  <DropdownMenuItem
                    onClick={onDelete}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-red/10 text-red"
                  >
                    <Trash2 size={13} />
                    <span>Supprimer cet article</span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
