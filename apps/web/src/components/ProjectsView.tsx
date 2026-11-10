import { useState, useMemo } from 'react';
import {
  Briefcase,
  Calendar,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import type { Project, ProjectsResponse, Employee, ProjectIncident, ProjectWorkPlanAllocation } from '../lib/api';
import { createProject, updateProject, deleteProject, fetchProjectIncidents, addProjectIncident, reviewProjectIncident } from '../lib/api';
import { Button, Card, Modal, Banner, Spinner, cx } from './ui';
import { ProjectsHeaderBar } from './ProjectsHeaderBar';
import { ProjectListRow } from './ProjectListRow';
import { ProjectBentoCard } from './ProjectBentoCard';

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
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) return 'list';
    return 'grid';
  });
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
      {/* Synthèse supérieure : Contraste de surface rehaussé pour écran mobile/tablette */}
      <section className="overflow-hidden rounded-2xl border border-line-strong bg-surface-2 shadow-card" aria-label="Synthèse des projets">
        <div className="grid grid-cols-2 gap-px bg-line-strong md:grid-cols-3">
          <div className="bg-surface-2 p-3 sm:p-4">
            <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Impact financier estimé</p>
            <p className="mt-1.5 font-mono text-xl sm:text-2xl font-bold tabular-nums text-ink">
              {(summary?.total_financial_damage_fcfa ?? 0).toLocaleString()} <span className="text-xs font-normal text-ink-faint">FCFA</span>
            </p>
            <p className="mt-0.5 text-[11px] text-ink-soft hidden sm:block">Heures hors budget et pénalités calculées.</p>
          </div>
          <div className="bg-surface-2 p-3 sm:p-4">
            <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Heures hors budget</p>
            <p className="mt-1.5 font-mono text-xl sm:text-2xl font-bold tabular-nums text-ink">
              +{(summary?.total_overtime_hours ?? 0).toLocaleString()} <span className="text-xs font-normal text-ink-faint">h</span>
            </p>
            <p className="mt-0.5 text-[11px] text-ink-soft hidden sm:block">Écart entre le réalisé et le budget projet.</p>
          </div>
          <div className="col-span-2 bg-surface-2 p-3 sm:p-4 md:col-span-1 border-t md:border-t-0 border-line-strong">
            <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Délais critiques</p>
            <div className="mt-1.5 flex items-baseline gap-2">
              <p className={cx('font-mono text-xl sm:text-2xl font-bold tabular-nums', (summary?.delayed_count ?? 0) > 0 ? 'text-red-400' : 'text-emerald-400')}>
                {summary?.delayed_count ?? 0}
              </p>
              <span className="text-xs text-ink-faint">sur {summary?.active_count ?? 0} commandes actives</span>
            </div>
            <p className="mt-0.5 text-[11px] text-ink-soft">
              {summary?.delayed_count ? 'Action ou arbitrage requis.' : 'Toutes les commandes sont dans les délais.'}
            </p>
          </div>
        </div>
      </section>

      {/* Bandeau de commande compact et unifié (48px) avec recherche, filtres et bascule de vue */}
      <ProjectsHeaderBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        search={search}
        onSearchChange={setSearch}
        filterCat={filterCat}
        onFilterCatChange={setFilterCat}
        filterDelayedOnly={filterDelayedOnly}
        onFilterDelayedOnlyChange={setFilterDelayedOnly}
        categories={configuredCategories}
        canCreate={canCreate}
        onCreate={openCreate}
        totalCount={projects.length}
        delayedCount={summary?.delayed_count ?? 0}
      />

      {/* =========================================================================
          TAB 1 : SUIVI DES PROJETS (ARCHITECTURE DUAL-MODE)
      ========================================================================= */}
      {activeTab === 'production' && (
        <div className="space-y-4">
          {filteredProjects.length === 0 ? (
            <Card className="p-8 text-center text-xs text-ink-soft bg-surface-2 border border-line-strong rounded-2xl shadow-card">
              <Briefcase size={32} className="mx-auto text-ink-faint mb-2" />
              <p className="font-bold text-ink text-sm">{projects.length === 0 ? 'Aucune commande enregistrée' : 'Aucune commande ne correspond aux filtres'}</p>
              <p className="mt-1 text-xs">
                {projects.length === 0
                  ? canCreate ? 'Créez la première commande pour initier le suivi d’atelier.' : 'La Direction n’a encore configuré aucune commande.'
                  : 'Modifiez la recherche ou réinitialisez les filtres pour afficher l’ensemble des chantiers.'}
              </p>
            </Card>
          ) : viewMode === 'list' ? (
            /* Mode 1 : Vue Liste Tactile Synthétique avec Accordéons (Recommandée Mobile/Tablette) */
            <div className="space-y-2">
              {filteredProjects.map((p) => (
                <ProjectListRow
                  key={p.id}
                  project={p}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  canReportIncident={canReportIncident}
                  currentEmployeeId={currentEmployeeId}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onIncident={openIncidentLog}
                />
              ))}
            </div>
          ) : (
            /* Mode 2 : Vue Fiches Bento Élevées en Relief (Desktop / Consultation Détaillée) */
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredProjects.map((p) => (
                <ProjectBentoCard
                  key={p.id}
                  project={p}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  canReportIncident={canReportIncident}
                  currentEmployeeId={currentEmployeeId}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onIncident={openIncidentLog}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'planning' && (
        <section className="space-y-4" aria-label="Charge hebdomadaire des projets">
          <div className="rounded-2xl border border-line-strong bg-surface-2 p-4 sm:p-5 shadow-card">
            <h3 className="font-bold text-ink text-sm sm:text-base">Répartition du budget par jour ouvré</h3>
            <p className="mt-1 text-xs text-ink-soft">Définissez les heures prévues par personne et par jour. Les repos et jours fériés sont sautés automatiquement dans le calcul de la date d'achèvement estimée.</p>
          </div>
          {filteredProjects.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line-strong bg-surface-2 p-8 text-center text-xs text-ink-soft">Aucune commande correspondante.</p>
          ) : (
            <div className="grid gap-3.5 xl:grid-cols-2">
              {filteredProjects.map((p) => (
                <article key={p.id} className="rounded-2xl border border-line-strong bg-surface-2 p-4 sm:p-5 shadow-card hover:shadow-card-hover transition-all">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-paper border border-line text-ink">{p.code}</span>
                      <h4 className="mt-1.5 font-bold text-sm text-ink">{p.title || 'Projet à compléter'}</h4>
                      <p className="mt-1 text-xs text-ink-soft">{p.assigned_worker_names?.join(', ') || 'Aucun exécutant affecté'}</p>
                    </div>
                    {canEdit && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!p.assigned_worker_ids?.length}
                        onClick={() => {
                          setScheduleProject(p);
                          setScheduleRows(Array.isArray(p.work_plan) ? p.work_plan.map((row) => ({ ...row })) : []);
                          setScheduleError(null);
                        }}
                        className="h-8 text-xs font-semibold"
                      >
                        Répartir les heures
                      </Button>
                    )}
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs">
                    <div className="p-2 rounded-lg bg-surface border border-line">
                      <p className="text-[10px] uppercase text-ink-faint font-semibold">Budget total</p>
                      <p className="mt-1 font-mono font-bold text-ink">{Number(p.budget_hours) > 0 ? `${p.budget_hours} h` : 'À définir'}</p>
                    </div>
                    <div className="p-2 rounded-lg bg-surface border border-line">
                      <p className="text-[10px] uppercase text-ink-faint font-semibold">Prévu / sem.</p>
                      <p className="mt-1 font-mono font-bold text-ink">{p.planned_weekly_hours ?? 0} h</p>
                    </div>
                    <div className="p-2 rounded-lg bg-surface border border-line">
                      <p className="text-[10px] uppercase text-ink-faint font-semibold">Fin estimée</p>
                      <p className="mt-1 font-mono font-bold text-ink">{p.planned_completion_date || 'À planifier'}</p>
                    </div>
                    <div className="p-2 rounded-lg bg-surface border border-line">
                      <p className="text-[10px] uppercase text-ink-faint font-semibold">Échéance</p>
                      <p className={cx('mt-1 font-mono font-bold', p.schedule_at_risk ? 'text-red-400' : 'text-ink')}>{p.delivery_deadline || 'À définir'}</p>
                    </div>
                  </div>
                  {p.schedule_at_risk && (
                    <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-400 font-medium">
                      Attention : avec cette répartition, le budget serait terminé après la date limite de livraison contractuelle.
                    </p>
                  )}
                  {(!p.work_plan?.length) && (
                    <p className="mt-3 text-xs text-ink-faint italic">Aucune répartition hebdomadaire configurée pour l'instant.</p>
                  )}
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
