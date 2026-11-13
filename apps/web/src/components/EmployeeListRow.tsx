import { type ReactNode, useState } from 'react';
import { ChevronDown, ChevronRight, Camera, Printer, Edit2 } from 'lucide-react';
import type { Employee } from '../lib/api';
import { initials } from '../lib/labels';
import { cx } from './ui';

export interface EmployeeListRowProps {
  employee: Employee;
  statusNode?: ReactNode;
  onClick: () => void;
  onPhotoClick?: () => void;
  onBadgeClick?: () => void;
  onEditClick?: () => void;
  onToggleActive?: () => void;
  canManage?: boolean;
  canPrintBadge?: boolean;
  canPhoto?: boolean;
  className?: string;
}

export function EmployeeListRow({
  employee,
  statusNode,
  onClick,
  onPhotoClick,
  onBadgeClick,
  onEditClick,
  onToggleActive,
  canManage,
  canPrintBadge,
  canPhoto,
  className,
}: EmployeeListRowProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={cx(
        'group relative rounded-xl border border-line/80 bg-surface shadow-xs transition-all',
        employee.active ? 'hover:border-amber/40' : 'opacity-75 bg-paper/40',
        className,
      )}
    >
      {/* Ligne principale tactile (Hauteur calibrée 58px) */}
      <div
        onClick={onClick}
        className="flex min-h-[58px] items-center justify-between gap-2.5 p-2.5 sm:px-3.5 cursor-pointer active:bg-surface-2/60 select-none"
      >
        {/* Ancrage Gauche : Photo / Initiale + Identité */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div
            onClick={(e) => {
              if (canPhoto && onPhotoClick) {
                e.stopPropagation();
                onPhotoClick();
              }
            }}
            className={cx(
              'relative grid h-10 w-10 shrink-0 place-items-center rounded-full border text-xs font-bold overflow-hidden shadow-2xs transition-transform',
              canPhoto ? 'cursor-pointer hover:scale-105 hover:border-amber' : '',
              employee.active ? 'bg-amber-wash text-amber border-amber/30' : 'bg-surface-2 text-ink-faint border-line',
            )}
            title={canPhoto ? 'Modifier la photo' : undefined}
          >
            {employee.photo_path ? (
              <img src={employee.photo_path} alt={employee.full_name} className="h-full w-full object-cover" />
            ) : (
              initials(employee.full_name)
            )}
            {canPhoto && (
              <span className="absolute bottom-0 right-0 grid h-3.5 w-3.5 place-items-center rounded-full bg-charcoal text-[8px] text-paper shadow-xs">
                <Camera size={8} />
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="truncate text-xs font-bold text-ink group-hover:text-amber transition-colors min-w-0">
                {employee.full_name}
              </span>
              {!employee.active && (
                <span className="shrink-0 rounded bg-red-wash px-1.5 py-0.2 text-[9px] font-bold text-red border border-red/20 uppercase">
                  Inactif
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-ink-soft truncate">
              <span className="truncate">{employee.job_title}</span>
              <span className="text-ink-faint">·</span>
              <span className="font-mono text-[10px] text-ink-faint shrink-0">{employee.id}</span>
            </div>
          </div>
        </div>

        {/* Ancrage Droite : Statut Aujourd'hui + Badge + Chevron Accordéon */}
        <div className="flex items-center gap-2 shrink-0">
          {statusNode && <div className="shrink-0">{statusNode}</div>}

          {employee.badge_token && (
            <span className="hidden sm:inline-block font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-paper-2 border border-line text-ink-soft tabular-nums">
              {employee.badge_token}
            </span>
          )}

          {/* Bouton dépliant accordéon rapide */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="grid h-8 w-8 place-items-center rounded-lg text-ink-faint hover:bg-paper hover:text-ink transition-colors"
            aria-label={expanded ? 'Réduire' : 'Déplier les actions rapides'}
          >
            {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
        </div>
      </div>

      {/* Accordéon Déplié pour Actions Rapides Tactiles */}
      {expanded && (
        <div className="border-t border-line/60 bg-surface-2/40 px-3 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2 animate-in fade-in-50 duration-150">
          <div className="flex items-center gap-2 text-[11px] text-ink-faint">
            <span>Badge : <strong className="font-mono text-ink">{employee.badge_token ?? 'Non attribué'}</strong></span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={onClick}
              className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-ink hover:border-amber/40 shadow-2xs"
            >
              Fiche complète
            </button>

            {canPrintBadge && onBadgeClick && (
              <button
                type="button"
                onClick={onBadgeClick}
                className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-ink-soft hover:text-amber shadow-2xs"
              >
                <Printer size={12} />
                Badge
              </button>
            )}

            {canManage && onEditClick && (
              <button
                type="button"
                onClick={onEditClick}
                className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-ink-soft hover:text-amber shadow-2xs"
              >
                <Edit2 size={12} />
                Modifier
              </button>
            )}

            {canManage && onToggleActive && (
              <button
                type="button"
                onClick={onToggleActive}
                className={cx(
                  'inline-flex min-h-8 items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold shadow-2xs transition-colors',
                  employee.active
                    ? 'border-red/20 bg-red-wash/40 text-red hover:bg-red-wash'
                    : 'border-green/20 bg-green-wash/40 text-green hover:bg-green-wash',
                )}
              >
                {employee.active ? 'Désactiver' : 'Activer'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
