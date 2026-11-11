import { Edit3, MoreVertical, Trash2, Wrench, Zap, ArrowRightLeft } from 'lucide-react';
import type { Tool } from '../lib/api';
import { CONDITION_LABEL, STATUS_LABEL } from '../lib/labels';
import { formatCurrency, type ToolAccounting } from '../lib/accounting';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { cx } from './ui';

export interface ToolBentoCardProps {
  tool: Tool;
  acc?: ToolAccounting | null;
  isSelected?: boolean;
  onSelect?: () => void;
  onClick: () => void;
  onEdit?: () => void;
  onLoan?: () => void;
  onMovement?: () => void;
  onAssign?: () => void;
  onDelete?: () => void;
  canManage?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canLoan?: boolean;
  canViewFinancial?: boolean;
  className?: string;
}

export function ToolBentoCard({
  tool,
  acc,
  isSelected,
  onSelect,
  onClick,
  onEdit,
  onLoan,
  onMovement,
  onAssign,
  onDelete,
  canManage,
  canEdit,
  canDelete,
  canLoan,
  canViewFinancial,
  className,
}: ToolBentoCardProps) {
  const availableQty = tool.available_qty ?? (tool.status === 'disponible' ? 1 : 0);
  const totalQty = tool.total_qty ?? 1;
  const pct = Math.min(100, Math.round((availableQty / Math.max(1, totalQty)) * 100));

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
          tool.status === 'disponible'
            ? 'bg-green'
            : tool.status === 'en_pret'
              ? 'bg-amber'
              : 'bg-red',
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
            {tool.photo_path ? (
              <img src={tool.photo_path} alt={tool.name} className="h-full w-full object-cover" />
            ) : (
              <Wrench size={24} className="text-ink-faint" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <span className="font-mono text-xs font-bold text-amber">{tool.id}</span>
              <span
                className={cx(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0',
                  tool.status === 'disponible'
                    ? 'bg-green-wash text-green'
                    : tool.status === 'en_pret'
                      ? 'bg-amber-wash text-amber'
                      : 'bg-red-wash text-red',
                )}
              >
                <span
                  className={cx(
                    'h-1.5 w-1.5 rounded-full',
                    tool.status === 'disponible' ? 'bg-green' : tool.status === 'en_pret' ? 'bg-amber' : 'bg-red',
                  )}
                />
                {STATUS_LABEL[tool.status]}
              </span>
            </div>

            <h3 className="truncate text-sm font-bold text-ink mt-0.5 group-hover:text-amber transition-colors">
              {tool.name}
            </h3>

            <div className="flex items-center gap-1.5 text-xs text-ink-soft truncate mt-0.5">
              <span>{tool.category}</span>
              {tool.brand && (
                <>
                  <span className="text-ink-faint">·</span>
                  <span className="font-semibold text-ink-faint">{tool.brand}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Ligne 2 : Jauge de disponibilité + Localisation */}
        <div className="rounded-xl border border-line/60 bg-paper/50 p-2.5 text-xs space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-faint font-medium">Disponibilité parc</span>
            <span className="font-mono font-bold tabular-nums">
              <span className={availableQty > 0 ? 'text-green' : 'text-red'}>{availableQty}</span>
              <span className="text-ink-faint"> / {totalQty}</span>
              {(tool.loaned_qty ?? 0) > 0 && (
                <span className="ml-1 text-[10px] text-amber">({tool.loaned_qty} prêté)</span>
              )}
            </span>
          </div>

          {/* Micro-jauge */}
          <div className="h-1.5 w-full rounded-full bg-paper overflow-hidden border border-line/40">
            <div
              className={cx('h-full transition-all duration-300', availableQty > 0 ? 'bg-green' : 'bg-red')}
              style={{ width: `${pct}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] pt-0.5 text-ink-faint">
            <span className="truncate">
              Atelier : <strong className="text-ink">{tool.magasin_name || tool.location || 'Central'}</strong>
            </span>
            <span className="rounded bg-paper px-1.5 py-0.2 text-[9px] font-semibold text-ink-soft border border-line shrink-0">
              {CONDITION_LABEL[tool.condition] || tool.condition}
            </span>
          </div>

          {canViewFinancial && acc && (
            <div className="flex items-center justify-between pt-1 border-t border-line/40 text-[10px] text-ink-faint">
              <span>VNC : <strong className="text-green font-mono">{formatCurrency(acc.vnc)}</strong></span>
              <span>{acc.progressPercent}% amorti</span>
            </div>
          )}
        </div>
      </div>

      {/* Barre d'action tactile (Min 42px touch target) */}
      <div
        className="mt-3.5 pt-3 border-t border-line/60 flex items-center justify-between gap-1.5 pl-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClick}
          className="flex-1 inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-bold text-ink hover:border-amber/40 hover:text-amber active:scale-95 transition-all shadow-2xs"
        >
          Fiche
        </button>

        {canLoan && availableQty > 0 && onLoan && (
          <button
            type="button"
            onClick={onLoan}
            className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl border border-amber/30 bg-amber-wash px-3 py-2 text-xs font-bold text-amber hover:bg-amber hover:text-white active:scale-95 transition-all shadow-2xs"
          >
            Prêter
          </button>
        )}

        {canManage && onMovement && (
          <button
            type="button"
            onClick={onMovement}
            className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl border border-line bg-surface px-2.5 py-2 text-xs font-semibold text-ink-soft hover:text-amber active:scale-95 transition-all shadow-2xs"
            title="Mouvement stock"
          >
            <Zap size={14} className="text-amber" />
          </button>
        )}

        {(canEdit || canDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-surface text-ink-faint hover:text-ink hover:border-amber/40 transition-colors shadow-2xs"
                aria-label="Options"
              >
                <MoreVertical size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 p-1 rounded-xl border border-line bg-surface shadow-pop text-xs z-50">
              {canEdit && onEdit && (
                <DropdownMenuItem
                  onClick={onEdit}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-paper-2 text-ink"
                >
                  <Edit3 size={13} className="text-amber" />
                  <span>Modifier la fiche</span>
                </DropdownMenuItem>
              )}
              {canEdit && onAssign && (
                <DropdownMenuItem
                  onClick={onAssign}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-paper-2 text-ink"
                >
                  <ArrowRightLeft size={13} />
                  <span>Affecter de magasin</span>
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
                    <span>Supprimer du parc</span>
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
