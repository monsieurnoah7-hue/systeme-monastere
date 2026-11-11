import { useState } from 'react';
import { ChevronDown, ChevronRight, Edit3, Wrench, Zap, ArrowRightLeft } from 'lucide-react';
import type { Tool } from '../lib/api';
import { STATUS_LABEL } from '../lib/labels';
import { cx } from './ui';

export interface ToolListRowProps {
  tool: Tool;
  isSelected?: boolean;
  onSelect?: () => void;
  onClick: () => void;
  onEdit?: () => void;
  onLoan?: () => void;
  onMovement?: () => void;
  onAssign?: () => void;
  canManage?: boolean;
  canEdit?: boolean;
  canLoan?: boolean;
  className?: string;
}

export function ToolListRow({
  tool,
  isSelected,
  onSelect,
  onClick,
  onEdit,
  onLoan,
  onMovement,
  onAssign,
  canManage,
  canEdit,
  canLoan,
  className,
}: ToolListRowProps) {
  const [expanded, setExpanded] = useState(false);
  const availableQty = tool.available_qty ?? (tool.status === 'disponible' ? 1 : 0);
  const totalQty = tool.total_qty ?? 1;

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
            {tool.photo_path ? (
              <img src={tool.photo_path} alt={tool.name} className="h-full w-full object-cover" />
            ) : (
              <Wrench size={18} className="text-ink-faint" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-mono text-[10px] font-bold text-amber">{tool.id}</span>
              <span className="truncate text-xs font-bold text-ink group-hover:text-amber transition-colors">
                {tool.name}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-ink-soft truncate">
              <span className="truncate">{tool.category}</span>
              {tool.brand && (
                <>
                  <span className="text-ink-faint">·</span>
                  <span className="font-medium text-ink-faint shrink-0">{tool.brand}</span>
                </>
              )}
              {tool.magasin_name && (
                <>
                  <span className="text-ink-faint">·</span>
                  <span className="truncate text-ink-faint">{tool.magasin_name}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Ancrage Droite : Disponibilité + Statut + Accordéon */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-[11px] font-bold tabular-nums">
            <span className={availableQty > 0 ? 'text-green' : 'text-red'}>{availableQty}</span>
            <span className="text-ink-faint">/{totalQty}</span>
          </span>

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
            <span className="hidden sm:inline">{STATUS_LABEL[tool.status]}</span>
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
            <span>Emplacement : <strong className="text-ink">{tool.location || tool.magasin_name || 'Non spécifié'}</strong></span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={onClick}
              className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-ink hover:border-amber/40 shadow-2xs"
            >
              Fiche complète
            </button>

            {canLoan && availableQty > 0 && onLoan && (
              <button
                type="button"
                onClick={onLoan}
                className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-amber/30 bg-amber-wash px-2.5 py-1 text-xs font-bold text-amber hover:bg-amber hover:text-white shadow-2xs"
              >
                Prêter
              </button>
            )}

            {canManage && onMovement && (
              <button
                type="button"
                onClick={onMovement}
                className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1 text-xs font-semibold text-ink-soft hover:text-amber shadow-2xs"
                title="Mouvement stock"
              >
                <Zap size={12} className="text-amber" />
                Mouvement
              </button>
            )}

            {canEdit && onAssign && (
              <button
                type="button"
                onClick={onAssign}
                className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1 text-xs font-semibold text-ink-soft hover:text-amber shadow-2xs"
                title="Affecter magasin"
              >
                <ArrowRightLeft size={12} />
              </button>
            )}

            {canEdit && onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1 text-xs font-semibold text-ink-soft hover:text-amber shadow-2xs"
                title="Modifier"
              >
                <Edit3 size={12} />
                Modifier
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
