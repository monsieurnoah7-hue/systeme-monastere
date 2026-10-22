import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  api,
  type Employee,
  type Magasin,
  type ScanResult,
  type Tool,
  type ToolCondition,
  type ToolEvent,
  type ToolLoan,
  type ToolStatus,
  type User,
} from '../lib/api';
import { QR_PREFIX, qrDataUrl } from '../lib/qr';
import { usePrintSheet } from '../lib/print';
import {
  CONDITION_LABEL,
  EVENT_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  formatDateTime,
} from '../lib/labels';
import {
  Banner,
  Button,
  Card,
  Chip,
  Drawer,
  EmptyState,
  Field,
  Modal,
  SelectField,
  Spinner,
  TextArea,
  cx,
  useToast,
} from '../components/ui';
import {
  IconChevronRight,
  IconPlus,
  IconPrinter,
  IconQr,
  IconSearch,
  IconWrench,
  IconBox,
} from '../components/Icons';

type ToolDetail = { tool: Tool; events: ToolEvent[]; loan: ToolLoan | null };
type Facets = { categories: string[]; locations: string[] };

function A4Sheet({ tools }: { tools: Tool[] }) {
  const [codes, setCodes] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      tools.map(async (tool) => [tool.id, await qrDataUrl(`${QR_PREFIX.tool}${tool.id}`, 240)] as const),
    ).then((entries) => {
      if (!cancelled) setCodes(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [tools]);

  return (
    <div className="a4-page" style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}>
      <div style={{ marginBottom: '6mm', borderBottom: '1px solid #d3cabd', paddingBottom: '3mm' }}>
        <p style={{ fontSize: '12pt', fontWeight: 600, color: '#17181b', margin: 0 }}>
          Menuiserie — Monastère du Mont Fèbè
        </p>
        <p style={{ fontSize: '9pt', color: '#5b5651', margin: '1mm 0 0' }}>
          Planche d’étiquettes — {tools.length} référence(s) — imprimer sur papier A4 avec découpe
        </p>
      </div>
      <div className="a4-grid">
        {tools.map((tool) => (
          <div
            key={tool.id}
            style={{
              border: '1px solid #d3cabd',
              borderRadius: '2mm',
              padding: '2mm',
              breakInside: 'avoid',
              textAlign: 'center',
            }}
          >
            {codes[tool.id] ? (
              <img src={codes[tool.id]} alt={`QR ${tool.id}`} style={{ width: '100%', maxWidth: '22mm', margin: '0 auto' }} />
            ) : (
              <div style={{ height: '22mm' }} />
            )}
            <p style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '8pt', fontWeight: 600, margin: '1.5mm 0 0' }}>
              {tool.id}
            </p>
            <p style={{ fontSize: '7pt', color: '#5b5651', margin: '0.5mm 0 0', lineHeight: 1.2 }}>{tool.name}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Outils({ user, scan }: { user: User; scan?: ScanResult | null }) {
  const toast = useToast();
  const canManage = user.role === 'direction' || user.role === 'magasinier';

  const [filters, setFilters] = useState({ q: '', status: '', category: '', location: '', magasin_id: '' });
  const [tools, setTools] = useState<Tool[]>([]);
  const [facets, setFacets] = useState<Facets>({ categories: [], locations: [] });
  const [magasins, setMagasins] = useState<Magasin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ToolDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [newOpen, setNewOpen] = useState(false);
  const [newForm, setNewForm] = useState({ name: '', category: 'Divers', location: 'Magasin', magasin_id: '', observations: '' });
  const [loanFor, setLoanFor] = useState<Tool | null>(null);
  const [loanForm, setLoanForm] = useState({ employeeId: '', motive: '' });
  const [returnFor, setReturnFor] = useState<ToolLoan | null>(null);
  const [returnForm, setReturnForm] = useState<{ condition: ToolCondition | 'endommage'; observations: string }>({
    condition: 'bon',
    observations: '',
  });
  const [statusFor, setStatusFor] = useState<Tool | null>(null);
  const [statusForm, setStatusForm] = useState<{ status: ToolStatus; reason: string }>({
    status: 'disponible',
    reason: '',
  });
  const [assignFor, setAssignFor] = useState<Tool | null>(null);
  const [assignMagasinId, setAssignMagasinId] = useState('');
  const [printOpen, setPrintOpen] = useState(false);
  const [printPick, setPrintPick] = useState<Record<string, boolean>>({});
  const { print, portal } = usePrintSheet();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    let cancelled = false;
    setLoading(true);
    api<{ tools: Tool[]; facets: Facets }>(`/api/tools?${params.toString()}`)
      .then((res) => {
        if (cancelled) return;
        setTools(res.tools);
        setFacets(res.facets);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Chargement impossible.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters, reload]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    api<ToolDetail>(`/api/tools/${selectedId}`)
      .then((res) => {
        if (!cancelled) setDetail(res);
      })
      .catch((err) => {
        if (!cancelled) {
          toast(err instanceof Error ? err.message : 'Fiche introuvable.', 'error');
          setSelectedId(null);
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, reload, toast]);

  useEffect(() => {
    api<{ employees: Employee[] }>('/api/employees')
      .then((res) => setEmployees(res.employees.filter((employee) => employee.active)))
      .catch(() => setEmployees([]));
    api<{ magasins: Magasin[] }>('/api/magasins')
      .then((res) => setMagasins(res.magasins.filter((m) => m.active)))
      .catch(() => setMagasins([]));
  }, []);

  const refresh = useCallback(() => setReload((value) => value + 1), []);

  useEffect(() => {
    if (!scan) return;
    if (scan.kind === 'tool') {
      setFilters({ q: '', status: '', category: '', location: '', magasin_id: '' });
      setSelectedId(scan.tool.id);
      setReload((value) => value + 1);
    }
  }, [scan]);

  const stats = useMemo(() => {
    const counts = {
      total: tools.length,
      disponible: 0,
      en_pret: 0,
      maintenance: 0,
      manquant: 0,
      reforme: 0,
    };
    for (const tool of tools) {
      if (tool.status in counts) {
        counts[tool.status as keyof typeof counts]++;
      }
    }
    return counts;
  }, [tools]);

  async function createTool() {
    setBusy(true);
    try {
      const res = await api<{ tool: Tool }>('/api/tools', {
        method: 'POST',
        body: JSON.stringify({
          name: newForm.name,
          category: newForm.category,
          location: newForm.location,
          magasin_id: newForm.magasin_id || undefined,
          observations: newForm.observations || undefined,
        }),
      });
      toast(`Outil ${res.tool.id} créé avec succès.`, 'success');
      setNewOpen(false);
      setNewForm({ name: '', category: 'Divers', location: 'Magasin', magasin_id: '', observations: '' });
      refresh();
      setSelectedId(res.tool.id);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Création impossible.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function assignMagasin() {
    if (!assignFor) return;
    setBusy(true);
    try {
      const mag = magasins.find((m) => m.id === assignMagasinId);
      await api(`/api/tools/${assignFor.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ magasin_id: assignMagasinId || null, location: mag?.name ?? assignFor.location }),
      });
      toast(`${assignFor.id} affecté à ${mag?.name ?? '—'}.`, 'success');
      setAssignFor(null);
      refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Affectation impossible.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function createLoan() {
    if (!loanFor) return;
    setBusy(true);
    try {
      await api('/api/loans', {
        method: 'POST',
        body: JSON.stringify({ toolId: loanFor.id, employeeId: loanForm.employeeId, motive: loanForm.motive }),
      });
      toast(`Sortie validée pour ${loanFor.name} (${loanFor.id}).`, 'success');
      setLoanFor(null);
      setLoanForm({ employeeId: '', motive: '' });
      refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Prêt refusé.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function confirmReturn() {
    if (!returnFor) return;
    setBusy(true);
    try {
      await api(`/api/loans/${returnFor.id}/return`, {
        method: 'POST',
        body: JSON.stringify({
          condition: returnForm.condition,
          observations: returnForm.observations || undefined,
        }),
      });
      toast('Retour enregistré.', 'success');
      setReturnFor(null);
      setReturnForm({ condition: 'bon', observations: '' });
      refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Retour refusé.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus() {
    if (!statusFor) return;
    setBusy(true);
    try {
      await api(`/api/tools/${statusFor.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: statusForm.status, reason: statusForm.reason }),
      });
      toast('Statut mis à jour.', 'success');
      setStatusFor(null);
      setStatusForm({ status: 'disponible', reason: '' });
      refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Modification refusée.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 pb-12">
      {/* Jibble Header Banner */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[12px] font-medium text-ink-faint">
            <span>Atelier & Quincaillerie</span>
            <span>/</span>
            <span className="text-amber font-semibold">Parc Outils</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink mt-0.5">
            Gestion du Matériel & Outils
          </h1>
          <p className="text-xs text-ink-soft">
            Traçabilité des emprunts, planches de QR codes et inventaire temps réel.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            icon={<IconPrinter size={16} />}
            onClick={() => {
              setPrintPick(Object.fromEntries(tools.map((tool) => [tool.id, false])));
              setPrintOpen(true);
            }}
          >
            Planche A4 QR
          </Button>
          {canManage ? (
            <Button
              variant="primary"
              size="sm"
              icon={<IconPlus size={16} />}
              onClick={() => setNewOpen(true)}
            >
              Nouvel Outil
            </Button>
          ) : null}
        </div>
      </div>

      {/* Jibble KPI Dashboard Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-xl border border-line bg-surface p-3.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Total Parc</span>
            <span className="h-1.5 w-1.5 rounded-full bg-ink-faint" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-ink tabular-nums">{stats.total}</span>
            <span className="text-[11px] text-ink-faint">unités</span>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-surface p-3.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Disponibles</span>
            <span className="h-1.5 w-1.5 rounded-full bg-green" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-ink tabular-nums">{stats.disponible}</span>
            <span className="text-[11px] text-ink-faint">en rayon</span>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-surface p-3.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">En Prêt</span>
            <span className="h-1.5 w-1.5 rounded-full bg-amber" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-ink tabular-nums">{stats.en_pret}</span>
            <span className="text-[11px] text-ink-faint">sur chantier</span>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-surface p-3.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Maintenance</span>
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-ink tabular-nums">{stats.maintenance}</span>
            <span className="text-[11px] text-ink-faint">à réparer</span>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-surface p-3.5 shadow-xs col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Manquants</span>
            <span className="h-1.5 w-1.5 rounded-full bg-red" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-ink tabular-nums">{stats.manquant + stats.reforme}</span>
            <span className="text-[11px] text-ink-faint">perdus/rebut</span>
          </div>
        </div>
      </div>

      {/* Jibble Filters & Search Bar */}
      <div className="rounded-xl border border-line bg-surface p-3 shadow-xs space-y-3">
        <div className="grid gap-2.5 sm:grid-cols-[1fr_auto_auto_auto_auto]">
          <div className="relative min-w-44">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">
              <IconSearch size={16} />
            </span>
            <input
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              placeholder="Rechercher désignation, code QR, marque..."
              className="h-10 w-full rounded-lg border border-line bg-paper pl-9 pr-3 text-xs sm:text-sm focus:border-amber focus:bg-surface focus:outline-none transition-all"
            />
          </div>

          <select
            value={filters.category}
            onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
            className="h-10 rounded-lg border border-line bg-paper px-3 text-xs font-medium text-ink focus:border-amber focus:bg-surface focus:outline-none"
          >
            <option value="">Toutes catégories ({facets.categories.length})</option>
            {facets.categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={filters.magasin_id}
            onChange={(e) => setFilters((f) => ({ ...f, magasin_id: e.target.value }))}
            className="h-10 rounded-lg border border-line bg-paper px-3 text-xs font-medium text-ink focus:border-amber focus:bg-surface focus:outline-none"
          >
            <option value="">Tous magasins ({magasins.length})</option>
            {magasins.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>

          {/* View mode toggle */}
          <div className="hidden sm:flex items-center rounded-lg border border-line bg-paper p-0.5">
            <button
              onClick={() => setViewMode('table')}
              className={cx(
                'rounded-md px-2.5 py-1.5 text-xs font-semibold transition-all',
                viewMode === 'table' ? 'bg-surface text-ink shadow-xs' : 'text-ink-soft hover:text-ink',
              )}
            >
              Tableur Pro
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={cx(
                'rounded-md px-2.5 py-1.5 text-xs font-semibold transition-all',
                viewMode === 'cards' ? 'bg-surface text-ink shadow-xs' : 'text-ink-soft hover:text-ink',
              )}
            >
              Cartes
            </button>
          </div>
        </div>

        {/* Status Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-line/60">
          {[
            { key: '', label: 'Tous', count: stats.total },
            { key: 'disponible', label: 'Disponibles', count: stats.disponible },
            { key: 'en_pret', label: 'En prêt', count: stats.en_pret },
            { key: 'maintenance', label: 'Maintenance', count: stats.maintenance },
            { key: 'manquant', label: 'Manquants', count: stats.manquant },
            { key: 'reforme', label: 'Réformés', count: stats.reforme },
          ].map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setFilters((f) => ({ ...f, status: key }))}
              className={cx(
                'rounded-full px-3 py-1 text-xs font-medium transition-all flex items-center gap-1.5',
                filters.status === key
                  ? 'bg-amber text-white shadow-xs'
                  : 'bg-paper text-ink-soft hover:bg-paper-2 hover:text-ink border border-line',
              )}
            >
              <span>{label}</span>
              <span
                className={cx(
                  'rounded-full px-1.5 py-0.2 text-[10px] tabular-nums font-semibold',
                  filters.status === key ? 'bg-white/20 text-white' : 'bg-surface text-ink-faint',
                )}
              >
                {count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div>
          <Banner tone="error">{error}</Banner>
        </div>
      ) : null}

      {/* Main Content: Tableur or Cards */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-soft">
          <Spinner /> Chargement du parc d’outils…
        </div>
      ) : tools.length === 0 ? (
        <EmptyState
          title="Aucun outil ne correspond à vos filtres"
          hint="Essayez de modifier vos filtres ou créez la fiche d’un nouvel équipement."
          action={
            canManage ? (
              <Button variant="primary" onClick={() => setNewOpen(true)}>
                Créer un outil
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          {/* Tableur Google Sheets Style */}
          <div className={cx('rounded-xl border border-line bg-surface shadow-xs overflow-hidden', viewMode === 'cards' ? 'hidden' : 'hidden sm:block')}>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-paper-2 border-b border-line text-ink-faint font-semibold uppercase tracking-wider text-[11px]">
                    <th className="sticky left-0 z-10 bg-paper-2 px-3 py-2.5 min-w-24 border-r border-line">
                      Réf / Code QR
                    </th>
                    <th className="px-3 py-2.5 min-w-44 border-r border-line">Désignation</th>
                    <th className="px-3 py-2.5 min-w-28 border-r border-line">Catégorie</th>
                    <th className="px-3 py-2.5 min-w-36 border-r border-line">Emplacement / Magasin</th>
                    <th className="px-3 py-2.5 min-w-24 border-r border-line text-center">État</th>
                    <th className="px-3 py-2.5 min-w-28 border-r border-line text-center">Statut</th>
                    <th className="px-3 py-2.5 min-w-32 text-right">Actions Rapides</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {tools.map((tool) => (
                    <tr
                      key={tool.id}
                      onClick={() => setSelectedId(tool.id)}
                      className="hover:bg-amber-wash/30 cursor-pointer transition-colors group"
                    >
                      {/* Sticky ID */}
                      <td className="sticky left-0 z-10 bg-surface group-hover:bg-surface-2 px-3 py-2 font-mono font-bold text-amber border-r border-line">
                        <div className="flex items-center gap-1.5">
                          <IconQr size={13} className="text-ink-faint shrink-0" />
                          <span>{tool.id}</span>
                        </div>
                      </td>

                      {/* Designation */}
                      <td className="px-3 py-2 font-medium text-ink border-r border-line">
                        <div className="font-semibold">{tool.name}</div>
                        {tool.observations ? (
                          <div className="text-[10px] text-ink-faint truncate max-w-xs">{tool.observations}</div>
                        ) : null}
                      </td>

                      {/* Catégorie */}
                      <td className="px-3 py-2 text-ink-soft border-r border-line">
                        <span className="inline-block rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium border border-line text-ink-soft">
                          {tool.category}
                        </span>
                      </td>

                      {/* Magasin & Location */}
                      <td className="px-3 py-2 text-ink-soft border-r border-line">
                        <div className="font-medium text-ink">{tool.magasin_name ?? 'Magasin Central'}</div>
                        <div className="text-[10px] text-ink-faint">{tool.location}</div>
                      </td>

                      {/* État */}
                      <td className="px-3 py-2 text-center border-r border-line">
                        <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-ink-soft">
                          <span
                            className={cx(
                              'h-1.5 w-1.5 rounded-full shrink-0',
                              tool.condition === 'bon' ? 'bg-green' : tool.condition === 'a_reparer' ? 'bg-amber' : 'bg-red',
                            )}
                          />
                          {CONDITION_LABEL[tool.condition]}
                        </span>
                      </td>

                      {/* Statut Chip */}
                      <td className="px-3 py-2 text-center border-r border-line">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-[11px] font-medium text-ink-soft">
                          <span
                            className={cx(
                              'h-1.5 w-1.5 rounded-full shrink-0',
                              tool.status === 'disponible'
                                ? 'bg-green'
                                : tool.status === 'en_pret'
                                  ? 'bg-amber'
                                  : tool.status === 'maintenance'
                                    ? 'bg-amber-500'
                                    : 'bg-red',
                            )}
                          />
                          {STATUS_LABEL[tool.status]}
                        </span>
                      </td>

                      {/* Actions Rapides */}
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          {canManage && tool.status === 'disponible' ? (
                            <button
                              onClick={() => {
                                setLoanFor(tool);
                                setLoanForm({ employeeId: employees[0]?.id ?? '', motive: '' });
                              }}
                              className="rounded bg-amber px-2.5 py-1 text-[11px] font-semibold text-white shadow-xs hover:bg-[#E05A02] active:scale-95 transition-all"
                            >
                              Prêter
                            </button>
                          ) : null}

                          <button
                            onClick={() => setSelectedId(tool.id)}
                            className="rounded border border-line bg-paper px-2 py-1 text-[11px] font-medium text-ink-soft hover:bg-paper-2 hover:text-ink active:scale-95 transition-all"
                          >
                            Détails ›
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Tableur Footer Total */}
            <div className="bg-paper border-t border-line px-4 py-2 text-xs flex items-center justify-between font-semibold text-ink-soft">
              <span>Total : {tools.length} référence(s)</span>
              <span className="text-[11px] text-ink-faint">
                Cliquez sur n’importe quelle ligne pour voir l’historique ou imprimer le QR code
              </span>
            </div>
          </div>

          {/* Cards View (pour Mobile) */}
          <div className={cx('space-y-2.5', viewMode === 'cards' ? 'block' : 'sm:hidden')}>
            {tools.map((tool) => (
              <div
                key={tool.id}
                onClick={() => setSelectedId(tool.id)}
                className="rounded-xl border border-line bg-surface p-3.5 shadow-xs active:bg-paper-2 cursor-pointer transition-all space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-amber">{tool.id}</span>
                      <span className="rounded bg-paper px-1.5 py-0.5 text-[10px] font-medium text-ink-soft border border-line">
                        {tool.category}
                      </span>
                    </div>
                    <p className="font-semibold text-sm text-ink mt-0.5">{tool.name}</p>
                  </div>

                  <span
                    className={cx(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
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
                        tool.status === 'disponible' ? 'bg-green' : 'bg-amber',
                      )}
                    />
                    {STATUS_LABEL[tool.status]}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-ink-faint pt-2 border-t border-line/60">
                  <span>{tool.magasin_name ?? tool.location}</span>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    {canManage && tool.status === 'disponible' ? (
                      <button
                        onClick={() => {
                          setLoanFor(tool);
                          setLoanForm({ employeeId: employees[0]?.id ?? '', motive: '' });
                        }}
                        className="rounded bg-amber px-2.5 py-1 text-[11px] font-semibold text-white"
                      >
                        Prêter
                      </button>
                    ) : null}
                    <span className="text-ink-soft font-medium flex items-center">
                      Fiche <IconChevronRight size={14} />
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Detail Drawer (Jibble Style) */}
      <Drawer
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
        title={detail ? `${detail.tool.id} — ${detail.tool.name}` : 'Fiche outil'}
        subtitle={detail ? `${detail.tool.category} · ${detail.tool.magasin_name ?? detail.tool.location}` : undefined}
        wide
      >
        {detailLoading || !detail ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-soft">
            <Spinner /> Chargement de la fiche…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone={STATUS_TONE[detail.tool.status]}>{STATUS_LABEL[detail.tool.status]}</Chip>
              <Chip tone={detail.tool.condition === 'bon' ? 'neutral' : 'amber'}>
                {CONDITION_LABEL[detail.tool.condition]}
              </Chip>
              {detail.tool.magasin_name ? <Chip tone="blue">{detail.tool.magasin_name}</Chip> : null}
            </div>

            {detail.tool.status_reason ? (
              <Banner tone={detail.tool.status === 'maintenance' ? 'warning' : 'error'} title="Motif du statut">
                {detail.tool.status_reason}
              </Banner>
            ) : null}

            {detail.loan ? (
              <Banner tone="info" title={`En prêt — ${detail.loan.full_name}`}>
                Sorti le {formatDateTime(detail.loan.out_at)} · {detail.loan.motive ?? 'motif non précisé'}
              </Banner>
            ) : null}

            <Card className="flex items-center gap-4 p-4 border border-line">
              <ToolQr id={detail.tool.id} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">QR Code d’identification</p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  Ce code permet le pointage rapide et le scan instantané à l’atelier.
                </p>
                <Button
                  className="mt-3"
                  size="sm"
                  icon={<IconPrinter size={16} />}
                  onClick={() => {
                    print(<A4Sheet tools={[detail.tool]} />);
                  }}
                >
                  Imprimer l’étiquette
                </Button>
              </div>
            </Card>

            {canManage ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {detail.tool.status === 'disponible' ? (
                  <Button
                    variant="primary"
                    onClick={() => {
                      setLoanFor(detail.tool);
                      setLoanForm({ employeeId: employees[0]?.id ?? '', motive: '' });
                    }}
                  >
                    Prêter cet outil
                  </Button>
                ) : null}
                {detail.loan ? (
                  <Button
                    variant="primary"
                    onClick={() => {
                      setReturnFor(detail.loan);
                      setReturnForm({ condition: 'bon', observations: '' });
                    }}
                  >
                    Enregistrer le retour
                  </Button>
                ) : null}
                <Button
                  onClick={() => {
                    setStatusFor(detail.tool);
                    setStatusForm({ status: detail.tool.status, reason: '' });
                  }}
                >
                  Changer le statut
                </Button>
                <Button
                  onClick={() => {
                    setAssignFor(detail.tool);
                    setAssignMagasinId(detail.tool.magasin_id ?? '');
                  }}
                >
                  Affecter à un magasin
                </Button>
              </div>
            ) : null}

            {detail.tool.observations ? (
              <div>
                <p className="mb-1 text-xs font-semibold text-ink-soft uppercase tracking-wider">Observations</p>
                <p className="rounded-lg border border-line bg-paper p-3 text-xs text-ink">{detail.tool.observations}</p>
              </div>
            ) : null}

            <div>
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-soft">
                <IconWrench size={15} /> Historique des événements
              </p>
              <ol className="relative ml-2 space-y-3 border-l-2 border-line pl-4">
                {detail.events.map((event) => (
                  <li key={event.id} className="relative">
                    <span
                      aria-hidden
                      className="absolute -left-[23px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-amber"
                    />
                    <div className="rounded-lg border border-line bg-surface p-2.5 shadow-xs">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold text-ink">
                          {EVENT_LABEL[event.event_type] ?? event.event_type}
                        </p>
                        <p className="font-mono text-[11px] text-ink-faint tabular-nums">{formatDateTime(event.created_at)}</p>
                      </div>
                      {event.from_status || event.to_status ? (
                        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                          {event.from_status ? (
                            <Chip tone={STATUS_TONE[event.from_status as ToolStatus] ?? 'grey'}>
                              {STATUS_LABEL[event.from_status as ToolStatus] ?? event.from_status}
                            </Chip>
                          ) : null}
                          <span aria-hidden className="text-[12px] text-ink-faint">
                            →
                          </span>
                          {event.to_status ? (
                            <Chip tone={STATUS_TONE[event.to_status as ToolStatus] ?? 'grey'}>
                              {STATUS_LABEL[event.to_status as ToolStatus] ?? event.to_status}
                            </Chip>
                          ) : null}
                        </p>
                      ) : null}
                      {event.note ? <p className="mt-1 text-xs text-ink-soft">{event.note}</p> : null}
                      <p className="mt-1 text-[10px] text-ink-faint">Par {event.actor}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </Drawer>

      {/* Modal Nouvel Outil */}
      <Modal
        open={newOpen}
        title="Nouvel outil"
        onClose={() => setNewOpen(false)}
        footer={
          <>
            <Button onClick={() => setNewOpen(false)}>Annuler</Button>
            <Button variant="primary" disabled={busy || newForm.name.trim().length < 2} onClick={() => void createTool()}>
              {busy ? <Spinner /> : 'Créer la fiche'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field
            label="Désignation"
            value={newForm.name}
            onChange={(event) => setNewForm((f) => ({ ...f, name: event.target.value }))}
            placeholder="ex. Rabot électrique 900 W"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Catégorie"
              value={newForm.category}
              onChange={(event) => setNewForm((f) => ({ ...f, category: event.target.value }))}
              hint="Préfixe généré (ex: RBT, SCI, PER...)"
            />
            <Field
              label="Emplacement normal"
              value={newForm.location}
              onChange={(event) => setNewForm((f) => ({ ...f, location: event.target.value }))}
            />
          </div>
          <SelectField
            label="Magasin / atelier"
            value={newForm.magasin_id}
            onChange={(event) => setNewForm((f) => ({ ...f, magasin_id: event.target.value }))}
          >
            <option value="">— Aucun —</option>
            {magasins.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </SelectField>
          <TextArea
            label="Observations (facultatif)"
            value={newForm.observations}
            onChange={(event) => setNewForm((f) => ({ ...f, observations: event.target.value }))}
          />
        </div>
      </Modal>

      {/* Modal Prêt */}
      <Modal
        open={!!loanFor}
        title={loanFor ? `Prêter : ${loanFor.id} — ${loanFor.name}` : 'Prêt'}
        onClose={() => setLoanFor(null)}
        footer={
          <>
            <Button onClick={() => setLoanFor(null)}>Annuler</Button>
            <Button
              variant="primary"
              disabled={busy || !loanForm.employeeId || loanForm.motive.trim().length < 2}
              onClick={() => void createLoan()}
            >
              {busy ? <Spinner /> : 'Confirmer le prêt'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <SelectField
            label="Travailleur bénéficiaire"
            value={loanForm.employeeId}
            onChange={(event) => setLoanForm((f) => ({ ...f, employeeId: event.target.value }))}
          >
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.full_name} — {employee.job_title}
              </option>
            ))}
          </SelectField>
          <Field
            label="Motif / Chantier"
            value={loanForm.motive}
            onChange={(event) => setLoanForm((f) => ({ ...f, motive: event.target.value }))}
            placeholder="ex. Pose des portes chapelle nord"
          />
          <p className="text-xs text-ink-faint">
            L’horodatage officiel sera consigné au serveur lors de la validation.
          </p>
        </div>
      </Modal>

      {/* Modal Retour */}
      <Modal
        open={!!returnFor}
        title={returnFor ? `Retour prêt #${returnFor.id}` : 'Retour'}
        onClose={() => setReturnFor(null)}
        footer={
          <>
            <Button onClick={() => setReturnFor(null)}>Annuler</Button>
            <Button variant="primary" disabled={busy} onClick={() => void confirmReturn()}>
              {busy ? <Spinner /> : 'Valider le retour'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <SelectField
            label="État au retour"
            value={returnForm.condition}
            onChange={(event) =>
              setReturnForm((f) => ({ ...f, condition: event.target.value as ToolCondition | 'endommage' }))
            }
          >
            <option value="bon">Bon état (opérationnel)</option>
            <option value="a_reparer">À réparer (maintenance)</option>
            <option value="endommage">Endommagé (incident)</option>
          </SelectField>
          <TextArea
            label="Observations"
            value={returnForm.observations}
            onChange={(event) => setReturnForm((f) => ({ ...f, observations: event.target.value }))}
            placeholder="Usure anormale, pièces manquantes…"
          />
        </div>
      </Modal>

      {/* Modal Statut */}
      <Modal
        open={!!statusFor}
        title={statusFor ? `Statut de l'outil ${statusFor.id}` : 'Statut'}
        onClose={() => setStatusFor(null)}
        footer={
          <>
            <Button onClick={() => setStatusFor(null)}>Annuler</Button>
            <Button
              variant="primary"
              disabled={busy || statusForm.reason.trim().length < 2}
              onClick={() => void changeStatus()}
            >
              {busy ? <Spinner /> : 'Enregistrer'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <SelectField
            label="Nouveau statut"
            value={statusForm.status}
            onChange={(event) => setStatusForm((f) => ({ ...f, status: event.target.value as ToolStatus }))}
          >
            {(Object.keys(STATUS_LABEL) as ToolStatus[])
              .filter((status) => status !== 'en_pret')
              .map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABEL[status]}
                </option>
              ))}
          </SelectField>
          <Field
            label="Motif du changement"
            value={statusForm.reason}
            onChange={(event) => setStatusForm((f) => ({ ...f, reason: event.target.value }))}
            placeholder="ex. Révision périodique, pièce commandée"
          />
        </div>
      </Modal>

      {/* Modal Affectation */}
      <Modal
        open={!!assignFor}
        title={assignFor ? `Affecter : ${assignFor.id}` : 'Affectation'}
        onClose={() => setAssignFor(null)}
        footer={
          <>
            <Button onClick={() => setAssignFor(null)}>Annuler</Button>
            <Button variant="primary" disabled={busy} onClick={() => void assignMagasin()}>
              {busy ? <Spinner /> : 'Affecter'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <SelectField
            label="Magasin / Atelier d'affectation"
            value={assignMagasinId}
            onChange={(event) => setAssignMagasinId(event.target.value)}
          >
            <option value="">— Aucun —</option>
            {magasins.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </SelectField>
        </div>
      </Modal>

      {/* Modal Planche A4 */}
      <Modal
        open={printOpen}
        title="Planches d’étiquettes QR (A4)"
        onClose={() => setPrintOpen(false)}
        footer={
          <>
            <Button onClick={() => setPrintOpen(false)}>Fermer</Button>
            <Button
              variant="primary"
              icon={<IconPrinter size={18} />}
              disabled={!tools.some((tool) => printPick[tool.id])}
              onClick={() => {
                print(<A4Sheet tools={tools.filter((tool) => printPick[tool.id])} />);
                setPrintOpen(false);
              }}
            >
              Imprimer la sélection
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-line">
            <span className="text-xs text-ink-soft">Cochez les outils à imprimer sur la planche</span>
            <button
              onClick={() => {
                const allSelected = tools.every((t) => printPick[t.id]);
                setPrintPick(Object.fromEntries(tools.map((t) => [t.id, !allSelected])));
              }}
              className="text-xs font-semibold text-amber hover:underline"
            >
              Tout cocher / décocher
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto space-y-1 pr-1">
            {tools.map((tool) => (
              <label
                key={tool.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2 hover:bg-paper"
              >
                <input
                  type="checkbox"
                  checked={!!printPick[tool.id]}
                  onChange={(event) => setPrintPick((p) => ({ ...p, [tool.id]: event.target.checked }))}
                  className="h-4 w-4 rounded accent-amber"
                />
                <span className="font-mono text-xs font-bold text-amber">{tool.id}</span>
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink">{tool.name}</span>
                <span className="text-[11px] text-ink-faint">{tool.category}</span>
              </label>
            ))}
          </div>
        </div>
      </Modal>

      {portal}
    </div>
  );
}

function ToolQr({ id }: { id: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void qrDataUrl(`${QR_PREFIX.tool}${id}`, 200).then((value) => {
      if (!cancelled) setSrc(value);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);
  return (
    <span className="grid h-24 w-24 shrink-0 place-items-center rounded-xl border border-line bg-white shadow-xs">
      {src ? <img src={src} alt={`QR ${id}`} className="h-20 w-20" /> : <IconBox size={28} className="text-ink-faint" />}
    </span>
  );
}
