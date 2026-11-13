import { Suspense, lazy, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, getCachedApiResponse, type Employee, type Magasin, type ScanResult, type StockMovement, type StockRef, type User } from '../lib/api';
import { QR_PREFIX, getCachedQr, qrDataUrl } from '../lib/qr';
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
  PageHeader,
  cx,
  useToast,
} from '../components/ui';
import { useUndo } from '../components/UndoToast';
import {
  IconArrowIn,
  IconArrowOut,
  IconBox,
  IconHistory,
  IconPlus,
  IconPrinter,
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
  FolderArchive,
  ArrowRight,
  Zap,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  Scale,
  Plus,
  Minus,
  Menu,
  RefreshCw,
  Search,
  X,
  LayoutGrid,
  List,
} from 'lucide-react';
import { Tabs, TabsContent } from '../components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { exportToExcel, exportToPdf } from '../lib/export';
import { usePrintSheet } from '../lib/print';
import { ImagePickerModal } from '../components/ImagePickerModal';
import { GroupedQrLabelsModal } from '../components/GroupedQrLabelsModal';
import { PrintPreviewModal } from '../components/PrintPreviewModal';
import { formatCurrency } from '../lib/accounting';
import { StockListRow } from '../components/StockListRow';
import { StockBentoCard } from '../components/StockBentoCard';
import { StockMovementCard } from '../components/StockMovementCard';
import { ScrollableChipRail } from '../components/ScrollableChipRail';
import { StickyTableScroller } from '../components/StickyTableScroller';

const ExcelImportModal = lazy(() => import('../components/ExcelImportModal').then((module) => ({ default: module.ExcelImportModal })));

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
  move_type: 'in' | 'out' | 'transfer' | 'correction';
  qty: string;
  beneficiary: string;
  target_magasin_id: string;
  doc_ref: string;
  note: string;
};

const EMPTY_REF: RefForm = {
  name: '',
  category: '',
  unit: '',
  location: '',
  magasin_id: '',
  min_qty: '',
  supplier: '',
  brand: '',
  unit_cost: '',
  photo_path: null,
  initial_qty: '',
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
  const qrKey = `${QR_PREFIX.stock}${id}`;
  const [src, setSrc] = useState<string | null>(() => getCachedQr(qrKey, 200) ?? null);
  useEffect(() => {
    let cancelled = false;
    const cached = getCachedQr(qrKey, 200);
    if (cached) {
      setSrc(cached);
      return;
    }
    void qrDataUrl(qrKey, 200).then((value) => {
      if (!cancelled) setSrc(value);
    });
    return () => {
      cancelled = true;
    };
  }, [qrKey]);
  return (
    <span
      data-qr-ready={src ? 'true' : 'false'}
      data-qr-pending={src ? 'false' : 'true'}
      className="grid h-24 w-24 shrink-0 place-items-center rounded-xl border border-gray-300 bg-white"
    >
      {src ? (
        <img
          src={src}
          alt={`QR ${id}`}
          className="h-20 w-20 object-contain"
          style={{ imageRendering: '-webkit-optimize-contrast' }}
        />
      ) : (
        <IconBox size={28} className="text-gray-400" />
      )}
    </span>
  );
}

function StockBinLabel({ refItem }: { refItem: StockRef }) {
  return (
    <div
      className="a4-page py-6"
      style={{
        fontFamily: '"IBM Plex Sans", -apple-system, sans-serif',
        breakInside: 'avoid',
        pageBreakInside: 'avoid',
      }}
    >
      <div
        className="stock-bin-label mx-auto flex flex-col justify-between overflow-hidden rounded-xl border-2 border-gray-900 bg-white p-5 text-gray-900"
        style={{
          width: '130mm',
          minHeight: '80mm',
          boxSizing: 'border-box',
          breakInside: 'avoid',
          pageBreakInside: 'avoid',
        }}
      >
        {/* En-tête officiel Monastère */}
        <div className="flex items-center justify-between border-b-2 border-gray-900 pb-2">
          <div className="flex items-center gap-3">
            <img src="/emblem.png" alt="" className="h-8 w-8 shrink-0 object-contain" />
            <div className="min-w-0">
              <p className="text-[8.5pt] font-extrabold uppercase tracking-wider text-gray-950">
                CFTM · Bénédictins du Mont Fébé
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
  const { registerUndo } = useUndo();
  const isSuper = user.role === 'direction';
  const hasPerm = (p: string) => isSuper || (permissions ? !!permissions[p] : false);

  const canCreateRef = hasPerm('stock.create_ref') || (!permissions && (user.role === 'direction' || user.role === 'magasinier'));
  const canEditRef = hasPerm('stock.edit_ref') || (!permissions && (user.role === 'direction' || user.role === 'magasinier'));
  const canDeleteRef = hasPerm('stock.delete_ref') || (!permissions && (user.role === 'direction' || user.role === 'magasinier'));
  const canMove = hasPerm('stock.move') || (!permissions && ['direction', 'magasinier', 'chef_atelier'].includes(user.role));
  const canCorrect = hasPerm('stock.correct') || (!permissions && (user.role === 'direction' || user.role === 'magasinier'));
  const canPhoto = hasPerm('stock.photo_edit') || (!permissions && (user.role === 'direction' || user.role === 'magasinier'));
  const canManageRefs = canCreateRef || canEditRef;
  const canViewFinancial = hasPerm('financial.view') || (!permissions && user.role === 'direction');
  const canExportReports = hasPerm('reports.export') || (!permissions && user.role === 'direction');

  const [activeTab, setActiveTab] = useState<'inventory' | 'journal'>('inventory');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('mf_stock_view_mode');
      if (saved === 'list' || saved === 'grid') return saved;
    }
    return 'grid';
  });

  useEffect(() => {
    try {
      localStorage.setItem('mf_stock_view_mode', viewMode);
    } catch {}
  }, [viewMode]);

  useEffect(() => {
    const subLabel = activeTab === 'journal' ? 'Journal des Flux' : 'Matières & Quincaillerie';
    window.dispatchEvent(new CustomEvent('subview-changed', { detail: { view: 'stock', subSection: subLabel } }));
  }, [activeTab]);
  const cachedRefs = useMemo(() => getCachedApiResponse<{ refs: StockRef[] }>('/api/stock/refs')?.refs ?? [], []);
  const cachedMags = useMemo(() => getCachedApiResponse<{ magasins: Magasin[] }>('/api/magasins')?.magasins ?? [], []);
  const [refs, setRefs] = useState<StockRef[]>(cachedRefs);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [magasins, setMagasins] = useState<Magasin[]>(cachedMags);
  const [loading, setLoading] = useState(() => cachedRefs.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [q, setQ] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'' | 'normal' | 'warning' | 'empty'>('');
  const [magasinFilter, setMagasinFilter] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [journalType, setJournalType] = useState<'' | 'in' | 'out' | 'transfer' | 'correction'>('');
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

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTargetRef, setMoveTargetRef] = useState<StockRef | null>(null);
  const [moveForm, setMoveForm] = useState<MoveForm>({
    ref_id: '',
    move_type: 'out',
    qty: '1',
    beneficiary: '',
    target_magasin_id: '',
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
  const [stockLabelPreviewOpen, setStockLabelPreviewOpen] = useState(false);
  const [stockLabelPreviewContent, setStockLabelPreviewContent] = useState<ReactNode>(null);

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
      api<{ employees: Employee[] }>('/api/employees').catch(() => ({ employees: [] })),
    ])
      .then(([refsRes, movesRes, magRes, empRes]) => {
        if (cancelled) return;
        setRefs(refsRes.refs);
        setMovements(movesRes.movements.slice(0, 100));
        setMagasins(magRes.magasins.filter((m) => m.active));
        setEmployees(empRes.employees.filter((e) => e.active));
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

  const refresh = useCallback(() => {
    setLoading(true);
    setReload((value) => value + 1);
  }, []);

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
      if (statusFilter === 'normal' && (ref.qty <= ref.min_qty || ref.qty <= 0)) return false;
      if (statusFilter === 'warning' && (ref.qty <= 0 || ref.qty > ref.min_qty)) return false;
      if (statusFilter === 'empty' && ref.qty > 0) return false;
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
  }, [refs, activeRefs, draftRefs, scopeFilter, q, lowOnly, statusFilter, magasinFilter]);

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
            min_qty: Number(refForm.min_qty || 0),
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
            min_qty: Number(refForm.min_qty || 0),
            supplier: refForm.supplier,
            brand: refForm.brand.trim() || undefined,
            unit_cost: refForm.unit_cost ? Number(refForm.unit_cost) : undefined,
            photo_path: refForm.photo_path || undefined,
            initial_qty: Number(refForm.initial_qty || 0),
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

  function openMove(type: 'in' | 'out' | 'transfer' | 'correction' = 'out', refItem?: StockRef | number) {
    const target = typeof refItem === 'number'
      ? refs.find((r) => r.id === refItem) ?? null
      : refItem ?? (refs[0] ?? null);

    setMoveTargetRef(target);
    setMoveForm({
      ref_id: target ? String(target.id) : (refs[0]?.id ? String(refs[0].id) : ''),
      move_type: type,
      qty: '',
      beneficiary: '',
      target_magasin_id: '',
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
      const parsedQty = Number(moveForm.qty);
      if (moveForm.move_type === 'correction') {
        if (moveForm.qty === '' || isNaN(parsedQty) || parsedQty < 0) {
          setFormError('Veuillez saisir le comptage réel constaté (supérieur ou égal à 0).');
          setBusy(false);
          return;
        }
      } else {
        if (moveForm.qty === '' || isNaN(parsedQty) || parsedQty <= 0) {
          setFormError('Veuillez saisir une quantité valide (supérieure à 0).');
          setBusy(false);
          return;
        }
      }

      if (moveForm.move_type === 'transfer' && !moveForm.target_magasin_id) {
        setFormError('Veuillez sélectionner le magasin ou atelier de destination.');
        setBusy(false);
        return;
      }

      const res = await api<{ qty: number }>('/api/stock/movements', {
        method: 'POST',
        body: JSON.stringify({
          ref_id: Number(moveForm.ref_id),
          move_type: moveForm.move_type,
          qty: parsedQty,
          beneficiary: moveForm.beneficiary || undefined,
          target_magasin_id: moveForm.target_magasin_id || undefined,
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
      const res = await api<{ ok: boolean; message: string; deleted?: StockRef }>(`/api/stock/refs/${refItem.id}`, {
        method: 'DELETE',
      });
      setDeleteSingleRef(null);
      if (selectedId === refItem.id) setSelectedId(null);
      refresh();

      // Enregistrer l'action d'annulation Ctrl+Z (Adobe / Google UX)
      registerUndo({
        title: `Article "${refItem.name}" (#${refItem.id}) supprimé`,
        details: 'Appuyez sur Ctrl+Z ou cliquez pour restaurer immédiatement.',
        onUndo: async () => {
          await api('/api/stock/refs/restore', {
            method: 'POST',
            body: JSON.stringify({ ref: res.deleted ?? refItem }),
          });
          refresh();
        },
      });
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
      ...(canViewFinancial ? ['Coût Unitaire (FCFA)', 'Valeur Totale (FCFA)'] : []),
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
      ...(canViewFinancial ? [r.unit_cost ? r.unit_cost : '-', r.unit_cost ? r.qty * r.unit_cost : '-'] : []),
      r.min_qty,
      r.qty === 0 ? 'Rupture' : r.qty <= r.min_qty ? 'Alerte Seuil' : 'Normal',
    ]);
    exportToExcel(`Inventaire_Stock_${dateStr}`, 'Stock', headers, rows);
  }

  function handleExportPdf() {
    const headers = [
      'Code',
      'Désignation',
      'Marque',
      'Catégorie',
      'Dépôt',
      'Quantité',
      'Unité',
      ...(canViewFinancial ? ['Coût Unit.', 'Valeur Totale'] : []),
      'État',
    ];
    const rows = filtered.map((r) => [
      r.id,
      r.name,
      r.brand || '-',
      r.category,
      r.magasin_name ?? r.location ?? '-',
      r.qty,
      r.unit,
      ...(canViewFinancial ? [r.unit_cost ? formatCurrency(r.unit_cost) : '-', r.unit_cost ? formatCurrency(r.qty * r.unit_cost) : '-'] : []),
      r.qty === 0 ? 'Rupture' : r.qty <= r.min_qty ? 'Alerte' : 'Normal',
    ]);
    exportToPdf(
      'État d’Inventaire & Stocks de Quincaillerie',
      'Registre physique certifié du stock et consommables de menuiserie C.F.T.',
      headers,
      rows,
      [
        { label: 'Références Totales', value: stats.total },
        ...(canViewFinancial ? [{ label: 'Valeur Totale du Stock', value: formatCurrency(totalStockValuation) }] : []),
        { label: 'Stock Normal', value: stats.normal },
        { label: 'Sous Seuil Alerte', value: stats.warning },
        { label: 'En Rupture', value: stats.empty },
      ],
    );
  }

  return (
    <div className="space-y-4 pb-12">
      {/* Top Page Header */}
      <div className={cx(viewMode === 'list' && 'lg:hidden')}>
        <PageHeader
          title="Matières & Quincaillerie"
          hint="Bois massif, visserie, colles & fournitures consommées de menuiserie"
        />
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'inventory' | 'journal')} className="w-full">
        {/* Navigation Bar Strictement 2 Lignes (Standard Apple / Google / YouTube) */}
        <div data-stock-sticky-toolbar="true" className="sticky top-0 lg:top-11 z-20 -mx-3 sm:-mx-6 lg:-mx-8 px-3 sm:px-6 lg:px-8 py-2 bg-paper/98 border-b border-line backdrop-blur-md shadow-xs">
          <div className="flex flex-col gap-1.5">
            {/* LIGNE 1 : Barre d'action unique (Titre + Recherche + CTA Primaire + Options) */}
            <div className="flex items-center justify-between gap-2">
              {/* Titre & Compteur */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-wash border border-amber/30 text-amber shrink-0 shadow-2xs">
                  <IconBox size={18} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h1 className="text-sm sm:text-base font-bold text-ink truncate tracking-tight">
                      {activeTab === 'inventory' ? 'Matières' : 'Journal'}
                    </h1>
                    <span className="rounded-full bg-paper-2 border border-line px-2 py-0.5 text-xs font-bold font-mono text-amber tabular-nums">
                      {activeTab === 'inventory' ? filtered.length : movements.length}
                    </span>
                  </div>
                </div>
              </div>

              {/* Recherche intégrée au centre */}
              <div className="flex-1 min-w-[110px] sm:min-w-[160px] max-w-xs sm:max-w-md relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
                {activeTab === 'inventory' ? (
                  <>
                    <input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Rechercher article, visserie..."
                      className="h-9 w-full rounded-xl border border-line bg-surface/90 pl-8 pr-7 text-xs sm:text-sm text-ink placeholder:text-ink-faint focus:border-amber focus:outline-none transition-all shadow-2xs"
                    />
                    {q && (
                      <button
                        onClick={() => setQ('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink p-1 rounded-md"
                        title="Effacer"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <input
                      value={journalQ}
                      onChange={(e) => setJournalQ(e.target.value)}
                      placeholder="Filtrer mouvements..."
                      className="h-9 w-full rounded-xl border border-line bg-surface/90 pl-8 pr-7 text-xs sm:text-sm text-ink placeholder:text-ink-faint focus:border-amber focus:outline-none transition-all shadow-2xs"
                    />
                    {journalQ && (
                      <button
                        onClick={() => setJournalQ('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink p-1 rounded-md"
                        title="Effacer"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </>
                )}
              </div>

              {/* Actions de droite : CTA Primaire + Menu Contextuel */}
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="hidden lg:inline-flex">
                  <GroupedQrLabelsModal canViewTools={hasPerm('tools.view')} canViewStock={hasPerm('stock.view')} />
                </div>

                {canMove && (
                  <div className="hidden sm:inline-flex">
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Zap size={14} className="text-amber" />}
                      onClick={() => openMove('out')}
                      className="h-9 px-3 text-xs sm:text-sm font-bold shadow-2xs"
                      title="Ouvrir le Hub de Mouvement"
                    >
                      <span>Mouvement</span>
                    </Button>
                  </div>
                )}

                {canManageRefs && (
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<IconPlus size={15} />}
                    onClick={openCreate}
                    className="h-9 px-2.5 sm:px-3.5 text-xs sm:text-sm font-bold shadow-xs shrink-0"
                    title="Créer une nouvelle référence"
                  >
                    <span className="hidden sm:inline">Nouvelle référence</span>
                    <span className="sm:hidden">Réf</span>
                  </Button>
                )}

                {/* Menu Options & Outils unique */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-surface text-ink-soft hover:text-ink hover:border-amber/40 transition-colors shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
                      title="Options & Outils"
                      aria-label="Options & Outils"
                    >
                      <Menu size={16} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 bg-paper border border-line shadow-card rounded-xl p-1 text-xs">
                    <DropdownMenuLabel className="px-2.5 py-1.5 text-xs font-semibold text-ink-faint uppercase tracking-wider">
                      Actions &amp; Outils
                    </DropdownMenuLabel>

                    <DropdownMenuItem
                      onClick={refresh}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-paper-2 text-ink"
                    >
                      <RefreshCw size={14} className={loading ? 'animate-spin text-amber' : 'text-ink-soft'} />
                      <span>Actualiser les données</span>
                    </DropdownMenuItem>

                    {canMove && (
                      <>
                        <DropdownMenuItem
                          onClick={() => openMove('in')}
                          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-paper-2 text-ink"
                        >
                          <IconArrowIn size={14} className="text-green" />
                          <span>+ Enregistrer une Entrée (Arrivage)</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => openMove('out')}
                          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-paper-2 text-ink"
                        >
                          <IconArrowOut size={14} className="text-amber" />
                          <span>- Enregistrer une Sortie (Chantier)</span>
                        </DropdownMenuItem>
                      </>
                    )}

                    <DropdownMenuSeparator className="my-1 border-line" />

                    {activeTab === 'inventory' && (
                      <DropdownMenuItem
                        onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                        className="flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-paper-2 text-ink"
                      >
                        <div className="flex items-center gap-2">
                          {viewMode === 'grid' ? <List size={14} className="text-amber" /> : <LayoutGrid size={14} className="text-amber" />}
                          <span>Mode {viewMode === 'grid' ? 'Liste détaillée' : 'Grille Bento'}</span>
                        </div>
                      </DropdownMenuItem>
                    )}

                    {canExportReports && (
                      <>
                        <DropdownMenuItem
                          onClick={handleExportExcel}
                          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-paper-2 text-ink"
                        >
                          <Download size={14} className="text-emerald-500" />
                          <span>Exporter vers Excel (.xlsx)</span>
                        </DropdownMenuItem>

                        <DropdownMenuItem
                          onClick={handleExportPdf}
                          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-paper-2 text-ink"
                        >
                          <Printer size={14} className="text-sky-500" />
                          <span>Imprimer le Registre (PDF)</span>
                        </DropdownMenuItem>
                      </>
                    )}

                    {canManageRefs && (
                      <DropdownMenuItem
                        onClick={() => setImportOpen(true)}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-paper-2 text-ink"
                      >
                        <FileSpreadsheet size={14} className="text-amber" />
                        <span>Importer Tableur (Excel/CSV)</span>
                      </DropdownMenuItem>
                    )}

                    {canManageRefs && refs.length > 0 && (
                      <>
                        <DropdownMenuSeparator className="my-1 border-line" />
                        <DropdownMenuItem
                          onClick={() => {
                            setDeleteAllConfirmText('');
                            setDeleteAllOpen(true);
                          }}
                          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-red-500/10 text-red"
                        >
                          <Trash2 size={14} />
                          <span>Tout supprimer (Purger)</span>
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* LIGNE 2 : Rail de Défilement Horizontal YouTube (Scroll avec flèches PC) */}
            {activeTab === 'inventory' ? (
              <ScrollableChipRail className="border-t border-line/40 pt-1 text-xs">
                {/* Scope Chips */}
                {[
                  { id: 'all', label: 'Tout le stock', count: refs.length },
                  { id: 'active', label: 'Parc Actif', count: activeRefs.length },
                  ...(draftRefs.length > 0 ? [{ id: 'drafts', label: 'À affecter', count: draftRefs.length }] : []),
                ].map((sc) => (
                  <button
                    key={sc.id}
                    type="button"
                    onClick={() => {
                      setScopeFilter(sc.id as any);
                      setSelectedRefIds(new Set());
                    }}
                    className={cx(
                      'h-8 px-3 rounded-full text-xs font-semibold shrink-0 transition-all flex items-center gap-1.5 border shadow-2xs',
                      scopeFilter === sc.id
                        ? 'bg-amber text-white border-amber shadow-xs font-bold'
                        : 'bg-surface text-ink-soft border-line hover:border-ink-faint hover:text-ink',
                    )}
                  >
                    <span>{sc.label}</span>
                    <span
                      className={cx(
                        'text-xs tabular-nums font-mono font-bold px-1.5 py-0.2 rounded-full',
                        scopeFilter === sc.id ? 'bg-white/20 text-white' : 'bg-paper text-ink-faint',
                      )}
                    >
                      {sc.count}
                    </span>
                  </button>
                ))}

                <span className="h-4 w-px bg-line shrink-0 mx-0.5" />

                {/* Status Chips */}
                {[
                  { key: '', label: 'Tous', count: stats.total },
                  { key: 'normal', label: 'Disponibles', count: stats.normal },
                  { key: 'warning', label: 'Stock bas', count: stats.warning },
                  { key: 'empty', label: 'Rupture', count: stats.empty },
                ].map(({ key, label, count }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setStatusFilter(key as any)}
                    className={cx(
                      'h-8 px-3 rounded-full text-xs font-semibold shrink-0 transition-all flex items-center gap-1.5 border shadow-2xs',
                      statusFilter === key
                        ? 'bg-amber text-white border-amber shadow-xs font-bold'
                        : 'bg-surface text-ink-soft border-line hover:border-ink-faint hover:text-ink',
                    )}
                  >
                    <span>{label}</span>
                    <span
                      className={cx(
                        'text-xs tabular-nums font-mono font-bold px-1.5 py-0.2 rounded-full',
                        statusFilter === key ? 'bg-white/20 text-white' : 'bg-paper text-ink-faint',
                      )}
                    >
                      {count}
                    </span>
                  </button>
                ))}

                {/* Sélecteur Magasin sous forme de puce */}
                {magasins.length > 0 && (
                  <select
                    value={magasinFilter}
                    onChange={(e) => setMagasinFilter(e.target.value)}
                    className="h-8 rounded-full border border-line bg-surface px-3 text-xs font-semibold text-ink focus:border-amber focus:outline-none shadow-2xs shrink-0 max-w-[170px] truncate"
                    title="Filtrer par magasin"
                  >
                    <option value="">Tous magasins ({magasins.length})</option>
                    {magasins.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                )}

                {/* Bascule vers le Journal sous forme de puce */}
                <button
                  type="button"
                  onClick={() => setActiveTab('journal')}
                  className="h-8 px-3 rounded-full text-xs font-semibold shrink-0 transition-all flex items-center gap-1.5 border border-line bg-surface text-ink-soft hover:text-ink shadow-2xs"
                >
                  <Clock size={13} className="text-amber" />
                  <span>Journal ({movements.length})</span>
                </button>
              </ScrollableChipRail>
            ) : (
              <ScrollableChipRail className="border-t border-line/40 pt-1 text-xs">
                {/* Revenir au Stock */}
                <button
                  type="button"
                  onClick={() => setActiveTab('inventory')}
                  className="h-8 px-3 rounded-full text-xs font-bold shrink-0 transition-all flex items-center gap-1.5 bg-amber text-white border border-amber shadow-xs"
                >
                  <IconBox size={13} />
                  <span>← Retour aux Matières</span>
                </button>

                <span className="h-4 w-px bg-line shrink-0 mx-0.5" />

                {/* Type chips */}
                {[
                  { value: '', label: 'Tous flux' },
                  { value: 'in', label: 'Entrées' },
                  { value: 'out', label: 'Sorties' },
                  { value: 'transfer', label: 'Transferts' },
                  { value: 'correction', label: 'Corrections' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setJournalType(opt.value as any)}
                    className={cx(
                      'h-8 px-3 rounded-full text-xs font-semibold shrink-0 transition-all border shadow-2xs',
                      journalType === opt.value
                        ? 'bg-paper-2 text-ink border-amber shadow-xs font-bold'
                        : 'bg-surface text-ink-soft border-line hover:text-ink',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}

                {/* Dates de début / fin */}
                <div className="flex items-center gap-1 shrink-0 text-ink-faint">
                  <input
                    type="date"
                    value={journalFrom}
                    onChange={(e) => setJournalFrom(e.target.value)}
                    className="h-8 rounded-full border border-line bg-surface px-2.5 text-xs text-ink focus:border-amber focus:outline-none shadow-2xs"
                  />
                  <span>→</span>
                  <input
                    type="date"
                    value={journalTo}
                    onChange={(e) => setJournalTo(e.target.value)}
                    className="h-8 rounded-full border border-line bg-surface px-2.5 text-xs text-ink focus:border-amber focus:outline-none shadow-2xs"
                  />
                </div>
              </ScrollableChipRail>
            )}
          </div>
        </div>

        {error ? (
          <div className="mt-4">
            <Banner tone="error">{error}</Banner>
          </div>
        ) : null}

        {/* Tab 1: Inventaire & Tableur Pro */}
        <TabsContent value="inventory" className="space-y-3">
          {/* Alerte brouillons si existants */}
          {draftRefs.length > 0 && scopeFilter !== 'drafts' && (
            <div className="flex items-center justify-between p-2.5 rounded-xl border border-amber/30 bg-amber-wash/30 text-xs">
              <span className="text-ink font-medium">⚠️ {draftRefs.length} article{draftRefs.length > 1 ? 's' : ''} en brouillon sans magasin</span>
              <button
                onClick={() => {
                  setScopeFilter('drafts');
                  setSelectedRefIds(new Set());
                }}
                className="font-bold text-amber hover:underline flex items-center gap-1"
              >
                <span>Voir les brouillons</span>
                <ArrowRight size={13} />
              </button>
            </div>
          )}

          {/* Mini-Bandeau Synthèse Mobile (remplace les 5 gros blocs sur smartphone pour afficher immédiatement les produits !) */}
          <div className="sm:hidden flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-surface border border-line text-xs shadow-2xs">
            <div className="flex items-center gap-2 text-ink-soft flex-wrap">
              <span className="font-semibold text-green">{stats.normal} dispo</span>
              <span className="text-line-strong">·</span>
              <span className="font-semibold text-amber">{stats.warning} alerte</span>
              <span className="text-line-strong">·</span>
              <span className="font-semibold text-red">{stats.empty} rupture</span>
            </div>
            {canViewFinancial && (
              <span className="font-mono font-bold text-green text-xs truncate max-w-[130px] ml-1">
                {formatCurrency(totalStockValuation)}
              </span>
            )}
          </div>

          {/* KPI Dashboard Cards (Affichés sur Tablette & Desktop) */}
          <div className={cx('hidden sm:grid gap-3', canViewFinancial ? 'sm:grid-cols-5' : 'sm:grid-cols-4')}>
            <div className="rounded-xl border border-line bg-surface p-3.5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-faint">Total Articles</span>
                <span className="h-1.5 w-1.5 rounded-full bg-ink-faint" />
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-ink tabular-nums">{stats.total}</span>
                <span className="text-xs text-ink-faint">références</span>
              </div>
            </div>

            {canViewFinancial && (
              <div className="rounded-xl border border-line bg-surface p-3.5 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-ink-faint">Valeur Stock</span>
                  <Coins size={14} className="text-amber" />
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-lg sm:text-xl font-bold text-green tabular-nums">{formatCurrency(totalStockValuation)}</span>
                </div>
              </div>
            )}

            <div className="rounded-xl border border-line bg-surface p-3.5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-faint">Stock Normal</span>
                <span className="h-1.5 w-1.5 rounded-full bg-green" />
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-ink tabular-nums">{stats.normal}</span>
                <span className="text-xs text-ink-faint">confortable</span>
              </div>
            </div>

            <div className="rounded-xl border border-line bg-surface p-3.5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-faint">Sous Seuil</span>
                <span className="h-1.5 w-1.5 rounded-full bg-amber" />
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-ink tabular-nums">{stats.warning}</span>
                <span className="text-xs text-ink-faint">à réappro.</span>
              </div>
            </div>

            <div className="rounded-xl border border-line bg-surface p-3.5 shadow-xs col-span-2 sm:col-span-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-faint">En Rupture</span>
                <span className="h-1.5 w-1.5 rounded-full bg-red" />
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-ink tabular-nums">{stats.empty}</span>
                <span className="text-xs text-ink-faint">épuisées</span>
              </div>
            </div>
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
          ) : viewMode === 'list' ? (
            <>
              {/* Tableur Google Sheets Style (Desktop) */}
              <StickyTableScroller
                stickyBelow="[data-stock-sticky-toolbar]"
                className="hidden lg:block"
                tableClassName="min-h-[460px]"
                footer={
                  <div className="flex items-center gap-3 text-xs flex-wrap font-semibold">
                    <span className="text-ink">
                      Affichés : <strong className="text-amber font-mono font-bold">{filtered.length}</strong> référence(s)
                    </span>
                    {canViewFinancial && (
                      <>
                        <span className="h-3 w-px bg-line" />
                        <span className="text-ink-soft">
                          Valeur Stock : <strong className="text-ink font-mono font-bold">{formatCurrency(totalStockValuation)}</strong>
                        </span>
                      </>
                    )}
                    <span className="h-3 w-px bg-line" />
                    <span className="text-ink-soft">
                      En stock : <strong className="text-green font-mono">{filtered.filter((i) => i.qty > 0).length}</strong>
                    </span>
                    {filtered.some((i) => i.qty <= 0) && (
                      <>
                        <span className="h-3 w-px bg-line" />
                        <span className="text-ink-soft">
                          Épuisés : <strong className="text-red font-mono">{filtered.filter((i) => i.qty <= 0).length}</strong>
                        </span>
                      </>
                    )}
                    {selectedRefIds.size > 0 ? (
                      <>
                        <span className="h-3 w-px bg-line" />
                        <span className="rounded bg-amber-wash border border-amber/30 px-2 py-0.5 text-xs font-bold text-amber">
                          {selectedRefIds.size} article(s) sélectionné(s)
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="h-3 w-px bg-line" />
                        <span className="text-[11px] text-ink-faint font-normal hidden 2xl:inline">
                          Cochez des articles pour les affecter ou transférer par lot
                        </span>
                      </>
                    )}
                  </div>
                }
              >
                  <table className="w-full text-left border-separate border-spacing-0 text-xs table-rhythm">
                    <thead>
                      <tr className="bg-paper-2 text-ink-faint font-semibold uppercase tracking-wider text-[11px]">
                        {canManageRefs && (
                          <th className="sticky top-0 left-0 z-30 bg-paper-2 px-2.5 py-2.5 w-10 min-w-10 max-w-10 text-center border-b border-r border-line">
                            <input
                              type="checkbox"
                              checked={filtered.length > 0 && selectedRefIds.size === filtered.length}
                              onChange={() => toggleSelectAll(filtered)}
                              className="h-4 w-4 rounded accent-amber cursor-pointer"
                              title="Tout sélectionner / désélectionner"
                            />
                          </th>
                        )}
                        <th className={cx(
                          'sticky top-0 z-30 bg-paper-2 px-1.5 py-2.5 w-16 min-w-16 max-w-16 border-b border-r border-line text-center whitespace-nowrap',
                          canManageRefs ? 'left-[40px]' : 'left-0',
                        )}>
                          Photo
                        </th>
                        <th className={cx(
                          'sticky top-0 z-30 bg-paper-2 px-3 py-2.5 min-w-64 border-b freeze-pane-divider',
                          canManageRefs ? 'left-[104px]' : 'left-[64px]',
                        )}>
                          Désignation &amp; Marque
                        </th>
                        <th className="sticky top-0 z-20 bg-paper-2 px-3 py-2.5 min-w-28 border-b border-r border-line whitespace-nowrap">Catégorie</th>
                        <th className="sticky top-0 z-20 bg-paper-2 px-3 py-2.5 min-w-32 border-b border-r border-line whitespace-nowrap">Emplacement / Magasin</th>
                        <th className="sticky top-0 z-20 bg-paper-2 px-3 py-2.5 min-w-36 border-b border-r border-line whitespace-nowrap">Stock Disponible</th>
                        {canViewFinancial && (
                          <>
                            <th className="sticky top-0 z-20 bg-paper-2 px-3 py-2.5 min-w-24 border-b border-r border-line text-right whitespace-nowrap">Coût Unit.</th>
                            <th className="sticky top-0 z-20 bg-paper-2 px-3 py-2.5 min-w-28 border-b border-r border-line text-right whitespace-nowrap">Valeur Stock</th>
                          </>
                        )}
                        <th className="sticky top-0 z-20 bg-paper-2 px-3 py-2.5 min-w-24 border-b border-r border-line text-center whitespace-nowrap">État</th>
                        <th className="sticky top-0 z-20 bg-paper-2 px-3 py-2.5 min-w-36 text-right border-b border-line col-actions whitespace-nowrap">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((ref, idx) => {
                        const state = stockState(ref);
                        const lineValuation = Number(ref.qty || 0) * Number(ref.unit_cost || 0);
                        const isSelected = selectedRefIds.has(ref.id);
                        const frozenBg = isSelected
                          ? 'bg-[#2a2216] group-hover:bg-[#342a1b]'
                          : idx % 2 === 0
                          ? 'bg-[#12151c] group-hover:bg-[#201c18]'
                          : 'bg-[#181d28] group-hover:bg-[#25201c]';

                        return (
                          <tr
                            key={ref.id}
                            onClick={() => setSelectedId(ref.id)}
                            className={cx(
                              'cursor-pointer transition-colors group',
                              isSelected
                                ? 'bg-amber-wash/40 hover:bg-amber-wash/50'
                                : idx % 2 === 0
                                ? 'bg-surface/95'
                                : 'bg-surface-2/45',
                              'hover:bg-amber-wash/20',
                            )}
                          >
                            {/* Checkbox */}
                            {canManageRefs && (
                              <td
                                className={cx(
                                  'sticky left-0 z-10 px-2.5 py-2 text-center border-b border-r border-line w-10 min-w-10 max-w-10',
                                  frozenBg,
                                )}
                                onClick={(e) => e.stopPropagation()}
                              >
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
                              className={cx(
                                'sticky z-10 px-1.5 py-1.5 text-center border-b border-r border-line w-16 min-w-16 max-w-16',
                                canManageRefs ? 'left-[40px]' : 'left-0',
                                frozenBg,
                              )}
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

                            {/* Designation & Marque */}
                            <td
                              className={cx(
                                'sticky z-10 px-3 py-2 font-semibold text-ink border-b freeze-pane-divider min-w-64',
                                canManageRefs ? 'left-[104px]' : 'left-[64px]',
                                frozenBg,
                              )}
                            >
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
                            <td className="px-3 py-2 text-ink-soft border-b border-r border-line">
                              <span className="inline-block rounded bg-paper px-1.5 py-0.5 text-[11px] font-medium border border-line">
                                {ref.category}
                              </span>
                            </td>

                            {/* Emplacement / Magasin */}
                            <td className="px-3 py-2 text-ink-soft border-b border-r border-line">
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
                            <td className="px-3 py-2 border-b border-r border-line">
                              <StockBar ref={ref} />
                            </td>

                            {canViewFinancial && (
                              <>
                                {/* Coût Unitaire */}
                                <td className="px-3 py-2 text-right font-mono text-ink-soft border-b border-r border-line tabular-nums">
                                  {ref.unit_cost ? formatCurrency(ref.unit_cost) : '—'}
                                </td>

                                {/* Valeur Totale */}
                                <td className="px-3 py-2 text-right font-mono font-bold text-ink border-b border-r border-line tabular-nums">
                                  {ref.unit_cost ? formatCurrency(lineValuation) : '—'}
                                </td>
                              </>
                            )}

                            {/* State Badge */}
                            <td className="px-3 py-2 text-center border-b border-r border-line">
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
                            <td className="px-3 py-2 text-right border-b border-line">
                              <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                                {canMove ? (
                                  <>
                                    <button
                                      onClick={() => openMove('out', ref)}
                                      title="Enregistrer une sortie"
                                      className="rounded border border-amber/30 bg-amber-wash px-2 py-1 text-[11px] font-semibold text-amber hover:bg-amber hover:text-white active:scale-95 transition-all flex items-center gap-1"
                                    >
                                      - Sortie
                                    </button>
                                    <button
                                      onClick={() => openMove('in', ref)}
                                      title="Enregistrer une entrée"
                                      className="rounded border border-green/30 bg-green/10 px-2 py-1 text-[11px] font-semibold text-green hover:bg-green hover:text-white active:scale-95 transition-all flex items-center gap-1"
                                    >
                                      + Entrée
                                    </button>
                                    <button
                                      onClick={() => openMove('out', ref)}
                                      title="Hub de Mouvement (Transfert, Ajustement, Sortie, Entrée)"
                                      className="rounded border border-line bg-paper p-1 text-ink-soft hover:bg-paper-2 hover:text-amber active:scale-95 transition-all"
                                    >
                                      <Zap size={13} className="text-amber" />
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
                </StickyTableScroller>

              {/* Mobile & Tablet Mode Liste Accordéon */}
              <div className="lg:hidden space-y-2">
                {filtered.map((ref) => (
                  <StockListRow
                    key={ref.id}
                    item={ref}
                    isSelected={selectedRefIds.has(ref.id)}
                    onSelect={() => toggleSelect(ref.id)}
                    onClick={() => setSelectedId(ref.id)}
                    onMoveIn={() => openMove('in', ref)}
                    onMoveOut={() => openMove('out', ref)}
                    onTransfer={() => {
                      setSelectedRefIds(new Set([ref.id]));
                      setBatchAssignMagasinId(ref.magasin_id ?? '');
                      setBatchAssignOpen(true);
                    }}
                    canManage={canManageRefs}
                    canMove={canMove}
                  />
                ))}
              </div>
            </>
          ) : (
            /* Mode Grille Bento Élevée (Mobile, Tablette & Desktop) */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {filtered.map((ref) => (
                <StockBentoCard
                  key={ref.id}
                  item={ref}
                  isSelected={selectedRefIds.has(ref.id)}
                  onSelect={() => toggleSelect(ref.id)}
                  onClick={() => setSelectedId(ref.id)}
                  onMoveIn={() => openMove('in', ref)}
                  onMoveOut={() => openMove('out', ref)}
                  onTransfer={() => {
                    setSelectedRefIds(new Set([ref.id]));
                    setBatchAssignMagasinId(ref.magasin_id ?? '');
                    setBatchAssignOpen(true);
                  }}
                  onDelete={() => setDeleteSingleRef(ref)}
                  canManage={canManageRefs}
                  canMove={canMove}
                  canDelete={canDeleteRef}
                  canViewFinancial={canViewFinancial}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tab 2: Journal des Mouvements (Audit Trail) */}
        <TabsContent value="journal" className="space-y-3">

          {movements.length === 0 ? (
            <EmptyState
              title="Aucun mouvement consigné"
              hint="Les entrées, sorties et ajustements d'inventaire apparaîtront dans cette table d'audit."
            />
          ) : (
            <>
              {/* Desktop Tableur */}
              <StickyTableScroller
                stickyBelow="[data-stock-sticky-toolbar]"
                className="hidden lg:block"
                tableClassName="min-h-[400px]"
              >
                  <table className="w-full text-left border-separate border-spacing-0 text-xs table-rhythm">
                    <thead>
                      <tr className="bg-paper-2 text-ink-faint font-semibold uppercase tracking-wider text-[11px]">
                        <th className="sticky top-0 left-0 z-30 bg-paper-2 px-3 py-2.5 w-36 min-w-36 max-w-36 border-b border-r border-line">Date &amp; Heure</th>
                        <th className="sticky top-0 left-[144px] z-30 bg-paper-2 px-3 py-2.5 w-28 min-w-28 max-w-28 border-b border-r border-line text-center">Type</th>
                        <th className="sticky top-0 left-[256px] z-30 bg-paper-2 px-3 py-2.5 min-w-44 border-b freeze-pane-divider">Article</th>
                        <th className="sticky top-0 z-20 bg-paper-2 px-3 py-2.5 min-w-24 border-b border-r border-line text-right">Quantité</th>
                        <th className="sticky top-0 z-20 bg-paper-2 px-3 py-2.5 min-w-36 border-b border-r border-line">Bénéficiaire / Motif</th>
                        <th className="sticky top-0 z-20 bg-paper-2 px-3 py-2.5 min-w-28 text-right border-b border-line col-actions">Agent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movements.map((move, idx) => {
                        const frozenBg = idx % 2 === 0 ? 'bg-[#12151c] group-hover:bg-[#201c18]' : 'bg-[#181d28] group-hover:bg-[#25201c]';
                        return (
                          <tr
                            key={move.id}
                            className={cx(
                              'transition-colors group',
                              idx % 2 === 0 ? 'bg-surface/95' : 'bg-surface-2/45',
                              'hover:bg-amber-wash/20',
                            )}
                          >
                            <td className={cx('sticky left-0 z-10 px-3 py-2 font-mono text-ink-faint tabular-nums border-b border-r border-line w-36 min-w-36 max-w-36', frozenBg)}>
                              {formatDateTime(move.created_at)}
                            </td>
                            <td className={cx('sticky left-[144px] z-10 px-3 py-2 text-center border-b border-r border-line w-28 min-w-28 max-w-28', frozenBg)}>
                              <Chip tone={MOVE_TONE[move.move_type]}>{MOVE_LABEL[move.move_type]}</Chip>
                            </td>
                            <td className={cx('sticky left-[256px] z-10 px-3 py-2 font-semibold text-ink border-b freeze-pane-divider min-w-44', frozenBg)}>
                              {move.ref_name}
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-bold text-ink border-b border-r border-line tabular-nums">
                              {move.move_type === 'out' || move.move_type === 'transfer' ? `-${move.qty}` : `+${move.qty}`} {move.unit ?? 'u'}
                            </td>
                            <td className="px-3 py-2 text-ink-soft border-b border-r border-line">
                              {move.move_type === 'transfer' ? (
                                <div className="font-semibold text-blue">
                                  Vers {move.target_magasin_name ?? 'autre magasin / atelier'}
                                </div>
                              ) : (
                                <div>{move.beneficiary ?? '—'}</div>
                              )}
                              {move.doc_ref ? <div className="text-[10px] font-mono text-ink-soft">Doc: {move.doc_ref}</div> : null}
                              {move.note ? <div className="text-[10px] text-ink-faint">{move.note}</div> : null}
                            </td>
                            <td className="px-3 py-2 text-right text-ink-faint border-b border-line">
                              {move.actor}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </StickyTableScroller>

              {/* Mobile & Tablet Movement Cards */}
              <div className="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-3">
                {movements.map((move) => (
                  <StockMovementCard key={move.id} movement={move} />
                ))}
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

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

              <div className={cx('grid gap-2.5 border-t border-line/60 pt-3 text-xs', canViewFinancial ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1')}>
                <div>
                  <span className="text-ink-faint block text-[11px]">Marque</span>
                  <span className="font-semibold text-ink">{selected.brand || '—'}</span>
                </div>
                {canViewFinancial && (
                  <>
                    <div>
                      <span className="text-ink-faint block text-[11px]">Coût Unitaire</span>
                      <span className="font-semibold text-ink">{selected.unit_cost ? formatCurrency(selected.unit_cost) : '—'}</span>
                    </div>
                    <div>
                      <span className="text-ink-faint block text-[11px]">Valeur Stock en Rayon</span>
                      <span className="font-bold text-green">{selected.unit_cost ? formatCurrency(selected.qty * selected.unit_cost) : '—'}</span>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2 pt-3 border-t border-line">
                {canMove ? (
                  <>
                    <Button
                      size="sm"
                      variant="primary"
                      icon={<Zap size={14} />}
                      onClick={() => openMove('out', selected)}
                    >
                      ⚡ Mouvement
                    </Button>
                    <Button
                      size="sm"
                      icon={<IconArrowOut size={16} />}
                      onClick={() => openMove('out', selected)}
                    >
                      Sortie
                    </Button>
                    <Button
                      size="sm"
                      icon={<IconArrowIn size={16} />}
                      onClick={() => openMove('in', selected)}
                    >
                      Entrée
                    </Button>
                    <Button
                      size="sm"
                      icon={<ArrowRightLeft size={14} />}
                      onClick={() => openMove('transfer', selected)}
                    >
                      Transfert
                    </Button>
                  </>
                ) : null}
                {canCorrect && (
                  <Button
                    size="sm"
                    icon={<Scale size={14} />}
                    onClick={() => openMove('correction', selected)}
                  >
                    Régulariser
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
                    setStockLabelPreviewContent(<StockBinLabel refItem={selected} />);
                    setStockLabelPreviewOpen(true);
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

          <div className={cx('grid gap-3', canViewFinancial ? 'sm:grid-cols-2' : 'sm:grid-cols-1')}>
            <Field
              label="Unité de comptage"
              value={refForm.unit}
              onChange={(e) => setRefForm((f) => ({ ...f, unit: e.target.value }))}
              placeholder="u, kg, boîte, l, m..."
            />
            {canViewFinancial && (
              <Field
                label="Coût unitaire d'achat (FCFA)"
                type="number"
                value={refForm.unit_cost}
                onChange={(e) => setRefForm((f) => ({ ...f, unit_cost: e.target.value }))}
                placeholder="ex. 150"
                hint="Pour le calcul de la valeur globale du stock"
              />
            )}
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
              placeholder="0"
              value={refForm.min_qty}
              onChange={(e) => setRefForm((f) => ({ ...f, min_qty: e.target.value }))}
            />
            {!editing ? (
              <Field
                label="Stock initial"
                type="number"
                placeholder="0"
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

      {/* Modal Mouvement de Stock (Hub Entrée / Sortie / Transfert / Correction) */}
      <Modal
        open={moveOpen}
        title="⚡ Mouvement Matières & Quincaillerie"
        onClose={() => setMoveOpen(false)}
        footer={
          <>
            <Button onClick={() => setMoveOpen(false)}>Annuler</Button>
            <Button
              variant="primary"
              disabled={
                busy ||
                !moveForm.ref_id ||
                moveForm.qty === '' ||
                (moveForm.move_type !== 'correction' && Number(moveForm.qty) <= 0) ||
                (moveForm.move_type === 'correction' && Number(moveForm.qty) < 0) ||
                (moveForm.move_type === 'transfer' && !moveForm.target_magasin_id)
              }
              onClick={() => void saveMove()}
            >
              {busy ? <Spinner /> : 'Valider l’opération'}
            </Button>
          </>
        }
      >
        {(() => {
          const currentRef = refs.find((r) => String(r.id) === String(moveForm.ref_id)) ?? moveTargetRef;
          const parsedQty = Number(moveForm.qty);
          const hasQty = moveForm.qty !== '' && !isNaN(parsedQty);
          const projectedQty = currentRef
            ? moveForm.move_type === 'in'
              ? currentRef.qty + (hasQty ? parsedQty : 0)
              : moveForm.move_type === 'out' || moveForm.move_type === 'transfer'
                ? currentRef.qty - (hasQty ? parsedQty : 0)
                : (hasQty ? parsedQty : currentRef.qty)
            : 0;
          const isOverdrawn = currentRef && (moveForm.move_type === 'out' || moveForm.move_type === 'transfer') && hasQty && projectedQty < 0;

          return (
            <div className="space-y-4">
              {formError ? <Banner tone="error">{formError}</Banner> : null}

              {/* Notice Pédagogique Google Material HMI */}
              <div className="rounded-xl border border-line bg-paper px-3 py-2 text-[11px] text-ink-soft flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-amber">💡</span>
                  <span>Gestion des <strong>fournitures &amp; consommables</strong> (bois, visserie, colles, abrasifs...).</span>
                </div>
                <span className="text-ink-faint hidden sm:inline">
                  Pour les machines &amp; outils (ex. <em>Agrafeuse OUT-001</em>), voir <strong>Parc Matériel</strong>.
                </span>
              </div>

              {/* Mode Selector : 4 Actions */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 rounded-xl bg-paper-2 border border-line">
                <button
                  type="button"
                  onClick={() => setMoveForm((f) => ({ ...f, move_type: 'out' }))}
                  className={cx(
                    'flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold transition-all',
                    moveForm.move_type === 'out'
                      ? 'bg-amber text-white shadow-xs'
                      : 'text-ink-soft hover:text-ink hover:bg-paper',
                  )}
                >
                  <ArrowUpRight size={14} />
                  <span>Sortie Chantier</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMoveForm((f) => ({ ...f, move_type: 'in' }))}
                  className={cx(
                    'flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold transition-all',
                    moveForm.move_type === 'in'
                      ? 'bg-green text-white shadow-xs'
                      : 'text-ink-soft hover:text-ink hover:bg-paper',
                  )}
                >
                  <ArrowDownLeft size={14} />
                  <span>Arrivage / Entrée</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMoveForm((f) => ({ ...f, move_type: 'transfer' }))}
                  className={cx(
                    'flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold transition-all',
                    moveForm.move_type === 'transfer'
                      ? 'bg-blue text-white shadow-xs'
                      : 'text-ink-soft hover:text-ink hover:bg-paper',
                  )}
                >
                  <ArrowRightLeft size={14} />
                  <span>Transfert Dépôt</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMoveForm((f) => ({ ...f, move_type: 'correction' }))}
                  className={cx(
                    'flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold transition-all',
                    moveForm.move_type === 'correction'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'text-ink-soft hover:text-ink hover:bg-paper',
                  )}
                >
                  <Scale size={14} />
                  <span>Régularisation</span>
                </button>
              </div>

              {/* Target Reference Selector */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-ink">Article de quincaillerie / matière</label>
                  {canManageRefs && (
                    <button
                      type="button"
                      onClick={() => {
                        setMoveOpen(false);
                        openCreate();
                      }}
                      className="text-[11px] text-amber hover:underline font-semibold flex items-center gap-1"
                    >
                      <IconPlus size={12} />
                      <span>Nouvelle matière</span>
                    </button>
                  )}
                </div>
                <SelectField
                  label=""
                  value={moveForm.ref_id}
                  onChange={(e) => {
                    const found = refs.find((r) => String(r.id) === e.target.value) ?? null;
                    setMoveTargetRef(found);
                    setMoveForm((f) => ({ ...f, ref_id: e.target.value }));
                  }}
                >
                  {refs.length === 0 ? (
                    <option value="" disabled>
                      ⚠️ Aucun consommable enregistré pour le moment
                    </option>
                  ) : (
                    refs.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} (Stock actuel : {r.qty} {r.unit})
                      </option>
                    ))
                  )}
                </SelectField>

                {refs.length === 0 && (
                  <div className="rounded-xl border border-amber/30 bg-amber-wash/40 p-3 text-xs space-y-2 mt-2">
                    <p className="text-amber font-semibold flex items-center gap-1.5">
                      <AlertTriangle size={15} />
                      Votre registre de quincaillerie &amp; matières est actuellement vide.
                    </p>
                    <p className="text-ink-soft text-[11px] leading-relaxed">
                      Vous n’avez pas encore enregistré de consommables (vis, colle, abrasifs, bois).
                      Si vous souhaitez prêter ou déplacer un appareil durable comme <strong>l'Agrafeuse OUT-001</strong>,
                      rendez-vous dans le module <strong>Parc Matériel &amp; Machines</strong>.
                    </p>
                    {canManageRefs && (
                      <div className="pt-1">
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => {
                            setMoveOpen(false);
                            openCreate();
                          }}
                          icon={<IconPlus size={13} />}
                        >
                          Créer un premier consommable
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Reference Info Badge */}
              {currentRef ? (
                <div className="flex items-center justify-between rounded-xl border border-line bg-paper p-3 text-xs">
                  <div className="flex items-center gap-3">
                    {currentRef.photo_path ? (
                      <img
                        src={currentRef.photo_path}
                        alt={currentRef.name}
                        className="h-10 w-10 rounded-lg object-cover border border-line shadow-2xs"
                      />
                    ) : (
                      <span className="grid h-10 w-10 place-items-center rounded-lg bg-surface border border-line text-ink-faint">
                        <IconBox size={18} />
                      </span>
                    )}
                    <div>
                      <div className="font-bold text-ink">{currentRef.name}</div>
                      <div className="text-[11px] text-ink-faint">
                        {currentRef.category} · {currentRef.magasin_name ?? 'Sans magasin'}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="block text-[10px] uppercase tracking-wider text-ink-faint font-semibold">En Rayon</span>
                    <span className="text-base font-bold text-ink tabular-nums">
                      {currentRef.qty} <span className="text-xs font-normal text-ink-soft">{currentRef.unit}</span>
                    </span>
                  </div>
                </div>
              ) : null}

              {/* Quantity Stepper & Projected Stock */}
              <div className="rounded-xl border border-line bg-surface p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-ink">
                    {moveForm.move_type === 'correction'
                      ? 'Nouveau stock réel physique compté'
                      : moveForm.move_type === 'out'
                        ? 'Quantité à sortir'
                        : moveForm.move_type === 'transfer'
                          ? 'Quantité à transférer'
                          : 'Quantité reçue / entrée'}
                  </label>
                  {currentRef && (
                    <span className="text-[11px] font-semibold text-ink-soft">
                      Unité : <strong className="text-ink">{currentRef.unit || 'unités'}</strong>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const cur = Number(moveForm.qty) || 0;
                      const next = moveForm.move_type === 'correction' ? Math.max(0, cur - 1) : Math.max(1, cur - 1);
                      setMoveForm((f) => ({ ...f, qty: String(next) }));
                    }}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-paper text-ink hover:bg-paper-2 active:scale-95 transition-all"
                  >
                    <Minus size={16} />
                  </button>

                  <input
                    type="number"
                    min={moveForm.move_type === 'correction' ? '0' : '1'}
                    value={moveForm.qty}
                    onChange={(e) => setMoveForm((f) => ({ ...f, qty: e.target.value }))}
                    placeholder={
                      moveForm.move_type === 'correction'
                        ? (currentRef ? `Actuel : ${currentRef.qty}` : 'ex. 15')
                        : 'ex. 5'
                    }
                    className="h-10 flex-1 rounded-xl border border-line bg-paper px-3 text-center text-sm font-bold text-ink tabular-nums focus:border-amber focus:outline-none"
                  />

                  <button
                    type="button"
                    onClick={() => {
                      const cur = Number(moveForm.qty) || 0;
                      setMoveForm((f) => ({ ...f, qty: String(cur + 1) }));
                    }}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-paper text-ink hover:bg-paper-2 active:scale-95 transition-all"
                  >
                    <Plus size={16} />
                  </button>
                </div>

                {/* Quick Addition Chips */}
                {moveForm.move_type !== 'correction' && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[10px] text-ink-faint font-medium mr-1">Ajout rapide:</span>
                    {[1, 5, 10, 25, 50, 100].map((step) => (
                      <button
                        key={step}
                        type="button"
                        onClick={() => {
                          const cur = Number(moveForm.qty) || 0;
                          setMoveForm((f) => ({ ...f, qty: String(cur + step) }));
                        }}
                        className="rounded-lg border border-line bg-paper px-2 py-0.5 text-[11px] font-semibold text-ink-soft hover:bg-paper-2 hover:text-amber active:scale-95 transition-all"
                      >
                        +{step}
                      </button>
                    ))}
                  </div>
                )}

                {/* Projected Stock Display */}
                {currentRef && hasQty && (
                  <div
                    className={cx(
                      'flex items-center justify-between rounded-lg p-2.5 text-xs border font-medium transition-colors',
                      isOverdrawn
                        ? 'border-red/40 bg-red-500/10 text-red'
                        : 'border-line/70 bg-paper text-ink',
                    )}
                  >
                    <span>
                      {isOverdrawn
                        ? '⚠️ Stock insuffisant en rayon !'
                        : 'Stock projeté après opération :'}
                    </span>
                    <span className="font-bold tabular-nums">
                      {currentRef.qty} →{' '}
                      <span className={isOverdrawn ? 'text-red font-black' : 'text-green'}>
                        {projectedQty} {currentRef.unit}
                      </span>
                    </span>
                  </div>
                )}
              </div>

              {/* Contextual Fields: Out (Beneficiary / Site) */}
              {moveForm.move_type === 'out' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-ink">Bénéficiaire / Chantier / Atelier</label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <SelectField
                      label=""
                      value={employees.some((e) => e.full_name === moveForm.beneficiary) ? moveForm.beneficiary : ''}
                      onChange={(e) => setMoveForm((f) => ({ ...f, beneficiary: e.target.value }))}
                    >
                      <option value="">— Ouvrier / Agent —</option>
                      {employees.map((e) => (
                        <option key={e.id} value={e.full_name}>
                          {e.full_name} ({e.job_title || 'Atelier'})
                        </option>
                      ))}
                    </SelectField>
                    <input
                      type="text"
                      placeholder="Ou saisir chantier / atelier..."
                      value={moveForm.beneficiary}
                      onChange={(e) => setMoveForm((f) => ({ ...f, beneficiary: e.target.value }))}
                      className="h-10 rounded-xl border border-line bg-paper px-3 text-xs text-ink focus:border-amber focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Contextual Fields: Transfer (Target Warehouse) */}
              {moveForm.move_type === 'transfer' && (
                <SelectField
                  label="Magasin / Atelier de destination"
                  value={moveForm.target_magasin_id}
                  onChange={(e) => setMoveForm((f) => ({ ...f, target_magasin_id: e.target.value }))}
                  required
                >
                  <option value="">— Choisir le magasin destinataire —</option>
                  {magasins
                    .filter((m) => m.id !== currentRef?.magasin_id)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </SelectField>
              )}

              {/* Contextual Fields: In (Supplier / Receipt) */}
              {moveForm.move_type === 'in' && (
                <Field
                  label="Fournisseur / Provenance"
                  value={moveForm.beneficiary}
                  onChange={(e) => setMoveForm((f) => ({ ...f, beneficiary: e.target.value }))}
                  placeholder={currentRef?.supplier ? `ex. ${currentRef.supplier}` : 'ex. Quincaillerie Centrale, Spax...'}
                />
              )}

              {/* Common Fields : Document Reference */}
              <Field
                label="N° bon / Référence document (optionnel)"
                value={moveForm.doc_ref}
                onChange={(e) => setMoveForm((f) => ({ ...f, doc_ref: e.target.value }))}
                placeholder="ex. Facture FAC-2024-88, Bon de livraison BL-042..."
              />

              {/* Common Fields : Note / Observations */}
              <TextArea
                label="Motif / Observations"
                value={moveForm.note}
                onChange={(e) => setMoveForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="Observations ou détails sur le mouvement…"
              />
            </div>
          );
        })()}
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
        <Suspense fallback={<div className="fixed inset-0 z-50 grid place-items-center bg-charcoal/70"><Spinner /></div>}>
          <ExcelImportModal
            type="stock"
            onClose={() => setImportOpen(false)}
            onSuccess={() => {
              refresh();
            }}
          />
        </Suspense>
      )}

      <PrintPreviewModal
        open={stockLabelPreviewOpen}
        title="Aperçu de l’étiquette de stock"
        paper="A4"
        copiesLabel="1 étiquette"
        content={stockLabelPreviewContent}
        pdfFilename={`etiquette-stock-${selected ? `${selected.id}-${selected.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : 'ref'}.pdf`}
        onClose={() => setStockLabelPreviewOpen(false)}
        onPrint={() => { if (stockLabelPreviewContent) print(stockLabelPreviewContent); setStockLabelPreviewOpen(false); }}
      />
      {portal}
    </div>
  );
}
