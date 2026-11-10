import { useState, useMemo } from 'react';
import {
  Briefcase,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Users,
  Plus,
  Wrench,
  Search,
  Edit2,
  Trash2,
} from 'lucide-react';
import type { Project, ProjectsResponse, Employee, ProjectIncident, ProjectWorkPlanAllocation } from '../lib/api';
import { createProject, updateProject, deleteProject, fetchProjectIncidents, addProjectIncident, reviewProjectIncident } from '../lib/api';
import { Button, Card, Modal, Banner, Spinner, cx } from './ui';

export function ProjectsView({
  data,
  employees,
  canCreate,
  canEdit,
  canDelete,
  canReportIncident,
  currentEmployeeId,
  onRefresh,
}: {
  data: ProjectsResponse | null;
  employees: Employee[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canReportIncident: boolean;
  currentEmployeeId: string | null;
  onRefresh: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'production' | 'planning'>('production');
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<string>('all');
  const [filterDelayedOnly, setFilterDelayedOnly] = useState(false);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [form, setForm] = useState<Partial<Project>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [incidentProject, setIncidentProject] = useState<Project | null>(null);
  const [incidents, setIncidents] = useState<ProjectIncident[]>([]);
  const [incidentBusy, setIncidentBusy] = useState(false);
  const [incidentError, setIncidentError] = useState<string | null>(null);
  const [incidentQueued, setIncidentQueued] = useState(false);
  const [scheduleProject, setScheduleProject] = useState<Project | null>(null);
  const [scheduleRows, setScheduleRows] = useState<ProjectWorkPlanAllocation[]>([]);
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [incidentForm, setIncidentForm] = useState({ kind: 'power_outage' as ProjectIncident['kind'], description: '', delay_days: '0', event_date: new Date().toISOString().slice(0, 10), employee_id: '' });

  const projects = data?.projects ?? [];
  const summary = data?.summary;
  const configuredCategories = useMemo(
    () => Array.from(new Set(projects.map((project) => project.category?.trim()).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'fr')),
    [projects],
  );

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        p.code.toLowerCase().includes(q) ||
        (p.title ?? '').toLowerCase().includes(q) ||
        (p.client_name ?? '').toLowerCase().includes(q) ||
        (p.site_location ?? '').toLowerCase().includes(q);

      const matchesCat = filterCat === 'all' || p.category === filterCat;
      const matchesDelayed = !filterDelayedOnly || Boolean(p.is_delayed);
      return matchesSearch && matchesCat && matchesDelayed;
    });
  }, [projects, search, filterCat, filterDelayedOnly]);

  function openCreate() {
    setEditingProject(null);
    setForm({
      code: '',
      title: '',
      client_name: '',
      site_location: '',
      category: null,
      assigned_worker_ids: [],
      assigned_worker_names: [],
      penalty_rate_daily_fcfa: undefined,
      delivery_deadline: '',
      start_date: '',
      budget_hours: undefined,
      work_plan: [],
      status: 'planifie',
    });
    setError(null);
    setModalOpen(true);
  }

  function openEdit(p: Project) {
    setEditingProject(p);
    setForm({
      ...p,
      // PostgreSQL numeric values may arrive as strings; normalize them before
      // they are ever submitted to the number-validated API.
      budget_hours: p.budget_hours == null ? undefined : Number(p.budget_hours),
      penalty_rate_daily_fcfa: p.penalty_rate_daily_fcfa == null ? undefined : Number(p.penalty_rate_daily_fcfa),
    });
    setError(null);
    setModalOpen(true);
  }

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      const optionalNumber = (value: unknown): number | null => {
        if (value == null || value === '') return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      };
      const projectForm = {
        code: form.code?.trim() || null,
        title: form.title?.trim() || null,
        client_name: form.client_name?.trim() || null,
        site_location: form.site_location?.trim() || null,
        category: form.category?.trim() || null,
        start_date: form.start_date || null,
        delivery_deadline: form.delivery_deadline || null,
        budget_hours: optionalNumber(form.budget_hours),
        penalty_rate_daily_fcfa: optionalNumber(form.penalty_rate_daily_fcfa),
        assigned_worker_ids: form.assigned_worker_ids ?? [],
        assigned_worker_names: form.assigned_worker_names ?? [],
        work_plan: form.work_plan ?? [],
        status: form.status ?? 'planifie',
        notes: form.notes ?? null,
      };
      if (editingProject) {
        await updateProject(editingProject.id, projectForm);
      } else {
        await createProject(projectForm);
      }
      setModalOpen(false);
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur enregistrement');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(p: Project) {
    if (!confirm(`Supprimer définitivement la commande ${p.code} (${p.title || 'sans intitulé'}) ?`)) return;
    try {
      await deleteProject(p.id);
      onRefresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur suppression');
    }
  }

  async function saveSchedule() {
    if (!scheduleProject) return;
    setScheduleBusy(true);
    setScheduleError(null);
    try {
      await updateProject(scheduleProject.id, { work_plan: scheduleRows });
      setScheduleProject(null);
      onRefresh();
    } catch (e) {
      setScheduleError(e instanceof Error ? e.message : 'Impossible d’enregistrer la répartition.');
    } finally {
      setScheduleBusy(false);
    }
  }

  async function openIncidentLog(project: Project) {
    setIncidentProject(project);
    setIncidents([]);
    setIncidentError(null);
    setIncidentQueued(false);
    setIncidentForm({ kind: 'power_outage', description: '', delay_days: '0', event_date: new Date().toISOString().slice(0, 10), employee_id: '' });
    try {
      setIncidents(await fetchProjectIncidents(project.id));
    } catch (e) {
      setIncidentError(e instanceof Error ? e.message : 'Impossible de charger les imprévus.');
    }
  }

  async function handleAddIncident() {
    if (!incidentProject || incidentForm.description.trim().length < 3) return;
    setIncidentBusy(true);
    try {
      const result = await addProjectIncident(incidentProject.id, {
        kind: incidentForm.kind,
        description: incidentForm.description.trim(),
        delay_days: Number(incidentForm.delay_days) || 0,
        employee_ids: [],
        excluded_from_accountability: false,
        event_date: incidentForm.event_date,
      });
      if (result.queued) {
        setIncidentQueued(true);
      } else if (result.incident) {
        setIncidents((current) => [result.incident!, ...current]);
        onRefresh();
      }
      setIncidentForm((current) => ({ ...current, description: '', delay_days: '0' }));
    } catch (e) {
      setIncidentError(e instanceof Error ? e.message : 'Impossible d’enregistrer l’imprévu.');
    } finally {
      setIncidentBusy(false);
    }
  }

  async function handleReviewIncident(incident: ProjectIncident, decision: 'approved' | 'rejected') {
    if (!incidentProject) return;
    const note = decision === 'rejected' ? window.prompt('Motif du refus (obligatoire) :') : '';
    if (decision === 'rejected' && (!note || !note.trim())) return;
    setIncidentBusy(true);
    setIncidentError(null);
    try {
      const updated = await reviewProjectIncident(incidentProject.id, incident.id, decision, note?.trim());
      setIncidents((current) => current.map((item) => item.id === updated.id ? updated : item));
      onRefresh();
    } catch (e) {
      setIncidentError(e instanceof Error ? e.message : 'Impossible de traiter le signalement.');
    } finally {
      setIncidentBusy(false);
    }
  }

  function toggleWorkerAssignment(emp: Employee) {
    const curIds = form.assigned_worker_ids || [];
    const curNames = form.assigned_worker_names || [];
    const exists = curIds.includes(String(emp.id));

    if (exists) {
      const idx = curIds.indexOf(String(emp.id));
      const nextIds = curIds.filter((_, i) => i !== idx);
      const nextNames = curNames.filter((_, i) => i !== idx);
      setForm((f) => ({ ...f, assigned_worker_ids: nextIds, assigned_worker_names: nextNames }));
    } else {
      setForm((f) => ({
        ...f,
        assigned_worker_ids: [...curIds, String(emp.id)],
        assigned_worker_names: [...curNames, emp.full_name],
      }));
    }
  }

  return (
    <div className="space-y-6">
      {/* Synthèse courte : une seule hiérarchie, sans compétition de couleurs */}
      <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-xs" aria-label="Synthèse des projets">
        <div className="grid grid-cols-2 gap-px bg-line md:grid-cols-3">
          <div className="bg-surface p-3 sm:p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Impact financier estimé</p>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-ink">
              {(summary?.total_financial_damage_fcfa ?? 0).toLocaleString()} <span className="text-xs font-normal text-ink-faint">FCFA</span>
            </p>
            <p className="mt-1 text-xs text-ink-soft">Heures hors budget et pénalités calculées.</p>
          </div>
          <div className="bg-surface p-3 sm:p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Heures hors budget</p>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-ink">
              +{(summary?.total_overtime_hours ?? 0).toLocaleString()} <span className="text-xs font-normal text-ink-faint">heures</span>
            </p>
            <p className="mt-1 text-xs text-ink-soft">Écart entre le réalisé et le budget projet.</p>
          </div>
          <div className="col-span-2 bg-surface p-3 sm:p-5 md:col-span-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Délais à surveiller</p>
            <div className="mt-2 flex items-baseline gap-2">
              <p className="font-mono text-2xl font-semibold tabular-nums text-ink">{summary?.delayed_count ?? 0}</p>
              <span className="text-xs text-ink-faint">sur {summary?.active_count ?? 0} projets actifs</span>
            </div>
            <p className="mt-1 text-xs text-ink-soft">{summary?.delayed_count ? 'Une décision de la Direction est requise.' : 'Aucun retard détecté.'}</p>
          </div>
        </div>
      </section>

      {/* Commandes persistantes : onglets, action principale, recherche et filtres.
          Ces éléments restent des enfants directs de la page afin que le sticky
          soit borné par toute la zone de contenu, pas par ce seul bandeau. */}
        {/* Navigation Onglets : Production Atelier vs Planning Chantiers de Pose */}
        <div className="sticky top-0 z-20 -mx-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-1 border-y border-line bg-paper/95 px-3 py-2 shadow-sm backdrop-blur sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:flex lg:items-center lg:justify-between lg:border-y-0 lg:bg-transparent lg:px-0 lg:py-0 lg:shadow-none lg:backdrop-blur-none">
        <div className="col-span-2 grid w-full grid-cols-2 gap-1 rounded-xl border border-line bg-paper-2/50 p-1 lg:col-span-1 lg:inline-flex lg:w-auto">
          <button
            type="button"
            onClick={() => setActiveTab('production')}
            className={cx(
              'flex min-w-0 items-center justify-center gap-2 rounded-lg px-2.5 py-2 text-center text-xs font-semibold leading-tight transition-all cursor-pointer lg:whitespace-nowrap',
              activeTab === 'production'
                ? 'bg-ink text-paper shadow-xs'
                : 'text-ink-soft hover:bg-surface hover:text-ink'
            )}
          >
            <Wrench size={15} />
            <span>Suivi Commandes &amp; Artisans ({projects.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('planning')}
            className={cx(
              'flex min-w-0 items-center justify-center gap-2 rounded-lg px-2.5 py-2 text-center text-xs font-semibold leading-tight transition-all cursor-pointer lg:whitespace-nowrap',
              activeTab === 'planning'
                ? 'bg-ink text-paper shadow-xs'
                : 'text-ink-soft hover:bg-surface hover:text-ink'
            )}
          >
            <Calendar size={15} />
            <span>Charge hebdomadaire</span>
          </button>
        </div>

        {canCreate && (
          <Button
            size="sm"
            variant="primary"
            icon={<Plus size={14} />}
            onClick={openCreate}
            className="!h-full !min-h-[48px] w-auto !bg-ink !text-paper hover:!bg-surface-3 hover:!text-ink lg:!h-8 lg:!min-h-0 lg:w-auto"
          >
            <span className="sm:hidden">Nouveau</span>
            <span className="hidden sm:inline">Nouvelle commande / projet</span>
          </Button>
        )}
        </div>

        {/* Barre de Recherche & Filtres */}
        <div className="sticky top-[68px] z-10 -mx-3 flex flex-col gap-2 border-y border-line bg-paper/95 px-3 py-2.5 shadow-sm backdrop-blur sm:top-[64px] sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:flex-row lg:items-center lg:justify-between lg:border-y-0 lg:bg-transparent lg:px-0 lg:py-0 lg:shadow-none lg:backdrop-blur-none">
        <div className="relative w-full min-w-0 lg:max-w-sm lg:flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            type="text"
            placeholder="Rechercher n° commande, client, lieu..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-lg border border-line bg-paper-2/50 pl-9 pr-3 text-sm text-ink focus:border-ink focus:outline-none"
          />
        </div>

          <div className="flex w-full min-w-0 flex-col gap-2 pb-1 sm:flex-row sm:items-center lg:w-auto lg:justify-end">
            <label className="sr-only" htmlFor="project-category-filter">Filtrer les projets par catégorie</label>
            <select
              id="project-category-filter"
              value={filterCat}
              onChange={(event) => setFilterCat(event.target.value)}
              className="h-10 w-full min-w-0 rounded-lg border border-line bg-surface px-3 text-sm text-ink focus:border-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink sm:min-w-48 lg:w-56"
            >
              <option value="all">Toutes les catégories</option>
              {configuredCategories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          <button
            type="button"
            onClick={() => setFilterDelayedOnly((v) => !v)}
            className={cx(
              'shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold transition-all cursor-pointer',
              filterDelayedOnly
                ? 'bg-ink text-paper border-ink shadow-xs'
                : 'bg-transparent text-ink-soft hover:bg-surface border-line'
            )}
          >
            En retard uniquement
          </button>
        </div>
        </div>

      {/* =========================================================================
          TAB 1 : SUIVI DES PROJETS ET DES HEURES
      ========================================================================= */}
      {activeTab === 'production' && (
        <div className="space-y-4">
          {filteredProjects.length === 0 ? (
            <Card className="p-8 text-center text-xs text-ink-soft">
              <Briefcase size={32} className="mx-auto text-ink-faint mb-2" />
              <p className="font-bold text-ink">{projects.length === 0 ? 'Aucun projet configuré' : 'Aucun projet correspondant'}</p>
              <p className="mt-1">
                {projects.length === 0
                  ? canCreate ? 'Ajoutez le premier projet pour commencer le suivi.' : 'La Direction n’a encore configuré aucun projet.'
                  : 'Modifiez la recherche ou les filtres pour élargir les résultats.'}
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredProjects.map((p) => {
                const isOverdue = p.is_delayed;
                const hasOvertime = (p.overtime_hours ?? 0) > 0;
                const hasBudget = Number(p.budget_hours) > 0;
                const needsConfiguration = !p.title?.trim() || !p.client_name?.trim() || !p.site_location?.trim() || !p.delivery_deadline || !hasBudget;

                return (
                  <div
                    key={p.id}
                    className={cx(
                      'flex min-w-0 flex-col justify-between overflow-hidden rounded-2xl border bg-surface p-5 shadow-xs transition-all hover:border-line-strong hover:shadow-card space-y-4',
                      isOverdue ? 'border-l-2 border-l-red-500' : 'border-line'
                    )}
                  >
                    <div>
                      {/* En-tête : Code Commande + Statut + Deadline */}
                      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="rounded-md border border-line bg-paper-2 px-2 py-1 font-mono text-[11px] font-semibold tracking-wide text-ink">
                              {p.code}
                            </span>
                            {p.category ? (
                              <span className="rounded-md border border-line bg-transparent px-1.5 py-1 text-[10px] font-medium text-ink-soft">
                                {p.category}
                              </span>
                            ) : null}
                          </div>
                          <h4 className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-ink">
                            {p.title || 'Projet à compléter'}
                          </h4>
                          <p className="mt-1 flex items-center gap-1 truncate text-xs text-ink-faint">
                            <span>Client : <strong>{p.client_name || 'à renseigner'}</strong></span>
                            <span>•</span>
                            <span className="truncate">{p.site_location || 'Lieu à renseigner'}</span>
                          </p>
                        </div>

                        <span
                          className={cx(
                            'max-w-full shrink-0 self-start truncate rounded-full border px-2.5 py-1 text-[10px] font-semibold sm:max-w-[45%]',
                            p.status === 'termine'
                              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : p.status === 'en_pose'
                              ? 'border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                              : isOverdue
                              ? 'border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400'
                              : 'border-line bg-paper-2 text-ink-soft'
                          )}
                        >
                          {p.status === 'termine'
                            ? 'Terminé'
                            : needsConfiguration
                            ? 'À compléter'
                            : p.status === 'en_pose'
                            ? 'Pose sur site'
                            : isOverdue
                            ? `Retard ${p.delayed_days}j`
                            : 'Fabrication'}
                        </span>
                      </div>

                      {/* Artisans assignés (Menuisiers de l'atelier) */}
                      <div className="mt-4 rounded-xl border border-line bg-paper-2/40 p-3 text-xs">
                        <div className="flex items-center justify-between text-[11px] text-ink-faint font-semibold mb-1">
                          <span className="flex items-center gap-1">
                            <Users size={12} className="text-amber" />
                            Artisans / Postes affectés
                          </span>
                          <span>{p.assigned_worker_names?.length || 0} ouvrier(s)</span>
                        </div>
                        {p.assigned_worker_names && p.assigned_worker_names.length > 0 ? (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {p.assigned_worker_names.map((name, i) => (
                              <span
                                key={i}
                                className="rounded-md bg-surface px-2 py-0.5 text-[10px] font-bold text-ink border border-line truncate max-w-40"
                              >
                                {name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[10px] text-ink-faint italic">Aucun artisan affecté</p>
                        )}
                      </div>

                        {/* Budget configuré pour ce projet */}
                      <div className="mt-4 space-y-2.5 text-xs">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-ink-soft">
                            {hasBudget
                              ? <>Heures : <strong>{p.spent_hours} h</strong> / {p.budget_hours} h prévues</>
                              : <>Heures saisies : <strong>{p.spent_hours} h</strong></>}
                          </span>
                          <span
                            className={cx(
                              'font-mono font-bold',
                              hasOvertime ? 'text-red-600 dark:text-red-400' : 'text-emerald-600'
                            )}
                          >
                            {hasOvertime ? `+${p.overtime_hours} h DÉPASSÉES` : hasBudget ? `${Number(p.budget_hours) - Number(p.spent_hours)} h restantes` : 'Budget à définir'}
                          </span>
                        </div>

                        {/* Barre de progression des heures */}
                        {hasBudget && <div className="h-1.5 w-full overflow-hidden rounded-full bg-paper-2">
                          <div
                            className={cx(
                              'h-full rounded-full transition-all',
                              hasOvertime ? 'bg-red-500' : 'bg-emerald-500'
                            )}
                            style={{ width: `${Math.min(100, p.hours_progress_pct || 0)}%` }}
                          />
                        </div>}

                        {/* Décompte Deadline de Livraison Contractuelle */}
                        <div className="flex items-center justify-between rounded-lg border border-line bg-paper-2/40 p-2.5 text-[11px]">
                          <span className="text-ink-faint flex items-center gap-1">
                            <Calendar size={12} />
                            Délai contractuel :
                          </span>
                          <span
                            className={cx(
                              'font-mono font-bold',
                              isOverdue ? 'text-red-600 dark:text-red-400' : 'text-ink'
                            )}
                          >
                            {p.delivery_deadline
                              ? `${p.delivery_deadline} (${isOverdue ? `dépassé de ${p.delayed_days} j` : `${p.days_to_deadline} j ouvrés restants`})`
                              : 'À définir · aucun retard calculé'}
                          </span>
                        </div>
                        {p.planned_completion_date && <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-paper-2/40 p-2.5 text-[11px]">
                          <span className="text-ink-faint flex items-center gap-1"><Clock size={12} />Fin estimée selon le planning :</span>
                          <span className={cx('font-mono font-bold', p.schedule_at_risk ? 'text-red' : 'text-ink')}>{p.planned_completion_date}</span>
                        </div>}

                        {/* Estimation du coût projet; aucune retenue sur salaire n’est effectuée. */}
                        {(hasOvertime || (p.ratio_delayed_workdays || 0) > 0) && (
                          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-2 text-[11px] flex items-center justify-between text-red-600 dark:text-red-400">
                            <span className="font-semibold flex items-center gap-1">
                              <AlertTriangle size={12} />
                              Impact estimé · hors paie :
                            </span>
                            <span className="font-mono font-extrabold text-xs">
                              {(p.financial_damage_fcfa || 0).toLocaleString()} FCFA
                            </span>
                          </div>
                        )}
                        {hasOvertime && !p.accountability_data_complete && (
                          <p className="text-[10px] text-ink-faint">Ventilation par exécutant incomplète : l’impact imputable attend les heures individuelles.</p>
                        )}
                      </div>
                    </div>

                    {/* Actions Card */}
                    <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
                      {!canEdit && canReportIncident && currentEmployeeId && p.assigned_worker_ids.includes(currentEmployeeId) && <button type="button" onClick={() => void openIncidentLog(p)} className="rounded-lg border border-line px-3 py-2 text-[11px] font-semibold text-ink-soft hover:bg-paper-2 hover:text-ink">
                        Signaler un imprévu
                      </button>}
                      {canEdit && <button type="button" onClick={() => void openIncidentLog(p)} className="rounded-lg border border-line px-3 py-2 text-[11px] font-semibold text-ink-soft hover:bg-paper-2 hover:text-ink">Voir les signalements</button>}

                      {(canEdit || canDelete) && (
                        <div className="flex items-center gap-1">
                          {canEdit && <button
                            type="button"
                            onClick={() => openEdit(p)}
                            className="p-1.5 rounded-lg text-ink-soft hover:bg-surface-2 hover:text-ink transition-colors cursor-pointer"
                            title="Modifier"
                          >
                            <Edit2 size={13} />
                          </button>}
                          {canDelete && <button
                            type="button"
                            onClick={() => handleDelete(p)}
                            className="p-1.5 rounded-lg text-red/70 hover:bg-red-wash hover:text-red transition-colors cursor-pointer"
                            title="Supprimer"
                          >
                            <Trash2 size={13} />
                          </button>}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'planning' && (
        <section className="space-y-3" aria-label="Charge hebdomadaire des projets">
          <div className="rounded-xl border border-line bg-surface p-4">
            <h3 className="font-semibold text-ink">Répartition du budget par jour ouvré</h3>
            <p className="mt-1 text-xs text-ink-soft">Définissez les heures prévues par personne et par jour. Les repos et jours fériés sont sautés automatiquement dans la date de fin estimée.</p>
          </div>
          {filteredProjects.length === 0 ? <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-ink-soft">Aucun projet correspondant.</p> : (
            <div className="grid gap-3 xl:grid-cols-2">
              {filteredProjects.map((p) => (
                <article key={p.id} className="rounded-xl border border-line bg-surface p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-semibold text-ink-soft">{p.code}</p>
                      <h4 className="mt-1 font-semibold text-ink">{p.title || 'Projet à compléter'}</h4>
                      <p className="mt-1 text-xs text-ink-soft">{p.assigned_worker_names?.join(', ') || 'Aucun exécutant affecté'}</p>
                    </div>
                    {canEdit && <Button size="sm" variant="secondary" disabled={!p.assigned_worker_ids?.length} onClick={() => {
                      setScheduleProject(p);
                      setScheduleRows(Array.isArray(p.work_plan) ? p.work_plan.map((row) => ({ ...row })) : []);
                      setScheduleError(null);
                    }}>Répartir les heures</Button>}
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div><p className="text-xs text-ink-faint">Budget total</p><p className="mt-1 font-mono font-semibold text-ink">{Number(p.budget_hours) > 0 ? `${p.budget_hours} h` : 'À définir'}</p></div>
                    <div><p className="text-xs text-ink-faint">Prévu / semaine</p><p className="mt-1 font-mono font-semibold text-ink">{p.planned_weekly_hours ?? 0} h</p></div>
                    <div><p className="text-xs text-ink-faint">Fin estimée</p><p className="mt-1 font-mono font-semibold text-ink">{p.planned_completion_date || 'À planifier'}</p></div>
                    <div><p className="text-xs text-ink-faint">Échéance</p><p className={cx('mt-1 font-mono font-semibold', p.schedule_at_risk ? 'text-red' : 'text-ink')}>{p.delivery_deadline || 'À définir'}</p></div>
                  </div>
                  {p.schedule_at_risk && <p className="mt-3 rounded-lg border border-amber/30 bg-amber-wash p-2 text-xs text-amber">Avec cette répartition, le budget serait terminé après la date de livraison.</p>}
                  {(!p.work_plan?.length) && <p className="mt-3 text-xs text-ink-faint">Aucune répartition hebdomadaire configurée.</p>}
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* =========================================================================
          MODAL PROJET / COMMANDE (Création / Modification)
      ========================================================================= */}
      <Modal
        open={modalOpen}
        title={editingProject ? `Modifier Commande : ${editingProject.code}` : 'Créer une Nouvelle Commande / Projet'}
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Annuler</Button>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => void handleSave()}
              className="!bg-ink !text-paper hover:!bg-surface-3 hover:!text-ink"
            >
              {busy ? <Spinner /> : 'Enregistrer le projet'}
            </Button>
          </>
        }
      >
        <div className="space-y-3.5 text-xs">
          {error && <Banner tone="error">{error}</Banner>}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block font-semibold text-ink">Code commande</label>
              <input
                type="text"
                value={form.code || ''}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="Auto si vide"
                className="h-10 w-full rounded-lg border border-line bg-surface px-3 font-mono font-bold text-xs text-ink focus:border-amber focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block font-semibold text-ink">Type de projet</label>
              <input
                type="text"
                value={form.category || ''}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value || null }))}
                placeholder="Ex. mobilier"
                className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-xs text-ink focus:border-amber focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block font-semibold text-ink">Intitulé de la commande</label>
            <input
              type="text"
              value={form.title || ''}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Ex. 12 portes en iroko"
              className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-xs text-ink focus:border-amber focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block font-semibold text-ink">Nom du client</label>
              <input
                type="text"
                value={form.client_name || ''}
                onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))}
                placeholder="Ex. Paroisse"
                className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-xs text-ink focus:border-amber focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block font-semibold text-ink">Lieu du chantier</label>
              <input
                type="text"
                value={form.site_location || ''}
                onChange={(e) => setForm((f) => ({ ...f, site_location: e.target.value }))}
                placeholder="Ex. Yaoundé"
                className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-xs text-ink focus:border-amber focus:outline-none"
              />
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface-2/40 p-3 space-y-2.5">
            <p className="font-bold text-ink flex items-center gap-1.5"><Clock size={14} className="text-amber" />Budget et référence d’impact</p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <label className="text-[11px] font-medium text-ink-soft"><span className="block min-h-8">Budget prévu (heures)</span>
                <input type="number" min="0.5" step="0.5" value={form.budget_hours && form.budget_hours > 0 ? form.budget_hours : ''} onChange={(e) => setForm((f) => ({ ...f, budget_hours: e.target.value === '' ? undefined : Number(e.target.value) }))} placeholder="Ex. 120" className="mt-1 h-10 w-full rounded-lg border border-line bg-surface px-3 font-mono text-sm text-ink focus:border-amber focus:outline-none" />
              </label>
              <label className="text-[11px] font-medium text-ink-soft"><span className="block min-h-8">Impact par heure dépassée (FCFA)</span>
                <input type="number" min="0" step="500" value={form.penalty_rate_daily_fcfa ?? ''} onChange={(e) => setForm((f) => ({ ...f, penalty_rate_daily_fcfa: e.target.value === '' ? undefined : Number(e.target.value) }))} placeholder="Ex. 10 000" className="mt-1 h-10 w-full rounded-lg border border-line bg-surface px-3 font-mono text-sm text-ink focus:border-amber focus:outline-none" />
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface-2/40 p-3">
            <p className="mb-3 font-bold text-ink flex items-center gap-1.5"><Calendar size={14} className="text-amber" />Dates du projet</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-[11px] font-medium text-ink-soft"><span className="block min-h-5">Début prévu</span>
                <input type="date" value={form.start_date || ''} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink focus:border-amber focus:outline-none" />
              </label>
              <label className="text-[11px] font-medium text-ink-soft"><span className="block min-h-5">Date limite de livraison</span>
                <input type="date" value={form.delivery_deadline || ''} onChange={(e) => setForm((f) => ({ ...f, delivery_deadline: e.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-amber/50 bg-surface px-3 text-sm text-ink focus:border-amber focus:outline-none" />
              </label>
            </div>
          </div>

          {/* Affectation des Artisans */}
          <div>
            <label className="mb-1.5 block font-semibold text-ink">Artisans &amp; Menuisiers affectés au projet</label>
            <div className="max-h-36 overflow-y-auto scroll-thin rounded-xl border border-line p-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5 bg-paper/60">
              {employees.map((emp) => {
                const isSelected = form.assigned_worker_ids?.includes(String(emp.id));
                return (
                  <button
                    type="button"
                    key={emp.id}
                    onClick={() => toggleWorkerAssignment(emp)}
                    className={cx(
                      'p-1.5 rounded-lg text-left text-[11px] font-semibold border transition-all cursor-pointer flex items-center justify-between',
                      isSelected
                        ? 'bg-amber text-white border-amber shadow-xs'
                        : 'bg-surface text-ink-soft border-line hover:bg-surface-2'
                    )}
                  >
                    <span className="truncate">{emp.full_name}</span>
                    {isSelected && <CheckCircle2 size={12} />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!scheduleProject}
        title={`Répartition hebdomadaire · ${scheduleProject?.code ?? ''}`}
        onClose={() => setScheduleProject(null)}
        footer={<><Button variant="ghost" onClick={() => setScheduleProject(null)}>Annuler</Button><Button variant="primary" disabled={scheduleBusy} onClick={() => void saveSchedule()}>{scheduleBusy ? <Spinner /> : 'Enregistrer le planning'}</Button></>}
      >
        <div className="space-y-3 text-sm">
          <p className="rounded-lg border border-line bg-paper-2/50 p-3 text-xs text-ink-soft">Attribuez les heures prévues par personne et par jour de semaine. Le total de tous les projets d’une personne ne peut pas dépasser sa capacité journalière définie dans sa fiche. Les jours fériés sont ignorés dans la prévision.</p>
          {scheduleError && <Banner tone="error">{scheduleError}</Banner>}
          {scheduleRows.map((row, index) => {
            const worker = employees.find((employee) => String(employee.id) === row.employee_id);
            const workdays = worker?.workdays?.length ? worker.workdays : [1, 2, 3, 4, 5, 6];
            return <div key={index} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 rounded-lg border border-line p-2 sm:grid-cols-[minmax(0,1fr)_minmax(6rem,0.7fr)_5rem_auto]">
              <label className="col-span-2 min-w-0 text-[11px] text-ink-soft sm:col-span-1">Travailleur
                <select value={row.employee_id} onChange={(e) => setScheduleRows((rows) => rows.map((item, i) => i === index ? { ...item, employee_id: e.target.value, weekday: employees.find((employee) => String(employee.id) === e.target.value)?.workdays?.[0] ?? 1 } : item))} className="mt-1 h-10 w-full min-w-0 rounded-lg border border-line bg-surface px-2 text-xs text-ink">
                  {scheduleProject?.assigned_worker_ids.map((id, i) => <option key={id} value={id}>{scheduleProject.assigned_worker_names[i] || employees.find((employee) => String(employee.id) === id)?.full_name || id}</option>)}
                </select>
              </label>
              <label className="text-[11px] text-ink-soft">Jour ouvré
                <select value={row.weekday} onChange={(e) => setScheduleRows((rows) => rows.map((item, i) => i === index ? { ...item, weekday: Number(e.target.value) } : item))} className="mt-1 h-10 w-full rounded-lg border border-line bg-surface px-2 text-xs text-ink">
                  {workdays.map((day) => <option key={day} value={day}>{['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'][day]}</option>)}
                </select>
              </label>
              <label className="text-[11px] text-ink-soft">Heures
                <input type="number" min="0.5" max="24" step="0.5" value={row.planned_hours} onChange={(e) => setScheduleRows((rows) => rows.map((item, i) => i === index ? { ...item, planned_hours: Number(e.target.value) } : item))} className="mt-1 h-10 w-full rounded-lg border border-line bg-surface px-2 font-mono text-sm text-ink" />
              </label>
              <button type="button" aria-label="Retirer cette ligne" onClick={() => setScheduleRows((rows) => rows.filter((_, i) => i !== index))} className="h-10 rounded-lg px-2 text-ink-faint hover:bg-red-wash hover:text-red">×</button>
            </div>;
          })}
          {scheduleRows.length === 0 && <p className="rounded-lg border border-dashed border-line p-4 text-center text-xs text-ink-faint">Aucune heure planifiée pour le moment.</p>}
          <Button variant="secondary" onClick={() => {
            const id = scheduleProject?.assigned_worker_ids[0];
            if (!id) return;
            const worker = employees.find((employee) => String(employee.id) === id);
            setScheduleRows((rows) => [...rows, { employee_id: id, weekday: worker?.workdays?.[0] ?? 1, planned_hours: Math.min(4, worker?.daily_work_hours ?? 8) }]);
          }} disabled={!scheduleProject?.assigned_worker_ids.length}>Ajouter une répartition</Button>
        </div>
      </Modal>

      <Modal
        open={!!incidentProject}
        title={`${canEdit ? 'Signalements à examiner' : 'Signaler un imprévu'} · ${incidentProject?.code ?? ''}`}
        onClose={() => setIncidentProject(null)}
        footer={<><Button variant="ghost" onClick={() => setIncidentProject(null)}>Fermer</Button>{!canEdit && <Button variant="primary" disabled={incidentBusy || !incidentForm.description.trim()} onClick={() => void handleAddIncident()}>{incidentBusy ? <Spinner /> : 'Envoyer le signalement'}</Button>}</>}
      >
        <div className="space-y-4 text-sm">
          {!canEdit && <p className="rounded-lg border border-line bg-paper-2/50 p-3 text-xs text-ink-soft">Votre déclaration sera horodatée et transmise à la Direction. Elle ne modifie pas le délai du projet avant validation.</p>}
          {incidentError && <Banner tone="error">{incidentError}</Banner>}
          {incidentQueued && <Banner tone="info">Signalement conservé sur cet appareil. Il sera transmis et contrôlé à la reconnexion.</Banner>}
          {!canEdit && <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-ink-soft">Type d’imprévu
              <select value={incidentForm.kind} onChange={(e) => setIncidentForm((f) => ({ ...f, kind: e.target.value as ProjectIncident['kind'] }))} className="mt-1 h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink">
                <option value="power_outage">Coupure d’électricité</option><option value="scope_change">Travaux supplémentaires</option><option value="justified_absence">Absence justifiée</option><option value="work_accident">Accident de travail</option><option value="other">Autre imprévu</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-ink-soft">Date de l’événement
              <input type="date" value={incidentForm.event_date} onChange={(e) => setIncidentForm((f) => ({ ...f, event_date: e.target.value }))} className="mt-1 h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink" />
            </label>
            <label className="text-xs font-semibold text-ink-soft">Jours ouvrés perdus
              <input type="number" min="0" max="365" step="1" value={incidentForm.delay_days} onChange={(e) => setIncidentForm((f) => ({ ...f, delay_days: e.target.value }))} className="mt-1 h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink" />
            </label>
          </div>}
          {!canEdit && <label className="block text-xs font-semibold text-ink-soft">Description
            <textarea value={incidentForm.description} onChange={(e) => setIncidentForm((f) => ({ ...f, description: e.target.value }))} rows={2} maxLength={500} className="mt-1 w-full rounded-lg border border-line bg-surface p-3 text-sm text-ink" placeholder="Ex. panne du générateur, période et justificatif…" />
          </label>}
          <section className="border-t border-line pt-3" aria-label="Historique des imprévus">
            <h3 className="font-semibold text-ink">{canEdit ? 'À traiter et historique' : 'Mes signalements'}</h3>
            {incidents.length === 0 ? <p className="mt-2 text-xs text-ink-faint">Aucun signalement enregistré.</p> : <ul className="mt-2 space-y-2">{incidents.map((incident) => <li key={incident.id} className="rounded-lg border border-line p-3 text-xs"><div className="flex flex-wrap justify-between gap-2 font-semibold text-ink"><span>{incident.kind.replaceAll('_', ' ')}</span><span>{incident.delay_days} j · {incident.review_status === 'pending' ? 'En attente' : incident.review_status === 'approved' ? 'Accepté' : 'Refusé'}</span></div><p className="mt-1 text-ink-soft">{incident.reporter_name || incident.reporter_employee_id || 'Travailleur'} · {incident.created_at ? new Date(incident.created_at).toLocaleString('fr-FR') : incident.event_date}</p><p className="mt-1 text-ink-soft">Événement du {incident.event_date} · {incident.description}</p>{incident.review_note && <p className="mt-1 text-ink-faint">Décision : {incident.review_note}</p>}{canEdit && incident.review_status === 'pending' && <div className="mt-3 flex gap-2"><Button size="sm" variant="primary" disabled={incidentBusy} onClick={() => void handleReviewIncident(incident, 'approved')}>Accepter</Button><Button size="sm" variant="secondary" disabled={incidentBusy} onClick={() => void handleReviewIncident(incident, 'rejected')}>Refuser</Button></div>}</li>)}</ul>}
          </section>
        </div>
      </Modal>
    </div>
  );
}
