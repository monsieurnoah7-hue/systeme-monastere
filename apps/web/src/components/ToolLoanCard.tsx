import { Clock, RotateCcw, User } from 'lucide-react';
import type { ToolLoan } from '../lib/api';
import { CONDITION_LABEL, formatDateTime } from '../lib/labels';
import { cx } from './ui';

export interface ToolLoanCardProps {
  loan: ToolLoan;
  onReturn?: () => void;
  canReturn?: boolean;
  className?: string;
}

export function ToolLoanCard({
  loan,
  onReturn,
  canReturn,
  className,
}: ToolLoanCardProps) {
  // Calcul du délai écoulé
  const outDate = new Date(loan.out_at);
  const now = new Date();
  const diffHours = Math.floor((now.getTime() - outDate.getTime()) / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  const isOverdue = diffDays >= 7;

  return (
    <div
      className={cx(
        'group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-line/80 bg-surface-2 p-4 shadow-card hover:border-amber/40 transition-all',
        isOverdue && 'border-amber/60',
        className,
      )}
    >
      {/* Liseré latéral */}
      <span
        className={cx(
          'absolute left-0 top-0 bottom-0 w-1.5 transition-colors',
          isOverdue ? 'bg-amber animate-pulse' : 'bg-blue',
        )}
      />

      <div className="space-y-3 pl-1.5">
        {/* Ligne 1 : Outil & Emprunteur */}
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-mono text-xs font-bold text-amber">{loan.tool_id}</span>
              <span className="rounded bg-paper px-1.5 py-0.2 text-[10px] font-bold text-ink-soft border border-line">
                Qté : {loan.qty}
              </span>
            </div>
            <h3 className="truncate text-sm font-bold text-ink mt-0.5">
              {loan.tool_name}
            </h3>
          </div>

          <span
            className={cx(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0',
              isOverdue ? 'bg-amber-wash text-amber border border-amber/30' : 'bg-paper text-ink-soft border border-line',
            )}
          >
            <Clock size={11} />
            <span>{diffDays > 0 ? `${diffDays}j` : `${diffHours}h`}</span>
          </span>
        </div>

        {/* Ligne 2 : Fiche Emprunteur & Date */}
        <div className="rounded-xl border border-line/60 bg-paper/50 p-2.5 text-xs space-y-1.5">
          <div className="flex items-center gap-2 text-ink">
            <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-amber-wash text-[10px] font-bold text-amber">
              <User size={12} />
            </div>
            <div className="min-w-0 flex-1">
              <span className="font-bold truncate block">{loan.employee_name}</span>
              <span className="font-mono text-[10px] text-ink-faint">{loan.employee_id}</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] pt-1 border-t border-line/40 text-ink-faint">
            <span>Sorti le : <strong>{formatDateTime(loan.out_at)}</strong></span>
            <span className="rounded bg-paper px-1.5 py-0.2 text-[9px] font-semibold text-ink-soft border border-line">
              État : {(loan.out_condition && loan.out_condition in CONDITION_LABEL
                ? CONDITION_LABEL[loan.out_condition as keyof typeof CONDITION_LABEL]
                : loan.out_condition) || 'Bon état'}
            </span>
          </div>

          {loan.motive && (
            <p className="text-[11px] text-ink-soft italic pt-0.5 truncate">
              « {loan.motive} »
            </p>
          )}
        </div>
      </div>

      {/* Barre d'action tactile (Restitution immédiate) */}
      {canReturn && onReturn && (
        <div className="mt-3.5 pt-3 border-t border-line/60 pl-1.5">
          <button
            type="button"
            onClick={onReturn}
            className="w-full inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-amber/40 bg-amber-wash px-3 py-2 text-xs font-bold text-amber hover:bg-amber hover:text-white active:scale-95 transition-all shadow-2xs"
          >
            <RotateCcw size={14} />
            <span>Restituer cette machine</span>
          </button>
        </div>
      )}
    </div>
  );
}
