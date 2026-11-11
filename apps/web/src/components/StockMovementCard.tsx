import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, Scale, User } from 'lucide-react';
import type { StockMovement } from '../lib/api';
import { MOVE_LABEL, formatDateTime } from '../lib/labels';
import { cx } from './ui';

export interface StockMovementCardProps {
  movement: StockMovement;
  className?: string;
}

export function StockMovementCard({ movement, className }: StockMovementCardProps) {
  const isIncoming = movement.move_type === 'in';
  const isOutgoing = movement.move_type === 'out';
  const isTransfer = movement.move_type === 'transfer';

  return (
    <div
      className={cx(
        'group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-line/80 bg-surface-2 p-3.5 shadow-card transition-all',
        className,
      )}
    >
      {/* Liseré latéral */}
      <span
        className={cx(
          'absolute left-0 top-0 bottom-0 w-1.5 transition-colors',
          isIncoming ? 'bg-green' : isOutgoing ? 'bg-amber' : isTransfer ? 'bg-blue' : 'bg-ink-soft',
        )}
      />

      <div className="space-y-2.5 pl-1.5">
        {/* Ligne 1 : Type de mouvement + Quantité */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span
              className={cx(
                'grid h-7 w-7 shrink-0 place-items-center rounded-lg border text-xs',
                isIncoming
                  ? 'border-green/30 bg-green/10 text-green'
                  : isOutgoing
                    ? 'border-amber/30 bg-amber-wash text-amber'
                    : isTransfer
                      ? 'border-blue/30 bg-blue/10 text-blue'
                      : 'border-line bg-paper text-ink-soft',
              )}
            >
              {isIncoming ? (
                <ArrowDownLeft size={14} />
              ) : isOutgoing ? (
                <ArrowUpRight size={14} />
              ) : isTransfer ? (
                <ArrowRightLeft size={14} />
              ) : (
                <Scale size={14} />
              )}
            </span>
            <div>
              <span className="font-mono text-[10px] font-bold text-amber">{movement.ref_id}</span>
              <span className="block text-xs font-bold text-ink leading-tight truncate max-w-[170px] sm:max-w-none">
                {movement.ref_name}
              </span>
            </div>
          </div>

          <div className="text-right">
            <span
              className={cx(
                'font-mono text-sm font-extrabold tabular-nums block',
                isIncoming ? 'text-green' : isOutgoing ? 'text-amber' : 'text-blue',
              )}
            >
              {isIncoming ? `+${movement.qty}` : isOutgoing ? `-${movement.qty}` : movement.qty}{' '}
              <span className="text-[10px] font-normal text-ink-soft">{movement.unit}</span>
            </span>
            <span className="text-[10px] font-medium text-ink-faint">
              {MOVE_LABEL[movement.move_type] || movement.move_type}
            </span>
          </div>
        </div>

        {/* Ligne 2 : Détails (Bénéficiaire, Date, Auteur) */}
        <div className="rounded-xl border border-line/60 bg-paper/50 p-2 text-xs space-y-1">
          {movement.beneficiary && (
            <div className="flex items-center gap-1.5 text-ink">
              <User size={11} className="text-ink-faint shrink-0" />
              <span className="truncate">
                Bénéficiaire : <strong>{movement.beneficiary}</strong>
              </span>
            </div>
          )}

          {movement.target_magasin_name && (
            <div className="text-ink-soft text-[11px] truncate">
              Vers : <strong>{movement.target_magasin_name}</strong>
            </div>
          )}

          <div className="flex items-center justify-between text-[10px] pt-0.5 border-t border-line/40 text-ink-faint">
            <span>{formatDateTime(movement.created_at)}</span>
            {movement.actor && (
              <span className="truncate max-w-[120px]">Par {movement.actor}</span>
            )}
          </div>

          {movement.note && (
            <p className="text-[10px] text-ink-soft italic pt-0.5 truncate">
              « {movement.note} »
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
