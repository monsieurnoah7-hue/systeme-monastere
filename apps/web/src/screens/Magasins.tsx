import { useCallback, useEffect, useState } from 'react';
import {
  api,
  ApiError,
  type Magasin,
  type ScanResult,
  type Tool,
  type StockRef,
  type Employee,
} from '../lib/api';
import {
  Button,
  Card,
  Chip,
  Drawer,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Skeleton,
  TextArea,
  useToast,
  cx,
} from '../components/ui';
import { IconAlert, IconBox, IconPlus, IconSearch, IconPrinter } from '../components/Icons';
import { STATUS_LABEL, STATUS_TONE, formatDateTime } from '../lib/labels';
import {
  ArrowRightLeft,
  Trash2,
  Wrench,
  Package,
  X,
  Download,
  ShieldCheck,
  Zap,
  Clock,
  UserCheck,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';
import { exportToExcel, exportToPdf } from '../lib/export';
import { formatCurrency } from '../lib/accounting';
import { usePrintSheet } from '../lib/print';
import { QR_PREFIX, qrDataUrl } from '../lib/qr';

type MagasinTool = Pick<
  Tool,
  'id' | 'name' | 'category' | 'status' | 'condition' | 'status_reason'
> & {
  brand?: string | null;
  model?: string | null;
  serial_number?: string | null;
  photo_path?: string | null;
  acquisition_cost?: number | null;
  total_qty?: number;
  loan_id?: number | null;
  loan_employee_id?: string | null;
  loan_employee_name?: string | null;
  loan_qty?: number | null;
  loan_out_at?: string | null;
};

type MagasinStock = Pick<
  StockRef,
  'id' | 'name' | 'category' | 'unit' | 'qty' | 'min_qty'
> & {
  unit_cost?: number | null;
  photo_path?: string | null;
  supplier?: string | null;
  brand?: string | null;
  location?: string | null;
};

type MagasinLoan = {
  id: number;
  tool_id: string;
  tool_name: string;
  employee_id: string;
  employee_name: string;
  qty: number;
  out_at: string;
  motive: string | null;
  out_condition: string;
};

type MagasinDetail = {
  magasin: Magasin;
  tools: MagasinTool[];
  stock: MagasinStock[];
  loans: MagasinLoan[];
};

function MagasinQr({ id }: { id: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void qrDataUrl(`${QR_PREFIX.magasin}${id}`, 220).then((value) => {
      if (!cancelled) setSrc(value);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);
  return (
    <span className="grid h-28 w-28 shrink-0 place-items-center rounded-xl border border-line bg-white p-2 shadow-xs">
      {src ? (
        <img src={src} alt={`QR ${id}`} className="h-full w-full object-contain" />
      ) : (
        <IconBox size={28} className="text-ink-faint" />
      )}
    </span>
  );
}

function MagasinDoorLabel({
  magasin,
  toolsCount,
  stockCount,
}: {
  magasin: Magasin;
  toolsCount: number;
  stockCount: number;
}) {
  return (
    <div className="a4-page py-8" style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}>
      <div
        className="mx-auto flex flex-col justify-between overflow-hidden rounded-2xl border-4 border-gray-900 bg-white p-8 text-gray-900 shadow-xl"
        style={{ width: '160mm', minHeight: '110mm', boxSizing: 'border-box' }}
      >
        {/* En-tête officiel Monastère */}
        <div className="flex items-center justify-between border-b-2 border-gray-900 pb-3">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Logo" className="h-10 object-contain" />
            <div>
              <p className="text-[9pt] font-extrabold uppercase tracking-wider text-gray-950">
                C.F.T. des Bénédictins du Mont Fébé
              </p>
              <p className="text-[7pt] font-bold text-[#ff5500] uppercase tracking-wider">
                Logistique · Atelier &amp; Dépôts
              </p>
            </div>
          </div>
          <span className="rounded bg-gray-100 border border-gray-400 px-3 py-1 font-mono text-[10pt] font-black text-gray-950">
            {magasin.code}
          </span>
        </div>

        {/* Corps : Grand QR Code + Détails Local */}
        <div className="flex items-center gap-6 py-4">
          <div className="grid h-[38mm] w-[38mm] shrink-0 place-items-center rounded-xl border border-gray-300 bg-white p-1">
            <MagasinQr id={magasin.id} />
          </div>

          <div className="min-w-0 flex-1 space-y-1.5">
            <h2 className="text-[16pt] font-black leading-tight text-gray-950">
              {magasin.name}
            </h2>
            <p className="text-[8.5pt] text-gray-700 italic">
              {magasin.description || 'Local logistique / Atelier de menuiserie'}
            </p>
            {magasin.manager_name && (
              <p className="text-[8.5pt] text-gray-900 font-semibold">
                👤 Responsable référent : {magasin.manager_name}
              </p>
            )}
            <div className="flex flex-wrap gap-2 pt-2 text-[7.5pt]">
              <span className="rounded bg-gray-100 border border-gray-300 px-2 py-0.5 font-bold">
                🧰 {toolsCount} Machine(s) &amp; Outils
              </span>
              <span className="rounded bg-gray-100 border border-gray-300 px-2 py-0.5 font-bold">
                📦 {stockCount} Réf. Quincaillerie
              </span>
            </div>
          </div>
        </div>

        {/* Pied de page officiel */}
        <div className="flex items-center justify-between border-t border-gray-300 pt-2 text-[6.5pt] text-gray-500">
          <span>Identifiant système : {magasin.id}</span>
          <span>Imprimé le {new Date().toLocaleDateString('fr-FR')} — Système de Gestion C.F.T.</span>
        </div>
      </div>
    </div>
  );
}

export function Magasins({
  user,
  scan,
  permissions,
}: {
  user: { role: string };
  scan?: ScanResult | null;
  permissions?: Record<string, boolean> | null;
}) {
  const toast = useToast();
  const { print, portal } = usePrintSheet();
  const isSuper = user.role === 'direction';
  const hasPerm = (p: string) => isSuper || (permissions ? !!permissions[p] : false);

  const canManage = hasPerm('magasins.manage') || (!permissions && (user.role === 'magasinier' || user.role === 'direction'));
  const canViewFinancial = hasPerm('financial.view') || (!permissions && user.role === 'direction');
  const canExport = hasPerm('reports.export') || (!permissions && user.role === 'direction');
  const canLendGlobal = hasPerm('loans.create') || (!permissions && ['magasinier', 'direction', 'chef_atelier'].includes(user.role));
  const canMoveStockGlobal = hasPerm('stock.move') || (!permissions && ['magasinier', 'direction', 'chef_atelier'].includes(user.role));

  const [magasins, setMagasins] = useState<Magasin[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MagasinDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [drawerFilter, setDrawerFilter] = useState('');
  const [drawerTab, setDrawerTab] = useState<'tools' | 'stock' | 'loans' | 'settings'>('tools');

  // Formulaire Création / Édition Magasin
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Magasin | null>(null);
  const [form, setForm] = useState({
    name: '',
    code: '',
    description: '',
    manager_name: '',
    can_lend: true,
    can_receive_in: true,
    can_deliver_out: true,
    can_transfer: true,
  });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Deletion state
  const [deleteFor, setDeleteFor] = useState<Magasin | null>(null);
  const [deleteTargetMagasinId, setDeleteTargetMagasinId] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Transfer single item states
  const [transferToolItem, setTransferToolItem] = useState<{ id: string; name: string } | null>(null);
  const [transferStockItem, setTransferStockItem] = useState<{ id: number; name: string } | null>(null);
  const [transferTargetId, setTransferTargetId] = useState('');
  const [deleteToolItem, setDeleteToolItem] = useState<{ id: string; name: string } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  // Magasin Quick Operational Modals: Loan
  const [loanModalOpen, setLoanModalOpen] = useState(false);
  const [loanToolId, setLoanToolId] = useState('');
  const [loanEmployeeId, setLoanEmployeeId] = useState('');
  const [loanMotive, setLoanMotive] = useState('');
  const [loanQty, setLoanQty] = useState('1');

  // Magasin Quick Operational Modals: Return
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnLoanItem, setReturnLoanItem] = useState<MagasinLoan | null>(null);
  const [returnCondition, setReturnCondition] = useState<'bon' | 'a_reparer' | 'hors_service'>('bon');
  const [returnObs, setReturnObs] = useState('');
  const [returnQty, setReturnQty] = useState('1');

  // Magasin Quick Operational Modals: Stock Movement
  const [stockMoveModalOpen, setStockMoveModalOpen] = useState(false);
  const [stockMoveType, setStockMoveType] = useState<'in' | 'out'>('out');
  const [stockMoveRefId, setStockMoveRefId] = useState<number | null>(null);
  const [stockMoveQty, setStockMoveQty] = useState('');
  const [stockMoveBeneficiary, setStockMoveBeneficiary] = useState('');
  const [stockMoveDocRef, setStockMoveDocRef] = useState('');
  const [stockMoveNote, setStockMoveNote] = useState('');

  const load = useCallback(async () => {
    if (magasins.length === 0) setLoading(true);
    setError(null);
    try {
      const [magRes, empRes] = await Promise.all([
        api<{ magasins: Magasin[] }>('/api/magasins'),
        api<{ employees: Employee[] }>('/api/employees').catch(() => ({ employees: [] })),
      ]);
      setMagasins(magRes.magasins);
      setEmployees(empRes.employees.filter((e) => e.active));
    } catch (e) {
      if (magasins.length === 0) {
        setError(e instanceof ApiError ? e.message : 'Erreur de chargement');
      }
    } finally {
      setLoading(false);
    }
  }, [magasins.length]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await api<MagasinDetail>(`/api/magasins/${id}`);
      setDetail(res);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  useEffect(() => {
    if (scan?.kind === 'tool' && scan.tool.magasin_id) setSelectedId(scan.tool.magasin_id);
  }, [scan]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  // Synchronisation en temps réel via événements personnalisés
  useEffect(() => {
    const onSync = () => {
      void load();
      if (selectedId) void loadDetail(selectedId);
    };
    window.addEventListener('mf-refresh-data', onSync);
    return () => window.removeEventListener('mf-refresh-data', onSync);
  }, [load, loadDetail, selectedId]);

  const notifyChange = () => {
    window.dispatchEvent(new CustomEvent('mf-refresh-data'));
  };

  const filtered = magasins.filter(
    (m) =>
      !q ||
      m.name.toLowerCase().includes(q.toLowerCase()) ||
      m.code.toLowerCase().includes(q.toLowerCase()) ||
      (m.manager_name ?? '').toLowerCase().includes(q.toLowerCase())
  );

  const openNew = () => {
    setEditing(null);
    setForm({
      name: '',
      code: '',
      description: '',
      manager_name: '',
      can_lend: true,
      can_receive_in: true,
      can_deliver_out: true,
      can_transfer: true,
    });
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (m: Magasin) => {
    setEditing(m);
    setForm({
      name: m.name,
      code: m.code,
      description: m.description ?? '',
      manager_name: m.manager_name ?? '',
      can_lend: m.can_lend ?? true,
      can_receive_in: m.can_receive_in ?? true,
      can_deliver_out: m.can_deliver_out ?? true,
      can_transfer: m.can_transfer ?? true,
    });
    setFormError(null);
    setFormOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim() || !form.code.trim()) {
      setFormError('Nom et code abrégé obligatoires.');
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      if (editing) {
        await api(`/api/magasins/${editing.id}`, { method: 'PATCH', body: JSON.stringify(form) });
        toast(`Magasin « ${form.name} » mis à jour.`, 'success');
      } else {
        await api('/api/magasins', { method: 'POST', body: JSON.stringify(form) });
        toast(`Nouveau magasin « ${form.name} » créé avec succès.`, 'success');
      }
      setFormOpen(false);
      setReloadKey((k) => k + 1);
      notifyChange();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Erreur d’enregistrement.');
    } finally {
      setBusy(false);
    }
  };

  const removeMagasin = async () => {
    if (!deleteFor) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const res = await api<{ ok: boolean; message?: string }>(`/api/magasins/${deleteFor.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ targetMagasinId: deleteTargetMagasinId || undefined }),
      });
      toast(res.message || 'Magasin supprimé avec succès.', 'success');
      if (selectedId === deleteFor.id) setSelectedId(null);
      setDeleteFor(null);
      setDeleteTargetMagasinId('');
      setReloadKey((k) => k + 1);
      notifyChange();
    } catch (e) {
      setDeleteError(e instanceof ApiError ? e.message : 'Suppression impossible.');
    } finally {
      setDeleteBusy(false);
    }
  };

  // Transfer tool handler
  const handleExecuteTransferTool = async () => {
    if (!transferToolItem || !transferTargetId) return;
    setActionBusy(true);
    try {
      await api('/api/tools/batch-transfer', {
        method: 'POST',
        body: JSON.stringify({ ids: [transferToolItem.id], magasin_id: transferTargetId }),
      });
      toast(`Outil transféré vers le nouveau magasin.`, 'success');
      setTransferToolItem(null);
      setTransferTargetId('');
      if (selectedId) void loadDetail(selectedId);
      setReloadKey((k) => k + 1);
      notifyChange();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erreur lors du transfert.', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  // Delete tool handler
  const handleExecuteDeleteTool = async () => {
    if (!deleteToolItem) return;
    setActionBusy(true);
    try {
      await api(`/api/tools/${deleteToolItem.id}`, { method: 'DELETE' });
      toast(`Outil « ${deleteToolItem.name} » supprimé.`, 'success');
      setDeleteToolItem(null);
      if (selectedId) void loadDetail(selectedId);
      setReloadKey((k) => k + 1);
      notifyChange();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Suppression impossible.', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  // Transfer stock handler
  const handleExecuteTransferStock = async () => {
    if (!transferStockItem || !transferTargetId) return;
    setActionBusy(true);
    try {
      await api('/api/stock/refs/batch-transfer', {
        method: 'POST',
        body: JSON.stringify({ ids: [transferStockItem.id], magasin_id: transferTargetId }),
      });
      toast(`Référence matière transférée.`, 'success');
      setTransferStockItem(null);
      setTransferTargetId('');
      if (selectedId) void loadDetail(selectedId);
      setReloadKey((k) => k + 1);
      notifyChange();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erreur lors du transfert.', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  // Quick Loan submit
  const handleExecuteLoan = async () => {
    if (!loanToolId || !loanEmployeeId) {
      toast('Veuillez sélectionner un outil disponible et un ouvrier bénéficiaire.', 'error');
      return;
    }
    setActionBusy(true);
    try {
      await api('/api/loans', {
        method: 'POST',
        body: JSON.stringify({
          toolId: loanToolId,
          employeeId: loanEmployeeId,
          motive: loanMotive || undefined,
          qty: Number(loanQty) || 1,
          outCondition: 'bon',
        }),
      });
      toast('Prêt enregistré avec succès depuis ce magasin.', 'success');
      setLoanModalOpen(false);
      setLoanToolId('');
      setLoanEmployeeId('');
      setLoanMotive('');
      setLoanQty('1');
      if (selectedId) void loadDetail(selectedId);
      setReloadKey((k) => k + 1);
      notifyChange();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Échec de l’enregistrement du prêt.', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  // Quick Return submit
  const handleExecuteReturn = async () => {
    if (!returnLoanItem) return;
    setActionBusy(true);
    try {
      const res = await api<{ ok: boolean; returnQty: number; isFullReturn: boolean; remaining: number }>(
        `/api/loans/${returnLoanItem.id}/return`,
        {
          method: 'POST',
          body: JSON.stringify({
            condition: returnCondition,
            observations: returnObs || undefined,
            qty: Number(returnQty) || 1,
          }),
        }
      );
      toast(
        res.isFullReturn
          ? 'Retour complet validé dans ce magasin.'
          : `Retour partiel de ${res.returnQty} unité(s) validé.`,
        'success'
      );
      setReturnModalOpen(false);
      setReturnLoanItem(null);
      setReturnObs('');
      setReturnQty('1');
      if (selectedId) void loadDetail(selectedId);
      setReloadKey((k) => k + 1);
      notifyChange();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Échec de validation du retour.', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  // Quick Stock Movement submit
  const handleExecuteStockMove = async () => {
    if (!stockMoveRefId || !stockMoveQty || Number(stockMoveQty) <= 0) {
      toast('Veuillez renseigner une quantité valide supérieure à zéro.', 'error');
      return;
    }
    setActionBusy(true);
    try {
      const res = await api<{ qty: number }>('/api/stock/movements', {
        method: 'POST',
        body: JSON.stringify({
          ref_id: stockMoveRefId,
          move_type: stockMoveType,
          qty: Number(stockMoveQty),
          beneficiary: stockMoveBeneficiary || undefined,
          doc_ref: stockMoveDocRef || undefined,
          note: stockMoveNote || undefined,
        }),
      });
      toast(`Mouvement validé · Nouveau stock en rayon : ${res.qty}.`, 'success');
      setStockMoveModalOpen(false);
      setStockMoveRefId(null);
      setStockMoveQty('');
      setStockMoveBeneficiary('');
      setStockMoveDocRef('');
      setStockMoveNote('');
      if (selectedId) void loadDetail(selectedId);
      setReloadKey((k) => k + 1);
      notifyChange();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Échec du mouvement de stock.', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  // Export Inventory for this Magasin
  const handleExportMagasinInventory = () => {
    if (!detail) return;
    const m = detail.magasin;
    const dateStr = new Date().toISOString().split('T')[0];

    const combinedHeaders = ['Type', 'Réf / ID', 'Désignation', 'Marque', 'Catégorie', 'Quantité / Statut', 'Coût Unitaire', 'Valeur Totale'];
    const combinedRows = [
      ...detail.tools.map((t) => [
        'Machine / Outil',
        t.id,
        t.name,
        t.brand || '—',
        t.category,
        STATUS_LABEL[t.status] ?? t.status,
        t.acquisition_cost ? formatCurrency(t.acquisition_cost) : '—',
        t.acquisition_cost ? formatCurrency(t.acquisition_cost) : '—',
      ]),
      ...detail.stock.map((s) => [
        'Matière / Quincaillerie',
        `REF-${s.id}`,
        s.name,
        s.brand || '—',
        s.category,
        `${s.qty} ${s.unit}`,
        s.unit_cost ? formatCurrency(s.unit_cost) : '—',
        s.unit_cost ? formatCurrency(s.qty * s.unit_cost) : '—',
      ]),
    ];

    exportToExcel(`Inventaire_${m.code}_${dateStr}`, 'Inventaire_Magasin', combinedHeaders, combinedRows);

    const pdfHeaders = ['Réf/ID', 'Désignation', 'Catégorie', 'Quantité', 'Statut / État'];
    const pdfRows = [
      ...detail.tools.map((t) => [t.id, t.name, t.category, '1 u', STATUS_LABEL[t.status] ?? t.status]),
      ...detail.stock.map((s) => [`REF-${s.id}`, s.name, s.category, `${s.qty} ${s.unit}`, s.qty <= s.min_qty ? 'Alerte Seuil' : 'En Stock']),
    ];

    exportToPdf(
      `Fiche d’Inventaire Physique · ${m.name} (${m.code})`,
      `Localisation : ${m.description || 'Atelier'} · Responsable : ${m.manager_name || 'Non assigné'} · C.F.T. Bénédictins`,
      pdfHeaders,
      pdfRows,
      [
        { label: 'Total Machines & Outils', value: detail.tools.length },
        { label: 'Total Matières / Fournitures', value: detail.stock.length },
        { label: 'Prêts en cours', value: detail.loans.length },
      ]
    );
  };

  const filteredTools =
    detail?.tools.filter(
      (t) =>
        !drawerFilter ||
        t.name.toLowerCase().includes(drawerFilter.toLowerCase()) ||
        t.id.toLowerCase().includes(drawerFilter.toLowerCase()) ||
        (t.brand ?? '').toLowerCase().includes(drawerFilter.toLowerCase())
    ) ?? [];

  const filteredStock =
    detail?.stock.filter(
      (s) =>
        !drawerFilter ||
        s.name.toLowerCase().includes(drawerFilter.toLowerCase()) ||
        s.category.toLowerCase().includes(drawerFilter.toLowerCase()) ||
        (s.brand ?? '').toLowerCase().includes(drawerFilter.toLowerCase())
    ) ?? [];

  const availableToolsForLoan = detail?.tools.filter((t) => t.status === 'disponible') ?? [];

  return (
    <div className="space-y-5">
      {portal}
      <PageHeader
        title="Magasins, Dépôts &amp; Ateliers"
        actions={
          canManage ? (
            <Button variant="primary" icon={<IconPlus size={16} />} onClick={openNew}>
              Nouveau magasin
            </Button>
          ) : undefined
        }
      />

      {/* Barre de recherche principale */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher par nom de magasin, code (ex. MAG-001) ou responsable…"
            className="w-full rounded-xl border border-line bg-surface py-2.5 pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-amber focus:outline-none focus:ring-2 focus:ring-amber/20"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          icon={<IconAlert size={28} />}
          title="Erreur de chargement"
          hint={error}
          action={<Button onClick={() => setReloadKey((k) => k + 1)}>Réessayer</Button>}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<IconBox size={28} />}
          title="Aucun magasin enregistré"
          hint={canManage ? 'Créez votre premier magasin, atelier ou local de stockage pour organiser les parcs.' : undefined}
          action={canManage ? <Button variant="primary" onClick={openNew}>Créer un magasin</Button> : undefined}
        />
      ) : (
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                setSelectedId(m.id);
                setDrawerTab('tools');
              }}
              className="text-left group transition-all"
            >
              <Card hover className="h-full flex flex-col justify-between transition-all group-hover:border-amber/50 space-y-3 p-4">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-charcoal text-xs font-black text-amber border border-line">
                        {m.code}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-ink group-hover:text-amber transition-colors">
                          {m.name}
                        </p>
                        <p className="truncate text-xs text-ink-soft">
                          {m.description || 'Atelier & local de stockage'}
                        </p>
                      </div>
                    </div>
                    {!m.active && <Chip tone="red">Inactif</Chip>}
                  </div>

                  {m.manager_name && (
                    <div className="mt-2.5 flex items-center gap-1.5 text-xs text-ink-soft font-medium">
                      <UserCheck size={13} className="text-amber shrink-0" />
                      <span className="truncate">Resp : <strong>{m.manager_name}</strong></span>
                    </div>
                  )}

                  {/* Badges de capacités opérationnelles du magasin */}
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {m.can_lend !== false && (
                      <span className="inline-flex items-center gap-1 rounded bg-paper px-2 py-0.5 text-[10px] font-semibold text-green border border-line">
                        🤝 Prêts autorisés
                      </span>
                    )}
                    {m.can_receive_in !== false && (
                      <span className="inline-flex items-center gap-1 rounded bg-paper px-2 py-0.5 text-[10px] font-semibold text-sky-400 border border-line">
                        📥 Entrées
                      </span>
                    )}
                    {m.can_deliver_out !== false && (
                      <span className="inline-flex items-center gap-1 rounded bg-paper px-2 py-0.5 text-[10px] font-semibold text-amber border border-line">
                        📤 Sorties
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-line/60 flex items-center justify-between text-xs text-ink-soft">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 font-semibold text-ink">
                      <Wrench size={13} className="text-amber" /> {m.tools_count ?? 0} machine{(m.tools_count ?? 0) > 1 ? 's' : ''}
                    </span>
                    <span className="flex items-center gap-1 font-semibold text-ink">
                      <Package size={13} className="text-sky-400" /> {m.stock_count ?? 0} matière{(m.stock_count ?? 0) > 1 ? 's' : ''}
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold text-amber group-hover:translate-x-0.5 transition-transform">
                    Ouvrir ›
                  </span>
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}

      {/* =========================================================================
          DRAWER TABLEAU DE BORD LOCAL DU MAGASIN (HUB OPÉRATIONNEL COMPLET)
      ========================================================================= */}
      <Drawer
        open={!!selectedId}
        title={detail?.magasin.name ?? 'Tableau de bord Magasin'}
        subtitle={
          detail
            ? `${detail.magasin.code} · ${detail.tools.length} machine(s) · ${detail.stock.length} matière(s) · ${detail.loans.length} prêt(s) actif(s)`
            : undefined
        }
        onClose={() => {
          setSelectedId(null);
          setDrawerFilter('');
        }}
        wide
      >
        {detailLoading || !detail ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Barre d'en-tête du magasin avec actions globales */}
            <div className="rounded-xl border border-line bg-paper p-3.5 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-charcoal border border-line px-2 py-0.5 font-mono text-xs font-bold text-amber">
                      {detail.magasin.code}
                    </span>
                    <h2 className="text-base font-bold text-ink">{detail.magasin.name}</h2>
                    {!detail.magasin.active && <Chip tone="red">Inactif</Chip>}
                  </div>
                  <p className="text-xs text-ink-soft">
                    {detail.magasin.description || 'Local logistique et parc d’outillage'}
                  </p>
                  {detail.magasin.manager_name && (
                    <p className="text-xs text-ink font-semibold flex items-center gap-1.5">
                      <UserCheck size={13} className="text-amber" />
                      Responsable désigné : {detail.magasin.manager_name}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<IconPrinter size={15} />}
                    onClick={() => {
                      print(
                        <MagasinDoorLabel
                          magasin={detail.magasin}
                          toolsCount={detail.tools.length}
                          stockCount={detail.stock.length}
                        />
                      );
                    }}
                    title="Imprimer l'étiquette QR officielle pour la porte du magasin"
                  >
                    Étiquette Porte
                  </Button>

                  {canExport && (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Download size={14} />}
                      onClick={handleExportMagasinInventory}
                      title="Télécharger l'inventaire complet de ce magasin en PDF et Excel"
                    >
                      Inventaire
                    </Button>
                  )}

                  {canManage && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => openEdit(detail.magasin)}
                    >
                      Modifier
                    </Button>
                  )}
                </div>
              </div>

              {/* Barre d'opérations directes pour ce magasin */}
              <div className="pt-2 border-t border-line/60 flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold text-ink-faint mr-1">Actions locales :</span>
                {detail.magasin.can_lend !== false && canLendGlobal && (
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<Zap size={14} />}
                    onClick={() => {
                      setLoanToolId(availableToolsForLoan[0]?.id ?? '');
                      setLoanEmployeeId('');
                      setLoanMotive('');
                      setLoanQty('1');
                      setLoanModalOpen(true);
                    }}
                  >
                    🤝 Nouveau Prêt
                  </Button>
                )}

                {detail.magasin.can_receive_in !== false && canMoveStockGlobal && (
                  <Button
                    size="sm"
                    icon={<ArrowDownLeft size={14} className="text-green" />}
                    onClick={() => {
                      setStockMoveType('in');
                      setStockMoveRefId(detail.stock[0]?.id ?? null);
                      setStockMoveQty('');
                      setStockMoveBeneficiary('');
                      setStockMoveDocRef('');
                      setStockMoveNote('');
                      setStockMoveModalOpen(true);
                    }}
                  >
                    + Entrée Matière
                  </Button>
                )}

                {detail.magasin.can_deliver_out !== false && canMoveStockGlobal && (
                  <Button
                    size="sm"
                    icon={<ArrowUpRight size={14} className="text-amber" />}
                    onClick={() => {
                      setStockMoveType('out');
                      setStockMoveRefId(detail.stock[0]?.id ?? null);
                      setStockMoveQty('');
                      setStockMoveBeneficiary('');
                      setStockMoveDocRef('');
                      setStockMoveNote('');
                      setStockMoveModalOpen(true);
                    }}
                  >
                    - Sortie Chantier
                  </Button>
                )}

                {canManage && (
                  <Button
                    size="sm"
                    variant="outline-danger"
                    icon={<Trash2 size={13} />}
                    onClick={() => {
                      setDeleteError(null);
                      setDeleteTargetMagasinId('');
                      setDeleteFor(detail.magasin);
                    }}
                  >
                    Supprimer le magasin
                  </Button>
                )}
              </div>
            </div>

            {/* Navigation Sub-Tabs dans le magasin */}
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-paper-2 border border-line">
              <button
                type="button"
                onClick={() => setDrawerTab('tools')}
                className={cx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                  drawerTab === 'tools'
                    ? 'bg-amber text-white shadow-xs'
                    : 'text-ink-soft hover:text-ink hover:bg-paper'
                )}
              >
                <Wrench size={13} />
                <span>Matériel &amp; Machines</span>
                <span
                  className={cx(
                    'rounded-full px-1.5 py-0.2 text-[10px] font-bold',
                    drawerTab === 'tools' ? 'bg-white/20 text-white' : 'bg-surface text-ink-faint'
                  )}
                >
                  {detail.tools.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setDrawerTab('stock')}
                className={cx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                  drawerTab === 'stock'
                    ? 'bg-amber text-white shadow-xs'
                    : 'text-ink-soft hover:text-ink hover:bg-paper'
                )}
              >
                <Package size={13} />
                <span>Matières &amp; Quincaillerie</span>
                <span
                  className={cx(
                    'rounded-full px-1.5 py-0.2 text-[10px] font-bold',
                    drawerTab === 'stock' ? 'bg-white/20 text-white' : 'bg-surface text-ink-faint'
                  )}
                >
                  {detail.stock.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setDrawerTab('loans')}
                className={cx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                  drawerTab === 'loans'
                    ? 'bg-amber text-white shadow-xs'
                    : 'text-ink-soft hover:text-ink hover:bg-paper'
                )}
              >
                <Clock size={13} />
                <span>Prêts en cours</span>
                <span
                  className={cx(
                    'rounded-full px-1.5 py-0.2 text-[10px] font-bold',
                    drawerTab === 'loans'
                      ? 'bg-white/20 text-white'
                      : detail.loans.length > 0
                        ? 'bg-amber-wash text-amber'
                        : 'bg-surface text-ink-faint'
                  )}
                >
                  {detail.loans.length}
                </span>
              </button>

              {canManage && (
                <button
                  type="button"
                  onClick={() => setDrawerTab('settings')}
                  className={cx(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ml-auto',
                    drawerTab === 'settings'
                      ? 'bg-blue text-white shadow-xs'
                      : 'text-ink-soft hover:text-ink hover:bg-paper'
                  )}
                >
                  <ShieldCheck size={13} />
                  <span>Droits &amp; Réglages</span>
                </button>
              )}
            </div>

            {/* Barre de recherche dans le contenu du magasin */}
            {drawerTab !== 'settings' && (
              <div className="relative">
                <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
                <input
                  type="text"
                  value={drawerFilter}
                  onChange={(e) => setDrawerFilter(e.target.value)}
                  placeholder={
                    drawerTab === 'tools'
                      ? 'Rechercher une machine, marque ou référence dans ce magasin…'
                      : drawerTab === 'stock'
                        ? 'Rechercher une matière, visserie, colle dans ce magasin…'
                        : 'Rechercher un prêt en cours ou un ouvrier emprunteur…'
                  }
                  className="w-full rounded-xl border border-line bg-surface py-2 pl-8 pr-8 text-xs text-ink placeholder:text-ink-faint focus:border-amber focus:outline-none"
                />
                {drawerFilter && (
                  <button
                    onClick={() => setDrawerFilter('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            )}

            {/* TAB 1 : MATÉRIEL & MACHINES */}
            {drawerTab === 'tools' && (
              <div className="space-y-3">
                {filteredTools.length === 0 ? (
                  <p className="text-xs text-ink-faint italic py-4 text-center">
                    Aucune machine ou outil trouvé dans ce magasin.
                  </p>
                ) : (
                  <div className="divide-y divide-line rounded-xl border border-line bg-surface overflow-hidden">
                    {filteredTools.map((t) => (
                      <div
                        key={t.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 hover:bg-paper-2/40 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-[11px] font-bold text-amber">{t.id}</span>
                            <p className="text-xs font-bold text-ink">{t.name}</p>
                            {t.brand && (
                              <span className="rounded bg-paper px-1.5 py-0.2 text-[10px] font-semibold text-ink-soft border border-line">
                                {t.brand}
                              </span>
                            )}
                            <Chip tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Chip>
                          </div>
                          <p className="text-[11px] text-ink-faint mt-0.5">
                            Catégorie : {t.category} · État : <strong>{t.condition}</strong>
                            {t.loan_employee_name ? (
                              <span className="text-amber ml-2 font-medium">
                                🤝 Emprunté par : {t.loan_employee_name} ({formatDateTime(t.loan_out_at ?? '')})
                              </span>
                            ) : null}
                          </p>
                          {t.status_reason && <p className="text-[11px] text-red mt-0.5">{t.status_reason}</p>}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {t.status === 'disponible' && detail.magasin.can_lend !== false && canLendGlobal && (
                            <button
                              type="button"
                              onClick={() => {
                                setLoanToolId(t.id);
                                setLoanEmployeeId('');
                                setLoanMotive('');
                                setLoanQty('1');
                                setLoanModalOpen(true);
                              }}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber text-white shadow-xs hover:bg-amber-2 active:scale-95 transition-all"
                            >
                              <Zap size={12} />
                              <span>Prêter</span>
                            </button>
                          )}

                          {t.status === 'en_pret' && t.loan_id && (
                            <button
                              type="button"
                              onClick={() => {
                                setReturnLoanItem({
                                  id: t.loan_id!,
                                  tool_id: t.id,
                                  tool_name: t.name,
                                  employee_id: t.loan_employee_id ?? '',
                                  employee_name: t.loan_employee_name ?? 'Ouvrier',
                                  qty: t.loan_qty ?? 1,
                                  out_at: t.loan_out_at ?? '',
                                  motive: null,
                                  out_condition: 'bon',
                                });
                                setReturnCondition('bon');
                                setReturnObs('');
                                setReturnQty(String(t.loan_qty ?? 1));
                                setReturnModalOpen(true);
                              }}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-green text-white shadow-xs hover:bg-green-2 active:scale-95 transition-all"
                            >
                              <span>↩️ Retourner</span>
                            </button>
                          )}

                          {canManage && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setTransferToolItem({ id: t.id, name: t.name });
                                  setTransferTargetId('');
                                }}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border border-line hover:border-amber hover:text-amber text-ink-soft bg-surface-2 transition-colors"
                                title="Transférer vers un autre atelier ou magasin"
                              >
                                <ArrowRightLeft size={12} />
                                <span>Transférer</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteToolItem({ id: t.id, name: t.name })}
                                className="p-1 rounded-lg text-ink-faint hover:text-red hover:bg-red-wash transition-colors"
                                title="Supprimer cet outil"
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2 : MATIÈRES & QUINCAILLERIE */}
            {drawerTab === 'stock' && (
              <div className="space-y-3">
                {filteredStock.length === 0 ? (
                  <p className="text-xs text-ink-faint italic py-4 text-center">
                    Aucune matière ou quincaillerie trouvée dans ce magasin.
                  </p>
                ) : (
                  <div className="divide-y divide-line rounded-xl border border-line bg-surface overflow-hidden">
                    {filteredStock.map((s) => (
                      <div
                        key={s.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 hover:bg-paper-2/40 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-[11px] font-bold text-sky-400">REF-{s.id}</span>
                            <p className="text-xs font-bold text-ink">{s.name}</p>
                            {s.brand && (
                              <span className="rounded bg-paper px-1.5 py-0.2 text-[10px] font-semibold text-ink-soft border border-line">
                                {s.brand}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-ink-faint mt-0.5">
                            {s.category} · Seuil minimal : {s.min_qty} {s.unit}
                            {canViewFinancial && s.unit_cost ? (
                              <span className="ml-2 font-mono text-green font-semibold">
                                ({formatCurrency(s.unit_cost)} / {s.unit})
                              </span>
                            ) : null}
                          </p>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <span className="block text-xs font-bold font-mono text-ink tabular-nums">
                              {s.qty} {s.unit}
                            </span>
                            <span className="text-[10px] text-ink-faint">
                              {s.qty <= s.min_qty ? '⚠️ Sous seuil' : 'Normal'}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {detail.magasin.can_receive_in !== false && canMoveStockGlobal && (
                              <button
                                type="button"
                                onClick={() => {
                                  setStockMoveType('in');
                                  setStockMoveRefId(s.id);
                                  setStockMoveQty('');
                                  setStockMoveBeneficiary('');
                                  setStockMoveDocRef('');
                                  setStockMoveNote('');
                                  setStockMoveModalOpen(true);
                                }}
                                className="px-2 py-1 rounded text-xs font-semibold text-green bg-green/10 border border-green/30 hover:bg-green hover:text-white transition-all"
                                title="Entrée de stock dans ce magasin"
                              >
                                + Entrée
                              </button>
                            )}

                            {detail.magasin.can_deliver_out !== false && canMoveStockGlobal && (
                              <button
                                type="button"
                                onClick={() => {
                                  setStockMoveType('out');
                                  setStockMoveRefId(s.id);
                                  setStockMoveQty('');
                                  setStockMoveBeneficiary('');
                                  setStockMoveDocRef('');
                                  setStockMoveNote('');
                                  setStockMoveModalOpen(true);
                                }}
                                className="px-2 py-1 rounded text-xs font-semibold text-amber bg-amber-wash border border-amber/30 hover:bg-amber hover:text-white transition-all"
                                title="Sortie pour chantier ou atelier"
                              >
                                - Sortie
                              </button>
                            )}

                            {canManage && (
                              <button
                                type="button"
                                onClick={() => {
                                  setTransferStockItem({ id: s.id, name: s.name });
                                  setTransferTargetId('');
                                }}
                                className="p-1 rounded text-ink-soft hover:text-sky-400 hover:bg-paper border border-line transition-colors"
                                title="Transférer vers un autre magasin"
                              >
                                <ArrowRightLeft size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3 : PRÊTS EN COURS */}
            {drawerTab === 'loans' && (
              <div className="space-y-3">
                {detail.loans.length === 0 ? (
                  <p className="text-xs text-ink-faint italic py-4 text-center">
                    Aucun prêt en cours pour le matériel de ce magasin.
                  </p>
                ) : (
                  <div className="divide-y divide-line rounded-xl border border-line bg-surface overflow-hidden">
                    {detail.loans.map((l) => (
                      <div
                        key={l.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 hover:bg-paper-2/40 transition-colors"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-ink">{l.tool_name}</span>
                            <span className="font-mono text-[11px] text-ink-faint">({l.tool_id})</span>
                          </div>
                          <p className="text-xs text-amber font-medium mt-0.5 flex items-center gap-1.5">
                            <UserCheck size={13} /> Emprunteur : <strong>{l.employee_name}</strong>
                          </p>
                          <p className="text-[11px] text-ink-faint">
                            Sorti le : {formatDateTime(l.out_at)} · Qté : {l.qty} unité(s)
                            {l.motive ? ` · Motif : ${l.motive}` : ''}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setReturnLoanItem(l);
                            setReturnCondition('bon');
                            setReturnObs('');
                            setReturnQty(String(l.qty));
                            setReturnModalOpen(true);
                          }}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green text-white shadow-xs hover:bg-green-2 active:scale-95 transition-all self-start sm:self-auto"
                        >
                          <span>↩️ Valider le retour</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 4 : DROITS & CONFIGURATION DU MAGASIN */}
            {drawerTab === 'settings' && canManage && (
              <div className="rounded-xl border border-line bg-surface p-4 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-ink">Capacités &amp; Droits opérationnels du local</h3>
                  <p className="text-xs text-ink-soft mt-0.5">
                    Configurez précisément les opérations autorisées pour ce magasin ou atelier.
                  </p>
                </div>

                <div className="space-y-3 pt-2">
                  <label className="flex items-start gap-3 p-3 rounded-xl border border-line bg-paper cursor-pointer hover:border-line-strong transition-colors">
                    <input
                      type="checkbox"
                      checked={form.can_lend}
                      onChange={(e) => setForm((f) => ({ ...f, can_lend: e.target.checked }))}
                      className="h-4 w-4 rounded accent-amber cursor-pointer mt-0.5"
                    />
                    <div>
                      <p className="text-xs font-bold text-ink">Autoriser les opérations de prêt &amp; retours d’outils</p>
                      <p className="text-[11px] text-ink-faint">
                        Permet aux ouvriers d’emprunter et de restituer des machines depuis ce local.
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3 rounded-xl border border-line bg-paper cursor-pointer hover:border-line-strong transition-colors">
                    <input
                      type="checkbox"
                      checked={form.can_receive_in}
                      onChange={(e) => setForm((f) => ({ ...f, can_receive_in: e.target.checked }))}
                      className="h-4 w-4 rounded accent-amber cursor-pointer mt-0.5"
                    />
                    <div>
                      <p className="text-xs font-bold text-ink">Autoriser les réceptions &amp; arrivages directs de matières</p>
                      <p className="text-[11px] text-ink-faint">
                        Permet de consigner des livraisons fournisseurs directement dans ce dépôt.
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3 rounded-xl border border-line bg-paper cursor-pointer hover:border-line-strong transition-colors">
                    <input
                      type="checkbox"
                      checked={form.can_deliver_out}
                      onChange={(e) => setForm((f) => ({ ...f, can_deliver_out: e.target.checked }))}
                      className="h-4 w-4 rounded accent-amber cursor-pointer mt-0.5"
                    />
                    <div>
                      <p className="text-xs font-bold text-ink">Autoriser les sorties de matières pour les chantiers</p>
                      <p className="text-[11px] text-ink-faint">
                        Permet la distribution et la consommation directe de quincaillerie et bois.
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3 rounded-xl border border-line bg-paper cursor-pointer hover:border-line-strong transition-colors">
                    <input
                      type="checkbox"
                      checked={form.can_transfer}
                      onChange={(e) => setForm((f) => ({ ...f, can_transfer: e.target.checked }))}
                      className="h-4 w-4 rounded accent-amber cursor-pointer mt-0.5"
                    />
                    <div>
                      <p className="text-xs font-bold text-ink">Autoriser les transferts vers d'autres ateliers / dépôts</p>
                      <p className="text-[11px] text-ink-faint">
                        Permet de déplacer des stocks et machines d’un magasin à un autre en 1 clic.
                      </p>
                    </div>
                  </label>
                </div>

                <div className="pt-2">
                  <Field
                    label="Responsable référent du magasin"
                    value={form.manager_name}
                    onChange={(e) => setForm((f) => ({ ...f, manager_name: e.target.value }))}
                    placeholder="ex. Frère Magasinier ou Paul N."
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <Button variant="primary" loading={busy} onClick={submit}>
                    Enregistrer les droits du magasin
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* =========================================================================
          MODALS D'ACTIONS OPÉRATIONNELLES (Prêt, Retour, Mouvement, Transfert)
      ========================================================================= */}

      {/* Modal Créer / Modifier Magasin */}
      <Modal
        open={formOpen}
        title={editing ? `Modifier : ${editing.name}` : 'Nouveau magasin ou atelier'}
        onClose={() => setFormOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>
              Annuler
            </Button>
            <Button variant="primary" loading={busy} onClick={submit}>
              {editing ? 'Enregistrer' : 'Créer le magasin'}
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          {formError && <div className="rounded-lg bg-red-wash px-3 py-2 text-xs text-red font-medium">{formError}</div>}
          <Field
            label="Nom du magasin ou atelier"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="ex. Atelier Menuiserie 1, Magasin Bois, Salle Machines…"
            required
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Code abrégé"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="ex. MAG-001, BOIS, ATEL-1…"
              required
            />
            <Field
              label="Responsable référent"
              value={form.manager_name}
              onChange={(e) => setForm((f) => ({ ...f, manager_name: e.target.value }))}
              placeholder="ex. Frère Économe ou Paul N."
            />
          </div>
          <TextArea
            label="Description &amp; localisation"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Précisions utiles sur le bâtiment, casiers, clés d'accès…"
          />

          <div className="pt-2 border-t border-line space-y-2">
            <p className="text-xs font-bold text-ink">Droits d’opération alloués à ce local :</p>
            <div className="grid gap-2 sm:grid-cols-2 text-xs">
              <label className="flex items-center gap-2 p-2 rounded-lg bg-paper border border-line cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.can_lend}
                  onChange={(e) => setForm((f) => ({ ...f, can_lend: e.target.checked }))}
                  className="rounded accent-amber cursor-pointer"
                />
                <span>Prêts &amp; retours autorisés</span>
              </label>

              <label className="flex items-center gap-2 p-2 rounded-lg bg-paper border border-line cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.can_receive_in}
                  onChange={(e) => setForm((f) => ({ ...f, can_receive_in: e.target.checked }))}
                  className="rounded accent-amber cursor-pointer"
                />
                <span>Arrivages directs</span>
              </label>

              <label className="flex items-center gap-2 p-2 rounded-lg bg-paper border border-line cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.can_deliver_out}
                  onChange={(e) => setForm((f) => ({ ...f, can_deliver_out: e.target.checked }))}
                  className="rounded accent-amber cursor-pointer"
                />
                <span>Sorties chantiers</span>
              </label>

              <label className="flex items-center gap-2 p-2 rounded-lg bg-paper border border-line cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.can_transfer}
                  onChange={(e) => setForm((f) => ({ ...f, can_transfer: e.target.checked }))}
                  className="rounded accent-amber cursor-pointer"
                />
                <span>Transferts inter-dépôts</span>
              </label>
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal Prêt Rapide depuis ce Magasin */}
      <Modal
        open={loanModalOpen}
        title="🤝 Prêter une machine de ce magasin"
        onClose={() => setLoanModalOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setLoanModalOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              loading={actionBusy}
              disabled={!loanToolId || !loanEmployeeId}
              onClick={() => void handleExecuteLoan()}
            >
              Valider le prêt
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Machine / Outil à prêter :</label>
            <select
              value={loanToolId}
              onChange={(e) => setLoanToolId(e.target.value)}
              className="w-full rounded-xl border border-line bg-paper p-2.5 text-xs text-ink focus:border-amber focus:outline-none"
            >
              {availableToolsForLoan.length === 0 ? (
                <option value="">⚠️ Aucune machine disponible actuellement dans ce magasin</option>
              ) : (
                availableToolsForLoan.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.id} · {t.brand || t.category})
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Ouvrier / Menuisier bénéficiaire :</label>
            <select
              value={loanEmployeeId}
              onChange={(e) => setLoanEmployeeId(e.target.value)}
              className="w-full rounded-xl border border-line bg-paper p-2.5 text-xs text-ink focus:border-amber focus:outline-none"
            >
              <option value="">-- Choisir un travailleur actif --</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name} ({e.job_title || 'Atelier'})
                </option>
              ))}
            </select>
          </div>

          <Field
            label="Motif / Chantier d’affectation"
            value={loanMotive}
            onChange={(e) => setLoanMotive(e.target.value)}
            placeholder="ex. Travaux portes réfectoire, débit bois massif…"
          />

          <Field
            label="Quantité prêtée"
            type="number"
            min="1"
            value={loanQty}
            onChange={(e) => setLoanQty(e.target.value)}
            placeholder="1"
          />
        </div>
      </Modal>

      {/* Modal Retour de Matériel dans ce Magasin */}
      <Modal
        open={returnModalOpen}
        title="↩️ Enregistrer le retour de matériel"
        onClose={() => setReturnModalOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReturnModalOpen(false)}>
              Annuler
            </Button>
            <Button variant="primary" loading={actionBusy} onClick={() => void handleExecuteReturn()}>
              Confirmer la réintégration
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <p className="text-xs text-ink">
            Réintégration de <strong>{returnLoanItem?.tool_name}</strong> emprunté par{' '}
            <strong>{returnLoanItem?.employee_name}</strong>.
          </p>

          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">État physique au retour :</label>
            <select
              value={returnCondition}
              onChange={(e) => setReturnCondition(e.target.value as typeof returnCondition)}
              className="w-full rounded-xl border border-line bg-paper p-2.5 text-xs text-ink focus:border-amber focus:outline-none"
            >
              <option value="bon">✅ Bon état (Prêt à l'emploi)</option>
              <option value="a_reparer">⚠️ À réparer (Lame à affûter, charbon usé…)</option>
              <option value="hors_service">❌ Hors service (En panne irréversible)</option>
            </select>
          </div>

          <Field
            label="Quantité réintégrée"
            type="number"
            min="1"
            value={returnQty}
            onChange={(e) => setReturnQty(e.target.value)}
            placeholder="1"
          />

          <TextArea
            label="Observations au retour (optionnel)"
            value={returnObs}
            onChange={(e) => setReturnObs(e.target.value)}
            placeholder="Préciser l'état du matériel au retour si nécessaire…"
          />
        </div>
      </Modal>

      {/* Modal Mouvement Stock dans ce Magasin */}
      <Modal
        open={stockMoveModalOpen}
        title={stockMoveType === 'in' ? '📥 Entrée de stock dans ce magasin' : '📤 Sortie pour chantier'}
        onClose={() => setStockMoveModalOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setStockMoveModalOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              loading={actionBusy}
              disabled={!stockMoveRefId || !stockMoveQty}
              onClick={() => void handleExecuteStockMove()}
            >
              Valider le mouvement
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Matière / Quincaillerie :</label>
            <select
              value={stockMoveRefId ?? ''}
              onChange={(e) => setStockMoveRefId(Number(e.target.value))}
              className="w-full rounded-xl border border-line bg-paper p-2.5 text-xs text-ink focus:border-amber focus:outline-none"
            >
              {detail?.stock.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} (En rayon : {s.qty} {s.unit})
                </option>
              ))}
            </select>
          </div>

          <Field
            label="Quantité"
            type="number"
            min="1"
            value={stockMoveQty}
            onChange={(e) => setStockMoveQty(e.target.value)}
            placeholder="ex. 10"
          />

          {stockMoveType === 'out' ? (
            <Field
              label="Bénéficiaire / Chantier"
              value={stockMoveBeneficiary}
              onChange={(e) => setStockMoveBeneficiary(e.target.value)}
              placeholder="ex. Atelier Menuiserie, Chantier Portes…"
            />
          ) : (
            <Field
              label="Fournisseur / Arrivage"
              value={stockMoveBeneficiary}
              onChange={(e) => setStockMoveBeneficiary(e.target.value)}
              placeholder="ex. Spax, Quincaillerie Centrale…"
            />
          )}

          <Field
            label="N° Bon / Document (optionnel)"
            value={stockMoveDocRef}
            onChange={(e) => setStockMoveDocRef(e.target.value)}
            placeholder="ex. BL-402, Facture…"
          />

          <TextArea
            label="Observations"
            value={stockMoveNote}
            onChange={(e) => setStockMoveNote(e.target.value)}
            placeholder="Précisions utiles sur le mouvement…"
          />
        </div>
      </Modal>

      {/* Modal Suppression Magasin Intelligente avec Réaffectation */}
      <Modal
        open={!!deleteFor}
        title="Suppression du magasin"
        onClose={() => setDeleteFor(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteFor(null)}>
              Annuler
            </Button>
            <Button
              variant="danger"
              loading={deleteBusy}
              disabled={
                Boolean(
                  deleteFor &&
                    ((deleteFor.tools_count ?? 0) > 0 || (deleteFor.stock_count ?? 0) > 0) &&
                    !deleteTargetMagasinId
                )
              }
              onClick={() => void removeMagasin()}
            >
              {deleteFor && ((deleteFor.tools_count ?? 0) > 0 || (deleteFor.stock_count ?? 0) > 0)
                ? 'Transférer et supprimer'
                : 'Supprimer définitivement'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {deleteError && (
            <div className="rounded-lg bg-red-wash px-3 py-2 text-xs text-red font-medium">
              {deleteError}
            </div>
          )}

          <p className="text-sm text-ink">
            Êtes-vous sûr de vouloir supprimer le magasin{' '}
            <strong className="text-amber">{deleteFor?.name}</strong> ({deleteFor?.code}) ?
          </p>

          {deleteFor && ((deleteFor.tools_count ?? 0) > 0 || (deleteFor.stock_count ?? 0) > 0) ? (
            <div className="rounded-xl border border-amber/30 bg-amber-wash/40 p-3.5 space-y-3">
              <div className="flex items-start gap-2 text-xs text-amber-900 dark:text-amber">
                <IconAlert size={16} className="shrink-0 mt-0.5" />
                <span>
                  Ce magasin contient actuellement <strong>{deleteFor.tools_count ?? 0} outil(s)</strong> et{' '}
                  <strong>{deleteFor.stock_count ?? 0} référence(s) de stock</strong>.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">
                  Transférer automatiquement tout le contenu vers :
                </label>
                <select
                  value={deleteTargetMagasinId}
                  onChange={(e) => setDeleteTargetMagasinId(e.target.value)}
                  className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-xs text-ink focus:border-amber focus:outline-none"
                >
                  <option value="">-- Sélectionnez le magasin de destination --</option>
                  {magasins
                    .filter((m) => m.id !== deleteFor.id)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.code})
                      </option>
                    ))}
                </select>
                <p className="mt-1 text-[11px] text-ink-faint">
                  Tous les outils et articles seront réaffectés instantanément au magasin sélectionné.
                </p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-ink-soft">
              Ce magasin ne contient aucun outil ni article de stock. Sa suppression est immédiate.
            </p>
          )}

          <p className="text-[11px] text-ink-faint">Cette opération est tracée dans le journal d'audit de sécurité.</p>
        </div>
      </Modal>

      {/* Modal Transfert Rapide d'un Outil */}
      <Modal
        open={!!transferToolItem}
        title={`Transférer l'outil : ${transferToolItem?.name ?? ''}`}
        onClose={() => setTransferToolItem(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setTransferToolItem(null)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              loading={actionBusy}
              disabled={!transferTargetId}
              onClick={() => void handleExecuteTransferTool()}
            >
              Valider le transfert
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-ink-soft">
            Sélectionnez le nouveau magasin auquel cet outil sera désormais rattaché :
          </p>
          <select
            value={transferTargetId}
            onChange={(e) => setTransferTargetId(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface p-2.5 text-xs text-ink focus:border-amber focus:outline-none"
          >
            <option value="">-- Choisir le magasin destinataire --</option>
            {magasins.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.code})
              </option>
            ))}
          </select>
        </div>
      </Modal>

      {/* Modal Confirmation Suppression d'un Outil */}
      <Modal
        open={!!deleteToolItem}
        title="Supprimer l'outil"
        onClose={() => setDeleteToolItem(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteToolItem(null)}>
              Annuler
            </Button>
            <Button variant="danger" loading={actionBusy} onClick={() => void handleExecuteDeleteTool()}>
              Supprimer définitivement
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <p className="text-xs text-ink">
            Voulez-vous vraiment supprimer définitivement l'outil <strong>{deleteToolItem?.name}</strong> ({deleteToolItem?.id}) ?
          </p>
          <p className="text-[11px] text-ink-faint">Cette suppression est irréversible.</p>
        </div>
      </Modal>

      {/* Modal Transfert Rapide d'une Référence Matière */}
      <Modal
        open={!!transferStockItem}
        title={`Transférer l'article : ${transferStockItem?.name ?? ''}`}
        onClose={() => setTransferStockItem(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setTransferStockItem(null)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              loading={actionBusy}
              disabled={!transferTargetId}
              onClick={() => void handleExecuteTransferStock()}
            >
              Valider le transfert
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-ink-soft">
            Sélectionnez le magasin où sera désormais localisé cet article de stock :
          </p>
          <select
            value={transferTargetId}
            onChange={(e) => setTransferTargetId(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface p-2.5 text-xs text-ink focus:border-amber focus:outline-none"
          >
            <option value="">-- Choisir le magasin destinataire --</option>
            {magasins.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.code})
              </option>
            ))}
          </select>
        </div>
      </Modal>
    </div>
  );
}
