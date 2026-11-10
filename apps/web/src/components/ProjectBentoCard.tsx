import {
  Calendar,
  Clock,
  AlertTriangle,
  Users,
  Edit2,
  Trash2,
  FileWarning,
} from 'lucide-react';
import type { Project } from '../lib/api';
import { cx } from './ui';

export interface ProjectBentoCardProps {
  project: Project;
  canEdit: boolean;
  canDelete: boolean;
  canReportIncident: boolean;
  currentEmployeeId: string | null;
  onEdit: (p: Project) => void;
  onDelete: (p: Project) => void;
  onIncident: (p: Project) => void;
}

export function ProjectBentoCard({
  project,
  canEdit,
  canDelete,
  canReportIncident,
  currentEmployeeId,
  onEdit,
  onDelete,
  onIncident,
}: ProjectBentoCardProps) {
  const isOverdue = Boolean(project.is_delayed);
  const hasOvertime = (project.overtime_hours ?? 0) > 0;
  const hasBudget = Number(project.budget_hours) > 0;
  const progressPct = Math.min(100, Math.max(0, project.hours_progress_pct || 0));

  const statusTheme = (() => {
    if (project.status === 'termine') {
      return {
        label: 'Terminé',
        pill: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400',
        dot: 'bg-emerald-400',
        borderAccent: 'border-l-emerald-500',
      };
    }
    if (project.status === 'en_pose') {
      return {
        label: 'Pose sur site',
        pill: 'border-blue-500/30 bg-blue-500/15 text-blue-400',
        dot: 'bg-blue-400',
        borderAccent: 'border-l-blue-500',
      };
    }
    if (isOverdue) {
      return {
        label: `Retard ${project.delayed_days}j`,
        pill: 'border-red-500/30 bg-red-500/15 text-red-400',
        dot: 'bg-red-400',
        borderAccent: 'border-l-red-500',
      };
    }
    return {
      label: 'Fabrication',
      pill: 'border-amber/30 bg-amber-wash text-amber',
      dot: 'bg-amber',
      borderAccent: 'border-l-amber',
    };
  })();

  const canWorkerReport =
    !canEdit &&
    canReportIncident &&
    currentEmployeeId &&
    project.assigned_worker_ids.includes(currentEmployeeId);

  return (
    <article
      className={cx(
        'group flex flex-col justify-between rounded-2xl border bg-surface-2 transition-all duration-200 overflow-hidden shadow-card hover:shadow-card-hover border-l-4',
        statusTheme.borderAccent,
        isOverdue ? 'border-red-500/40 hover:border-red-500/60' : 'border-line-strong hover:border-line-strong'
      )}
    >
      {/* 1. En-tête de la Fiche Bento */}
      <div className="p-4 sm:p-5 border-b border-line/60 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-paper border border-line text-ink shadow-xs">
              {project.code}
            </span>
            {project.category && (
              <span className="text-[10px] font-medium text-ink-soft px-2 py-0.5 rounded bg-surface border border-line">
                {project.category}
              </span>
            )}
          </div>

          <span
            className={cx(
              'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border shadow-xs tracking-tight shrink-0',
              statusTheme.pill
            )}
          >
            <span className={cx('h-1.5 w-1.5 rounded-full shrink-0', statusTheme.dot)} />
            <span>{statusTheme.label}</span>
          </span>
        </div>

        <div>
          <h3 className="text-sm sm:text-base font-bold text-ink leading-snug line-clamp-2">
            {project.title || 'Projet à compléter'}
          </h3>
          <p className="text-xs text-ink-soft mt-1 truncate">
            Client : <strong className="text-ink">{project.client_name || 'Non spécifié'}</strong>
            {project.site_location && (
              <span className="text-ink-faint"> · {project.site_location}</span>
            )}
          </p>
        </div>
      </div>

      {/* 2. Métriques & Délais (Contraste Élevé, zéro boîte noire imbriquée) */}
      <div className="p-4 sm:p-5 space-y-3.5 flex-1 bg-surface-2/60">
        {/* Heures & Progression */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-soft flex items-center gap-1">
              <Clock size={12} className="text-blue" />
              <span>Avancement heures :</span>
            </span>
            <span className={cx('font-mono font-bold', hasOvertime ? 'text-red-400' : 'text-ink')}>
              {project.spent_hours}h / {hasBudget ? `${project.budget_hours}h` : 'non fixé'}
            </span>
          </div>

          {hasBudget && (
            <div className="h-2 w-full bg-paper rounded-full overflow-hidden border border-line/60">
              <div
                className={cx('h-full rounded-full transition-all duration-300', hasOvertime ? 'bg-red-500' : 'bg-emerald-500')}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          )}

          <div className="flex items-center justify-between text-[11px] text-ink-faint">
            <span>{hasBudget ? `${Math.round(progressPct)}% réalisé` : 'Heures saisies'}</span>
            <span className={cx('font-semibold font-mono', hasOvertime ? 'text-red-400' : 'text-emerald-400')}>
              {hasOvertime
                ? `+${project.overtime_hours}h DÉPASSÉES`
                : hasBudget
                ? `${Number(project.budget_hours) - Number(project.spent_hours)}h restantes`
                : 'Budget libre'}
            </span>
          </div>
        </div>

        {/* Échéance contractuelle */}
        <div className="p-2.5 rounded-xl bg-surface border border-line flex items-center justify-between text-xs">
          <span className="text-ink-soft flex items-center gap-1.5">
            <Calendar size={13} className="text-amber" />
            <span>Échéance contractuelle :</span>
          </span>
          <span className={cx('font-mono font-bold', isOverdue ? 'text-red-400' : 'text-ink')}>
            {project.delivery_deadline ? (
              `${project.delivery_deadline} (${isOverdue ? `retard ${project.delayed_days}j` : `${project.days_to_deadline ?? 0}j restants`})`
            ) : (
              'À renseigner'
            )}
          </span>
        </div>

        {/* Coût estimé si retard ou dépassement */}
        {(hasOvertime || (project.ratio_delayed_workdays || 0) > 0) && (
          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-between text-xs text-red-400">
            <span className="font-semibold flex items-center gap-1.5">
              <AlertTriangle size={13} />
              <span>Impact financier estimé :</span>
            </span>
            <span className="font-mono font-extrabold text-sm">
              {(project.financial_damage_fcfa || 0).toLocaleString()} FCFA
            </span>
          </div>
        )}

        {/* Équipe d'artisans affectés */}
        <div className="pt-2 border-t border-line/60 text-xs">
          <div className="flex items-center justify-between text-[11px] text-ink-faint font-semibold mb-1.5">
            <span className="flex items-center gap-1.5 text-ink">
              <Users size={12} className="text-amber" />
              Artisans affectés
            </span>
            <span className="font-mono">{project.assigned_worker_names?.length || 0}</span>
          </div>

          {project.assigned_worker_names && project.assigned_worker_names.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {project.assigned_worker_names.map((name, i) => (
                <span
                  key={i}
                  className="inline-flex items-center px-2 py-0.5 rounded-md bg-surface text-ink text-[11px] font-medium border border-line truncate max-w-[150px]"
                >
                  {name}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-ink-faint italic">Aucun artisan affecté</p>
          )}
        </div>
      </div>

      {/* 3. Pied de Fiche Bento : Actions */}
      <div className="p-3 sm:px-4 border-t border-line/60 bg-surface flex items-center justify-between gap-2">
        <div>
          {canWorkerReport && (
            <button
              type="button"
              onClick={() => onIncident(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber/40 bg-amber-wash text-amber text-xs font-semibold hover:bg-amber/20 transition-colors cursor-pointer"
            >
              <FileWarning size={13} />
              <span>Signaler un imprévu</span>
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => onIncident(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line bg-surface-2 text-ink-soft hover:text-ink text-xs font-medium transition-colors cursor-pointer"
            >
              <FileWarning size={13} />
              <span>Imprévus</span>
            </button>
          )}
        </div>

        {(canEdit || canDelete) && (
          <div className="flex items-center gap-1">
            {canEdit && (
              <button
                type="button"
                onClick={() => onEdit(project)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-2 border border-line text-xs font-semibold text-ink hover:border-amber hover:text-amber transition-colors cursor-pointer"
                title="Modifier"
              >
                <Edit2 size={12} />
                <span>Modifier</span>
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={() => onDelete(project)}
                className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-surface-2 border border-line text-red-400 hover:bg-red-500/10 hover:border-red-500/40 transition-colors cursor-pointer"
                title="Supprimer"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
