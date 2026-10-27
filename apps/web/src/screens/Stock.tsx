import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type Magasin, type ScanResult, type StockMovement, type StockRef, type User } from '../lib/api';
import { QR_PREFIX, qrDataUrl } from '../lib/qr';
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
  SelectField,
  Spinner,
  TextArea,
  cx,
  useToast,
} from '../components/ui';
import {
  IconArrowIn,
  IconArrowOut,
  IconBox,
  IconHistory,
  IconPlus,
  IconPrinter,
  IconRefresh,
  IconSearch,
} from '../components/Icons';
import {
  Camera,
  Coins,
  Download,
  FileSpreadsheet,
  Printer,
  Trash2,
  ArrowRightLeft,
  AlertTriangle,
  Layers,
  FolderArchive,
  ArrowRight,
} from 'lucide-react';
import { exportToExcel, exportToPdf } from '../lib/export';
import { usePrintSheet } from '../lib/print';
import { ImagePickerModal } from '../components/ImagePickerModal';
import { ExcelImportModal } from '../components/ExcelImportModal';
import { formatCurrency } from '../lib/accounting';

type RefForm = {
  name: string;
  category: string;
  unit: string;
  location: string;
  magasin_id: string;
  min_qty: string;
  supplier: string;
  brand: string;
  unit_cost: string;
  photo_path: string | null;
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

const EMPTY_REF: RefForm = {
  name: '',
  category: '',
  unit: 'u',
  location: '',
  magasin_id: '',
  min_qty: '0',
  supplier: '',
  brand: '',
  unit_cost: '',
  photo_path: null,
  initial_qty: '0',
};

function stockState(ref: StockRef): { label: string; tone: 'green' | 'amber' | 'red' } {
  if (ref.qty <= 0) return { label: 'Épuisé', tone: 'red' };
  if (ref.qty <= ref.min_qty) return { label: 'Alerte seuil', tone: 'amber' };
  return { label: 'Normal', tone: 'green' };
}

function StockBar({ ref }: { ref: StockRef }) {
  const target = Math.max(ref.min_qty * 2, ref.qty, 1);
  const pct = Math.min(100, Math.round((ref.qty / target) * 100));
  const state = stockState(ref);
  return (
    <div className="flex items-center gap-2">
      <span className="min-w-16 whitespace-nowrap text-right font-mono text-xs font-bold tabular-nums">
        {ref.qty} <span className="text-[10px] font-normal text-ink-faint">{ref.unit}</span>
      </span>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-line shrink-0">
        <span
          className={cx(
            'block h-full rounded-full transition-all duration-300',
            state.tone === 'red' ? 'bg-red' : state.tone === 'amber' ? 'bg-amber' : 'bg-green',
          )}
          style={{ width: `${pct}%` }}
        />
      </span>
    </div>
  );
}

function RefQr({ id }: { id: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void qrDataUrl(`${QR_PREFIX.stock}${id}`, 200).then((value) => {
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

function StockBinLabel({ refItem }: { refItem: StockRef }) {
  return (
    <div className="a4-page py-6" style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}>
      <div
        className="mx-auto flex flex-col justify-between overflow-hidden rounded-xl border-2 border-gray-900 bg-white p-5 text-gray-900 shadow-md"
        style={{ width: '130mm', minHeight: '80mm', boxSizing: 'border-box' }}
      >
        {/* En-tête officiel Monastère */}
        <div className="flex items-center justify-between border-b-2 border-gray-900 pb-2">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Logo" className="h-8 object-contain" />
            <div>
              <p className="text-[8.5pt] font-extrabold uppercase tracking-wider text-gray-950">
                C.F.T. des Bénédictins du Mont Fébé
              </p>
              <p className="text-[6.5pt] font-bold text-[#ff5500] uppercase tracking-wider">
                Magasin & Gestion des Stocks
              </p>
            </div>
          </div>
          <span className="rounded bg-gray-100 border border-gray-300 px-2 py-0.5 font-mono text-[8pt] font-bold text-gray-800">
            REF-{refItem.id}
          </span>
        </div>

        {/* Corps : Grand QR Code + Détails Article */}
        <div className="flex items-center gap-5 py-3">
          <div className="grid h-[32mm] w-[32mm] shrink-0 place-items-center rounded-lg border border-gray-300 bg-white p-1">
            <RefQr id={refItem.id} />
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <h2 className="text-[13pt] font-black leading-tight text-gray-950">
              {refItem.name}
            </h2>
            <p className="text-[8.5pt] font-semibold text-gray-700">
              {refItem.category}
            </p>
            <div className="pt-1 text-[7.5pt] text-gray-600 space-y-0.5">
              <p><span className="font-semibold text-gray-900">Emplacement :</span> {refItem.location || 'Non spécifié'}</p>
              <p><span className="font-semibold text-gray-900">Unité de mesure :</span> {refItem.unit}</p>
              <p><span className="font-semibold text-gray-900">Seuil alerte :</span> {refItem.min_qty} {refItem.unit}</p>
            </div>
          </div>
        </div>

        {/* Pied : Mention officielle */}
        <div className="flex items-center justify-between border-t border-gray-300 pt-1.5 text-[6pt] font-bold uppercase tracking-wider text-gray-500">
          <span>ÉTIQUETTE DE RAYONNAGE / CASIER</span>
          <span>SCAN INVENTAIRE RAPIDE</span>
        </div>
      </div>
    </div>
  );
}

export function Stock({
  user,
  scan,
  permissions,
}: {
  user: User;
  scan?: ScanResult | null;
  permissions?: Record<string, boolean> | null;
}) {
  const toast = useToast();
  const isSuper = user.role === 'direction';
  const hasPerm = (p: string) => isSuper || (permissions ? !!permissions[p] : false);

  const canCreateRef = hasPerm('stock.create_ref') || (!permissions && (user.role === 'direction' || user.role === 'magasinier'));
  const canEditRef = hasPerm('stock.edit_ref') || (!permissions && (user.role === 'direction' || user.role === 'magasinier'));
  const canDeleteRef = hasPerm('stock.delete_ref') || (!permissions && (user.role === 'direction' || user.role === 'magasinier'));
  const canMove = hasPerm('stock.move') || (!permissions && ['direction', 'magasinier', 'chef_atelier'].includes(user.role));
  const canCorrect = hasPerm('stock.correct') || (!permissions && (user.role === 'direction' || user.role === 'magasinier'));
  const canPhoto = hasPerm('stock.photo_edit') || (!permissions && (user.role === 'direction' || user.role === 'magasinier'));
  const canManageRefs = canCreateRef || canEditRef;

  const [activeTab, setActiveTab] = useState<'inventory' | 'journal'>('inventory');
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
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [photoTarget, setPhotoTarget] = useState<{ id?: number; current?: string | null; name?: string } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
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

  /* Scope and Batch State (Google Enterprise) */
  const [scopeFilter, setScopeFilter] = useState<'all' | 'active' | 'drafts'>('all');
  const [selectedRefIds, setSelectedRefIds] = useState<Set<number>>(new Set());
  const [batchAssignOpen, setBatchAssignOpen] = useState(false);
  const [batchAssignMagasinId, setBatchAssignMagasinId] = useState('');
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [deleteSingleRef, setDeleteSingleRef] = useState<StockRef | null>(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deleteAllConfirmText, setDeleteAllConfirmText] = useState('');

  const { print, portal } = usePrintSheet();

  useEffect(() => {
    let cancelled = false;
    if (refs.length === 0) setLoading(true);
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
        setMovements(movesRes.movements.slice(0, 100));
        setMagasins(magRes.magasins.filter((m) => m.active));
        setError(null);
      })
      .catch((err) => {
        if (!cancelled && refs.length === 0) setError(err instanceof Error ? err.message : 'Chargement impossible.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reload, journalType, journalFrom, journalTo, journalQ, refs.length]);

  const refresh = useCallback(() => setReload((value) => value + 1), []);

  useEffect(() => {
    const handleSync = () => refresh();
    window.addEventListener('mf-refresh-data', handleSync);
    return () => window.removeEventListener('mf-refresh-data', handleSync);
  }, [refresh]);

  useEffect(() => {
    if (!scan) return;
    if (scan.kind === 'stock') {
      setQ('');
      setLowOnly(false);
      setSelectedId(scan.ref.id);
      setReload((value) => value + 1);
    }
  }, [scan]);

  const activeRefs = useMemo(() => refs.filter((r) => !!r.magasin_id), [refs]);
  const draftRefs = useMemo(() => refs.filter((r) => !r.magasin_id), [refs]);

  const stats = useMemo(() => {
    const list = scopeFilter === 'drafts' ? draftRefs : scopeFilter === 'active' ? activeRefs : refs;
    let total = list.length;
    let normal = 0;
    let warning = 0;
    let empty = 0;
    for (const r of list) {
      if (r.qty <= 0) empty++;
      else if (r.qty <= r.min_qty) warning++;
      else normal++;
    }
    return { total, normal, warning, empty };
  }, [refs, activeRefs, draftRefs, scopeFilter]);

  const filtered = useMemo(() => {
    const baseList = scopeFilter === 'active' ? activeRefs : scopeFilter === 'drafts' ? draftRefs : refs;
    const needle = q.trim().toLowerCase();
    return baseList.filter((ref) => {
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
  }, [refs, activeRefs, draftRefs, scopeFilter, q, lowOnly, magasinFilter]);

  const selected = refs.find((ref) => ref.id === selectedId) ?? null;
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
      brand: ref.brand ?? '',
      unit_cost: ref.unit_cost ? String(ref.unit_cost) : '',
      photo_path: ref.photo_path ?? null,
      initial_qty: '0',
    });
    setFormError(null);
    setRefOpen(true);
  }

  async function handleStockPhotoSelect(url: string | null) {
    if (!photoTarget?.id) {
      setRefForm((f) => ({ ...f, photo_path: url }));
      return;
    }
    setBusy(true);
    try {
      await api<{ ok: boolean; ref: StockRef }>(`/api/stock/refs/${photoTarget.id}/photo`, {
        method: 'POST',
        body: JSON.stringify({ photo_path: url }),
      });
      toast('Photo de la référence mise à jour.', 'success');
      refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Échec de mise à jour photo.', 'error');
    } finally {
      setBusy(false);
    }
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
            brand: refForm.brand.trim() || null,
            unit_cost: refForm.unit_cost ? Number(refForm.unit_cost) : null,
            photo_path: refForm.photo_path,
          }),
        });
        toast('Référence mise à jour avec succès.', 'success');
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
            brand: refForm.brand.trim() || undefined,
            unit_cost: refForm.unit_cost ? Number(refForm.unit_cost) : undefined,
            photo_path: refForm.photo_path || undefined,
            initial_qty: Number(refForm.initial_qty),
          }),
        });
        toast('Référence créée au stock.', 'success');
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
      beneficiary: '',
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
      toast(`Mouvement validé · Nouveau stock disponible : ${res.qty}.`, 'success');
      setMoveOpen(false);
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Mouvement refusé.');
    } finally {
      setBusy(false);
    }
  }

  function toggleSelect(id: number) {
    setSelectedRefIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(currentList: StockRef[]) {
    if (selectedRefIds.size === currentList.length && currentList.length > 0) {
      setSelectedRefIds(new Set());
    } else {
      setSelectedRefIds(new Set(currentList.map((r) => r.id)));
    }
  }

  async function handleBatchAssign() {
    if (selectedRefIds.size === 0) return;
    setBusy(true);
    try {
      const ids = Array.from(selectedRefIds);
      const res = await api<{ ok: boolean; message: string }>('/api/stock/refs/batch-transfer', {
        method: 'POST',
        body: JSON.stringify({ ids, magasin_id: batchAssignMagasinId || null }),
      });
      toast(res.message, 'success');
      setBatchAssignOpen(false);
      setSelectedRefIds(new Set());
      refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Échec du transfert groupé.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleBatchDelete() {
    if (selectedRefIds.size === 0) return;
    setBusy(true);
    try {
      const ids = Array.from(selectedRefIds);
      const res = await api<{ ok: boolean; message: string }>('/api/stock/refs/batch-delete', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
      toast(res.message, 'success');
      setBatchDeleteOpen(false);
      setSelectedRefIds(new Set());
      refresh();
      if (selectedId && ids.includes(selectedId)) {
        setSelectedId(null);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Échec de la suppression groupée.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteSingle(refItem: StockRef) {
    setBusy(true);
    try {
      const res = await api<{ ok: boolean; message: string }>(`/api/stock/refs/${refItem.id}`, {
        method: 'DELETE',
      });
      toast(res.message, 'success');
      setDeleteSingleRef(null);
      if (selectedId === refItem.id) setSelectedId(null);
      refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Suppression impossible.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteAll() {
    if (deleteAllConfirmText !== 'SUPPRIMER') return;
    setBusy(true);
    try {
      const res = await api<{ ok: boolean; message: string }>('/api/stock/refs/delete-all', {
        method: 'POST',
        body: JSON.stringify({
          confirmation: 'SUPPRIMER',
          drafts_only: scopeFilter === 'drafts',
          magasin_id: magasinFilter || undefined,
        }),
      });
      toast(res.message, 'success');
      setDeleteAllOpen(false);
      setDeleteAllConfirmText('');
      setSelectedRefIds(new Set());
      setSelectedId(null);
      refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Échec de la suppression globale.', 'error');
    } finally {
      setBusy(false);
    }
  }

  const totalStockValuation = useMemo(
    () => refs.reduce((acc, r) => acc + Number(r.qty || 0) * Number(r.unit_cost || 0), 0),
    [refs],
  );

  function handleExportExcel() {
    const dateStr = new Date().toISOString().split('T')[0];
    const headers = [
      'Code',
      'Désignation',
      'Marque',
      'Catégorie',
      'Magasin / Dépôt',
      'Quantité',
      'Unité',
      'Coût Unitaire (FCFA)',
      'Valeur Totale (FCFA)',
      'Seuil Alerte',
      'Statut Stock',
    ];
    const rows = filtered.map((r) => [
      r.id,
      r.name,
      r.brand || '-',
      r.category,
      r.magasin_name ?? r.location ?? '-',
      r.qty,
      r.unit,
      r.unit_cost ? r.unit_cost : '-',
      r.unit_cost ? r.qty * r.unit_cost : '-',
      r.min_qty,
      r.qty === 0 ? 'Rupture' : r.qty <= r.min_qty ? 'Alerte Seuil' : 'Normal',
    ]);
    exportToExcel(`Inventaire_Stock_${dateStr}`, 'Stock', headers, rows);
  }

  function handleExportPdf() {
    const headers = ['Code', 'Désignation', 'Marque', 'Catégorie', 'Dépôt', 'Quantité', 'Unité', 'Coût Unit.', 'Valeur Totale', 'État'];
    const rows = filtered.map((r) => [
      r.id,
      r.name,
      r.brand || '-',
      r.category,
      r.magasin_name ?? r.location ?? '-',
      r.qty,
      r.unit,
      r.unit_cost ? formatCurrency(r.unit_cost) : '-',
      r.unit_cost ? formatCurrency(r.qty * r.unit_cost) : '-',
      r.qty === 0 ? 'Rupture' : r.qty <= r.min_qty ? 'Alerte' : 'Normal',
    ]);
    exportToPdf(
      'État d’Inventaire & Stocks de Quincaillerie',
      'Registre physique certifié du stock et consommables de menuiserie C.F.T.',
      headers,
      rows,
      [
        { label: 'Références Totales', value: stats.total },
        { label: 'Valeur Totale du Stock', value: formatCurrency(totalStockValuation) },
        { label: 'Stock Normal', value: stats.normal },
        { label: 'Sous Seuil Alerte', value: stats.warning },
        { label: 'En Rupture', value: stats.empty },
      ],
    );
  }

  return (
    <div className="space-y-4 pb-12">
      {/* Header Banner */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink">
            Stock &amp; Matières
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" icon={<IconRefresh size={16} />} onClick={refresh}>
            Actualiser
          </Button>
          <Button size="sm" variant="secondary" icon={<Download size={14} />} onClick={handleExportExcel}>
            Excel
          </Button>
          <Button size="sm" variant="secondary" icon={<Printer size={14} />} onClick={handleExportPdf}>
            Imprimer
          </Button>
          {canMove ? (
            <Button
              size="sm"
              icon={<IconArrowOut size={16} />}
              onClick={() => openMove('out')}
            >
              Sortie
            </Button>
          ) : null}
          {canManageRefs ? (
            <>
              <Button
                size="sm"
                icon={<IconArrowIn size={16} />}
                onClick={() => openMove('in')}
              >
                Entrée
              </Button>
              <Button
                size="sm"
                variant="secondary"
                icon={<FileSpreadsheet size={15} />}
                onClick={() => setImportOpen(true)}
                title="Importer un fichier Excel (.xlsx, .xls) ou Google Sheets (.csv) sans doublon"
              >
                Importer Tableur
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={<IconPlus size={16} />}
                onClick={openCreate}
              >
                Nouvelle Réf
              </Button>
              {refs.length > 0 && (
                <Button
                  size="sm"
                  variant="outline-danger"
                  icon={<Trash2 size={13} />}
                  onClick={() => {
                    setDeleteAllConfirmText('');
                    setDeleteAllOpen(true);
                  }}
                  title="Purger ou supprimer l'ensemble des articles de stock"
                >
                  Tout supprimer
                </Button>
              )}
            </>
          ) : null}
        </div>
      </div>

      {/* Scope Navigation Tabs: Parc Actif vs Brouillons vs Tout */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-2.5">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-paper-2 border border-line">
          <button
            type="button"
            onClick={() => {
              setScopeFilter('all');
              setSelectedRefIds(new Set());
            }}
            className={cx(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
              scopeFilter === 'all'
                ? 'bg-amber text-white shadow-xs'
                : 'text-ink-soft hover:text-ink hover:bg-paper',
            )}
          >
            <Layers size={14} />
            <span>Tout le Stock</span>
            <span
              className={cx(
                'text-[10px] px-1.5 py-0.2 rounded-full font-bold',
                scopeFilter === 'all' ? 'bg-white/20 text-white' : 'bg-surface text-ink-faint',
              )}
            >
              {refs.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setScopeFilter('active');
              setSelectedRefIds(new Set());
            }}
            className={cx(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
              scopeFilter === 'active'
                ? 'bg-amber text-white shadow-xs'
                : 'text-ink-soft hover:text-ink hover:bg-paper',
            )}
          >
            <IconBox size={14} />
            <span>Articles en Magasins</span>
            <span
              className={cx(
                'text-[10px] px-1.5 py-0.2 rounded-full font-bold',
                scopeFilter === 'active' ? 'bg-white/20 text-white' : 'bg-surface text-green',
              )}
            >
              {activeRefs.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setScopeFilter('drafts');
              setSelectedRefIds(new Set());
            }}
            className={cx(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
              scopeFilter === 'drafts'
                ? 'bg-amber text-white shadow-xs'
                : 'text-ink-soft hover:text-ink hover:bg-paper',
            )}
          >
            <FolderArchive size={14} />
            <span>Brouillons &amp; Non affectés</span>
            <span
              className={cx(
                'text-[10px] px-1.5 py-0.2 rounded-full font-bold',
                scopeFilter === 'drafts'
                  ? 'bg-white/20 text-white'
                  : draftRefs.length > 0
                    ? 'bg-amber-wash text-amber border border-amber/30'
                    : 'bg-surface text-ink-faint',
              )}
            >
              {draftRefs.length}
            </span>
          </button>
        </div>

        {draftRefs.length > 0 && scopeFilter !== 'drafts' && (
          <button
            onClick={() => {
              setScopeFilter('drafts');
              setSelectedRefIds(new Set());
            }}
            className="text-xs font-semibold text-amber hover:underline flex items-center gap-1.5"
          >
            <span>⚠️ {draftRefs.length} article{draftRefs.length > 1 ? 's' : ''} en brouillon sans magasin</span>
            <ArrowRight size={13} />
          </button>
        )}
      </div>

      {/* KPI Dashboard Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-xl border border-line bg-surface p-3.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Total Articles</span>
            <span className="h-1.5 w-1.5 rounded-full bg-ink-faint" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-ink tabular-nums">{stats.total}</span>
            <span className="text-[11px] text-ink-faint">références</span>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-surface p-3.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Valeur Stock</span>
            <Coins size={14} className="text-amber" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-lg sm:text-xl font-bold text-green tabular-nums">{formatCurrency(totalStockValuation)}</span>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-surface p-3.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Stock Normal</span>
            <span className="h-1.5 w-1.5 rounded-full bg-green" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-ink tabular-nums">{stats.normal}</span>
            <span className="text-[11px] text-ink-faint">confortable</span>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-surface p-3.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Sous Seuil</span>
            <span className="h-1.5 w-1.5 rounded-full bg-amber" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-ink tabular-nums">{stats.warning}</span>
            <span className="text-[11px] text-ink-faint">à réappro.</span>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-surface p-3.5 shadow-xs col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">En Rupture</span>
            <span className="h-1.5 w-1.5 rounded-full bg-red" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-ink tabular-nums">{stats.empty}</span>
            <span className="text-[11px] text-ink-faint">épuisées</span>
          </div>
        </div>
      </div>

      {/* Main Tabs (Inventaire / Journal) */}
      <div className="flex items-center gap-1 border-b border-line">
        <button
          onClick={() => setActiveTab('inventory')}
          className={cx(
            'flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-all',
            activeTab === 'inventory'
              ? 'border-amber text-amber'
              : 'border-transparent text-ink-soft hover:text-ink',
          )}
        >
          <IconBox size={16} />
          <span>Inventaire & Tableur</span>
          <span className="rounded-full bg-paper px-2 py-0.5 text-[10px] text-ink-faint border border-line">
            {filtered.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('journal')}
          className={cx(
            'flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-all',
            activeTab === 'journal'
              ? 'border-amber text-amber'
              : 'border-transparent text-ink-soft hover:text-ink',
          )}
        >
          <IconHistory size={16} />
          <span>Journal des Mouvements</span>
          <span className="rounded-full bg-paper px-2 py-0.5 text-[10px] text-ink-faint border border-line">
            {movements.length}
          </span>
        </button>
      </div>

      {error ? (
        <div>
          <Banner tone="error">{error}</Banner>
        </div>
      ) : null}

      {/* Tab 1: Inventaire & Tableur Pro */}
      {activeTab === 'inventory' ? (
        <div className="space-y-3">
          {/* Filters Bar */}
          <div className="rounded-xl border border-line bg-surface p-3 shadow-xs flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-52 flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">
                <IconSearch size={16} />
              </span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Rechercher article, visserie, colle, fournisseur..."
                className="h-10 w-full rounded-lg border border-line bg-paper pl-9 pr-3 text-xs sm:text-sm focus:border-amber focus:bg-surface focus:outline-none transition-all"
              />
            </div>

            <button
              onClick={() => setLowOnly((v) => !v)}
              className={cx(
                'h-10 rounded-lg border px-3 text-xs font-semibold transition-all flex items-center gap-1.5',
                lowOnly
                  ? 'border-amber bg-amber-wash text-amber'
                  : 'border-line bg-paper text-ink-soft hover:bg-paper-2',
              )}
            >
              <span className={cx('h-2 w-2 rounded-full', lowOnly ? 'bg-amber' : 'bg-ink-faint')} />
              <span>Sous le seuil uniquement</span>
            </button>

            {magasins.length > 0 && (
              <select
                value={magasinFilter}
                onChange={(e) => setMagasinFilter(e.target.value)}
                className="h-10 rounded-lg border border-line bg-paper px-3 text-xs font-medium text-ink focus:border-amber focus:bg-surface focus:outline-none"
              >
                <option value="">Tous magasins ({magasins.length})</option>
                {magasins.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Drafts Informative Banner */}
          {scopeFilter === 'drafts' && (
            <div className="flex items-start gap-3 p-3.5 rounded-xl border border-amber/30 bg-amber-wash/50 text-xs text-ink leading-relaxed">
              <FolderArchive size={18} className="text-amber shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">Brouillons d’articles &amp; Matières en attente d’affectation</p>
                <p className="text-ink-soft mt-0.5">
                  Ces articles de stock ne sont rattachés à aucun magasin ou atelier. Ils ne sont pas comptabilisés dans le stock actif en magasin. Cochez-les pour les affecter en 1 clic au magasin de votre choix.
                </p>
              </div>
            </div>
          )}

          {/* Batch Actions Bar (Flottant / Sticky quand sélection active) */}
          {selectedRefIds.size > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-amber/40 bg-surface-2 shadow-card animate-slide-up">
              <div className="flex items-center gap-2.5">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber text-white text-xs font-bold shadow-xs">
                  {selectedRefIds.size}
                </span>
                <span className="text-xs font-semibold text-ink">
                  {selectedRefIds.size} article{selectedRefIds.size > 1 ? 's' : ''} sélectionné{selectedRefIds.size > 1 ? 's' : ''}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {canManageRefs && (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="border-amber/30 bg-amber-wash text-amber hover:bg-amber hover:text-white"
                      icon={<ArrowRightLeft size={14} />}
                      onClick={() => {
                        setBatchAssignMagasinId('');
                        setBatchAssignOpen(true);
                      }}
                    >
                      Affecter / Transférer de magasin
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      icon={<Trash2 size={14} />}
                      onClick={() => setBatchDeleteOpen(true)}
                    >
                      Supprimer la sélection ({selectedRefIds.size})
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedRefIds(new Set())}
                >
                  Désélectionner tout
                </Button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-soft">
              <Spinner /> Chargement du stock…
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              title={
                scopeFilter === 'drafts'
                  ? 'Aucun article en brouillon'
                  : scopeFilter === 'active'
                    ? 'Aucun article en magasin'
                    : 'Aucune référence trouvée'
              }
              hint={
                scopeFilter === 'drafts'
                  ? 'Toutes vos références sont actuellement rattachées à des magasins.'
                  : 'Aucun article ne correspond aux filtres appliqués.'
              }
              action={
                canManageRefs ? (
                  <Button variant="primary" onClick={openCreate}>
                    Créer un article
                  </Button>
                ) : null
              }
            />
          ) : (
            <>
              {/* Tableur Google Sheets Style (Desktop & Tablette) */}
              <div className="rounded-xl border border-line bg-surface shadow-xs overflow-hidden hidden sm:block">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-paper-2 border-b border-line text-ink-faint font-semibold uppercase tracking-wider text-[11px]">
                        {canManageRefs && (
                          <th className="px-2.5 py-2.5 w-10 text-center border-r border-line">
                            <input
                              type="checkbox"
                              checked={filtered.length > 0 && selectedRefIds.size === filtered.length}
                              onChange={() => toggleSelectAll(filtered)}
                              className="h-4 w-4 rounded accent-amber cursor-pointer"
                              title="Tout sélectionner / désélectionner"
                            />
                          </th>
                        )}
                        <th className="px-2.5 py-2.5 w-12 border-r border-line text-center">Photo</th>
                        <th className="sticky left-0 z-10 bg-paper-2 px-3 py-2.5 min-w-44 border-r border-line">
                          Désignation &amp; Marque
                        </th>
                        <th className="px-3 py-2.5 min-w-28 border-r border-line">Catégorie</th>
                        <th className="px-3 py-2.5 min-w-32 border-r border-line">Emplacement / Magasin</th>
                        <th className="px-3 py-2.5 min-w-36 border-r border-line">Stock Disponible</th>
                        <th className="px-3 py-2.5 min-w-24 border-r border-line text-right">Coût Unit.</th>
                        <th className="px-3 py-2.5 min-w-28 border-r border-line text-right">Valeur Stock</th>
                        <th className="px-3 py-2.5 min-w-24 border-r border-line text-center">État</th>
                        <th className="px-3 py-2.5 min-w-36 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {filtered.map((ref) => {
                        const state = stockState(ref);
                        const lineValuation = Number(ref.qty || 0) * Number(ref.unit_cost || 0);
                        const isSelected = selectedRefIds.has(ref.id);
                        return (
                          <tr
                            key={ref.id}
                            onClick={() => setSelectedId(ref.id)}
                            className={cx(
                              'cursor-pointer transition-colors group',
                              isSelected ? 'bg-amber-wash/40 hover:bg-amber-wash/50' : 'hover:bg-paper-2/40',
                            )}
                          >
                            {/* Checkbox */}
                            {canManageRefs && (
                              <td className="px-2.5 py-2 text-center border-r border-line" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleSelect(ref.id)}
                                  className="h-4 w-4 rounded accent-amber cursor-pointer"
                                />
                              </td>
                            )}

                            {/* Photo Thumbnail */}
                            <td
                              className="px-2 py-1.5 text-center border-r border-line"
                              onClick={(e) => {
                                if (canPhoto) {
                                  e.stopPropagation();
                                  setPhotoTarget({ id: ref.id, current: ref.photo_path, name: ref.name });
                                  setPhotoModalOpen(true);
                                }
                              }}
                            >
                              {ref.photo_path ? (
                                <img
                                  src={ref.photo_path}
                                  alt={ref.name}
                                  className="h-9 w-9 rounded-lg object-cover border border-line shadow-2xs mx-auto hover:opacity-85 transition-opacity"
                                  title="Cliquer pour modifier la photo"
                                />
                              ) : (
                                <span
                                  className="grid h-9 w-9 place-items-center rounded-lg bg-paper text-ink-faint border border-line/60 mx-auto hover:text-amber hover:border-amber transition-colors"
                                  title="Ajouter une photo"
                                >
                                  <IconBox size={16} />
                                </span>
                              )}
                            </td>

                            {/* Sticky Designation & Marque */}
                            <td className="sticky left-0 z-10 bg-surface group-hover:bg-surface-2 px-3 py-2 font-semibold text-ink border-r border-line">
                              <div className="flex items-center gap-1.5">
                                <span>{ref.name}</span>
                                {ref.brand ? (
                                  <span className="rounded bg-paper px-1.5 py-0.2 text-[10px] font-bold text-ink-soft border border-line">
                                    {ref.brand}
                                  </span>
                                ) : null}
                              </div>
                              {ref.supplier ? (
                                <div className="text-[10px] text-ink-faint font-normal">Fourn. {ref.supplier}</div>
                              ) : null}
                            </td>

                            {/* Category */}
                            <td className="px-3 py-2 text-ink-soft border-r border-line">
                              <span className="inline-block rounded bg-paper px-1.5 py-0.5 text-[11px] font-medium border border-line">
                                {ref.category}
                              </span>
                            </td>

                            {/* Emplacement / Magasin */}
                            <td className="px-3 py-2 text-ink-soft border-r border-line">
                              {ref.magasin_name ? (
                                <div>
                                  <div className="font-semibold text-ink">{ref.magasin_name}</div>
                                  <div className="text-[10px] text-ink-faint">{ref.location}</div>
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded bg-amber-wash px-2 py-0.5 text-[10px] font-semibold text-amber border border-amber/30">
                                  <FolderArchive size={11} /> Brouillon (sans magasin)
                                </span>
                              )}
                            </td>

                            {/* Stock Bar Gauge */}
                            <td className="px-3 py-2 border-r border-line">
                              <StockBar ref={ref} />
                            </td>

                            {/* Coût Unitaire */}
                            <td className="px-3 py-2 text-right font-mono text-ink-soft border-r border-line tabular-nums">
                              {ref.unit_cost ? formatCurrency(ref.unit_cost) : '—'}
                            </td>

                            {/* Valeur Totale */}
                            <td className="px-3 py-2 text-right font-mono font-bold text-ink border-r border-line tabular-nums">
                              {ref.unit_cost ? formatCurrency(lineValuation) : '—'}
                            </td>

                            {/* State Badge */}
                            <td className="px-3 py-2 text-center border-r border-line">
                              <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-ink-soft">
                                <span
                                  className={cx(
                                    'h-1.5 w-1.5 rounded-full shrink-0',
                                    state.tone === 'green' ? 'bg-green' : state.tone === 'amber' ? 'bg-amber' : 'bg-red',
                                  )}
                                />
                                {state.label}
                              </span>
                            </td>

                            {/* Quick In / Out / Manage Buttons */}
                            <td className="px-3 py-2 text-right">
                              <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                                {canMove ? (
                                  <>
                                    <button
                                      onClick={() => openMove('out', ref.id)}
                                      title="Enregistrer une sortie"
                                      className="rounded border border-line bg-surface-2 px-2 py-1 text-[11px] font-medium text-ink-soft hover:text-ink hover:border-line-strong active:scale-95 transition-all"
                                    >
                                      - Sortie
                                    </button>
                                    <button
                                      onClick={() => openMove('in', ref.id)}
                                      title="Enregistrer une entrée"
                                      className="rounded border border-line bg-surface-2 px-2 py-1 text-[11px] font-medium text-ink-soft hover:text-ink hover:border-line-strong active:scale-95 transition-all"
                                    >
                                      + Entrée
                                    </button>
                                  </>
                                ) : null}

                                {(canEditRef || canDeleteRef) && (
                                  <>
                                    {canEditRef && (
                                      <button
                                        onClick={() => {
                                          setSelectedRefIds(new Set([ref.id]));
                                          setBatchAssignMagasinId(ref.magasin_id ?? '');
                                          setBatchAssignOpen(true);
                                        }}
                                        className="rounded border border-line bg-paper p-1 text-ink-soft hover:bg-paper-2 hover:text-amber active:scale-95 transition-all"
                                        title="Affecter ou transférer de magasin"
                                      >
                                        <ArrowRightLeft size={13} />
                                      </button>
                                    )}
                                    {canDeleteRef && (
                                      <button
                                        onClick={() => setDeleteSingleRef(ref)}
                                        className="rounded border border-line bg-paper p-1 text-ink-soft hover:bg-red-500/10 hover:text-red hover:border-red-500/30 active:scale-95 transition-all"
                                        title="Supprimer cet article"
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    )}
                                  </>
                                )}

                                <button
                                  onClick={() => setSelectedId(ref.id)}
                                  className="rounded border border-line bg-paper px-2 py-1 text-[11px] font-medium text-ink-soft hover:bg-paper-2"
                                >
                                  ›
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Spreadsheet Summary Footer */}
                <div className="bg-paper border-t border-line px-4 py-2.5 text-xs flex items-center justify-between font-semibold text-ink-soft">
                  <span>Affichés : {filtered.length} référence(s) · Valeur Stock : {formatCurrency(totalStockValuation)}</span>
                  <span className="text-[11px] text-ink-faint">
                    Cochez des articles pour les affecter ou les transférer par lot vers un magasin
                  </span>
                </div>
              </div>

              {/* Mobile Cards View */}
              <div className="space-y-2.5 sm:hidden">
                {filtered.map((ref) => {
                  const state = stockState(ref);
                  const lineValuation = Number(ref.qty || 0) * Number(ref.unit_cost || 0);
                  const isSelected = selectedRefIds.has(ref.id);
                  return (
                    <div
                      key={ref.id}
                      onClick={() => setSelectedId(ref.id)}
                      className={cx(
                        'rounded-xl border border-line bg-surface p-3.5 shadow-xs active:bg-paper cursor-pointer transition-all space-y-2.5',
                        isSelected && 'border-amber/50 bg-amber-wash/30',
                      )}
                    >
                      <div className="flex items-start gap-3">
                        {canManageRefs && (
                          <div className="pt-1" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(ref.id)}
                              className="h-4 w-4 rounded accent-amber cursor-pointer"
                            />
                          </div>
                        )}

                        {ref.photo_path ? (
                          <img
                            src={ref.photo_path}
                            alt={ref.name}
                            className="h-14 w-14 shrink-0 rounded-xl object-cover border border-line shadow-xs"
                          />
                        ) : (
                          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-paper text-ink-faint border border-line">
                            <IconBox size={22} />
                          </span>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-1">
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="font-semibold text-sm text-ink">{ref.name}</p>
                                {ref.brand ? (
                                  <span className="rounded bg-paper px-1.5 py-0.2 text-[10px] font-bold text-ink-soft border border-line">
                                    {ref.brand}
                                  </span>
                                ) : null}
                              </div>
                              <p className="text-xs text-ink-faint mt-0.5">
                                {ref.category} · {ref.magasin_name ?? <strong className="text-amber">📁 Brouillon</strong>}
                              </p>
                            </div>
                            <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-ink-soft shrink-0">
                              <span
                                className={cx(
                                  'h-1.5 w-1.5 rounded-full shrink-0',
                                  state.tone === 'green' ? 'bg-green' : state.tone === 'amber' ? 'bg-amber' : 'bg-red',
                                )}
                              />
                              {state.label}
                            </span>
                          </div>

                          {ref.unit_cost ? (
                            <div className="mt-1 flex items-center gap-2 text-[11px]">
                              <span className="text-ink-faint">Valeur:</span>
                              <span className="font-bold text-green">{formatCurrency(lineValuation)}</span>
                              <span className="text-ink-faint">({formatCurrency(ref.unit_cost)}/{ref.unit})</span>
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <StockBar ref={ref} />

                      <div className="flex items-center justify-between pt-2 border-t border-line/60" onClick={(e) => e.stopPropagation()}>
                        <span className="text-xs text-ink-faint">Seuil : {ref.min_qty} {ref.unit}</span>
                        <div className="flex items-center gap-1.5">
                          {canManageRefs && (
                            <>
                              <button
                                onClick={() => {
                                  setSelectedRefIds(new Set([ref.id]));
                                  setBatchAssignMagasinId(ref.magasin_id ?? '');
                                  setBatchAssignOpen(true);
                                }}
                                className="rounded border border-line bg-paper p-1 text-ink-soft hover:text-amber"
                                title="Affecter / Transférer"
                              >
                                <ArrowRightLeft size={13} />
                              </button>
                              <button
                                onClick={() => setDeleteSingleRef(ref)}
                                className="rounded border border-line bg-paper p-1 text-ink-soft hover:text-red hover:border-red-500/30"
                                title="Supprimer cet article"
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          )}
                          {canMove ? (
                            <button
                              onClick={() => openMove('out', ref.id)}
                              className="rounded border border-line bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-soft hover:text-ink active:scale-95"
                            >
                              - Sortie
                            </button>
                          ) : null}
                          {canManageRefs ? (
                            <button
                              onClick={() => openMove('in', ref.id)}
                              className="rounded border border-line bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-soft hover:text-ink active:scale-95"
                            >
                              + Entrée
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      ) : null}

      {/* Tab 2: Journal des Mouvements (Audit Trail) */}
      {activeTab === 'journal' ? (
        <div className="space-y-3">
          {/* Filters Bar */}
          <div className="rounded-xl border border-line bg-surface p-3 shadow-xs flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-lg border border-line bg-paper p-0.5 text-xs">
              {[
                { value: '', label: 'Tous' },
                { value: 'in', label: 'Entrées' },
                { value: 'out', label: 'Sorties' },
                { value: 'correction', label: 'Corrections' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setJournalType(opt.value as typeof journalType)}
                  className={cx(
                    'rounded-md px-2.5 py-1.5 font-semibold transition-all',
                    journalType === opt.value
                      ? 'bg-surface text-ink shadow-xs'
                      : 'text-ink-soft hover:text-ink',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5 text-xs text-ink-soft">
              <input
                type="date"
                value={journalFrom}
                onChange={(e) => setJournalFrom(e.target.value)}
                className="h-9 rounded-lg border border-line bg-paper px-2 text-xs text-ink focus:border-amber focus:outline-none"
              />
              <span>→</span>
              <input
                type="date"
                value={journalTo}
                onChange={(e) => setJournalTo(e.target.value)}
                className="h-9 rounded-lg border border-line bg-paper px-2 text-xs text-ink focus:border-amber focus:outline-none"
              />
            </div>

            <div className="relative min-w-40 flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">
                <IconSearch size={15} />
              </span>
              <input
                value={journalQ}
                onChange={(e) => setJournalQ(e.target.value)}
                placeholder="Filtrer article, bénéficiaire, agent..."
                className="h-9 w-full rounded-lg border border-line bg-paper pl-8 pr-3 text-xs text-ink focus:border-amber focus:outline-none"
              />
            </div>
          </div>

          {movements.length === 0 ? (
            <EmptyState
              title="Aucun mouvement consigné"
              hint="Les entrées, sorties et ajustements d'inventaire apparaîtront dans cette table d'audit."
            />
          ) : (
            <div className="rounded-xl border border-line bg-surface shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-paper-2 border-b border-line text-ink-faint font-semibold uppercase tracking-wider text-[11px]">
                      <th className="px-3 py-2.5 min-w-36 border-r border-line">Date & Heure</th>
                      <th className="px-3 py-2.5 min-w-28 border-r border-line text-center">Type</th>
                      <th className="px-3 py-2.5 min-w-44 border-r border-line">Article</th>
                      <th className="px-3 py-2.5 min-w-24 border-r border-line text-right">Quantité</th>
                      <th className="px-3 py-2.5 min-w-36 border-r border-line">Bénéficiaire / Motif</th>
                      <th className="px-3 py-2.5 min-w-28 text-right">Agent</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {movements.map((move) => (
                      <tr key={move.id} className="hover:bg-paper-2 transition-colors">
                        <td className="px-3 py-2 font-mono text-ink-faint tabular-nums border-r border-line">
                          {formatDateTime(move.created_at)}
                        </td>
                        <td className="px-3 py-2 text-center border-r border-line">
                          <Chip tone={MOVE_TONE[move.move_type]}>{MOVE_LABEL[move.move_type]}</Chip>
                        </td>
                        <td className="px-3 py-2 font-semibold text-ink border-r border-line">
                          {move.ref_name}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-ink border-r border-line tabular-nums">
                          {move.move_type === 'out' ? `-${move.qty}` : `+${move.qty}`} {move.unit ?? 'u'}
                        </td>
                        <td className="px-3 py-2 text-ink-soft border-r border-line">
                          <div>{move.beneficiary ?? '—'}</div>
                          {move.note ? <div className="text-[10px] text-ink-faint">{move.note}</div> : null}
                        </td>
                        <td className="px-3 py-2 text-right text-ink-faint">
                          {move.actor}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* Drawer Fiche Référence */}
      <Drawer
        open={!!selected}
        onClose={() => setSelectedId(null)}
        title={selected ? selected.name : 'Détail référence'}
        subtitle={selected ? `${selected.category} · ${selected.magasin_name ?? selected.location}` : undefined}
        wide
      >
        {selected ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone={stockState(selected).tone}>{stockState(selected).label}</Chip>
              {selected.magasin_name ? <Chip tone="blue">{selected.magasin_name}</Chip> : null}
            </div>

            {/* Photo & Identity Hero */}
            <div className="relative rounded-2xl border border-line bg-paper overflow-hidden">
              {selected.photo_path ? (
                <div className="relative h-44 sm:h-52 w-full bg-black/5 flex items-center justify-center">
                  <img
                    src={selected.photo_path}
                    alt={selected.name}
                    className="h-full w-full object-contain"
                  />
                  {canPhoto ? (
                    <button
                      type="button"
                      onClick={() => {
                        setPhotoTarget({ id: selected.id, current: selected.photo_path, name: selected.name });
                        setPhotoModalOpen(true);
                      }}
                      className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-surface/90 px-3 py-1.5 text-xs font-semibold text-ink shadow-md backdrop-blur-xs hover:bg-surface border border-line"
                    >
                      <Camera size={14} className="text-amber" /> Modifier la photo
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-5 text-center">
                  <div className="grid h-14 w-14 place-items-center rounded-2xl bg-surface border border-line text-ink-faint shadow-xs mb-2">
                    <IconBox size={24} />
                  </div>
                  <p className="text-xs text-ink-soft">Aucune photo enregistrée pour cet article.</p>
                  {canPhoto ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-2.5"
                      icon={<Camera size={13} className="text-amber" />}
                      onClick={() => {
                        setPhotoTarget({ id: selected.id, current: null, name: selected.name });
                        setPhotoModalOpen(true);
                      }}
                    >
                      Prendre / Choisir photo
                    </Button>
                  ) : null}
                </div>
              )}
            </div>

            <Card className="p-4 border border-line space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wider text-ink-faint font-semibold">Stock en rayon</p>
                  <p className="mt-1 text-2xl font-bold text-ink tabular-nums">
                    {selected.qty} <span className="text-sm font-normal text-ink-soft">{selected.unit}</span>
                  </p>
                  <p className="text-xs text-ink-faint mt-1">Seuil minimal d'alerte : {selected.min_qty} {selected.unit}</p>
                </div>
                <RefQr id={selected.id} />
              </div>

              <div className="grid grid-cols-2 gap-2.5 border-t border-line/60 pt-3 text-xs sm:grid-cols-3">
                <div>
                  <span className="text-ink-faint block text-[11px]">Marque</span>
                  <span className="font-semibold text-ink">{selected.brand || '—'}</span>
                </div>
                <div>
                  <span className="text-ink-faint block text-[11px]">Coût Unitaire</span>
                  <span className="font-semibold text-ink">{selected.unit_cost ? formatCurrency(selected.unit_cost) : '—'}</span>
                </div>
                <div>
                  <span className="text-ink-faint block text-[11px]">Valeur Stock en Rayon</span>
                  <span className="font-bold text-green">{selected.unit_cost ? formatCurrency(selected.qty * selected.unit_cost) : '—'}</span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 pt-3 border-t border-line">
                {canMove ? (
                  <Button
                    size="sm"
                    icon={<IconArrowOut size={16} />}
                    onClick={() => {
                      openMove('out', selected.id);
                    }}
                  >
                    Sortie
                  </Button>
                ) : null}
                {canMove && (
                  <Button
                    size="sm"
                    icon={<IconArrowIn size={16} />}
                    onClick={() => {
                      openMove('in', selected.id);
                    }}
                  >
                    Entrée
                  </Button>
                )}
                {canCorrect && (
                  <Button
                    size="sm"
                    onClick={() => {
                      openMove('correction', selected.id);
                    }}
                  >
                    Ajuster inventaire
                  </Button>
                )}
                {canEditRef && (
                  <Button
                    size="sm"
                    onClick={() => {
                      openEdit(selected);
                    }}
                  >
                    Modifier la fiche
                  </Button>
                )}
                {canDeleteRef && (
                  <Button
                    size="sm"
                    variant="outline-danger"
                    icon={<Trash2 size={14} />}
                    onClick={() => setDeleteSingleRef(selected)}
                  >
                    Supprimer l’article
                  </Button>
                )}
                <Button
                  size="sm"
                  icon={<IconPrinter size={16} />}
                  onClick={() => {
                    print(<StockBinLabel refItem={selected} />);
                  }}
                >
                  Étiquette
                </Button>
              </div>
            </Card>

            <div>
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-soft">
                <IconHistory size={15} /> Derniers mouvements sur cette référence
              </p>
              {selectedMoves.length === 0 ? (
                <p className="text-xs text-ink-faint italic">Aucun mouvement récent enregistré sur cette référence.</p>
              ) : (
                <div className="rounded-xl border border-line bg-surface overflow-hidden divide-y divide-line">
                  {selectedMoves.map((m) => (
                    <div key={m.id} className="p-3 text-xs flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <Chip tone={MOVE_TONE[m.move_type]}>{MOVE_LABEL[m.move_type]}</Chip>
                          <span className="font-bold text-ink">
                            {m.move_type === 'out' ? `-${m.qty}` : `+${m.qty}`} {m.unit ?? selected?.unit ?? 'u'}
                          </span>
                        </div>
                        <p className="text-ink-faint mt-1 text-[11px]">
                          {m.beneficiary ? `Pour : ${m.beneficiary} · ` : ''}{formatDateTime(m.created_at)}
                        </p>
                      </div>
                      <span className="text-[11px] text-ink-faint">Par {m.actor}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Drawer>

      {/* Modal Création / Édition Référence */}
      <Modal
        open={refOpen}
        title={editing ? `Modifier : ${editing.name}` : 'Nouvelle référence de quincaillerie'}
        onClose={() => setRefOpen(false)}
        footer={
          <>
            <Button onClick={() => setRefOpen(false)}>Annuler</Button>
            <Button variant="primary" disabled={busy || refForm.name.trim().length < 2} onClick={() => void saveRef()}>
              {busy ? <Spinner /> : editing ? 'Enregistrer' : 'Créer l’article'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError ? <Banner tone="error">{formError}</Banner> : null}

          {/* Photo de la Référence / Quincaillerie (Caméra / Galerie / Même Groupe) */}
          <div className="flex items-center gap-4 p-3 rounded-xl border border-line bg-paper">
            <div
              onClick={() => {
                setPhotoTarget({ id: editing?.id, current: refForm.photo_path, name: refForm.name || 'Article quincaillerie' });
                setPhotoModalOpen(true);
              }}
              className="relative grid h-20 w-20 shrink-0 place-items-center rounded-xl border-2 border-dashed border-line-strong bg-surface cursor-pointer hover:border-amber overflow-hidden group transition-all"
            >
              {refForm.photo_path ? (
                <img src={refForm.photo_path} alt="Aperçu article" className="h-full w-full object-cover" />
              ) : (
                <div className="flex flex-col items-center justify-center p-1 text-center">
                  <Camera size={18} className="text-amber group-hover:scale-110 transition-transform" />
                  <span className="text-[9px] font-bold text-ink-soft mt-1">Photo</span>
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-ink">Photo de l’article / quincaillerie</p>
              <p className="text-[11px] text-ink-faint mt-0.5">
                Prenez une photo, importez un fichier ou réutilisez une photo d'un même lot (ex. clous, vis, charnières).
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  icon={<Camera size={13} />}
                  onClick={() => {
                    setPhotoTarget({ id: editing?.id, current: refForm.photo_path, name: refForm.name || 'Article quincaillerie' });
                    setPhotoModalOpen(true);
                  }}
                >
                  {refForm.photo_path ? 'Changer la photo' : 'Prendre / Choisir photo'}
                </Button>
                {refForm.photo_path ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-red"
                    onClick={() => setRefForm((f) => ({ ...f, photo_path: null }))}
                  >
                    Supprimer
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          <Field
            label="Désignation de l’article"
            value={refForm.name}
            onChange={(e) => setRefForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="ex. Vis bois tête fraisée 4x40 inox"
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Marque / Fabricant"
              value={refForm.brand}
              onChange={(e) => setRefForm((f) => ({ ...f, brand: e.target.value }))}
              placeholder="ex. Spax, Wurth, Sika..."
            />
            <Field
              label="Catégorie"
              value={refForm.category}
              onChange={(e) => setRefForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="ex. Visserie, Colle, Abrasif..."
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Unité de comptage"
              value={refForm.unit}
              onChange={(e) => setRefForm((f) => ({ ...f, unit: e.target.value }))}
              placeholder="u, kg, boîte, l, m..."
            />
            <Field
              label="Coût unitaire d'achat (FCFA)"
              type="number"
              value={refForm.unit_cost}
              onChange={(e) => setRefForm((f) => ({ ...f, unit_cost: e.target.value }))}
              placeholder="ex. 150"
              hint="Pour le calcul de la valeur globale du stock"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Emplacement / Casier"
              value={refForm.location}
              onChange={(e) => setRefForm((f) => ({ ...f, location: e.target.value }))}
              placeholder="ex. Casier B-12"
            />
            <SelectField
              label="Magasin / Atelier"
              value={refForm.magasin_id}
              onChange={(e) => setRefForm((f) => ({ ...f, magasin_id: e.target.value }))}
            >
              <option value="">— Aucun —</option>
              {magasins.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </SelectField>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Seuil d'alerte minimal"
              type="number"
              value={refForm.min_qty}
              onChange={(e) => setRefForm((f) => ({ ...f, min_qty: e.target.value }))}
            />
            {!editing ? (
              <Field
                label="Stock initial"
                type="number"
                value={refForm.initial_qty}
                onChange={(e) => setRefForm((f) => ({ ...f, initial_qty: e.target.value }))}
              />
            ) : (
              <Field
                label="Fournisseur habituel"
                value={refForm.supplier}
                onChange={(e) => setRefForm((f) => ({ ...f, supplier: e.target.value }))}
              />
            )}
          </div>
        </div>
      </Modal>

      {/* Modal Mouvement de Stock (In / Out / Correction) */}
      <Modal
        open={moveOpen}
        title={
          moveForm.move_type === 'out'
            ? 'Sortie de matériel / Quincaillerie'
            : moveForm.move_type === 'in'
              ? 'Entrée de marchandises'
              : 'Ajustement d’inventaire (Correction)'
        }
        onClose={() => setMoveOpen(false)}
        footer={
          <>
            <Button onClick={() => setMoveOpen(false)}>Annuler</Button>
            <Button variant="primary" disabled={busy || !moveForm.ref_id || Number(moveForm.qty) <= 0} onClick={() => void saveMove()}>
              {busy ? <Spinner /> : 'Valider l’opération'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError ? <Banner tone="error">{formError}</Banner> : null}
          <SelectField
            label="Article concerné"
            value={moveForm.ref_id}
            onChange={(e) => setMoveForm((f) => ({ ...f, ref_id: e.target.value }))}
          >
            {refs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} (en rayon : {r.qty} {r.unit})
              </option>
            ))}
          </SelectField>

          <Field
            label={moveForm.move_type === 'correction' ? 'Nouveau stock réel compté' : 'Quantité'}
            type="number"
            value={moveForm.qty}
            onChange={(e) => setMoveForm((f) => ({ ...f, qty: e.target.value }))}
          />

          {moveForm.move_type === 'out' ? (
            <Field
              label="Bénéficiaire / Chantier"
              value={moveForm.beneficiary}
              onChange={(e) => setMoveForm((f) => ({ ...f, beneficiary: e.target.value }))}
              placeholder="ex. Frère Économe / Portes réfectoire"
            />
          ) : null}

          <Field
            label="N° bon / Référence document (optionnel)"
            value={moveForm.doc_ref}
            onChange={(e) => setMoveForm((f) => ({ ...f, doc_ref: e.target.value }))}
            placeholder="ex. Facture FAC-2024-88"
          />

          <TextArea
            label="Motif / Observations"
            value={moveForm.note}
            onChange={(e) => setMoveForm((f) => ({ ...f, note: e.target.value }))}
            placeholder="Précisions utiles sur le mouvement…"
          />
        </div>
      </Modal>

      {/* Modal Photo Quincaillerie & Matériels (Caméra / Galerie / Même Groupe) */}
      <ImagePickerModal
        open={photoModalOpen}
        title={photoTarget?.name ? `Photo : ${photoTarget.name}` : 'Photo du matériel / quincaillerie'}
        currentImage={photoTarget?.current}
        category="stock"
        defaultFacingMode="environment"
        onClose={() => setPhotoModalOpen(false)}
        onSelect={(url) => void handleStockPhotoSelect(url)}
      />

      {/* Modal Affectation / Transfert Groupé */}
      <Modal
        open={batchAssignOpen}
        title={`Affecter ou transférer ${selectedRefIds.size} article(s)`}
        onClose={() => setBatchAssignOpen(false)}
        footer={
          <>
            <Button onClick={() => setBatchAssignOpen(false)}>Annuler</Button>
            <Button variant="primary" disabled={busy} onClick={() => void handleBatchAssign()}>
              {busy ? <Spinner /> : 'Appliquer l’affectation'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-ink-soft">
            Choisissez le magasin de destination pour les <strong>{selectedRefIds.size}</strong> article(s) sélectionnés.
            Vous pouvez affecter des brouillons ou transférer des stocks d’un magasin à un autre en 1 clic.
          </p>

          <SelectField
            label="Magasin de destination"
            value={batchAssignMagasinId}
            onChange={(e) => setBatchAssignMagasinId(e.target.value)}
          >
            <option value="">📁 Retirer de l’inventaire actif (remettre en brouillon)</option>
            {magasins.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.code})
              </option>
            ))}
          </SelectField>

          <div>
            <span className="mb-1 block text-xs font-semibold text-ink-soft uppercase tracking-wider">
              Articles concernés par ce transfert :
            </span>
            <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg border border-line bg-paper p-2">
              {Array.from(selectedRefIds).map((id) => {
                const r = refs.find((item) => item.id === id);
                return (
                  <div key={id} className="flex items-center justify-between text-xs py-1 px-1.5 border-b border-line/40 last:border-0">
                    <span className="font-mono font-bold text-amber">REF-{id}</span>
                    <span className="truncate flex-1 px-2 text-ink font-medium">{r?.name ?? 'Article'}</span>
                    <span className="text-[11px] text-ink-faint">
                      {r?.magasin_name ?? '📁 Brouillon'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal Suppression Groupée */}
      <Modal
        open={batchDeleteOpen}
        title={`Supprimer ${selectedRefIds.size} article(s) sélectionné(s)`}
        onClose={() => setBatchDeleteOpen(false)}
        footer={
          <>
            <Button onClick={() => setBatchDeleteOpen(false)}>Annuler</Button>
            <Button variant="danger" disabled={busy} onClick={() => void handleBatchDelete()}>
              {busy ? <Spinner /> : `Supprimer définitivement (${selectedRefIds.size})`}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Suppression irréversible du stock</p>
              <p className="mt-0.5 text-ink-soft">
                Vous êtes sur le point de supprimer définitivement <strong>{selectedRefIds.size}</strong> article(s) de stock.
                Leur historique de mouvements sera également purgé.
              </p>
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal Suppression Singleton */}
      <Modal
        open={!!deleteSingleRef}
        title={deleteSingleRef ? `Supprimer l'article REF-${deleteSingleRef.id}` : 'Supprimer'}
        onClose={() => setDeleteSingleRef(null)}
        footer={
          <>
            <Button onClick={() => setDeleteSingleRef(null)}>Annuler</Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                if (deleteSingleRef) void handleDeleteSingle(deleteSingleRef);
              }}
            >
              {busy ? <Spinner /> : 'Supprimer définitivement'}
            </Button>
          </>
        }
      >
        {deleteSingleRef && (
          <div className="space-y-3">
            <p className="text-xs text-ink">
              Confirmez-vous la suppression définitive de l'article suivant ?
            </p>
            <div className="rounded-lg border border-line bg-paper p-3 text-xs space-y-1">
              <div className="font-mono font-bold text-amber">REF-{deleteSingleRef.id}</div>
              <div className="font-semibold text-ink text-sm">{deleteSingleRef.name}</div>
              <div className="text-ink-soft">{deleteSingleRef.category} · {deleteSingleRef.magasin_name ?? '📁 Brouillon'}</div>
              <div className="text-[11px] text-ink-faint">Quantité actuelle en stock : {deleteSingleRef.qty} {deleteSingleRef.unit}</div>
            </div>
            <p className="text-[11px] text-ink-faint">
              ⚠️ Cette action effacera également tous les mouvements d’entrée/sortie associés à cette référence.
            </p>
          </div>
        )}
      </Modal>

      {/* Modal Suppression Globale / Purge Stock */}
      <Modal
        open={deleteAllOpen}
        title="Zone Critique : Suppression globale du stock"
        onClose={() => setDeleteAllOpen(false)}
        footer={
          <>
            <Button onClick={() => setDeleteAllOpen(false)}>Annuler</Button>
            <Button
              variant="danger"
              disabled={busy || deleteAllConfirmText !== 'SUPPRIMER'}
              onClick={() => void handleDeleteAll()}
            >
              {busy ? <Spinner /> : 'Confirmer la suppression globale'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Attention : Action destructrice</p>
              <p className="mt-0.5 text-ink-soft">
                {scopeFilter === 'drafts'
                  ? `Vous allez supprimer l'intégralité des ${draftRefs.length} articles en brouillon (non rattachés à un magasin).`
                  : `Vous allez supprimer l'intégralité des ${refs.length} articles de stock enregistrés dans le système.`}
              </p>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">
              Tapez <strong className="font-mono text-red">SUPPRIMER</strong> pour débloquer :
            </label>
            <input
              type="text"
              value={deleteAllConfirmText}
              onChange={(e) => setDeleteAllConfirmText(e.target.value)}
              placeholder="SUPPRIMER"
              className="h-10 w-full rounded-lg border border-line bg-surface px-3 font-mono text-sm uppercase text-ink focus:border-red focus:outline-none"
            />
          </div>
        </div>
      </Modal>

      {/* Modal Import Tableur Excel / CSV */}
      {importOpen && (
        <ExcelImportModal
          type="stock"
          onClose={() => setImportOpen(false)}
          onSuccess={() => {
            refresh();
          }}
        />
      )}

      {portal}
    </div>
  );
}
