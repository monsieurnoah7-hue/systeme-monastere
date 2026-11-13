import { type ReactNode } from 'react';
import { Camera, Edit2, MoreVertical, Printer, Trash2 } from 'lucide-react';
import type { Employee } from '../lib/api';
import { initials } from '../lib/labels';
import { formatWorkdaysLabels } from '../screens/Employees';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { cx } from './ui';

export interface EmployeeBentoCardProps {
  employee: Employee;
  statusNode?: ReactNode;
  onClick: () => void;
  onPhotoClick?: () => void;
  onBadgeClick?: () => void;
  onEditClick?: () => void;
  onToggleActive?: () => void;
  onDeleteClick?: () => void;
  canManage?: boolean;
  canPrintBadge?: boolean;
  canPhoto?: boolean;
  className?: string;
}

export function EmployeeBentoCard({
  employee,
  statusNode,
  onClick,
  onPhotoClick,
  onBadgeClick,
  onEditClick,
  onToggleActive,
  onDeleteClick,
  canManage,
  canPrintBadge,
  canPhoto,
  className,
}: EmployeeBentoCardProps) {
  return (
    <div
      onClick={onClick}
      className={cx(
        'group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-line/80 bg-surface-2 p-4 shadow-card hover:border-amber/40 active:scale-[0.99] transition-all cursor-pointer',
        !employee.active && 'opacity-80 bg-surface-2/60',
        className,
      )}
    >
      {/* Liseré latéral de statut actif (4mm) */}
      <span
        className={cx(
          'absolute left-0 top-0 bottom-0 w-1.5 transition-colors',
          employee.active ? 'bg-green' : 'bg-line-strong',
        )}
      />

      <div className="space-y-3 pl-1.5">
        {/* Ligne 1 : Avatar tactile + Présence du jour + Menu rapide */}
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div
              onClick={(e) => {
                if (canPhoto && onPhotoClick) {
                  e.stopPropagation();
                  onPhotoClick();
                }
              }}
              className={cx(
                'relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl border text-sm font-bold overflow-hidden shadow-xs transition-transform',
                canPhoto ? 'cursor-pointer hover:scale-105 hover:border-amber' : '',
                employee.active ? 'bg-amber-wash text-amber border-amber/30' : 'bg-paper text-ink-faint border-line',
              )}
              title={canPhoto ? 'Modifier la photo' : undefined}
            >
              {employee.photo_path ? (
                <img src={employee.photo_path} alt={employee.full_name} className="h-full w-full object-cover" />
              ) : (
                initials(employee.full_name)
              )}
              {canPhoto && (
                <span className="absolute bottom-0 right-0 grid h-4 w-4 place-items-center rounded-tl-lg bg-charcoal text-[9px] text-paper shadow-xs">
                  <Camera size={9} />
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-bold text-ink group-hover:text-amber transition-colors">
                {employee.full_name}
              </h3>
              <p className="truncate text-xs text-ink-soft">
                {employee.job_title}
              </p>
              <span className="font-mono text-[10px] text-ink-faint">
                {employee.id}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
            {statusNode && <div>{statusNode}</div>}

            {canManage && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="grid h-8 w-8 place-items-center rounded-lg text-ink-faint hover:bg-paper hover:text-ink transition-colors"
                    aria-label="Actions supplémentaires"
                  >
                    <MoreVertical size={16} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 p-1 rounded-xl border border-line bg-surface shadow-pop text-xs z-50">
                  {onEditClick && (
                    <DropdownMenuItem
                      onClick={onEditClick}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-paper-2 text-ink"
                    >
                      <Edit2 size={13} className="text-amber" />
                      <span>Modifier la fiche</span>
                    </DropdownMenuItem>
                  )}
                  {canPrintBadge && onBadgeClick && (
                    <DropdownMenuItem
                      onClick={onBadgeClick}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-paper-2 text-ink"
                    >
                      <Printer size={13} className="text-blue-500" />
                      <span>Imprimer le badge QR</span>
                    </DropdownMenuItem>
                  )}
                  {onToggleActive && (
                    <DropdownMenuItem
                      onClick={onToggleActive}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-paper-2 text-ink"
                    >
                      <span className={cx('h-2 w-2 rounded-full', employee.active ? 'bg-red' : 'bg-green')} />
                      <span>{employee.active ? 'Désactiver le compte' : 'Réactiver le compte'}</span>
                    </DropdownMenuItem>
                  )}
                  {onDeleteClick && (
                    <>
                      <DropdownMenuSeparator className="my-1 border-line" />
                      <DropdownMenuItem
                        onClick={onDeleteClick}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-red/10 text-red"
                      >
                        <Trash2 size={13} />
                        <span>Supprimer définitivement</span>
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* Ligne 2 : Détails techniques (Badge QR + Jours de travail) */}
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-line/60 bg-paper/50 p-2.5 text-xs">
          <div>
            <span className="block text-[10px] uppercase font-bold text-ink-faint">Badge QR</span>
            <span className="font-mono font-bold text-ink text-xs truncate block">
              {employee.badge_token ?? '—'}
            </span>
          </div>
          <div>
            <span className="block text-[10px] uppercase font-bold text-ink-faint">Jours ouvrés</span>
            <span className="text-ink-soft text-xs truncate block font-medium">
              {formatWorkdaysLabels(employee.workdays)}
            </span>
          </div>
        </div>
      </div>

      {/* Barre d'action tactile (Min 42px touch target) */}
      <div
        className="mt-3.5 pt-3 border-t border-line/60 flex items-center justify-between gap-2 pl-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClick}
          className="flex-1 inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-bold text-ink hover:border-amber/40 hover:text-amber active:scale-95 transition-all shadow-2xs"
        >
          Fiche complète
        </button>

        {canPrintBadge && onBadgeClick && (
          <button
            type="button"
            onClick={onBadgeClick}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink-soft hover:text-ink active:scale-95 transition-all shadow-2xs"
            title="Imprimer badge"
          >
            <Printer size={14} />
            <span className="hidden sm:inline">Badge</span>
          </button>
        )}

        {canManage && onEditClick && (
          <button
            type="button"
            onClick={onEditClick}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink-soft hover:text-ink active:scale-95 transition-all shadow-2xs"
            title="Modifier travailleur"
          >
            <Edit2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
