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
  PageHeader,
  SelectField,
  Spinner,
  TextArea,
  cx,
  useToast,
} from '../components/ui';
import { IconChevronRight, IconPlus, IconPrinter, IconQr, IconSearch, IconWrench } from '../components/Icons';
import { DataTable, type DataTableColumn } from '../components/DataTable';

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
  const canManage = user.role === 'magasinier' || user.role === 'admin';

  const [filters, setFilters] = useState({ q: '', status: '', category: '', location: '', magasin_id: '' });
  const [tools, setTools] = useState<Tool[]>([]);
  const [facets, setFacets] = useState<Facets>({ categories: [], locations: [] });
  const [magasins, setMagasins] = useState<Magasin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

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

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { tous: tools.length };
    for (const tool of tools) counts[tool.status] = (counts[tool.status] ?? 0) + 1;
    return counts;
  }, [tools]);

  const toolColumns = useMemo<DataTableColumn<Tool>[]>(
    () => [
      {
        accessorKey: 'id',
        header: 'ID',
        sortFn: 'alphanumeric',
        cell: ({ row }) => <span className="font-mono text-[13px] font-medium num">{row.original.id}</span>,
      },
      {
        accessorKey: 'name',
        header: 'Désignation',
        sortFn: 'alphanumeric',
        meta: { cellClassName: 'whitespace-normal min-w-44' },
        cell: ({ row }) => (
          <div>
            <p className="text-sm font-medium text-ink">{row.original.name}</p>
            <p className="text-[12px] text-ink-faint">{row.original.category}</p>
          </div>
        ),
      },
      {
        accessorKey: 'location',
        header: 'Emplacement',
        meta: { headerClassName: 'hidden md:table-cell', cellClassName: 'hidden md:table-cell text-sm text-ink-soft' },
        cell: ({ row }) => row.original.location,
      },
      {
        id: 'condition',
        accessorKey: 'condition',
        header: 'État',
        meta: { headerClassName: 'hidden sm:table-cell', cellClassName: 'hidden sm:table-cell' },
        cell: ({ row }) => (
          <Chip tone={row.original.condition === 'bon' ? 'neutral' : 'amber'}>{CONDITION_LABEL[row.original.condition]}</Chip>
        ),
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: 'Statut',
        sortFn: 'alphanumeric',
        cell: ({ row }) => <Chip tone={STATUS_TONE[row.original.status]}>{STATUS_LABEL[row.original.status]}</Chip>,
      },
      {
        id: 'actions',
        enableSorting: false,
        header: '',
        meta: { headerClassName: 'w-10', cellClassName: 'w-10' },
        cell: () => (
          <span className="flex justify-end text-ink-faint" aria-hidden>
            <IconChevronRight size={18} />
          </span>
        ),
      },
    ],
    [],
  );

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
      toast(`Outil ${res.tool.id} créé.`, 'success');
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
      toast(`${loanFor.id} sorti en prêt.`, 'success');
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
    <>
      <PageHeader
        title="Outils & QR codes"
        hint="Fiche, statut, historique et planches d’étiquettes (OUT-01 à QR-04)."
        actions={
          <>
            <Button
              icon={<IconPrinter size={18} />}
              onClick={() => {
                setPrintPick(Object.fromEntries(tools.map((tool) => [tool.id, false])));
                setPrintOpen(true);
              }}
            >
              Planche A4
            </Button>
            {canManage ? (
              <Button variant="primary" icon={<IconPlus size={18} />} onClick={() => setNewOpen(true)}>
                Nouvel outil
              </Button>
            ) : null}
          </>
        }
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint">
              <IconSearch size={16} />
            </span>
            <input
              value={filters.q}
              onChange={(event) => setFilters((f) => ({ ...f, q: event.target.value }))}
              placeholder="Rechercher un identifiant, un nom, une catégorie…"
              className="h-11 w-full rounded-btn border border-line-strong bg-surface pr-3 pl-9 text-sm placeholder:text-ink-faint focus:border-amber focus:outline-none"
            />
          </div>
          <SelectField value={filters.status} onChange={(event) => setFilters((f) => ({ ...f, status: event.target.value }))}>
            <option value="">Tous les statuts</option>
            {(Object.keys(STATUS_LABEL) as ToolStatus[]).map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </SelectField>
          <SelectField value={filters.category} onChange={(event) => setFilters((f) => ({ ...f, category: event.target.value }))}>
            <option value="">Toutes catégories</option>
            {facets.categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </SelectField>
          <SelectField value={filters.location} onChange={(event) => setFilters((f) => ({ ...f, location: event.target.value }))}>
            <option value="">Tous emplacements</option>
            {facets.locations.map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
          </SelectField>
          <SelectField value={filters.magasin_id} onChange={(event) => setFilters((f) => ({ ...f, magasin_id: event.target.value }))}>
            <option value="">Tous magasins</option>
            {magasins.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </SelectField>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {['tous', 'disponible', 'en_pret', 'maintenance', 'manquant', 'reforme'].map((key) => (
            <button
              key={key}
              onClick={() => setFilters((f) => ({ ...f, status: key === 'tous' ? '' : key }))}
              className={cx(
                'rounded-chip border px-2.5 py-1 text-[12px] font-medium',
                (key === 'tous' && !filters.status) || filters.status === key
                  ? 'border-amber bg-amber-wash text-amber'
                  : 'border-line-strong bg-surface-2 text-ink-soft hover:border-amber/50',
              )}
            >
              {key === 'tous' ? 'Tous' : STATUS_LABEL[key as ToolStatus]}
              <span className="ml-1.5 font-mono num">{statusCounts[key] ?? 0}</span>
            </button>
          ))}
        </div>
      </Card>

      {error ? (
        <div className="mb-4">
          <Banner tone="error">{error}</Banner>
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-soft">
          <Spinner /> Chargement des outils…
        </div>
      ) : tools.length === 0 ? (
        <EmptyState
          title="Aucun outil ne correspond à ces filtres"
          hint="Modifiez la recherche ou créez la fiche d’un nouvel outil."
          action={
            canManage ? (
              <Button variant="primary" onClick={() => setNewOpen(true)}>
                Créer un outil
              </Button>
            ) : null
          }
        />
      ) : (
        <DataTable
          data={tools}
          columns={toolColumns}
          onRowClick={(tool) => setSelectedId(tool.id)}
          caption="Liste des outils — cliquez une ligne pour ouvrir la fiche"
          minWidth="min-w-[46rem]"
          empty={<EmptyState title="Aucun outil ne correspond" />}
        />
      )}

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

            <Card className="flex items-center gap-4 p-4">
              <ToolQr id={detail.tool.id} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">QR code de l’outil</p>
                <p className="mt-1 text-[13px] text-ink-soft">
                  Le code renvoie à la fiche et ne contient que l’identifiant (QR-01).
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

            <div className="grid gap-3 sm:grid-cols-2">
              {canManage && detail.tool.status === 'disponible' ? (
                <Button
                  variant="primary"
                  onClick={() => {
                    setLoanFor(detail.tool);
                    setLoanForm({ employeeId: employees[0]?.id ?? '', motive: '' });
                  }}
                >
                  Enregistrer un prêt (sortir)
                </Button>
              ) : null}
              {canManage && detail.loan ? (
                <Button
                  variant="primary"
                  onClick={() => {
                    setReturnFor(detail.loan);
                    setReturnForm({ condition: 'bon', observations: '' });
                  }}
                >
                  Enregistrer un retour (entrer)
                </Button>
              ) : null}
              {canManage ? (
                <Button
                  onClick={() => {
                    setAssignFor(detail.tool);
                    setAssignMagasinId(detail.tool.magasin_id ?? '');
                  }}
                >
                  Affecter à un magasin
                </Button>
              ) : null}
              {canManage ? (
                <Button
                  onClick={() => {
                    setStatusFor(detail.tool);
                    setStatusForm({ status: detail.tool.status, reason: '' });
                  }}
                >
                  Changer le statut
                </Button>
              ) : null}
            </div>

            {detail.tool.observations ? (
              <div>
                <p className="mb-1 text-[13px] font-medium text-ink-soft">Observations</p>
                <p className="rounded-btn border border-line bg-surface-2 px-3 py-2 text-sm">{detail.tool.observations}</p>
              </div>
            ) : null}

            <div>
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                <IconWrench size={16} /> Historique (OUT-03)
              </p>
              <ol className="space-y-2">
                {detail.events.map((event) => (
                  <li key={event.id} className="rounded-btn border border-line bg-surface px-3 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-ink">{EVENT_LABEL[event.event_type] ?? event.event_type}</p>
                      <p className="font-mono text-[12px] text-ink-faint num">{formatDateTime(event.created_at)}</p>
                    </div>
                    {event.from_status || event.to_status ? (
                      <p className="mt-1 font-mono text-[12px] text-ink-soft">
                        {event.from_status ?? '—'} → {event.to_status ?? '—'}
                      </p>
                    ) : null}
                    {event.note ? <p className="mt-1 text-[13px] text-ink-soft">{event.note}</p> : null}
                    <p className="mt-1 text-[12px] text-ink-faint">Par {event.actor}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </Drawer>

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
              hint="Utilisée pour préfixer l’identifiant (RBT, SCI, PER…)"
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

      <Modal
        open={!!loanFor}
        title={loanFor ? `Prêt — ${loanFor.id}` : 'Prêt'}
        onClose={() => setLoanFor(null)}
        footer={
          <>
            <Button onClick={() => setLoanFor(null)}>Annuler</Button>
            <Button
              variant="primary"
              disabled={busy || !loanForm.employeeId || loanForm.motive.trim().length < 2}
              onClick={() => void createLoan()}
            >
              {busy ? <Spinner /> : 'Valider la sortie'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <SelectField
            label="Travailleur"
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
            label="Motif / travail"
            value={loanForm.motive}
            onChange={(event) => setLoanForm((f) => ({ ...f, motive: event.target.value }))}
            placeholder="ex. Pose du plafond salle paroissiale"
          />
          <p className="text-[12px] text-ink-faint">
            La date et l’heure sont relevées sur le serveur au moment de la validation (PRE-01).
          </p>
        </div>
      </Modal>

      <Modal
        open={!!returnFor}
        title={returnFor ? `Retour — prêt n° ${returnFor.id}` : 'Retour'}
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
            <option value="bon">Bon état</option>
            <option value="a_reparer">À réparer</option>
            <option value="endommage">Endommagé</option>
          </SelectField>
          <TextArea
            label="Observations"
            value={returnForm.observations}
            onChange={(event) => setReturnForm((f) => ({ ...f, observations: event.target.value }))}
            placeholder="Usure constatée, pièce manquante…"
          />
          <p className="text-[12px] text-ink-faint">
            Un outil rendu « à réparer » passe automatiquement en maintenance (PRE-03).
          </p>
        </div>
      </Modal>

      <Modal
        open={!!statusFor}
        title={statusFor ? `Statut — ${statusFor.id}` : 'Statut'}
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
            label="Motif"
            value={statusForm.reason}
            onChange={(event) => setStatusForm((f) => ({ ...f, reason: event.target.value }))}
            placeholder="ex. Constaté à l’inventaire du 14/10"
          />
          <p className="text-[12px] text-ink-faint">
            Aucune modification n’est effacée : l’entrée reste visible dans l’historique et le journal d’audit.
          </p>
        </div>
      </Modal>

      <Modal
        open={!!assignFor}
        title={assignFor ? `Affecter — ${assignFor.id}` : 'Affectation'}
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
            label="Magasin / atelier"
            value={assignMagasinId}
            onChange={(event) => setAssignMagasinId(event.target.value)}
          >
            <option value="">— Aucun —</option>
            {magasins.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </SelectField>
          <p className="text-[12px] text-ink-faint">
            L’outil sera rattaché au magasin sélectionné. L’emplacement historique est conservé.
          </p>
        </div>
      </Modal>

      <Modal
        open={printOpen}
        title="Planches d’étiquettes (A4)"
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
        <p className="mb-3 text-sm text-ink-soft">
          Chaque étiquette comporte le QR code, l’identifiant et le nom (QR-02). Sélectionnez les outils à imprimer.
        </p>
        <div className="space-y-1">
          {tools.map((tool) => (
            <label
              key={tool.id}
              className="flex cursor-pointer items-center gap-3 rounded-btn border border-line bg-surface px-3 py-2 hover:bg-surface-2"
            >
              <input
                type="checkbox"
                checked={!!printPick[tool.id]}
                onChange={(event) => setPrintPick((p) => ({ ...p, [tool.id]: event.target.checked }))}
                className="h-4 w-4 accent-[#b4530a]"
              />
              <span className="font-mono text-[13px] num">{tool.id}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{tool.name}</span>
            </label>
          ))}
        </div>
      </Modal>

      {portal}
    </>
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
    <span className="grid h-24 w-24 shrink-0 place-items-center rounded-btn border border-line bg-white">
      {src ? <img src={src} alt={`QR ${id}`} className="h-20 w-20" /> : <IconQr size={28} className="text-ink-faint" />}
    </span>
  );
}
