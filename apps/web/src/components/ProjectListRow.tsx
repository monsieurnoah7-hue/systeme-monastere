import { useState } from 'react';
import {
  ChevronRight,
  Clock,
  Calendar,
  Users,
  AlertTriangle,
  Edit2,
  Trash2,
  FileWarning,
} from 'lucide-react';
import type { Project } from '../lib/api';
import { cx } from './ui';

export interface ProjectListRowProps {
  project: Project;
  canEdit: boolean;
  canDelete: boolean;
  canReportIncident: boolean;
  currentEmployeeId: string | null;
  onEdit: (p: Project) => void;
  onDelete: (p: Project) => void;
  onIncident: (p: Project) => void;
}

export function ProjectListRow({
  project,
  canEdit,
  canDelete,
  canReportIncident,
  currentEmployeeId,
  onEdit,
  onDelete,
  onIncident,
}: ProjectListRowProps) {
  const [expanded, setExpanded] = useState(false);

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
        'group rounded-xl border bg-surface-2 transition-all duration-150 overflow-hidden shadow-2xs',
        isOverdue ? 'border-red-500/40' : 'border-line hover:border-line-strong',
        expanded ? 'ring-1 ring-line-strong bg-surface-3/30' : 'hover:bg-surface-2/80',
        'border-l-4',
        statusTheme.borderAccent
      )}
    >
      {/* Ligne Maîtresse Compacte (Hauteur tactile optimisée) */}
      <div
        onClick={() => setExpanded((prev) => !prev)}
        className="flex items-center justify-between gap-2.5 p-3 sm:px-4 cursor-pointer select-none"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded((prev) => !prev);
          }
        }}
        aria-expanded={expanded}
        aria-label={`Détails commande ${project.code}`}
      >
        {/* Identifiant & Titre */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-paper border border-line text-ink shrink-0 tracking-tight shadow-xs">
            {project.code}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h4 className="text-xs sm:text-sm font-semibold text-ink truncate leading-tight">
                {project.title || 'Commande à compléter'}
              </h4>
              {project.category && (
                <span className="hidden md:inline-block px-1.5 py-0.2 rounded text-[10px] text-ink-faint bg-surface border border-line shrink-0">
                  {project.category}
                </span>
              )}
            </div>

            <p className="text-[11px] text-ink-soft truncate mt-0.5">
              <span className="text-ink font-medium">{project.client_name || 'Client non spécifié'}</span>
              {project.site_location && (
                <span className="text-ink-faint"> · {project.site_location}</span>
              )}
            </p>
          </div>
        </div>

        {/* Jauge d'heures synthétique (Visible sur tablettes & grands mobiles) */}
        <div className="hidden sm:flex flex-col items-end gap-1 shrink-0 w-32">
          <div className="flex items-center justify-between w-full text-[10px]">
            <span className="text-ink-faint">Heures :</span>
            <span className={cx('font-mono font-bold', hasOvertime ? 'text-red-400' : 'text-ink')}>
              {project.spent_hours}h / {hasBudget ? `${project.budget_hours}h` : '—'}
            </span>
          </div>
          {hasBudget && (
            <div className="h-1.5 w-full bg-paper rounded-full overflow-hidden border border-line/50">
              <div
                className={cx('h-full rounded-full transition-all', hasOvertime ? 'bg-red-500' : 'bg-emerald-500')}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          )}
        </div>

        {/* Statut & Dépliage */}
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={cx(
              'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border shadow-xs tracking-tight',
              statusTheme.pill
            )}
          >
            <span className={cx('h-1.5 w-1.5 rounded-full shrink-0', statusTheme.dot)} />
            <span>{statusTheme.label}</span>
          </span>

          <ChevronRight
            size={16}
            className={cx(
              'text-ink-faint transition-transform duration-200 shrink-0',
              expanded && 'rotate-90 text-amber'
            )}
          />
        </div>
      </div>

      {/* Accordéon Dépliable (Détails approfondis sur smartphone & tablette) */}
      {expanded && (
        <div className="border-t border-line/60 bg-paper-2/70 p-3 sm:p-4 space-y-3 animate-in fade-in duration-150">
          {/* Grille des Métriques Clés */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {/* Heures & Progression (Mobile) */}
            <div className="p-2.5 rounded-lg bg-surface border border-line">
              <div className="text-[10px] font-semibold uppercase text-ink-faint flex items-center gap-1">
                <Clock size={11} className="text-blue" />
                Budget Heures
              </div>
              <p className="mt-1 font-mono font-bold text-ink">
                {project.spent_hours} h <span className="text-ink-faint font-normal">/ {hasBudget ? `${project.budget_hours} h` : 'non fixé'}</span>
              </p>
              {hasBudget && (
                <div className="mt-1.5 h-1.5 w-full bg-paper rounded-full overflow-hidden">
                  <div
                    className={cx('h-full rounded-full', hasOvertime ? 'bg-red-500' : 'bg-emerald-500')}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              )}
            </div>

            {/* Échéance contractuelle */}
            <div className="p-2.5 rounded-lg bg-surface border border-line">
              <div className="text-[10px] font-semibold uppercase text-ink-faint flex items-center gap-1">
                <Calendar size={11} className="text-amber" />
                Échéance Livraison
              </div>
              <p className={cx('mt-1 font-mono font-bold', isOverdue ? 'text-red-400' : 'text-ink')}>
                {project.delivery_deadline || 'À renseigner'}
              </p>
              <p className="text-[10px] text-ink-faint mt-0.5">
                {isOverdue
                  ? `Retard de ${project.delayed_days} jours`
                  : project.days_to_deadline != null
                  ? `${project.days_to_deadline} j restants`
                  : 'Aucun retard'}
              </p>
            </div>

            {/* Fin estimée selon le planning */}
            <div className="p-2.5 rounded-lg bg-surface border border-line">
              <div className="text-[10px] font-semibold uppercase text-ink-faint">Fin Estimée Planning</div>
              <p className="mt-1 font-mono font-semibold text-ink">
                {project.planned_completion_date || 'Non planifiée'}
              </p>
              {project.schedule_at_risk && (
                <p className="text-[10px] text-red-400 font-semibold mt-0.5">Planning à risque</p>
              )}
            </div>

            {/* Impact financier si dépassement ou retard */}
            <div className="p-2.5 rounded-lg bg-surface border border-line">
              <div className="text-[10px] font-semibold uppercase text-ink-faint flex items-center gap-1">
                <AlertTriangle size={11} className={cx((project.financial_damage_fcfa || 0) > 0 ? 'text-red-400' : 'text-ink-faint')} />
                Impact Estimé
              </div>
              <p className={cx('mt-1 font-mono font-bold', (project.financial_damage_fcfa || 0) > 0 ? 'text-red-400' : 'text-emerald-400')}>
                {(project.financial_damage_fcfa || 0).toLocaleString()} FCFA
              </p>
              <p className="text-[10px] text-ink-faint mt-0.5 truncate">
                {(project.financial_damage_fcfa || 0) > 0
                  ? (project.penalties_cost_fcfa || 0) > 0 && (project.overtime_cost_fcfa || 0) > 0
                    ? `Retard + +${project.overtime_hours}h sup.`
                    : (project.penalties_cost_fcfa || 0) > 0
                    ? `Pénalité retard (${project.delayed_days || 0}j)`
                    : `+${project.overtime_hours}h dépassement`
                  : 'Budget respecté'}
              </p>
            </div>
          </div>

          {/* Équipe d'artisans affectés */}
          <div className="p-2.5 rounded-lg bg-surface border border-line text-xs">
            <div className="flex items-center justify-between text-[11px] font-semibold text-ink-faint mb-1.5">
              <span className="flex items-center gap-1.5 text-ink">
                <Users size={12} className="text-amber" />
                Artisans &amp; Postes affectés
              </span>
              <span className="font-mono text-[10px]">
                {project.assigned_worker_names?.length || 0} affecté(s)
              </span>
            </div>

            {project.assigned_worker_names && project.assigned_worker_names.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {project.assigned_worker_names.map((name, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center px-2 py-0.5 rounded-md bg-paper text-ink text-[11px] font-medium border border-line"
                  >
                    {name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-ink-faint italic">Aucun artisan affecté à cette commande.</p>
            )}
          </div>

          {/* Barre d'action basse (Tactile, boutons aérés) */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-line/40">
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
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line bg-surface text-ink-soft hover:text-ink text-xs font-medium transition-colors cursor-pointer"
                >
                  <FileWarning size={13} />
                  <span>Signalements &amp; Imprévus</span>
                </button>
              )}
            </div>

            {(canEdit || canDelete) && (
              <div className="flex items-center gap-1.5">
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => onEdit(project)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface border border-line text-xs font-semibold text-ink hover:border-amber hover:text-amber transition-colors cursor-pointer"
                    title="Modifier la commande"
                  >
                    <Edit2 size={12} />
                    <span>Modifier</span>
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => onDelete(project)}
                    className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-surface border border-line text-red-400 hover:bg-red-500/10 hover:border-red-500/40 transition-colors cursor-pointer"
                    title="Supprimer la commande"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
