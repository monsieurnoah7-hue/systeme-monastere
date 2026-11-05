import { useState, useMemo } from 'react';
import {
  Briefcase,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Users,
  MapPin,
  Plus,
  Wrench,
  Truck,
  Search,
  Edit2,
  Trash2,
} from 'lucide-react';
import type { Project, ProjectsResponse, Employee } from '../lib/api';
import { createProject, updateProject, deleteProject } from '../lib/api';
import { Button, Card, Modal, Banner, Spinner, cx } from './ui';

export function ProjectsView({
  data,
  employees,
  canCreate,
  canEdit,
  canDelete,
  onRefresh,
}: {
  data: ProjectsResponse | null;
  employees: Employee[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
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

  // Quick Hours Modal
  const [quickHoursProject, setQuickHoursProject] = useState<Project | null>(null);
  const [quickHoursValue, setQuickHoursValue] = useState<string>('');
  const [quickHoursBusy, setQuickHoursBusy] = useState(false);

  const projects = data?.projects ?? [];
  const summary = data?.summary;
  const configuredCategories = useMemo(
    () => Array.from(new Set(projects.map((project) => project.category?.trim()).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'fr')),
    [projects],
  );
  const configuredRatios = useMemo(
    () => projects.filter((project) => project.ratio_value !== null && project.ratio_value !== undefined && project.ratio_unit),
    [projects],
  );
  const calculatedBudget = form.ratio_value != null && Boolean(form.ratio_unit?.trim()) && form.ratio_quantity != null && form.ratio_quantity > 0
    ? form.ratio_value * form.ratio_quantity
    : null;

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        p.code.toLowerCase().includes(q) ||
        p.title.toLowerCase().includes(q) ||
        p.client_name.toLowerCase().includes(q) ||
        p.site_location.toLowerCase().includes(q);

      const matchesCat = filterCat === 'all' || p.category === filterCat;
      const matchesDelayed = !filterDelayedOnly || Boolean(p.is_delayed);
      return matchesSearch && matchesCat && matchesDelayed;
    });
  }, [projects, search, filterCat, filterDelayedOnly]);

  function openCreate() {
    const year = new Date().getFullYear();
    const prefix = `CMD-${year}-`;
    const nextNumber = projects.reduce((max, project) => {
      if (!project.code.startsWith(prefix)) return max;
      const suffix = Number(project.code.slice(prefix.length));
      return Number.isInteger(suffix) ? Math.max(max, suffix) : max;
    }, 0) + 1;
    setEditingProject(null);
    setForm({
      code: `${prefix}${String(nextNumber).padStart(3, '0')}`,
      title: '',
      client_name: '',
      site_location: '',
      category: null,
      assigned_worker_ids: [],
      assigned_worker_names: [],
      ratio_basis: null,
      ratio_quantity: null,
      penalty_rate_daily_fcfa: 0,
      delivery_deadline: '',
      installation_start_date: '',
      status: 'planifie',
    });
    setError(null);
    setModalOpen(true);
  }

  function openEdit(p: Project) {
    setEditingProject(p);
    setForm({ ...p });
    setError(null);
    setModalOpen(true);
  }

  async function handleSave() {
    const ratioStarted = form.ratio_value != null || Boolean(form.ratio_unit?.trim()) || form.ratio_quantity != null;
    const legacyRatioUnchanged = Boolean(
      editingProject &&
      editingProject.ratio_quantity == null &&
      form.ratio_value === editingProject.ratio_value &&
      form.ratio_unit === editingProject.ratio_unit &&
      form.ratio_quantity == null
    );
    if (!form.code?.trim() || !form.title?.trim() || !form.client_name?.trim() || !form.site_location?.trim() || !form.delivery_deadline) {
      setError('Code, intitulé, client, lieu et date limite de livraison sont obligatoires.');
      return;
    }
    if (ratioStarted && !legacyRatioUnchanged && (form.ratio_value == null || !form.ratio_unit?.trim() || form.ratio_quantity == null || form.ratio_quantity <= 0)) {
      setError('Pour calculer le budget, indiquez le temps pour une unité, le nom de l’unité et la quantité.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const projectForm = {
        ...form,
        ...(calculatedBudget !== null ? { budget_hours: calculatedBudget } : {}),
        ...(legacyRatioUnchanged ? { ratio_value: undefined, ratio_unit: undefined, ratio_quantity: undefined } : {}),
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
    if (!confirm(`Supprimer définitivement la commande ${p.code} (${p.title}) ?`)) return;
    try {
      await deleteProject(p.id);
      onRefresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur suppression');
    }
  }

  async function handleAddHours() {
    if (!quickHoursProject) return;
    const added = Number(quickHoursValue);
    if (isNaN(added) || added <= 0) return;
    setQuickHoursBusy(true);
    try {
      const newSpent = Number(quickHoursProject.spent_hours) + added;
      await updateProject(quickHoursProject.id, { spent_hours: newSpent });
      setQuickHoursProject(null);
      onRefresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setQuickHoursBusy(false);
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

      {/* Ratios réellement configurés sur les projets existants */}
      {configuredRatios.length > 0 && (
        <section className="rounded-2xl border border-line bg-paper-2/40 p-4 text-xs" aria-label="Ratios configurés">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="font-bold text-ink">Ratios configurés par la Direction</span>
            <span className="text-[11px] text-ink-faint">{configuredRatios.length} projet(s) documenté(s)</span>
          </div>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1 text-[11px] text-ink-soft">
            {configuredRatios.map((project) => (
              <span key={project.id} className="shrink-0 rounded-lg border border-line bg-surface px-2.5 py-1.5">
                <strong className="text-ink">{project.category || project.title}</strong> · {project.ratio_value} h / {project.ratio_unit}
                {project.ratio_quantity != null ? ` × ${project.ratio_quantity} = ${project.budget_hours} h` : ''}
              </span>
            ))}
          </div>
        </section>
      )}

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
            <span>Planification Livraisons &amp; Pose Chantier</span>
          </button>
        </div>

        {canCreate && (
          <Button
            size="sm"
            variant="primary"
            icon={<Plus size={14} />}
            onClick={openCreate}
            className="!h-full !min-h-[58px] w-auto !bg-ink !text-paper hover:!bg-surface-3 hover:!text-ink lg:!h-8 lg:!min-h-0 lg:w-auto"
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

          <div className="flex w-full flex-wrap items-center gap-1.5 pb-1 lg:w-auto lg:justify-end">
            {[{ id: 'all', label: 'Tous' }, ...configuredCategories.map((category) => ({ id: category, label: category }))].map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setFilterCat(c.id)}
                className={cx(
                  'shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-colors cursor-pointer border',
                  filterCat === c.id
                    ? 'bg-ink text-paper border-ink'
                    : 'bg-transparent text-ink-soft hover:bg-surface border-line'
                )}
              >
                {c.label}
              </button>
            ))}
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
                            {p.title}
                          </h4>
                          <p className="mt-1 flex items-center gap-1 truncate text-xs text-ink-faint">
                            <span>Client : <strong>{p.client_name}</strong></span>
                            <span>•</span>
                            <span className="truncate">{p.site_location}</span>
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

                        {p.ratio_value !== null && p.ratio_value !== undefined && p.ratio_unit ? (
                          <div className="rounded-lg border border-line bg-paper-2/40 px-3 py-2.5 text-xs text-ink-soft">
                            <span className="font-semibold text-ink">Temps par unité :</span> {p.ratio_value} h / {p.ratio_unit}
                            {p.ratio_quantity != null ? ` · ${p.ratio_quantity} ${p.ratio_unit} = ${p.budget_hours} h prévues` : ''}
                          </div>
                        ) : null}

                        {/* Budget configuré pour ce projet */}
                      <div className="mt-4 space-y-2.5 text-xs">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-ink-soft">
                            Heures : <strong>{p.spent_hours} h</strong> / {p.budget_hours} h prévues
                          </span>
                          <span
                            className={cx(
                              'font-mono font-bold',
                              hasOvertime ? 'text-red-600 dark:text-red-400' : 'text-emerald-600'
                            )}
                          >
                            {hasOvertime ? `+${p.overtime_hours} h DÉPASSÉES` : `${Number(p.budget_hours) - Number(p.spent_hours)} h restantes`}
                          </span>
                        </div>

                        {/* Barre de progression des heures */}
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-paper-2">
                          <div
                            className={cx(
                              'h-full rounded-full transition-all',
                              hasOvertime ? 'bg-red-500' : 'bg-emerald-500'
                            )}
                            style={{ width: `${Math.min(100, p.hours_progress_pct || 0)}%` }}
                          />
                        </div>

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
                            {p.delivery_deadline} ({isOverdue ? `dépassé de ${p.delayed_days} j` : `${p.days_to_deadline} j restants`})
                          </span>
                        </div>

                        {/* Préjudice financier estimé si dépassement / retard */}
                        {(hasOvertime || isOverdue) && (
                          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-2 text-[11px] flex items-center justify-between text-red-600 dark:text-red-400">
                            <span className="font-semibold flex items-center gap-1">
                              <AlertTriangle size={12} />
                              Manque à gagner évalué :
                            </span>
                            <span className="font-mono font-extrabold text-xs">
                              {(p.financial_damage_fcfa || 0).toLocaleString()} FCFA
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions Card */}
                    <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
                      {canEdit && <button
                        type="button"
                        onClick={() => {
                          setQuickHoursProject(p);
                          setQuickHoursValue('');
                        }}
                        className="flex items-center gap-1.5 rounded-lg border border-line bg-transparent px-3 py-2 text-[11px] font-semibold text-ink-soft transition-colors hover:bg-paper-2 hover:text-ink cursor-pointer"
                      >
                        <Clock size={12} />
                        <span>Pointer Heures</span>
                      </button>}

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

      {/* =========================================================================
          TAB 2 : PLANIFICATION DES LIVRAISONS ET INTERVENTIONS
      ========================================================================= */}
      {activeTab === 'planning' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-surface p-4 shadow-xs">
            <h3 className="font-bold text-sm text-ink mb-1 flex items-center gap-2">
              <Truck size={16} className="text-amber" />
              Planning des Livraisons &amp; Pose sur Site
            </h3>
            <p className="text-xs text-ink-soft mb-4">
              Coordination entre l'atelier central, le Responsable des Livraisons et les équipes de montage sur chantier.
            </p>

            <div className="hidden overflow-x-auto scroll-thin md:block">
              <table className="w-full text-left border-collapse text-xs table-rhythm">
                <thead>
                  <tr className="bg-paper-2 border-b border-line text-ink-faint font-semibold uppercase tracking-wider text-[11px]">
                    <th className="px-3 py-2.5 min-w-28 border-r border-line">N° Commande</th>
                    <th className="px-3 py-2.5 min-w-44 border-r border-line">Ouvrage &amp; Chantier</th>
                    <th className="px-3 py-2.5 min-w-32 border-r border-line">Lieu de Pose</th>
                    <th className="px-3 py-2.5 min-w-32 border-r border-line">Début Intervention</th>
                    <th className="px-3 py-2.5 min-w-24 border-r border-line text-center">Durée (jours)</th>
                    <th className="px-3 py-2.5 min-w-44 border-r border-line">Équipe Assignée</th>
                    <th className="px-3 py-2.5 min-w-28 border-r border-line text-center">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filteredProjects.map((p) => (
                    <tr key={p.id} className="hover:bg-paper-2/40 transition-colors">
                      <td className="px-3 py-2.5 font-mono font-bold text-ink border-r border-line">
                        {p.code}
                      </td>
                      <td className="px-3 py-2.5 font-medium text-ink border-r border-line">
                        <span className="font-semibold block">{p.title}</span>
                        <span className="text-[10px] text-ink-faint">Client : {p.client_name}</span>
                      </td>
                      <td className="px-3 py-2.5 text-ink-soft border-r border-line">
                        <span className="flex items-center gap-1">
                          <MapPin size={11} className="text-amber shrink-0" />
                          {p.site_location}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-ink border-r border-line">
                        {p.installation_start_date || 'À planifier'}
                      </td>
                      <td className="px-3 py-2.5 text-center font-bold text-ink border-r border-line">
                        {p.installation_days} j
                      </td>
                      <td className="px-3 py-2.5 text-ink-soft border-r border-line">
                        {p.assigned_worker_names && p.assigned_worker_names.length > 0
                          ? p.assigned_worker_names.join(', ')
                          : 'Équipe non fixée'}
                      </td>
                      <td className="px-3 py-2.5 text-center border-r border-line">
                        <span
                          className={cx(
                            'rounded-full px-2 py-0.5 text-[10px] font-bold border',
                            p.status === 'termine'
                              ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                              : p.status === 'en_pose'
                              ? 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                              : 'bg-surface-2 text-ink-soft border-line'
                          )}
                        >
                          {p.status === 'termine'
                            ? 'Réceptionné'
                            : p.status === 'en_pose'
                            ? 'En cours de pose'
                            : 'En attente'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-2 md:hidden">
              {filteredProjects.length === 0 ? (
                <p className="rounded-lg border border-dashed border-line p-4 text-center text-xs text-ink-soft">
                  Aucun projet à planifier avec ces critères.
                </p>
              ) : filteredProjects.map((p) => (
                <article key={p.id} className="rounded-xl border border-line bg-paper-2/50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-[11px] font-bold text-ink">{p.code}</p>
                      <h4 className="mt-1 truncate font-semibold text-ink">{p.title}</h4>
                      <p className="mt-0.5 text-[11px] text-ink-faint">{p.client_name}</p>
                    </div>
                    <span
                      className={cx(
                        'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold',
                        p.status === 'termine'
                          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600'
                          : p.status === 'en_pose'
                          ? 'border-blue-500/20 bg-blue-500/10 text-blue-600'
                          : 'border-line bg-surface-2 text-ink-soft',
                      )}
                    >
                      {p.status === 'termine' ? 'Réceptionné' : p.status === 'en_pose' ? 'En pose' : 'En attente'}
                    </span>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
                    <div>
                      <dt className="text-ink-faint">Lieu</dt>
                      <dd className="mt-0.5 flex items-center gap-1 text-ink-soft"><MapPin size={11} className="text-amber" />{p.site_location}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-faint">Début</dt>
                      <dd className="mt-0.5 font-mono text-ink-soft">{p.installation_start_date || 'À planifier'}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-faint">Durée</dt>
                      <dd className="mt-0.5 font-semibold text-ink-soft">{p.installation_days} jour(s)</dd>
                    </div>
                    <div>
                      <dt className="text-ink-faint">Équipe</dt>
                      <dd className="mt-0.5 truncate text-ink-soft">
                        {p.assigned_worker_names?.length ? p.assigned_worker_names.join(', ') : 'Non affectée'}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </div>
        </div>
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
              {busy ? <Spinner /> : 'Enregistrer Projet'}
            </Button>
          </>
        }
      >
        <div className="space-y-3.5 text-xs">
          {error && <Banner tone="error">{error}</Banner>}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block font-semibold text-ink">Code Commande</label>
              <input
                type="text"
                value={form.code || ''}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="Ex : CMD-2026-042"
                className="h-10 w-full rounded-lg border border-line bg-surface px-3 font-mono font-bold text-xs text-ink focus:border-amber focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block font-semibold text-ink">Type de projet (optionnel)</label>
              <input
                type="text"
                value={form.category || ''}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value || null }))}
                placeholder="Ex. mobilier liturgique, restauration, agencement…"
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
              placeholder="Ex : Fabrication et pose de 14 blocs-portes en Iroko"
              className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-xs text-ink focus:border-amber focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block font-semibold text-ink">Nom du Client</label>
              <input
                type="text"
                value={form.client_name || ''}
                onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))}
                placeholder="Ex : Villa Bastos / Paroisse..."
                className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-xs text-ink focus:border-amber focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block font-semibold text-ink">Lieu du chantier *</label>
              <input
                type="text"
                value={form.site_location || ''}
                onChange={(e) => setForm((f) => ({ ...f, site_location: e.target.value }))}
                placeholder="Ex : Bastos, Yaoundé"
                className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-xs text-ink focus:border-amber focus:outline-none"
              />
            </div>
          </div>

          {/* Ratios et paramètres financiers propres à ce projet */}
          <div className="rounded-xl border border-line bg-surface-2/40 p-3 space-y-2.5">
            <p className="font-bold text-ink flex items-center gap-1.5">
              <Clock size={14} className="text-amber" />
              Budget, ratio et paramètres financiers
            </p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-ink-soft">Budget prévu (heures)</label>
                <input
                  type="number"
                  value={calculatedBudget ?? form.budget_hours ?? ''}
                  readOnly={calculatedBudget !== null}
                  onChange={(e) => setForm((f) => ({ ...f, budget_hours: e.target.value === '' ? undefined : Number(e.target.value) }))}
                  className="h-9 w-full rounded-lg border border-line bg-surface px-2.5 font-mono text-xs text-ink focus:border-amber focus:outline-none"
                />
                <p className="mt-1 text-[10px] text-ink-faint">
                  {calculatedBudget !== null
                    ? `${form.ratio_value} h × ${form.ratio_quantity} ${form.ratio_unit} = ${calculatedBudget} h`
                    : 'Le total se calcule automatiquement si vous renseignez les unités ci-dessous.'}
                </p>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-ink-soft">Heures Consommées</label>
                <input
                  type="number"
                  value={form.spent_hours ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, spent_hours: e.target.value === '' ? undefined : Number(e.target.value) }))}
                  className="h-9 w-full rounded-lg border border-line bg-surface px-2.5 font-mono text-xs text-ink focus:border-amber focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-ink-soft">Taux Horaire (FCFA)</label>
                <input
                  type="number"
                  value={form.hourly_rate_fcfa ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, hourly_rate_fcfa: e.target.value === '' ? undefined : Number(e.target.value) }))}
                  className="h-9 w-full rounded-lg border border-line bg-surface px-2.5 font-mono text-xs text-ink focus:border-amber focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-ink-soft">Temps pour 1 unité (heures)</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={form.ratio_value ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, ratio_value: e.target.value === '' ? null : Number(e.target.value) }))}
                  placeholder="Ex. 2,5"
                  className="h-9 w-full rounded-lg border border-line bg-surface px-2.5 font-mono text-xs text-ink focus:border-amber focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-ink-soft">Unité à produire</label>
                <input
                  type="text"
                  value={form.ratio_unit || ''}
                  onChange={(e) => setForm((f) => ({ ...f, ratio_unit: e.target.value || null }))}
                  placeholder="Carreau, porte, m²…"
                  className="h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-xs text-ink focus:border-amber focus:outline-none"
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-1">
                <label className="mb-1 block text-[11px] font-medium text-ink-soft">Quantité</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={form.ratio_quantity ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, ratio_quantity: e.target.value === '' ? null : Number(e.target.value) }))}
                  placeholder="Ex. 4"
                  className="h-9 w-full rounded-lg border border-line bg-surface px-2.5 font-mono text-xs text-ink focus:border-amber focus:outline-none"
                />
              </div>
            </div>
            <p className="text-[10px] text-ink-faint">Exemple : 2,5 heures par carreau × 4 carreaux = 10 heures de budget.</p>
          </div>

          {/* Planification et délais propres à ce projet */}
          <div className="rounded-xl border border-line bg-surface-2/40 p-3 space-y-2.5">
            <p className="font-bold text-ink flex items-center gap-1.5">
              <Calendar size={14} className="text-amber" />
              Délais et intervention sur site
            </p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-1 block text-[11px] font-bold text-amber">Date Limite Livraison</label>
                <input
                  type="date"
                  value={form.delivery_deadline || ''}
                  onChange={(e) => setForm((f) => ({ ...f, delivery_deadline: e.target.value }))}
                  className="h-9 w-full rounded-lg border border-amber/50 bg-surface px-2.5 text-xs text-ink focus:border-amber focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-ink-soft">Début Pose Chantier</label>
                <input
                  type="date"
                  value={form.installation_start_date || ''}
                  onChange={(e) => setForm((f) => ({ ...f, installation_start_date: e.target.value }))}
                  className="h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-xs text-ink focus:border-amber focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-ink-soft">Durée Pose (jours)</label>
                <input
                  type="number"
                  value={form.installation_days ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, installation_days: e.target.value === '' ? undefined : Number(e.target.value) }))}
                  className="h-9 w-full rounded-lg border border-line bg-surface px-2.5 font-mono text-xs text-ink focus:border-amber focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Affectation des Artisans */}
          <div>
            <label className="mb-1.5 block font-semibold text-ink">Artisans &amp; Menuisiers affectés au projet</label>
            <div className="max-h-36 overflow-y-auto scroll-thin rounded-xl border border-line p-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5 bg-paper/60">
              {employees.slice(0, 16).map((emp) => {
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

      {/* MODAL RAPIDE DE POINTAGE D'HEURES */}
      <Modal
        open={!!quickHoursProject}
        title={`Pointer des Heures sur : ${quickHoursProject?.code}`}
        onClose={() => setQuickHoursProject(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setQuickHoursProject(null)}>Annuler</Button>
            <Button
              variant="primary"
              disabled={quickHoursBusy}
              onClick={() => void handleAddHours()}
              className="!bg-ink !text-paper hover:!bg-surface-3 hover:!text-ink"
            >
              {quickHoursBusy ? <Spinner /> : 'Ajouter au Cumul'}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-xs">
          <p className="text-ink-soft">
            Ajoutez le nombre d'heures effectuées par l'équipe aujourd'hui sur cette commande. Le système mettra à jour en direct le ratio par rapport au budget prévisionnel.
          </p>
          <div>
            <label className="mb-1 block font-semibold text-ink">Nombre d'heures à ajouter</label>
            <input
              type="number"
              value={quickHoursValue}
              onChange={(e) => setQuickHoursValue(e.target.value)}
              placeholder="Ex : 8"
              className="h-10 w-full rounded-lg border border-line bg-surface px-3 font-mono font-bold text-xs text-ink focus:border-amber focus:outline-none"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
