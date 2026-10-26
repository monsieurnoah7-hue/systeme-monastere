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
import {
  Download,
  Printer,
  Camera,
  TrendingDown,
  FileSpreadsheet,
  Trash2,
  ArrowRightLeft,
  AlertTriangle,
  Layers,
  FolderArchive,
  ArrowRight,
} from 'lucide-react';
import { exportToExcel, exportToPdf } from '../lib/export';
import { ImagePickerModal } from '../components/ImagePickerModal';
import { ExcelImportModal } from '../components/ExcelImportModal';
import { computePortfolioAudit, computeToolAccounting, formatCurrency } from '../lib/accounting';

type ToolDetail = { tool: Tool; events: ToolEvent[]; loan: ToolLoan | null };
type Facets = { categories: string[]; locations: string[] };

function ToolLabelCard({ tool, qrSrc }: { tool: Tool; qrSrc?: string }) {
  return (
    <div
      className="tool-label-card relative flex flex-col justify-between overflow-hidden rounded-lg border-2 border-gray-800 bg-white p-2 text-gray-900 shadow-xs"
      style={{
        fontFamily: '"IBM Plex Sans", -apple-system, sans-serif',
        breakInside: 'avoid',
      }}
    >
      {/* En-tête officiel du Monastère */}
      <div className="flex items-center justify-between border-b border-gray-300 pb-1">
        <div className="flex items-center gap-1.5">
          <img src="/logo.png" alt="Logo" className="h-4 object-contain" />
          <span className="text-[6pt] font-extrabold uppercase tracking-wider text-gray-900">
            C.F.T. Bénédictins Mont Fébé
          </span>
        </div>
        <span className="rounded bg-orange-100 px-1 py-0.2 text-[5pt] font-bold text-[#ff5500] uppercase tracking-wider">
          Atelier
        </span>
      </div>

      {/* Corps : QR Code + Données Outil */}
      <div className="flex items-center gap-2 py-1.5">
        <div className="grid h-[24mm] w-[24mm] shrink-0 place-items-center rounded border border-gray-300 bg-white p-0.5">
          {qrSrc ? (
            <img src={qrSrc} alt={`QR ${tool.id}`} className="h-full w-full object-contain" />
          ) : (
            <div className="h-full w-full bg-gray-100" />
          )}
        </div>

        <div className="min-w-0 flex-1 leading-tight">
          <p className="font-mono text-[11pt] font-black tracking-tight text-gray-950">
            {tool.id}
          </p>
          <p className="truncate text-[7.5pt] font-bold text-gray-900 leading-snug">
            {tool.name}
          </p>
          <p className="mt-0.5 truncate text-[6pt] text-gray-600">
            {tool.category} · {tool.location}
          </p>
          <div className="mt-1 flex items-center gap-1">
            <span className="text-[5.5pt] text-gray-500 font-mono">
              MAGASIN : {tool.magasin_id ?? 'Central'}
            </span>
          </div>
        </div>
      </div>

      {/* Pied de sécurité */}
      <div className="flex items-center justify-between border-t border-gray-200 pt-0.5 text-[4.8pt] font-semibold uppercase tracking-wider text-gray-500">
        <span>PROPRIÉTÉ DU MONASTÈRE</span>
        <span>SCAN RETOUR OBLIGATOIRE</span>
      </div>
    </div>
  );
}

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
      <div style={{ marginBottom: '6mm', borderBottom: '1px solid #d3cabd', paddingBottom: '3mm' }} className="flex items-center justify-between">
        <div>
          <p style={{ fontSize: '12pt', fontWeight: 700, color: '#ff6603', margin: 0 }}>
            C.F.T. des Bénédictins du Mont Fébé
          </p>
          <p style={{ fontSize: '8.5pt', color: '#5b5651', margin: '1mm 0 0' }}>
            Planche d’étiquettes outillage &amp; machines · {tools.length} référence(s) · format d’atelier avec découpe
          </p>
        </div>
        <img src="/logo.png" alt="Logo" style={{ height: '10mm', objectFit: 'contain' }} />
      </div>
      <div className="a4-grid">
        {tools.map((tool) => (
          <ToolLabelCard key={tool.id} tool={tool} qrSrc={codes[tool.id]} />
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
  const [importOpen, setImportOpen] = useState(false);
  const [newForm, setNewForm] = useState({
    name: '',
    category: 'Divers',
    location: 'Magasin',
    magasin_id: '',
    observations: '',
    brand: '',
    model: '',
    serial_number: '',
    acquisition_cost: '',
    acquisition_year: String(new Date().getFullYear()),
    lifespan_years: '5',
    photo_path: null as string | null,
  });
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [photoTarget, setPhotoTarget] = useState<{ id?: string; current?: string | null; name?: string } | null>(null);
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

  /* Scope filter: active stock vs drafts */
  const [scopeFilter, setScopeFilter] = useState<'all' | 'active' | 'drafts'>('all');
  const [selectedToolIds, setSelectedToolIds] = useState<Set<string>>(new Set());
  const [batchAssignOpen, setBatchAssignOpen] = useState(false);
  const [batchAssignMagasinId, setBatchAssignMagasinId] = useState('');
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [deleteSingleTool, setDeleteSingleTool] = useState<Tool | null>(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deleteAllConfirmText, setDeleteAllConfirmText] = useState('');

  useEffect(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    let cancelled = false;
    if (tools.length === 0) setLoading(true);
    api<{ tools: Tool[]; facets: Facets }>(`/api/tools?${params.toString()}`)
      .then((res) => {
        if (cancelled) return;
        setTools(res.tools);
        setFacets(res.facets);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled && tools.length === 0) setError(err instanceof Error ? err.message : 'Chargement impossible.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters, reload, tools.length]);

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
    const handleSync = () => {
      refresh();
      api<{ magasins: Magasin[] }>('/api/magasins')
        .then((res) => setMagasins(res.magasins.filter((m) => m.active)))
        .catch(() => {});
    };
    window.addEventListener('mf-refresh-data', handleSync);
    return () => window.removeEventListener('mf-refresh-data', handleSync);
  }, [refresh]);

  useEffect(() => {
    if (!scan) return;
    if (scan.kind === 'tool') {
      setFilters({ q: '', status: '', category: '', location: '', magasin_id: '' });
      setSelectedId(scan.tool.id);
      setReload((value) => value + 1);
    }
  }, [scan]);

  const activeTools = useMemo(() => tools.filter((t) => !!t.magasin_id), [tools]);
  const draftTools = useMemo(() => tools.filter((t) => !t.magasin_id), [tools]);

  const displayedTools = useMemo(() => {
    if (scopeFilter === 'active') return activeTools;
    if (scopeFilter === 'drafts') return draftTools;
    return tools;
  }, [scopeFilter, activeTools, draftTools, tools]);

  const stats = useMemo(() => {
    const list = scopeFilter === 'drafts' ? draftTools : scopeFilter === 'active' ? activeTools : tools;
    const counts = {
      total: list.length,
      disponible: 0,
      en_pret: 0,
      maintenance: 0,
      manquant: 0,
      reforme: 0,
    };
    for (const tool of list) {
      if (tool.status in counts) {
        counts[tool.status as keyof typeof counts]++;
      }
    }
    return counts;
  }, [scopeFilter, activeTools, draftTools, tools]);

  const auditSummary = useMemo(() => {
    const list = scopeFilter === 'drafts' ? draftTools : activeTools.length > 0 ? activeTools : tools;
    return computePortfolioAudit(list);
  }, [scopeFilter, activeTools, draftTools, tools]);

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
          brand: newForm.brand.trim() || undefined,
          model: newForm.model.trim() || undefined,
          serial_number: newForm.serial_number.trim() || undefined,
          acquisition_cost: newForm.acquisition_cost ? Number(newForm.acquisition_cost) : undefined,
          acquisition_year: newForm.acquisition_year ? Number(newForm.acquisition_year) : undefined,
          lifespan_years: newForm.lifespan_years ? Number(newForm.lifespan_years) : 5,
          photo_path: newForm.photo_path || undefined,
        }),
      });
      toast(`Outil ${res.tool.id} créé avec succès.`, 'success');
      setNewOpen(false);
      setNewForm({
        name: '',
        category: 'Divers',
        location: 'Magasin',
        magasin_id: '',
        observations: '',
        brand: '',
        model: '',
        serial_number: '',
        acquisition_cost: '',
        acquisition_year: String(new Date().getFullYear()),
        lifespan_years: '5',
        photo_path: null,
      });
      refresh();
      setSelectedId(res.tool.id);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Création impossible.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleToolPhotoSelect(url: string | null) {
    if (!photoTarget?.id) {
      setNewForm((f) => ({ ...f, photo_path: url }));
      return;
    }
    setBusy(true);
    try {
      await api<{ ok: boolean; tool: Tool }>(`/api/tools/${photoTarget.id}/photo`, {
        method: 'POST',
        body: JSON.stringify({ photo_path: url }),
      });
      toast('Photo du matériel mise à jour.', 'success');
      refresh();
      if (detail && detail.tool.id === photoTarget.id) {
        setDetail({ ...detail, tool: { ...detail.tool, photo_path: url } });
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Échec de mise à jour photo.', 'error');
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

  function toggleSelect(id: string) {
    setSelectedToolIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(currentList: Tool[]) {
    if (selectedToolIds.size === currentList.length && currentList.length > 0) {
      setSelectedToolIds(new Set());
    } else {
      setSelectedToolIds(new Set(currentList.map((t) => t.id)));
    }
  }

  async function handleBatchAssign() {
    if (selectedToolIds.size === 0) return;
    setBusy(true);
    try {
      const ids = Array.from(selectedToolIds);
      const res = await api<{ ok: boolean; message: string }>('/api/tools/batch-transfer', {
        method: 'POST',
        body: JSON.stringify({ ids, magasin_id: batchAssignMagasinId || null }),
      });
      toast(res.message, 'success');
      setBatchAssignOpen(false);
      setSelectedToolIds(new Set());
      refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Échec de l’affectation groupée.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleBatchDelete() {
    if (selectedToolIds.size === 0) return;
    setBusy(true);
    try {
      const ids = Array.from(selectedToolIds);
      const res = await api<{ ok: boolean; message: string }>('/api/tools/batch-delete', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
      toast(res.message, 'success');
      setBatchDeleteOpen(false);
      setSelectedToolIds(new Set());
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

  async function handleDeleteSingle(tool: Tool) {
    setBusy(true);
    try {
      const res = await api<{ ok: boolean; message: string }>(`/api/tools/${tool.id}`, {
        method: 'DELETE',
      });
      toast(res.message, 'success');
      setDeleteSingleTool(null);
      if (selectedId === tool.id) setSelectedId(null);
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
      const res = await api<{ ok: boolean; message: string }>('/api/tools/delete-all', {
        method: 'POST',
        body: JSON.stringify({
          confirmation: 'SUPPRIMER',
          drafts_only: scopeFilter === 'drafts',
          magasin_id: filters.magasin_id || undefined,
        }),
      });
      toast(res.message, 'success');
      setDeleteAllOpen(false);
      setDeleteAllConfirmText('');
      setSelectedToolIds(new Set());
      setSelectedId(null);
      refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Échec de la suppression globale.', 'error');
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

  function handleExportExcel() {
    const dateStr = new Date().toISOString().split('T')[0];
    const headers = ['Identifiant', 'Désignation', 'Marque', 'Catégorie', 'Magasin / Dépôt', 'Coût Achat', 'VNC Résiduelle', 'État Physique', 'Statut'];
    const rows = tools.map((t) => {
      const acc = computeToolAccounting(t);
      return [
        t.id,
        t.name,
        t.brand || '-',
        t.category,
        t.magasin_name ?? t.location ?? '-',
        acc ? formatCurrency(acc.acquisitionCost) : '-',
        acc ? formatCurrency(acc.vnc) : '-',
        CONDITION_LABEL[t.condition] ?? t.condition,
        STATUS_LABEL[t.status] ?? t.status,
      ];
    });
    exportToExcel(`Parc_Outils_${dateStr}`, 'Outils', headers, rows);
  }

  function handleExportAuditReport() {
    const dateStr = new Date().toISOString().split('T')[0];
    const headers = [
      'ID Outil',
      'Désignation',
      'Marque',
      'Catégorie',
      'Magasin',
      'Coût Achat (FCFA)',
      'Année',
      'Âge',
      'Amortissement (FCFA)',
      'VNC Résiduelle (FCFA)',
      'Progression %',
      'Statut Comptable',
      'État Physique',
    ];
    const rows = tools.map((t) => {
      const acc = computeToolAccounting(t);
      return [
        t.id,
        t.name,
        t.brand || '-',
        t.category,
        t.magasin_name ?? t.location ?? '-',
        acc ? acc.acquisitionCost : (t.acquisition_cost || '-'),
        acc ? acc.acquisitionYear : (t.acquisition_year || '-'),
        acc ? `${acc.ageYears} an(s)` : '-',
        acc ? acc.cumulativeAmortization : '-',
        acc ? acc.vnc : '-',
        acc ? `${acc.progressPercent}%` : '-',
        acc ? acc.statusLabel : 'Non valorisé',
        CONDITION_LABEL[t.condition] ?? t.condition,
      ];
    });

    exportToExcel(`Audit_Patrimonial_Outils_${dateStr}`, 'Inventaire_Amortissements', headers, rows);

    exportToPdf(
      'Rapport d’Audit Patrimonial & Amortissement de l’Outillage',
      'Centre de Formation Technique (C.F.T.) des Bénédictins du Mont Fébé — État des Immobilisations',
      ['ID', 'Désignation', 'Marque', 'Catégorie', 'Coût Achat', 'Amortissement', 'VNC Nette', 'Statut Comptable'],
      rows.map((r) => [r[0], r[1], r[2], r[3], typeof r[5] === 'number' ? formatCurrency(r[5]) : r[5], typeof r[8] === 'number' ? formatCurrency(r[8]) : r[8], typeof r[9] === 'number' ? formatCurrency(r[9]) : r[9], r[11]]),
      [
        { label: 'Valeur Brute Parc', value: formatCurrency(auditSummary.totalAcquisitionCost) },
        { label: 'VNC Active Nette', value: formatCurrency(auditSummary.totalVnc) },
        { label: 'Amortissements Cumulés', value: formatCurrency(auditSummary.totalAmortization) },
        { label: 'Taux Moyen d’Amortissement', value: `${auditSummary.averageAmortizationRate}%` },
      ],
    );
  }

  function handleExportPdf() {
    const headers = ['Identifiant', 'Désignation', 'Catégorie', 'Dépôt', 'État', 'Statut', 'Emprunteur'];
    const rows = tools.map((t) => [
      t.id,
      t.name,
      t.category,
      t.magasin_name ?? t.location ?? '-',
      CONDITION_LABEL[t.condition] ?? t.condition,
      STATUS_LABEL[t.status] ?? t.status,
      t.status === 'en_pret' ? 'Emprunté' : '-',
    ]);
    exportToPdf(
      'Inventaire du Parc Outillage & Machines',
      'Registre certifié du matériel électroportatif et outillage à main C.F.T.',
      headers,
      rows,
      [
        { label: 'Total Parc', value: stats.total },
        { label: 'Disponibles', value: stats.disponible },
        { label: 'En Prêt', value: stats.en_pret },
        { label: 'En Maintenance', value: stats.maintenance },
      ],
    );
  }

  return (
    <div className="space-y-4 pb-12">
      {/* Header Banner */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink">
            Outils &amp; Machines
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            icon={<Download size={14} />}
            onClick={handleExportExcel}
          >
            Excel
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={<Printer size={14} />}
            onClick={handleExportPdf}
          >
            Imprimer
          </Button>
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
            <>
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
                onClick={() => setNewOpen(true)}
              >
                Nouvel Outil
              </Button>
              {tools.length > 0 && (
                <Button
                  size="sm"
                  variant="outline-danger"
                  icon={<Trash2 size={13} />}
                  onClick={() => {
                    setDeleteAllConfirmText('');
                    setDeleteAllOpen(true);
                  }}
                  title="Purger ou supprimer l'ensemble du parc d'outils"
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
              setSelectedToolIds(new Set());
            }}
            className={cx(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
              scopeFilter === 'all'
                ? 'bg-amber text-white shadow-xs'
                : 'text-ink-soft hover:text-ink hover:bg-paper',
            )}
          >
            <Layers size={14} />
            <span>Tout le Parc</span>
            <span
              className={cx(
                'text-[10px] px-1.5 py-0.2 rounded-full font-bold',
                scopeFilter === 'all' ? 'bg-white/20 text-white' : 'bg-surface text-ink-faint',
              )}
            >
              {tools.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setScopeFilter('active');
              setSelectedToolIds(new Set());
            }}
            className={cx(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
              scopeFilter === 'active'
                ? 'bg-amber text-white shadow-xs'
                : 'text-ink-soft hover:text-ink hover:bg-paper',
            )}
          >
            <IconBox size={14} />
            <span>Parc Actif en Magasins</span>
            <span
              className={cx(
                'text-[10px] px-1.5 py-0.2 rounded-full font-bold',
                scopeFilter === 'active' ? 'bg-white/20 text-white' : 'bg-surface text-green',
              )}
            >
              {activeTools.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setScopeFilter('drafts');
              setSelectedToolIds(new Set());
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
                  : draftTools.length > 0
                    ? 'bg-amber-wash text-amber border border-amber/30'
                    : 'bg-surface text-ink-faint',
              )}
            >
              {draftTools.length}
            </span>
          </button>
        </div>

        {draftTools.length > 0 && scopeFilter !== 'drafts' && (
          <button
            onClick={() => {
              setScopeFilter('drafts');
              setSelectedToolIds(new Set());
            }}
            className="text-xs font-semibold text-amber hover:underline flex items-center gap-1.5"
          >
            <span>⚠️ {draftTools.length} outil{draftTools.length > 1 ? 's' : ''} en brouillon sans affectation</span>
            <ArrowRight size={13} />
          </button>
        )}
      </div>

      {/* KPI Dashboard Cards */}
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

      {/* Bandeau d'Amortissement Intelligent & Valorisation Patrimoniale */}
      <div className="rounded-xl border border-line bg-gradient-to-r from-paper to-surface p-4 shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-wash border border-amber/30 text-amber shrink-0">
              <TrendingDown size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-ink">Valorisation &amp; Amortissement Comptable</h3>
                <span className="rounded bg-amber-wash px-2 py-0.5 text-[10px] font-bold text-amber border border-amber/20">
                  SYSCOHADA / Pratique Atelier
                </span>
              </div>
              <p className="text-xs text-ink-soft">
                Suivi dynamique de la Valeur Nette Comptable (VNC) et vieillissement du parc d’outillage.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="border-amber/30 bg-amber-wash/30 text-amber hover:bg-amber-wash hover:border-amber/50"
            icon={<FileSpreadsheet size={15} />}
            onClick={handleExportAuditReport}
          >
            Rapport d’Audit Patrimonial
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 border-t border-line/60 pt-3">
          <div>
            <span className="text-[11px] font-medium text-ink-faint">Valeur Brute d'Acquisition</span>
            <p className="text-base font-bold text-ink">{formatCurrency(auditSummary.totalAcquisitionCost)}</p>
          </div>
          <div>
            <span className="text-[11px] font-medium text-ink-faint">VNC Active (Résiduelle)</span>
            <p className="text-base font-bold text-green">{formatCurrency(auditSummary.totalVnc)}</p>
          </div>
          <div>
            <span className="text-[11px] font-medium text-ink-faint">Amortissements Cumulés</span>
            <p className="text-base font-bold text-ink-soft">{formatCurrency(auditSummary.totalAmortization)}</p>
          </div>
          <div>
            <span className="text-[11px] font-medium text-ink-faint">Usure Moyenne du Parc</span>
            <div className="flex items-center gap-2 mt-0.5">
              <div className="h-2 flex-1 rounded-full bg-paper-2 overflow-hidden border border-line">
                <div
                  className="h-full bg-amber rounded-full"
                  style={{ width: `${auditSummary.averageAmortizationRate}%` }}
                />
              </div>
              <span className="text-xs font-bold text-ink">{auditSummary.averageAmortizationRate}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filters & Search Bar */}
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

      {/* Drafts Informative Banner */}
      {scopeFilter === 'drafts' && (
        <div className="flex items-start gap-3 p-3.5 rounded-xl border border-amber/30 bg-amber-wash/50 text-xs text-ink leading-relaxed">
          <FolderArchive size={18} className="text-amber shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink">Brouillons d’outils &amp; Matériels en attente d’affectation</p>
            <p className="text-ink-soft mt-0.5">
              Ces équipements ne sont rattachés à aucun magasin, atelier ou salle. Ils <strong>ne sont pas comptabilisés</strong> dans le stock opérationnel actif et ne peuvent être prêtés. Cochez-les pour les affecter en 1 clic au magasin de votre choix.
            </p>
          </div>
        </div>
      )}

      {/* Batch Actions Bar (Flottant / Sticky quand sélection active) */}
      {selectedToolIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-amber/40 bg-surface-2 shadow-card animate-slide-up">
          <div className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber text-white text-xs font-bold shadow-xs">
              {selectedToolIds.size}
            </span>
            <span className="text-xs font-semibold text-ink">
              {selectedToolIds.size} outil{selectedToolIds.size > 1 ? 's' : ''} sélectionné{selectedToolIds.size > 1 ? 's' : ''}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canManage && (
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
                  Supprimer la sélection ({selectedToolIds.size})
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedToolIds(new Set())}
            >
              Désélectionner tout
            </Button>
          </div>
        </div>
      )}

      {/* Main Content: Tableur or Cards */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-soft">
          <Spinner /> Chargement du parc d’outils…
        </div>
      ) : displayedTools.length === 0 ? (
        <EmptyState
          title={
            scopeFilter === 'drafts'
              ? 'Aucun outil en brouillon'
              : scopeFilter === 'active'
                ? 'Aucun outil actif en magasin'
                : 'Aucun outil ne correspond à vos filtres'
          }
          hint={
            scopeFilter === 'drafts'
              ? 'Tous vos outils sont actuellement affectés à des magasins opérationnels.'
              : 'Essayez de modifier vos filtres ou créez la fiche d’un nouvel équipement.'
          }
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
                    {canManage && (
                      <th className="px-2.5 py-2.5 w-10 text-center border-r border-line">
                        <input
                          type="checkbox"
                          checked={displayedTools.length > 0 && selectedToolIds.size === displayedTools.length}
                          onChange={() => toggleSelectAll(displayedTools)}
                          className="h-4 w-4 rounded accent-amber cursor-pointer"
                          title="Tout sélectionner / désélectionner"
                        />
                      </th>
                    )}
                    <th className="px-2.5 py-2.5 w-12 border-r border-line text-center">Photo</th>
                    <th className="sticky left-0 z-10 bg-paper-2 px-3 py-2.5 min-w-24 border-r border-line">
                      Réf / Code QR
                    </th>
                    <th className="px-3 py-2.5 min-w-44 border-r border-line">Désignation &amp; Marque</th>
                    <th className="px-3 py-2.5 min-w-28 border-r border-line">Catégorie</th>
                    <th className="px-3 py-2.5 min-w-36 border-r border-line">Emplacement / Magasin</th>
                    <th className="px-3 py-2.5 min-w-24 border-r border-line text-right">VNC Nette</th>
                    <th className="px-3 py-2.5 min-w-24 border-r border-line text-center">État</th>
                    <th className="px-3 py-2.5 min-w-28 border-r border-line text-center">Statut</th>
                    <th className="px-3 py-2.5 min-w-36 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {displayedTools.map((tool) => {
                    const acc = computeToolAccounting(tool);
                    const isSelected = selectedToolIds.has(tool.id);
                    return (
                      <tr
                        key={tool.id}
                        onClick={() => setSelectedId(tool.id)}
                        className={cx(
                          'cursor-pointer transition-colors group',
                          isSelected ? 'bg-amber-wash/40 hover:bg-amber-wash/50' : 'hover:bg-paper-2/40',
                        )}
                      >
                        {/* Checkbox */}
                        {canManage && (
                          <td className="px-2.5 py-2 text-center border-r border-line" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(tool.id)}
                              className="h-4 w-4 rounded accent-amber cursor-pointer"
                            />
                          </td>
                        )}

                        {/* Photo Thumbnail */}
                        <td className="px-2 py-1.5 text-center border-r border-line" onClick={(e) => {
                          if (canManage) {
                            e.stopPropagation();
                            setPhotoTarget({ id: tool.id, current: tool.photo_path, name: tool.name });
                            setPhotoModalOpen(true);
                          }
                        }}>
                          {tool.photo_path ? (
                            <img
                              src={tool.photo_path}
                              alt={tool.name}
                              className="h-9 w-9 rounded-lg object-cover border border-line shadow-2xs mx-auto hover:opacity-85 transition-opacity"
                              title="Cliquer pour changer la photo"
                            />
                          ) : (
                            <span
                              className="grid h-9 w-9 place-items-center rounded-lg bg-paper text-ink-faint border border-line/60 mx-auto hover:text-amber hover:border-amber transition-colors"
                              title="Ajouter une photo"
                            >
                              <IconWrench size={16} />
                            </span>
                          )}
                        </td>

                        {/* Sticky ID */}
                        <td className="sticky left-0 z-10 bg-surface group-hover:bg-surface-2 px-3 py-2 font-mono font-bold text-amber border-r border-line">
                          <div className="flex items-center gap-1.5">
                            <IconQr size={13} className="text-ink-faint shrink-0" />
                            <span>{tool.id}</span>
                          </div>
                        </td>

                        {/* Designation & Marque */}
                        <td className="px-3 py-2 font-medium text-ink border-r border-line">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold">{tool.name}</span>
                            {tool.brand ? (
                              <span className="rounded bg-paper px-1.5 py-0.2 text-[10px] font-bold text-ink-soft border border-line">
                                {tool.brand}
                              </span>
                            ) : null}
                          </div>
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
                          {tool.magasin_name ? (
                            <div>
                              <div className="font-semibold text-ink">{tool.magasin_name}</div>
                              <div className="text-[10px] text-ink-faint">{tool.location}</div>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-wash px-2 py-0.5 text-[10px] font-semibold text-amber border border-amber/30">
                              <FolderArchive size={11} /> Brouillon (sans magasin)
                            </span>
                          )}
                        </td>

                        {/* VNC Nette */}
                        <td className="px-3 py-2 text-right font-mono font-semibold text-ink border-r border-line">
                          {acc ? (
                            <div>
                              <span className={acc.isFullyAmortized ? 'text-purple-400' : 'text-green'}>
                                {formatCurrency(acc.vnc)}
                              </span>
                              <span className="block text-[10px] text-ink-faint font-normal">{acc.progressPercent}% amorti</span>
                            </div>
                          ) : (
                            <span className="text-ink-faint">—</span>
                          )}
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
                                className="rounded bg-amber px-2.5 py-1 text-[11px] font-semibold text-white shadow-xs hover:bg-amber-2 active:scale-95 transition-all"
                              >
                                Prêter
                              </button>
                            ) : null}

                            {canManage && (
                              <>
                                <button
                                  onClick={() => {
                                    setAssignFor(tool);
                                    setAssignMagasinId(tool.magasin_id ?? '');
                                  }}
                                  className="rounded border border-line bg-paper p-1 text-ink-soft hover:bg-paper-2 hover:text-amber active:scale-95 transition-all"
                                  title="Affecter ou changer de magasin"
                                >
                                  <ArrowRightLeft size={13} />
                                </button>
                                <button
                                  onClick={() => setDeleteSingleTool(tool)}
                                  className="rounded border border-line bg-paper p-1 text-ink-soft hover:bg-red-500/10 hover:text-red hover:border-red-500/30 active:scale-95 transition-all"
                                  title="Supprimer définitivement cet outil"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </>
                            )}

                            <button
                              onClick={() => setSelectedId(tool.id)}
                              className="rounded border border-line bg-paper px-2 py-1 text-[11px] font-medium text-ink-soft hover:bg-paper-2 hover:text-ink active:scale-95 transition-all"
                            >
                              Détails ›
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Tableur Footer Total */}
            <div className="bg-paper border-t border-line px-4 py-2.5 text-xs flex items-center justify-between font-semibold text-ink-soft">
              <span>Affichés : {displayedTools.length} référence(s) {scopeFilter === 'drafts' ? '(brouillons)' : `· VNC : ${formatCurrency(auditSummary.totalVnc)}`}</span>
              <span className="text-[11px] text-ink-faint">
                Cochez des outils pour les affecter ou les transférer par lot vers un magasin
              </span>
            </div>
          </div>

          {/* Cards View (pour Mobile) */}
          <div className={cx('space-y-2.5', viewMode === 'cards' ? 'block' : 'sm:hidden')}>
            {displayedTools.map((tool) => {
              const acc = computeToolAccounting(tool);
              const isSelected = selectedToolIds.has(tool.id);
              return (
                <div
                  key={tool.id}
                  onClick={() => setSelectedId(tool.id)}
                  className={cx(
                    'rounded-xl border border-line bg-surface p-3.5 shadow-xs active:bg-paper-2 cursor-pointer transition-all space-y-2.5',
                    isSelected && 'border-amber/50 bg-amber-wash/30',
                  )}
                >
                  <div className="flex items-start gap-3">
                    {canManage && (
                      <div className="pt-1" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(tool.id)}
                          className="h-4 w-4 rounded accent-amber cursor-pointer"
                        />
                      </div>
                    )}

                    {tool.photo_path ? (
                      <img
                        src={tool.photo_path}
                        alt={tool.name}
                        className="h-14 w-14 shrink-0 rounded-xl object-cover border border-line shadow-xs"
                      />
                    ) : (
                      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-paper text-ink-faint border border-line">
                        <IconWrench size={22} />
                      </span>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-bold text-amber">{tool.id}</span>
                          <span className="rounded bg-paper px-1.5 py-0.5 text-[10px] font-medium text-ink-soft border border-line">
                            {tool.category}
                          </span>
                          {tool.brand ? (
                            <span className="rounded bg-paper px-1.5 py-0.5 text-[10px] font-bold text-ink-soft border border-line">
                              {tool.brand}
                            </span>
                          ) : null}
                        </div>

                        <span
                          className={cx(
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0',
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

                      <p className="font-semibold text-sm text-ink mt-0.5 truncate">{tool.name}</p>

                      {acc ? (
                        <div className="mt-1 flex items-center gap-2 text-[11px]">
                          <span className="text-ink-faint">VNC:</span>
                          <span className="font-bold text-green">{formatCurrency(acc.vnc)}</span>
                          <span className="text-ink-faint">({acc.progressPercent}% amorti)</span>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-ink-faint pt-2 border-t border-line/60">
                    <span className="truncate max-w-[150px]">
                      {tool.magasin_name ? (
                        tool.magasin_name
                      ) : (
                        <strong className="text-amber">📁 Brouillon</strong>
                      )}
                    </span>
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      {canManage && (
                        <>
                          <button
                            onClick={() => {
                              setAssignFor(tool);
                              setAssignMagasinId(tool.magasin_id ?? '');
                            }}
                            className="rounded border border-line bg-paper p-1 text-ink-soft hover:text-amber"
                            title="Affecter de magasin"
                          >
                            <ArrowRightLeft size={13} />
                          </button>
                          <button
                            onClick={() => setDeleteSingleTool(tool)}
                            className="rounded border border-line bg-paper p-1 text-ink-soft hover:text-red hover:border-red-500/30"
                            title="Supprimer cet outil"
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
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
              );
            })}
          </div>
        </>
      )}

      {/* Detail Drawer */}
      <Drawer
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
        title={detail ? `${detail.tool.id} · ${detail.tool.name}` : 'Fiche outil'}
        subtitle={detail ? `${detail.tool.category} · ${detail.tool.magasin_name ?? detail.tool.location}` : undefined}
        wide
      >
        {detailLoading || !detail ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-soft">
            <Spinner /> Chargement de la fiche…
          </div>
        ) : (
          <div className="space-y-4">
            {/* Photo & Identity Hero */}
            <div className="relative rounded-2xl border border-line bg-paper overflow-hidden">
              {detail.tool.photo_path ? (
                <div className="relative h-48 sm:h-56 w-full bg-black/5 flex items-center justify-center">
                  <img
                    src={detail.tool.photo_path}
                    alt={detail.tool.name}
                    className="h-full w-full object-contain"
                  />
                  {canManage ? (
                    <button
                      type="button"
                      onClick={() => {
                        setPhotoTarget({ id: detail.tool.id, current: detail.tool.photo_path, name: detail.tool.name });
                        setPhotoModalOpen(true);
                      }}
                      className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-surface/90 px-3 py-1.5 text-xs font-semibold text-ink shadow-md backdrop-blur-xs hover:bg-surface border border-line"
                    >
                      <Camera size={14} className="text-amber" /> Modifier la photo
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-6 text-center">
                  <div className="grid h-16 w-16 place-items-center rounded-2xl bg-surface border border-line text-ink-faint shadow-xs mb-2">
                    <IconWrench size={28} />
                  </div>
                  <p className="text-xs text-ink-soft">Aucune photo enregistrée pour cet équipement.</p>
                  {canManage ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-3"
                      icon={<Camera size={14} className="text-amber" />}
                      onClick={() => {
                        setPhotoTarget({ id: detail.tool.id, current: null, name: detail.tool.name });
                        setPhotoModalOpen(true);
                      }}
                    >
                      Prendre ou importer une photo
                    </Button>
                  ) : null}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Chip tone={STATUS_TONE[detail.tool.status]}>{STATUS_LABEL[detail.tool.status]}</Chip>
              <Chip tone={detail.tool.condition === 'bon' ? 'neutral' : 'amber'}>
                {CONDITION_LABEL[detail.tool.condition]}
              </Chip>
              {detail.tool.magasin_name ? <Chip tone="blue">{detail.tool.magasin_name}</Chip> : null}
            </div>

            {/* Fiche Comptable & Amortissement Intelligent */}
            {(() => {
              const acc = computeToolAccounting(detail.tool);
              return (
                <div className="rounded-xl border border-line bg-surface p-4 shadow-xs space-y-3">
                  <div className="flex items-center justify-between border-b border-line pb-2.5">
                    <div className="flex items-center gap-2">
                      <TrendingDown size={16} className="text-amber" />
                      <span className="text-xs font-bold text-ink uppercase tracking-wider">État d’Amortissement Intelligent</span>
                    </div>
                    {acc ? (
                      <span className={cx(
                        'rounded-full px-2 py-0.5 text-[10px] font-bold border',
                        acc.statusTone === 'emerald' && 'bg-green-wash text-green border-green/20',
                        acc.statusTone === 'blue' && 'bg-blue-wash text-blue border-blue/20',
                        acc.statusTone === 'amber' && 'bg-amber-wash text-amber border-amber/20',
                        acc.statusTone === 'purple' && 'bg-purple-wash text-purple-700 border-purple-200',
                        acc.statusTone === 'red' && 'bg-red-wash text-red border-red/20'
                      )}>
                        {acc.statusLabel}
                      </span>
                    ) : (
                      <span className="text-[11px] text-ink-faint">Non valorisé</span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
                    <div>
                      <span className="text-ink-faint block text-[11px]">Marque &amp; Modèle</span>
                      <span className="font-semibold text-ink">{detail.tool.brand || '—'} {detail.tool.model ? `· ${detail.tool.model}` : ''}</span>
                    </div>
                    <div>
                      <span className="text-ink-faint block text-[11px]">N° de Série</span>
                      <span className="font-mono text-ink-soft">{detail.tool.serial_number || '—'}</span>
                    </div>
                    <div>
                      <span className="text-ink-faint block text-[11px]">Année d’Acquisition</span>
                      <span className="font-semibold text-ink">{detail.tool.acquisition_year || '—'} {acc ? `(${acc.ageYears} an${acc.ageYears > 1 ? 's' : ''})` : ''}</span>
                    </div>
                    <div>
                      <span className="text-ink-faint block text-[11px]">Coût d'Acquisition Initial</span>
                      <span className="font-bold text-ink">{formatCurrency(detail.tool.acquisition_cost)}</span>
                    </div>
                    <div>
                      <span className="text-ink-faint block text-[11px]">Amortissement Cumulé</span>
                      <span className="font-bold text-ink-soft">{acc ? formatCurrency(acc.cumulativeAmortization) : '—'}</span>
                    </div>
                    <div>
                      <span className="text-ink-faint block text-[11px]">Valeur Nette Comptable (VNC)</span>
                      <span className="font-bold text-green">{acc ? formatCurrency(acc.vnc) : '—'}</span>
                    </div>
                  </div>

                  {acc ? (
                    <div className="space-y-1.5 pt-1 border-t border-line/60">
                      <div className="flex justify-between text-[11px] text-ink-soft">
                        <span>Progression de l’amortissement ({acc.annualRate}% / an sur {acc.lifespanYears} ans)</span>
                        <span className="font-bold text-ink">{acc.progressPercent}%</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-paper overflow-hidden border border-line">
                        <div
                          className={cx('h-full rounded-full transition-all', acc.isFullyAmortized ? 'bg-purple-600' : 'bg-amber')}
                          style={{ width: `${acc.progressPercent}%` }}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })()}

            {detail.tool.status_reason ? (
              <Banner tone={detail.tool.status === 'maintenance' ? 'warning' : 'error'} title="Motif du statut">
                {detail.tool.status_reason}
              </Banner>
            ) : null}

            {detail.loan ? (
              <Banner tone="info" title={`En prêt · ${detail.loan.full_name}`}>
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
                <Button
                  variant="outline-danger"
                  icon={<Trash2 size={14} />}
                  onClick={() => setDeleteSingleTool(detail.tool)}
                >
                  Supprimer la fiche
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
        title="Nouvel équipement / Outil"
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
          {/* Sélecteur de Photo de l'Outil */}
          <div className="flex items-center gap-4 p-3 rounded-xl border border-line bg-paper">
            <div
              onClick={() => {
                setPhotoTarget({ id: undefined, current: newForm.photo_path, name: newForm.name || 'Nouvel outil' });
                setPhotoModalOpen(true);
              }}
              className="relative grid h-20 w-20 shrink-0 place-items-center rounded-xl border-2 border-dashed border-line-strong bg-surface cursor-pointer hover:border-amber overflow-hidden group transition-all"
            >
              {newForm.photo_path ? (
                <img src={newForm.photo_path} alt="Aperçu outil" className="h-full w-full object-cover" />
              ) : (
                <div className="flex flex-col items-center justify-center p-1 text-center">
                  <Camera size={18} className="text-amber group-hover:scale-110 transition-transform" />
                  <span className="text-[9px] font-bold text-ink-soft mt-1">Photo</span>
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-ink">Photo du matériel</p>
              <p className="text-[11px] text-ink-faint mt-0.5">
                Prenez une photo en direct, importez un fichier ou réutilisez une photo d'un lot similaire.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  icon={<Camera size={13} />}
                  onClick={() => {
                    setPhotoTarget({ id: undefined, current: newForm.photo_path, name: newForm.name || 'Nouvel outil' });
                    setPhotoModalOpen(true);
                  }}
                >
                  {newForm.photo_path ? 'Changer la photo' : 'Prendre / Choisir photo'}
                </Button>
                {newForm.photo_path ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-red"
                    onClick={() => setNewForm((f) => ({ ...f, photo_path: null }))}
                  >
                    Supprimer
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          <Field
            label="Désignation de l'outil"
            value={newForm.name}
            onChange={(event) => setNewForm((f) => ({ ...f, name: event.target.value }))}
            placeholder="ex. Rabot électrique 900 W"
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Marque"
              value={newForm.brand}
              onChange={(event) => setNewForm((f) => ({ ...f, brand: event.target.value }))}
              placeholder="ex. Bosch, Makita, Festool..."
            />
            <Field
              label="Modèle / Référence constructeur"
              value={newForm.model}
              onChange={(event) => setNewForm((f) => ({ ...f, model: event.target.value }))}
              placeholder="ex. GHO 26-82 D"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Catégorie"
              value={newForm.category}
              onChange={(event) => setNewForm((f) => ({ ...f, category: event.target.value }))}
              hint="Préfixe généré (ex: RBT, SCI, PER...)"
            />
            <Field
              label="Numéro de série (facultatif)"
              value={newForm.serial_number}
              onChange={(event) => setNewForm((f) => ({ ...f, serial_number: event.target.value }))}
              placeholder="ex. SN-8849201"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <SelectField
                label="Magasin / Atelier d'affectation"
                value={newForm.magasin_id}
                onChange={(event) => {
                  const magId = event.target.value;
                  const mag = magasins.find((m) => m.id === magId);
                  setNewForm((f) => ({
                    ...f,
                    magasin_id: magId,
                    location: mag ? mag.name : f.location || 'Magasin',
                  }));
                }}
              >
                <option value="">📁 Laisser sans affectation (Brouillon)</option>
                {magasins.map((m) => (
                  <option key={m.id} value={m.id}>{m.name} ({m.code})</option>
                ))}
              </SelectField>
              <p className="mt-1 text-[11px] text-ink-faint">
                Classé en <strong>Brouillon</strong> tant qu'il n'est pas rattaché à un magasin.
              </p>
            </div>
            <Field
              label="Emplacement spécifique / Rayon"
              value={newForm.location}
              onChange={(event) => setNewForm((f) => ({ ...f, location: event.target.value }))}
              placeholder="ex. Étagère B3, Établi 2..."
            />
          </div>

          {/* Section Amortissement & Comptabilité */}
          <div className="rounded-xl border border-line bg-surface p-3.5 space-y-3">
            <div className="flex items-center gap-2 border-b border-line pb-2">
              <TrendingDown size={15} className="text-amber" />
              <span className="text-xs font-bold text-ink uppercase tracking-wider">Valorisation &amp; Amortissement</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field
                label="Coût d'acquisition (FCFA)"
                value={newForm.acquisition_cost}
                onChange={(event) => setNewForm((f) => ({ ...f, acquisition_cost: event.target.value }))}
                placeholder="ex. 185000"
                type="number"
              />
              <Field
                label="Année d'acquisition"
                value={newForm.acquisition_year}
                onChange={(event) => setNewForm((f) => ({ ...f, acquisition_year: event.target.value }))}
                placeholder={String(new Date().getFullYear())}
                type="number"
              />
              <Field
                label="Durée d'amortissement (ans)"
                value={newForm.lifespan_years}
                onChange={(event) => setNewForm((f) => ({ ...f, lifespan_years: event.target.value }))}
                placeholder="5"
                type="number"
                hint="Défaut : 5 ans (20%/an)"
              />
            </div>
          </div>

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
        title={loanFor ? `Prêter : ${loanFor.id} · ${loanFor.name}` : 'Prêt'}
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

      {/* Image Picker Modal (Caméra / Galerie / Lot) */}
      <ImagePickerModal
        open={photoModalOpen}
        title={photoTarget?.name ? `Photo : ${photoTarget.name}` : 'Photo de l’outil / matériel'}
        currentImage={photoTarget?.current}
        category="tools"
        defaultFacingMode="environment"
        onClose={() => setPhotoModalOpen(false)}
        onSelect={(url) => void handleToolPhotoSelect(url)}
      />

      {/* Modal Import Tableur Excel / CSV */}
      {importOpen && (
        <ExcelImportModal
          type="tools"
          onClose={() => setImportOpen(false)}
          onSuccess={() => {
            refresh();
          }}
        />
      )}

      {/* Modal Affectation / Transfert Groupé (Interchanger magasins & Affecter brouillons) */}
      <Modal
        open={batchAssignOpen}
        title={`Affecter ou transférer ${selectedToolIds.size} outil(s)`}
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
            Choisissez le magasin de destination pour les <strong>{selectedToolIds.size}</strong> outil(s) sélectionnés.
            Vous pouvez affecter des brouillons, ou interchanger des outils d'un magasin à un autre en une seule opération.
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
              Outils concernés par ce transfert :
            </span>
            <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg border border-line bg-paper p-2">
              {Array.from(selectedToolIds).map((id) => {
                const t = tools.find((item) => item.id === id);
                return (
                  <div key={id} className="flex items-center justify-between text-xs py-1 px-1.5 border-b border-line/40 last:border-0">
                    <span className="font-mono font-bold text-amber">{id}</span>
                    <span className="truncate flex-1 px-2 text-ink font-medium">{t?.name ?? 'Outil'}</span>
                    <span className="text-[11px] text-ink-faint">
                      {t?.magasin_name ?? '📁 Brouillon'}
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
        title={`Supprimer ${selectedToolIds.size} outil(s) sélectionné(s)`}
        onClose={() => setBatchDeleteOpen(false)}
        footer={
          <>
            <Button onClick={() => setBatchDeleteOpen(false)}>Annuler</Button>
            <Button variant="danger" disabled={busy} onClick={() => void handleBatchDelete()}>
              {busy ? <Spinner /> : `Supprimer définitivement (${selectedToolIds.size})`}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Suppression irréversible</p>
              <p className="mt-0.5 text-ink-soft">
                Vous êtes sur le point de supprimer définitivement ces <strong>{selectedToolIds.size}</strong> outil(s).
                Leur historique d'événements et de prêts archivés sera également supprimé. Les outils actuellement en prêt ne pourront pas être supprimés tant qu’ils n’auront pas été retournés.
              </p>
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal Suppression Singleton */}
      <Modal
        open={!!deleteSingleTool}
        title={deleteSingleTool ? `Supprimer l'outil ${deleteSingleTool.id}` : 'Supprimer'}
        onClose={() => setDeleteSingleTool(null)}
        footer={
          <>
            <Button onClick={() => setDeleteSingleTool(null)}>Annuler</Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                if (deleteSingleTool) void handleDeleteSingle(deleteSingleTool);
              }}
            >
              {busy ? <Spinner /> : 'Supprimer définitivement'}
            </Button>
          </>
        }
      >
        {deleteSingleTool && (
          <div className="space-y-3">
            <p className="text-xs text-ink">
              Confirmez-vous la suppression définitive de la fiche suivante ?
            </p>
            <div className="rounded-lg border border-line bg-paper p-3 text-xs space-y-1">
              <div className="font-mono font-bold text-amber">{deleteSingleTool.id}</div>
              <div className="font-semibold text-ink text-sm">{deleteSingleTool.name}</div>
              <div className="text-ink-soft">{deleteSingleTool.category} · {deleteSingleTool.magasin_name ?? '📁 Brouillon'}</div>
            </div>
            <p className="text-[11px] text-ink-faint">
              ⚠️ Cette action effacera également tous les événements de pointage et de suivi rattachés à cet outil.
            </p>
          </div>
        )}
      </Modal>

      {/* Modal Suppression Globale / Purge */}
      <Modal
        open={deleteAllOpen}
        title="Zone Critique : Suppression globale"
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
                  ? `Vous allez supprimer l'intégralité des ${draftTools.length} outils en brouillon (non affectés à un magasin).`
                  : `Vous allez supprimer l'intégralité du parc d'outils (${tools.length} référence(s)). Les outils actuellement en prêt seront protégés.`}
              </p>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">
              Tapez <strong className="font-mono text-red">SUPPRIMER</strong> pour débloquer la suppression :
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
