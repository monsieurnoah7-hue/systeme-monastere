import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type Magasin, type ScanResult, type StockMovement, type StockRef, type User } from '../lib/api';
import { QR_PREFIX } from '../lib/qr';
import { MOVE_LABEL, MOVE_TONE, formatDateTime } from '../lib/labels';
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
  SegmentedControl,
  SelectField,
  Spinner,
  TextArea,
  cx,
  useToast,
} from '../components/ui';
import { QrCode } from '../components/QrCode';
import { DataTable, type DataTableColumn } from '../components/DataTable';
import { IconArrowIn, IconArrowOut, IconBox, IconHistory, IconPlus, IconRefresh, IconSearch } from '../components/Icons';

type RefForm = {
  name: string;
  category: string;
  unit: string;
  location: string;
  magasin_id: string;
  min_qty: string;
  supplier: string;
  initial_qty: string;
};

type MoveForm = {
  ref_id: string;
  move_type: 'in' | 'out' | 'correction';
  qty: string;
  beneficiary: string;
  doc_ref: string;
  note: string;
};

const EMPTY_REF: RefForm = { name: '', category: '', unit: 'u', location: '', magasin_id: '', min_qty: '0', supplier: '', initial_qty: '0' };

function stockState(ref: StockRef): { label: string; tone: 'green' | 'amber' | 'red' } {
  if (ref.qty <= 0) return { label: 'Épuisée', tone: 'red' };
  if (ref.qty <= ref.min_qty) return { label: 'Sous le seuil', tone: 'amber' };
  return { label: 'Stock correct', tone: 'green' };
}

function StockBar({ ref }: { ref: StockRef }) {
  const target = Math.max(ref.min_qty * 2, ref.qty, 1);
  const pct = Math.min(100, Math.round((ref.qty / target) * 100));
  const state = stockState(ref);
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 text-right font-mono text-sm font-semibold num">
        {ref.qty} <span className="text-[11px] font-normal text-ink-faint">{ref.unit}</span>
      </span>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-line">
        <span
          className={cx(
            'block h-full rounded-full',
            state.tone === 'red' ? 'bg-red' : state.tone === 'amber' ? 'bg-amber' : 'bg-green',
          )}
          style={{ width: `${pct}%` }}
        />
      </span>
    </div>
  );
}

export function Stock({ user, scan }: { user: User; scan?: ScanResult | null }) {
  const toast = useToast();
  const canManageRefs = user.role === 'magasinier' || user.role === 'admin';
  const canMove = ['direction', 'magasinier', 'chef_atelier', 'admin'].includes(user.role);

  const [refs, setRefs] = useState<StockRef[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [magasins, setMagasins] = useState<Magasin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [q, setQ] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [magasinFilter, setMagasinFilter] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [journalType, setJournalType] = useState<'' | 'in' | 'out' | 'correction'>('');
  const [journalFrom, setJournalFrom] = useState('');
  const [journalTo, setJournalTo] = useState('');
  const [journalQ, setJournalQ] = useState('');

  const [refOpen, setRefOpen] = useState(false);
  const [editing, setEditing] = useState<StockRef | null>(null);
  const [refForm, setRefForm] = useState<RefForm>(EMPTY_REF);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [moveOpen, setMoveOpen] = useState(false);
  const [moveForm, setMoveForm] = useState<MoveForm>({
    ref_id: '',
    move_type: 'out',
    qty: '1',
    beneficiary: '',
    doc_ref: '',
    note: '',
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const moveParams = new URLSearchParams();
    if (journalType) moveParams.set('move_type', journalType);
    if (journalFrom) moveParams.set('from', journalFrom);
    if (journalTo) moveParams.set('to', journalTo);
    if (journalQ) moveParams.set('q', journalQ);
    Promise.all([
      api<{ refs: StockRef[] }>('/api/stock/refs'),
      api<{ movements: StockMovement[] }>(`/api/stock/movements?${moveParams.toString()}`),
      api<{ magasins: Magasin[] }>('/api/magasins').catch(() => ({ magasins: [] })),
    ])
      .then(([refsRes, movesRes, magRes]) => {
        if (cancelled) return;
        setRefs(refsRes.refs);
        setMovements(movesRes.movements.slice(0, 80));
        setMagasins(magRes.magasins.filter((m) => m.active));
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
  }, [reload, journalType, journalFrom, journalTo, journalQ]);

  const refresh = useCallback(() => setReload((value) => value + 1), []);

  useEffect(() => {
    if (!scan) return;
    if (scan.kind === 'stock') {
      setQ('');
      setLowOnly(false);
      setSelectedId(scan.ref.id);
      setReload((value) => value + 1);
    }
  }, [scan]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return refs.filter((ref) => {
      if (lowOnly && ref.qty > ref.min_qty) return false;
      if (magasinFilter && ref.magasin_id !== magasinFilter) return false;
      if (!needle) return true;
      return (
        ref.name.toLowerCase().includes(needle) ||
        ref.category.toLowerCase().includes(needle) ||
        ref.location.toLowerCase().includes(needle) ||
        (ref.supplier ?? '').toLowerCase().includes(needle)
      );
    });
  }, [refs, q, lowOnly, magasinFilter]);

  const selected = refs.find((ref) => ref.id === selectedId) ?? null;

  const stockColumns = useMemo<DataTableColumn<StockRef>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Désignation',
        sortFn: 'alphanumeric',
        meta: { cellClassName: 'whitespace-normal min-w-44' },
        cell: ({ row }) => (
          <div>
            <p className="text-sm font-medium text-ink">{row.original.name}</p>
            <p className="text-[12px] text-ink-faint sm:hidden">
              {row.original.category} · {row.original.location}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'category',
        header: 'Catégorie',
        sortFn: 'alphanumeric',
        meta: { headerClassName: 'hidden sm:table-cell', cellClassName: 'hidden sm:table-cell text-sm text-ink-soft' },
        cell: ({ row }) => row.original.category,
      },
      {
        accessorKey: 'location',
        header: 'Emplacement',
        sortFn: 'alphanumeric',
        meta: { headerClassName: 'hidden md:table-cell', cellClassName: 'hidden md:table-cell text-sm text-ink-soft' },
        cell: ({ row }) => row.original.location,
      },
      {
        id: 'qty',
        accessorKey: 'qty',
        header: 'Stock',
        cell: ({ row }) => <StockBar ref={row.original} />,
      },
      {
        id: 'state',
        accessorKey: 'qty',
        header: 'État',
        cell: ({ row }) => {
          const state = stockState(row.original);
          return <Chip tone={state.tone}>{state.label}</Chip>;
        },
      },
      {
        id: 'actions',
        enableSorting: false,
        header: '',
        meta: { headerClassName: 'w-10', cellClassName: 'w-10' },
        cell: () => (
          <span className="text-ink-faint" aria-hidden>
            ›
          </span>
        ),
      },
    ],
    [],
  );
  const selectedMoves = movements.filter((move) => move.ref_id === selectedId);

  function openCreate() {
    setEditing(null);
    setRefForm(EMPTY_REF);
    setFormError(null);
    setRefOpen(true);
  }

  function openEdit(ref: StockRef) {
    setEditing(ref);
    setRefForm({
      name: ref.name,
      category: ref.category,
      unit: ref.unit,
      location: ref.location,
      magasin_id: ref.magasin_id ?? '',
      min_qty: String(ref.min_qty),
      supplier: ref.supplier ?? '',
      initial_qty: '0',
    });
    setFormError(null);
    setRefOpen(true);
  }

  async function saveRef() {
    setBusy(true);
    setFormError(null);
    try {
      if (editing) {
        await api(`/api/stock/refs/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: refForm.name,
            category: refForm.category,
            unit: refForm.unit,
            location: refForm.location,
            magasin_id: refForm.magasin_id || null,
            min_qty: Number(refForm.min_qty),
            supplier: refForm.supplier,
          }),
        });
        toast('Référence mise à jour.', 'success');
      } else {
        await api('/api/stock/refs', {
          method: 'POST',
          body: JSON.stringify({
            name: refForm.name,
            category: refForm.category || 'Divers',
            unit: refForm.unit || 'u',
            location: refForm.location || 'Quincaillerie',
            magasin_id: refForm.magasin_id || undefined,
            min_qty: Number(refForm.min_qty),
            supplier: refForm.supplier,
            initial_qty: Number(refForm.initial_qty),
          }),
        });
        toast('Référence créée.', 'success');
      }
      setRefOpen(false);
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  }

  function openMove(type: 'in' | 'out' | 'correction', refId?: number) {
    setMoveForm({
      ref_id: refId ? String(refId) : (refs[0]?.id ? String(refs[0].id) : ''),
      move_type: type,
      qty: '1',
      beneficiary: type === 'out' ? '' : '',
      doc_ref: '',
      note: '',
    });
    setFormError(null);
    setMoveOpen(true);
  }

  async function saveMove() {
    setBusy(true);
    setFormError(null);
    try {
      const res = await api<{ qty: number }>('/api/stock/movements', {
        method: 'POST',
        body: JSON.stringify({
          ref_id: Number(moveForm.ref_id),
          move_type: moveForm.move_type,
          qty: Number(moveForm.qty),
          beneficiary: moveForm.beneficiary || undefined,
          doc_ref: moveForm.doc_ref || undefined,
          note: moveForm.note || undefined,
        }),
      });
      toast(`Mouvement enregistré · nouveau stock ${res.qty}.`, 'success');
      setMoveOpen(false);
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Mouvement refusé.');
    } finally {
      setBusy(false);
    }
  }

  const moveTypes: { value: MoveForm['move_type']; label: string }[] = [
    { value: 'out', label: 'Sortie' },
    ...(canManageRefs
      ? ([
          { value: 'in', label: 'Entrée' },
          { value: 'correction', label: 'Correction (comptage)' },
        ] as const)
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Stock quincaillerie"
        hint="Inventaire, seuils minimums et journal des mouvements (STK-01 à STK-04)."
        actions={
          <>
            <Button icon={<IconRefresh size={18} />} onClick={refresh}>
              Actualiser
            </Button>
            {canMove ? (
              <Button icon={<IconArrowOut size={18} />} onClick={() => openMove('out')}>
                Sortie
              </Button>
            ) : null}
            {canManageRefs ? (
              <>
                <Button icon={<IconArrowIn size={18} />} onClick={() => openMove('in')}>
                  Entrée
                </Button>
                <Button variant="primary" icon={<IconPlus size={18} />} onClick={openCreate}>
                  Nouvelle référence
                </Button>
              </>
            ) : null}
          </>
        }
      />

      {error ? (
        <div className="mb-4">
          <Banner tone="error">{error}</Banner>
        </div>
      ) : null}

      {loading && refs.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-24 text-sm text-ink-soft">
          <Spinner /> Chargement du stock…
        </div>
      ) : (
        <>
          <Card className="mb-4 flex flex-wrap items-center gap-3 p-3">
            <div className="relative min-w-56 flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">
                <IconSearch size={16} />
              </span>
              <input
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="Rechercher une référence, un fournisseur…"
                className="h-11 w-full rounded-btn border border-line-strong bg-surface pl-9 pr-3 text-sm focus:border-amber focus:outline-none"
              />
            </div>
            <button
              onClick={() => setLowOnly((value) => !value)}
              className={cx(
                'h-11 rounded-btn border px-3 text-sm font-medium',
                lowOnly ? 'border-amber bg-amber-wash text-amber' : 'border-line-strong bg-surface text-ink-soft hover:bg-surface-2',
              )}
            >
              Sous le seuil uniquement
            </button>
            <p className="text-[13px] text-ink-faint">
              {filtered.length} référence{filtered.length > 1 ? 's' : ''}
            </p>
          </Card>

          {magasins.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              <button
                onClick={() => setMagasinFilter('')}
                className={cx(
                  'rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-all',
                  !magasinFilter ? 'border-charcoal bg-charcoal text-white' : 'border-line-strong bg-surface text-ink-soft hover:bg-paper-2',
                )}
              >
                Tous magasins
              </button>
              {magasins.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMagasinFilter(m.id)}
                  className={cx(
                    'rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-all',
                    magasinFilter === m.id ? 'border-charcoal bg-charcoal text-white' : 'border-line-strong bg-surface text-ink-soft hover:bg-paper-2',
                  )}
                >
                  {m.name}
                </button>
              ))}
            </div>
          )}

          <DataTable
            data={filtered}
            columns={stockColumns}
            onRowClick={(ref) => setSelectedId(ref.id)}
            caption="Inventaire des références de stock — cliquez une ligne pour ouvrir la fiche"
            empty={<EmptyState title="Aucune référence" hint="Aucun article ne correspond à ce filtre." />}
          />

          <div className="mt-6">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
              <IconHistory size={16} /> Journal des mouvements
            </h2>
            <Card className="mb-3 flex flex-wrap items-center gap-2 p-2.5">
              <SegmentedControl
                value={journalType}
                onChange={(v) => setJournalType(v as typeof journalType)}
                size="sm"
                options={[
                  { value: '', label: 'Tous' },
                  { value: 'in', label: 'Entrées' },
                  { value: 'out', label: 'Sorties' },
                  { value: 'correction', label: 'Corrections' },
                ]}
              />
              <input
                type="date"
                value={journalFrom}
                onChange={(e) => setJournalFrom(e.target.value)}
                className="h-9 rounded-btn border border-line-strong bg-surface px-2 text-[13px] text-ink focus:border-amber focus:outline-none"
                aria-label="Du"
              />
              <span className="text-ink-faint">→</span>
              <input
                type="date"
                value={journalTo}
                onChange={(e) => setJournalTo(e.target.value)}
                className="h-9 rounded-btn border border-line-strong bg-surface px-2 text-[13px] text-ink focus:border-amber focus:outline-none"
                aria-label="Au"
              />
              <input
                value={journalQ}
                onChange={(e) => setJournalQ(e.target.value)}
                placeholder="Rechercher (article, bénéficiaire, agent)…"
                className="h-9 min-w-40 flex-1 rounded-btn border border-line-strong bg-surface px-3 text-[13px] text-ink placeholder:text-ink-faint focus:border-amber focus:outline-none"
              />
            </Card>
            {movements.length === 0 ? (
              <EmptyState title="Aucun mouvement enregistré" hint="Les entrées, sorties et corrections apparaîtront ici." />
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                {movements.map((move) => (
                  <li key={move.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span
                      className={cx(
                        'grid h-7 w-7 shrink-0 place-items-center rounded-chip',
                        move.move_type === 'in'
                          ? 'bg-green-wash text-green'
                          : move.move_type === 'out'
                            ? 'bg-red-wash text-red'
                            : 'bg-amber-wash text-amber',
                      )}
                    >
                      {move.move_type === 'in' ? <IconArrowIn size={15} /> : <IconArrowOut size={15} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{move.ref_name}</p>
                      <p className="truncate text-[12px] text-ink-soft">
                        {MOVE_LABEL[move.move_type]} · {move.beneficiary ?? '—'}
                        {move.note ? ` · ${move.note}` : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm font-semibold num">
                        {move.move_type === 'in' ? '+' : move.move_type === 'correction' ? (move.qty >= 0 ? '+' : '−') : '−'}
                        {Math.abs(move.qty)} {move.unit}
                      </p>
                      <p className="font-mono text-[11px] text-ink-faint num">{formatDateTime(move.created_at)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      <Drawer
        open={!!selected}
        onClose={() => setSelectedId(null)}
        title={selected?.name ?? 'Référence'}
        subtitle={selected ? `${selected.category} · ${selected.location}` : undefined}
      >
        {selected ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <Chip tone={stockState(selected).tone}>{stockState(selected).label}</Chip>
              {canManageRefs ? (
                <Button size="sm" onClick={() => openEdit(selected)}>
                  Modifier la fiche
                </Button>
              ) : null}
            </div>

            <Card className="p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] text-ink-soft">Stock théorique</span>
                <span className="font-mono text-2xl font-semibold num">
                  {selected.qty} <span className="text-sm font-normal text-ink-faint">{selected.unit}</span>
                </span>
              </div>
              <div className="mt-2">
                <StockBar ref={selected} />
              </div>
              <div className="mt-3 space-y-0">
                <div className="flex items-baseline justify-between border-b border-line py-2">
                  <span className="text-[13px] text-ink-soft">Seuil minimum</span>
                  <span className="font-mono text-sm font-medium num">
                    {selected.min_qty} {selected.unit}
                  </span>
                </div>
                <div className="flex items-baseline justify-between border-b border-line py-2">
                  <span className="text-[13px] text-ink-soft">Fournisseur</span>
                  <span className="text-sm font-medium text-ink">{selected.supplier ?? '—'}</span>
                </div>
              </div>
            </Card>

            <Card className="flex items-center gap-4 p-4">
              <QrCode value={`${QR_PREFIX.stock}${selected.id}`} size={96} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">Étiquette de stock</p>
                <p className="mt-1 text-[13px] text-ink-soft">
                  Scannez ce QR avec le bouton global pour ouvrir directement l’entrée, la sortie ou la correction de
                  cette référence.
                </p>
                <p className="mt-1 font-mono text-[12px] text-ink-faint num">montfebe:stock:{selected.id}</p>
              </div>
            </Card>

            <div>
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                <IconBox size={16} /> Mouvements de cette référence
              </p>
              {selectedMoves.length === 0 ? (
                <p className="text-sm text-ink-soft">Aucun mouvement enregistré.</p>
              ) : (
                <ul className="space-y-2">
                  {selectedMoves.map((move) => (
                    <li key={move.id} className="rounded-btn border border-line bg-surface px-3 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <Chip tone={MOVE_TONE[move.move_type] ?? 'neutral'}>{MOVE_LABEL[move.move_type]}</Chip>
                        <span className="font-mono text-sm font-semibold num">
                          {move.move_type === 'in' ? '+' : '−'}
                          {Math.abs(move.qty)} {move.unit}
                        </span>
                      </div>
                      <p className="mt-1 text-[13px] text-ink-soft">
                        {move.beneficiary ?? '—'}
                        {move.note ? ` · ${move.note}` : ''}
                      </p>
                      <p className="mt-1 font-mono text-[11px] text-ink-faint num">
                        {formatDateTime(move.created_at)} · {move.actor}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </Drawer>

      <Modal
        open={refOpen}
        title={editing ? 'Modifier la référence' : 'Nouvelle référence'}
        onClose={() => setRefOpen(false)}
        footer={
          <>
            <Button onClick={() => setRefOpen(false)}>Annuler</Button>
            <Button variant="primary" disabled={busy || refForm.name.trim().length < 2} onClick={() => void saveRef()}>
              {busy ? <Spinner /> : 'Enregistrer'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {formError ? <Banner tone="error">{formError}</Banner> : null}
          <Field
            label="Désignation"
            value={refForm.name}
            placeholder="ex. Vis inox 5×60 (boîte 200)"
            onChange={(event) => setRefForm({ ...refForm, name: event.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Catégorie"
              value={refForm.category}
              placeholder="Visserie"
              onChange={(event) => setRefForm({ ...refForm, category: event.target.value })}
            />
            <Field
              label="Unité"
              value={refForm.unit}
              placeholder="boîte, m, L…"
              onChange={(event) => setRefForm({ ...refForm, unit: event.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Emplacement"
              value={refForm.location}
              placeholder="Magasin"
              onChange={(event) => setRefForm({ ...refForm, location: event.target.value })}
            />
            <Field
              label="Seuil minimum"
              type="number"
              min={0}
              value={refForm.min_qty}
              onChange={(event) => setRefForm({ ...refForm, min_qty: event.target.value })}
            />
          </div>
          <SelectField
            label="Magasin / quincaillerie"
            value={refForm.magasin_id}
            onChange={(event) => setRefForm({ ...refForm, magasin_id: event.target.value })}
          >
            <option value="">— Aucun —</option>
            {magasins.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </SelectField>
          <Field
            label="Fournisseur"
            value={refForm.supplier}
            placeholder="Quincaillerie Wouri"
            onChange={(event) => setRefForm({ ...refForm, supplier: event.target.value })}
          />
          {!editing ? (
            <Field
              label="Stock initial"
              type="number"
              min={0}
              hint="Enregistré comme première entrée au journal."
              value={refForm.initial_qty}
              onChange={(event) => setRefForm({ ...refForm, initial_qty: event.target.value })}
            />
          ) : null}
        </div>
      </Modal>

      <Modal
        open={moveOpen}
        title="Nouveau mouvement de stock"
        onClose={() => setMoveOpen(false)}
        footer={
          <>
            <Button onClick={() => setMoveOpen(false)}>Annuler</Button>
            <Button variant="primary" disabled={busy || !moveForm.ref_id || !moveForm.qty} onClick={() => void saveMove()}>
              {busy ? <Spinner /> : 'Enregistrer'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {formError ? <Banner tone="error">{formError}</Banner> : null}
          <SelectField
            label="Référence"
            value={moveForm.ref_id}
            onChange={(event) => setMoveForm({ ...moveForm, ref_id: event.target.value })}
          >
            <option value="">Choisir…</option>
            {refs.map((ref) => (
              <option key={ref.id} value={ref.id}>
                {ref.name} — {ref.qty} {ref.unit}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Type de mouvement"
            value={moveForm.move_type}
            onChange={(event) =>
              setMoveForm({ ...moveForm, move_type: event.target.value as MoveForm['move_type'] })
            }
          >
            {moveTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </SelectField>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label={moveForm.move_type === 'correction' ? 'Écart (signé)' : 'Quantité'}
              type="number"
              step="any"
              value={moveForm.qty}
              hint={moveForm.move_type === 'correction' ? 'ex. -2 si manquant, +1 si trouvé' : undefined}
              onChange={(event) => setMoveForm({ ...moveForm, qty: event.target.value })}
            />
            <Field
              label="N° de bon / document"
              value={moveForm.doc_ref}
              placeholder="BC-1042"
              onChange={(event) => setMoveForm({ ...moveForm, doc_ref: event.target.value })}
            />
          </div>
          {moveForm.move_type !== 'correction' ? (
            <Field
              label={moveForm.move_type === 'out' ? 'Bénéficiaire' : 'Provenance'}
              value={moveForm.beneficiary}
              placeholder={moveForm.move_type === 'out' ? 'Atelier B — chantier…' : 'Quincaillerie Wouri'}
              onChange={(event) => setMoveForm({ ...moveForm, beneficiary: event.target.value })}
            />
          ) : null}
          <TextArea
            label={moveForm.move_type === 'correction' ? 'Motif (obligatoire)' : 'Note'}
            value={moveForm.note}
            placeholder={moveForm.move_type === 'correction' ? 'Comptage tiroir 12' : 'Facultatif'}
            onChange={(event) => setMoveForm({ ...moveForm, note: event.target.value })}
          />
        </div>
      </Modal>
    </>
  );
}
