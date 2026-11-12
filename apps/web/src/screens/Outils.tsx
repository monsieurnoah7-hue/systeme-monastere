import { Suspense, lazy, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  api,
  getCachedApiResponse,
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
import { Tabs, TabsContent } from '../components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { useUndo } from '../components/UndoToast';
import {
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
  FolderArchive,
  ArrowRight,
  Clock,
  Zap,
  Edit3,
  ArrowDownToLine,
  Truck,
  Menu,
  RefreshCw,
  Search,
  X,
  LayoutGrid,
  List,
} from 'lucide-react';
import { exportToExcel, exportToPdf } from '../lib/export';
import { ImagePickerModal } from '../components/ImagePickerModal';
import { GroupedQrLabelsModal } from '../components/GroupedQrLabelsModal';
import { PrintPreviewModal } from '../components/PrintPreviewModal';
import { ToolListRow } from '../components/ToolListRow';
import { ToolBentoCard } from '../components/ToolBentoCard';
import { ToolLoanCard } from '../components/ToolLoanCard';
import { FleetView } from '../components/FleetView';
import { InventoryEditModal, type InventoryEditTarget } from '../components/InventoryEditModal';
import { ScrollableChipRail } from '../components/ScrollableChipRail';
import { StickyTableScroller } from '../components/StickyTableScroller';
import { computePortfolioAudit, computeToolAccounting, formatCurrency } from '../lib/accounting';
import { fetchFleetSummary, type FleetSummary } from '../lib/api';

const ExcelImportModal = lazy(() => import('../components/ExcelImportModal').then((module) => ({ default: module.ExcelImportModal })));

type ToolDetail = { tool: Tool; events: ToolEvent[]; loan: ToolLoan | null };
type Facets = { categories: string[]; locations: string[] };

type LabelFormat = 'compact' | 'standard';
type PaperFormat = 'A4' | 'Letter';

async function makeToolQrSheet(tools: Tool[]) {
  const ids = [...new Set(tools.map((tool) => tool.id))];
  const entries = await Promise.all(ids.map(async (id) => [id, await qrDataUrl(`${QR_PREFIX.tool}${id}`, 240)] as const));
  return Object.fromEntries(entries);
}

function ToolLabelCard({ tool, qrSrc, format }: { tool: Tool; qrSrc?: string; format: LabelFormat }) {
  const compact = format === 'compact';
  const qrSize = compact ? '17mm' : '28mm';
  return (
    <div
      className="tool-label-card flex overflow-hidden border border-gray-400 bg-white text-gray-900"
      style={{
        fontFamily: '"IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        breakInside: 'avoid',
        pageBreakInside: 'avoid',
        width: compact ? '38mm' : '63.5mm',
        height: compact ? '21mm' : '38.1mm',
        boxSizing: 'border-box',
      }}
    >
      <div
        className="flex shrink-0 items-center justify-center bg-white"
        style={{
          boxSizing: 'border-box',
          width: qrSize,
          height: '100%',
          padding: compact ? '1mm' : '2mm',
        }}
      >
        {qrSrc ? (
          <img
            src={qrSrc}
            alt={`QR ${tool.id}`}
            className="h-full w-full object-contain"
            style={{ imageRendering: '-webkit-optimize-contrast' }}
          />
        ) : (
          <div className="h-full w-full bg-gray-100" />
        )}
      </div>
      <div
        className={`flex min-w-0 flex-1 flex-col justify-center leading-tight ${
          compact ? 'py-[0.8mm] pr-[1mm]' : 'py-[2mm] pr-[2mm]'
        }`}
      >
        <div className="mb-[0.6mm] flex items-center gap-1 border-b border-gray-200 pb-[0.4mm]">
          <img
            src="/emblem.png"
            alt=""
            className={compact ? 'h-[3mm] w-[3mm] object-contain' : 'h-[4mm] w-[4mm] object-contain'}
          />
          <span className={`font-bold tracking-wide text-gray-800 ${compact ? 'text-[4.5pt]' : 'text-[6pt]'}`}>
            CFTM
          </span>
        </div>
        <p className={`truncate font-mono font-extrabold tracking-tight text-gray-950 ${compact ? 'text-[7pt]' : 'text-[9.5pt]'}`}>
          {tool.id}
        </p>
        <p className={`truncate font-semibold text-gray-800 ${compact ? 'text-[5.5pt]' : 'text-[7.5pt]'}`}>
          {tool.name}
        </p>
        <p className={`truncate text-gray-600 ${compact ? 'text-[4.5pt]' : 'text-[6pt]'}`}>
          {compact ? tool.location : `${tool.category} · ${tool.location}`}
        </p>
      </div>
    </div>
  );
}

function A4Sheet({
  tools,
  codes,
  format = 'compact',
  paper = 'A4',
}: {
  tools: Tool[];
  codes: Record<string, string>;
  format?: LabelFormat;
  paper?: PaperFormat;
}) {
  const compact = format === 'compact';
  // 60 étiquettes (5 cols × 12 lignes) en compact, 21 étiquettes (3 cols × 7 lignes) en standard
  const LABELS_PER_PAGE = compact ? 60 : 21;
  const pages: Tool[][] = [];
  for (let i = 0; i < tools.length; i += LABELS_PER_PAGE) {
    pages.push(tools.slice(i, i + LABELS_PER_PAGE));
  }
  if (pages.length === 0) pages.push([]);

  const pageWidth = compact ? '196mm' : '195.5mm';

  return (
    <div style={{ fontFamily: '"IBM Plex Sans", -apple-system, sans-serif' }}>
      <style>{`@page { size: ${paper} portrait; margin: 5mm; }`}</style>
      {pages.map((pageTools, pageIndex) => {
        const isLast = pageIndex === pages.length - 1;
        return (
          <div
            key={`tool-sheet-page-${pageIndex}`}
            className="label-sheet-page"
            style={{
              width: pageWidth,
              margin: '0 auto',
              padding: '4mm 0',
              boxSizing: 'border-box',
              breakAfter: isLast ? 'auto' : 'page',
              pageBreakAfter: isLast ? 'auto' : 'always',
            }}
          >
            {/* En-tête officiel CFTM sur chaque page */}
            <div className="flex items-center justify-between border-b border-gray-200 pb-1.5 mb-2.5">
              <div>
                <p style={{ fontSize: '10pt', fontWeight: 800, color: '#ff6603', margin: 0 }}>
                  CFTM · Bénédictins du Mont‑Fébé
                </p>
                <p style={{ fontSize: '7pt', color: '#6b7280', margin: '0.5mm 0 0' }}>
                  Planche d'étiquettes {compact ? 'compactes (38 × 21 mm)' : 'standard (63,5 × 38,1 mm)'} · Page {pageIndex + 1} / {pages.length} · {tools.length} étiquette(s) au total
                </p>
              </div>
              <img src="/emblem.png" alt="" style={{ height: '7mm', width: '7mm', objectFit: 'contain' }} />
            </div>

            <div
              className="label-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: compact ? 'repeat(5, 38mm)' : 'repeat(3, 63.5mm)',
                gap: '2mm',
                justifyContent: 'center',
                alignContent: 'start',
              }}
            >
              {pageTools.map((tool, index) => (
                <ToolLabelCard
                  key={`${tool.id}-${pageIndex}-${index}`}
                  tool={tool}
                  qrSrc={codes[tool.id]}
                  format={format}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Outils({
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

  const canCreate = hasPerm('tools.create') || (!permissions && user.role === 'magasinier');
  const canEdit = hasPerm('tools.edit') || (!permissions && user.role === 'magasinier');
  const canDelete = hasPerm('tools.delete') || (!permissions && (user.role === 'direction' || user.role === 'magasinier'));
  const canEditStatus = hasPerm('tools.edit_status') || (!permissions && user.role === 'magasinier');
  const canPhoto = hasPerm('tools.photo_edit') || (!permissions && (user.role === 'direction' || user.role === 'magasinier'));
  const canLoan = hasPerm('loans.create') || (!permissions && user.role === 'magasinier');
  const canReturn = hasPerm('loans.return') || (!permissions && user.role === 'magasinier');
  const canManage = canCreate || canEdit;
  const canViewTools = hasPerm('tools.view');
  const canViewLoans = hasPerm('loans.view');
  const initialTab: 'tools' | 'loans' | 'fleet' = canViewTools ? 'tools' : canViewLoans ? 'loans' : 'tools';

  const canViewFinancial = hasPerm('financial.view');
  const canViewReports = hasPerm('reports.view') || canViewFinancial;
  const canExportReports = hasPerm('reports.export');

  const [filters, setFilters] = useState({ q: '', status: '', category: '', location: '', magasin_id: '' });
  const cachedTools = useMemo(() => getCachedApiResponse<{ tools: Tool[]; facets: Facets }>('/api/tools')?.tools ?? [], []);
  const cachedFacets = useMemo(() => getCachedApiResponse<{ tools: Tool[]; facets: Facets }>('/api/tools')?.facets ?? { categories: [], locations: [] }, []);
  const cachedMags = useMemo(() => getCachedApiResponse<{ magasins: Magasin[] }>('/api/magasins')?.magasins ?? [], []);
  const [tools, setTools] = useState<Tool[]>(cachedTools);
  const [facets, setFacets] = useState<Facets>(cachedFacets);
  const [magasins, setMagasins] = useState<Magasin[]>(cachedMags);
  const [loading, setLoading] = useState(() => cachedTools.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('mf_tools_view_mode');
      if (saved === 'table' || saved === 'cards') return saved;
    }
    return 'cards';
  });

  useEffect(() => {
    try {
      localStorage.setItem('mf_tools_view_mode', viewMode);
    } catch {}
  }, [viewMode]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ToolDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [newOpen, setNewOpen] = useState(false);
  const [inventoryEditTarget, setInventoryEditTarget] = useState<InventoryEditTarget | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'tools' | 'loans' | 'fleet'>(initialTab);

  useEffect(() => {
    const subLabel = activeTab === 'loans' ? 'Prêts en cours' : activeTab === 'fleet' ? 'Flotte & Groupes' : 'Matériel & Outils';
    window.dispatchEvent(new CustomEvent('subview-changed', { detail: { view: 'outils', subSection: subLabel } }));
  }, [activeTab]);
  const [fleetSummary, setFleetSummary] = useState<FleetSummary | null>(null);
  const [activeLoans, setActiveLoans] = useState<ToolLoan[]>([]);
  const [loansSearch, setLoansSearch] = useState('');

  const loadFleet = useCallback(() => {
    if (canViewTools) fetchFleetSummary().then(setFleetSummary).catch(() => {});
  }, [canViewTools]);

  useEffect(() => {
    if (!canViewTools && !canViewLoans) return;
    if (activeTab === 'tools' && !canViewTools) setActiveTab('loans');
    else if (activeTab === 'loans' && !canViewLoans) setActiveTab('tools');
    else if (activeTab === 'fleet' && !canViewTools) setActiveTab(canViewLoans ? 'loans' : 'tools');
  }, [activeTab, canViewTools, canViewLoans]);

  useEffect(() => {
    loadFleet();
  }, [loadFleet, reload]);

  // Reference Quick Movement Hub modal
  const [movementTool, setMovementTool] = useState<Tool | null>(null);
  const [movementForm, setMovementForm] = useState<{
    type: 'in' | 'out' | 'transfer' | 'adjust';
    qty: number;
    magasin_id?: string;
    note: string;
    doc_ref: string;
  }>({
    type: 'in',
    qty: 1,
    magasin_id: '',
    note: '',
    doc_ref: '',
  });

  // Edit Active Loan modal
  const [editLoanFor, setEditLoanFor] = useState<ToolLoan | null>(null);
  const [editLoanForm, setEditLoanForm] = useState<{ qty: number; motive: string }>({
    qty: 1,
    motive: '',
  });

  const [newForm, setNewForm] = useState({
    name: '',
    category: 'Divers',
    location: '',
    magasin_id: '',
    total_qty: '1',
    observations: '',
    brand: '',
    model: '',
    serial_number: '',
    acquisition_cost: '',
    acquisition_year: '',
    lifespan_years: '',
    photo_path: null as string | null,
  });
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [photoTarget, setPhotoTarget] = useState<{ id?: string; current?: string | null; name?: string } | null>(null);
  const [loanFor, setLoanFor] = useState<Tool | null>(null);
  const [loanForm, setLoanForm] = useState({
    employeeId: '',
    motive: '',
    qty: 1,
    outCondition: 'bon' as 'bon' | 'passable' | 'usure_normale',
  });
  const [returnFor, setReturnFor] = useState<ToolLoan | null>(null);
  const [returnForm, setReturnForm] = useState<{
    condition: ToolCondition | 'lame_a_affuter' | 'endommage';
    observations: string;
    qty: number;
  }>({
    condition: 'bon',
    observations: '',
    qty: 1,
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
  const [printCopies, setPrintCopies] = useState<Record<string, number>>({});
  const [labelFormat, setLabelFormat] = useState<LabelFormat>('compact');
  const [paperFormat, setPaperFormat] = useState<PaperFormat>('A4');
  const [printPreparing, setPrintPreparing] = useState(false);
  const [toolPreviewOpen, setToolPreviewOpen] = useState(false);
  const [toolPreviewContent, setToolPreviewContent] = useState<ReactNode>(null);
  const [toolPreviewCount, setToolPreviewCount] = useState(0);
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
    if (!canViewTools) {
      setTools([]);
      setLoading(false);
      return () => { cancelled = true; };
    }
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
  }, [filters, reload, tools.length, canViewTools]);

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

  const refresh = useCallback(() => {
    setLoading(true);
    setReload((value) => value + 1);
  }, []);

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
    let cancelled = false;
    if (!canViewLoans) {
      setActiveLoans([]);
      return () => { cancelled = true; };
    }
    api<{ loans: ToolLoan[] }>('/api/loans?status=out')
      .then((res) => {
        if (!cancelled) setActiveLoans(res.loans || []);
      })
      .catch(() => {
        if (!cancelled) setActiveLoans([]);
      });
    return () => {
      cancelled = true;
    };
  }, [reload, canViewLoans]);

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

  const filteredActiveLoans = useMemo(() => {
    if (!loansSearch.trim()) return activeLoans;
    const q = loansSearch.toLowerCase().trim();
    return activeLoans.filter(
      (l) =>
        l.tool_id.toLowerCase().includes(q) ||
        (l.tool_name && l.tool_name.toLowerCase().includes(q)) ||
        (l.employee_name && l.employee_name.toLowerCase().includes(q)) ||
        (l.motive && l.motive.toLowerCase().includes(q)),
    );
  }, [activeLoans, loansSearch]);

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
          location: newForm.location.trim() || 'Magasin',
          magasin_id: newForm.magasin_id || undefined,
          total_qty: newForm.total_qty ? Math.max(1, parseInt(newForm.total_qty, 10)) : 1,
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
        location: '',
        magasin_id: '',
        total_qty: '1',
        observations: '',
        brand: '',
        model: '',
        serial_number: '',
        acquisition_cost: '',
        acquisition_year: '',
        lifespan_years: '',
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
      const res = await api<{ ok: boolean; message: string; deleted?: Tool }>(`/api/tools/${tool.id}`, {
        method: 'DELETE',
      });
      setDeleteSingleTool(null);
      if (selectedId === tool.id) setSelectedId(null);
      refresh();

      // Enregistrer l'action d'annulation Ctrl+Z (Adobe / Google UX)
      registerUndo({
        title: `Outil "${tool.name}" (${tool.id}) supprimé`,
        details: 'Appuyez sur Ctrl+Z ou cliquez pour restaurer immédiatement.',
        onUndo: async () => {
          await api('/api/tools/restore', {
            method: 'POST',
            body: JSON.stringify({ tool: res.deleted ?? tool }),
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
        body: JSON.stringify({
          toolId: loanFor.id,
          employeeId: loanForm.employeeId,
          motive: loanForm.motive,
          qty: loanForm.qty || 1,
          outCondition: loanForm.outCondition,
        }),
      });
      toast(`Prêt de ${loanForm.qty || 1} unité(s) validé pour ${loanFor.name} (${loanFor.id}).`, 'success');
      setLoanFor(null);
      setLoanForm({ employeeId: '', motive: '', qty: 1, outCondition: 'bon' });
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
      const res = await api<{ ok: boolean; returnQty: number; isFullReturn: boolean; remaining: number }>(`/api/loans/${returnFor.id}/return`, {
        method: 'POST',
        body: JSON.stringify({
          condition: returnForm.condition,
          observations: returnForm.observations || undefined,
          qty: returnForm.qty,
        }),
      });
      toast(
        res.isFullReturn
          ? 'Retour complet validé.'
          : `Retour partiel de ${res.returnQty} unité(s) validé (reste ${res.remaining} en prêt).`,
        'success',
      );
      setReturnFor(null);
      setReturnForm({ condition: 'bon', observations: '', qty: 1 });
      refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Retour refusé.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function saveEditLoan() {
    if (!editLoanFor) return;
    setBusy(true);
    try {
      await api(`/api/loans/${editLoanFor.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          qty: editLoanForm.qty,
          motive: editLoanForm.motive,
        }),
      });
      toast(`Prêt #${editLoanFor.id} réajusté à ${editLoanForm.qty} unité(s).`, 'success');
      setEditLoanFor(null);
      refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Ajustement impossible.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function submitToolMovement() {
    if (!movementTool) return;
    setBusy(true);
    try {
      await api(`/api/tools/${movementTool.id}/movement`, {
        method: 'POST',
        body: JSON.stringify(movementForm),
      });
      toast(`Mouvement enregistré pour ${movementTool.name}.`, 'success');
      setMovementTool(null);
      refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erreur lors du mouvement.', 'error');
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
      <PageHeader
        title="Parc Matériel & Machines"
      />

      {error ? (
        <div className="mb-4">
          <Banner tone="error">{error}</Banner>
        </div>
      ) : null}

      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as typeof activeTab)} className="w-full space-y-4">
        {/* Navigation Bar Strictement 2 Lignes (Standard Apple / Google / YouTube) */}
        <div data-tools-sticky-toolbar="true" className="sticky top-0 lg:top-11 z-20 -mx-3 sm:-mx-6 lg:-mx-8 px-3 sm:px-6 lg:px-8 py-2 bg-paper/98 border-b border-line backdrop-blur-md shadow-xs">
          <div className="flex flex-col gap-1.5">
            {/* LIGNE 1 : Barre d'action unique (Titre + Recherche + CTA Primaire + Options) */}
            <div className="flex items-center justify-between gap-2">
              {/* Titre & Compteur */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-wash border border-amber/30 text-amber shrink-0 shadow-2xs">
                  <IconWrench size={18} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h1 className="text-sm sm:text-base font-bold text-ink truncate tracking-tight">
                      <span className="hidden sm:inline">
                        {activeTab === 'tools' ? 'Machines & Outils' : activeTab === 'loans' ? 'Prêts d’Outils' : 'Flotte & Groupes'}
                      </span>
                      <span className="sm:hidden">
                        {activeTab === 'tools' ? 'Machines' : activeTab === 'loans' ? 'Prêts' : 'Flotte'}
                      </span>
                    </h1>
                    <span className="rounded-full bg-paper-2 border border-line px-2 py-0.5 text-xs font-bold font-mono text-amber tabular-nums">
                      {activeTab === 'tools' ? tools.length : activeTab === 'loans' ? activeLoans.length : fleetSummary ? (fleetSummary.vehicles_count + fleetSummary.generators_count) : 0}
                    </span>
                  </div>
                </div>
              </div>

              {/* Recherche intégrée au centre */}
              <div className="flex-1 min-w-[110px] sm:min-w-[160px] max-w-xs sm:max-w-md relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
                {activeTab === 'tools' ? (
                  <>
                    <input
                      value={filters.q}
                      onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                      placeholder="Rechercher machine, marque, QR..."
                      className="h-9 w-full rounded-xl border border-line bg-surface/90 pl-8 pr-7 text-xs sm:text-sm text-ink placeholder:text-ink-faint focus:border-amber focus:outline-none transition-all shadow-2xs"
                    />
                    {filters.q && (
                      <button
                        onClick={() => setFilters((f) => ({ ...f, q: '' }))}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink p-1 rounded-md"
                        title="Effacer"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </>
                ) : activeTab === 'loans' ? (
                  <>
                    <input
                      value={loansSearch}
                      onChange={(e) => setLoansSearch(e.target.value)}
                      placeholder="Rechercher emprunteur, outil..."
                      className="h-9 w-full rounded-xl border border-line bg-surface/90 pl-8 pr-7 text-xs sm:text-sm text-ink placeholder:text-ink-faint focus:border-amber focus:outline-none transition-all shadow-2xs"
                    />
                    {loansSearch && (
                      <button
                        onClick={() => setLoansSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink p-1 rounded-md"
                        title="Effacer"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </>
                ) : (
                  <div className="hidden sm:block text-xs text-ink-faint italic truncate">
                    Supervision globale de la flotte et groupes électrogènes
                  </div>
                )}
              </div>

              {/* Actions de droite : CTA Primaire + Menu Contextuel */}
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="hidden lg:inline-flex">
                  <GroupedQrLabelsModal canViewTools={canViewTools} canViewStock={hasPerm('stock.view')} />
                </div>

                {activeTab === 'tools' && canManage && (
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<IconPlus size={15} />}
                    onClick={() => setNewOpen(true)}
                    className="h-9 px-2.5 sm:px-3.5 text-xs sm:text-sm font-bold shadow-xs shrink-0"
                    title="Ajouter un nouvel outil ou machine"
                  >
                    <span className="hidden sm:inline">Nouvelle machine</span>
                    <span className="sm:hidden">Outil</span>
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
                  <DropdownMenuContent align="end" className="w-56 p-1.5 rounded-xl border border-line bg-surface shadow-pop text-xs z-50">
                    <DropdownMenuLabel className="px-2.5 py-1.5 text-xs font-semibold text-ink-faint uppercase tracking-wider">
                      Actions &amp; Outils
                    </DropdownMenuLabel>

                    <DropdownMenuItem
                      onClick={refresh}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-paper-2 text-ink"
                    >
                      <RefreshCw size={14} className={cx(loading && 'animate-spin text-amber')} />
                      <span>Actualiser les données</span>
                    </DropdownMenuItem>

                    {activeTab === 'tools' && (
                      <DropdownMenuItem
                        onClick={() => setViewMode(viewMode === 'table' ? 'cards' : 'table')}
                        className="flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-paper-2 text-ink"
                      >
                        <div className="flex items-center gap-2">
                          {viewMode === 'table' ? <LayoutGrid size={14} className="text-amber" /> : <List size={14} className="text-amber" />}
                          <span>Mode {viewMode === 'table' ? 'Cartes Bento' : 'Tableur'}</span>
                        </div>
                      </DropdownMenuItem>
                    )}

                    <DropdownMenuItem
                      onClick={() => {
                        setPrintPick(Object.fromEntries(tools.map((tool) => [tool.id, false])));
                        setPrintOpen(true);
                      }}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-paper-2 text-ink"
                    >
                      <IconPrinter size={14} className="text-amber" />
                      <span>Planche A4 QR Codes</span>
                    </DropdownMenuItem>

                    {canExportReports && (
                      <>
                        <DropdownMenuSeparator className="my-1 border-line" />
                        <DropdownMenuItem
                          onClick={handleExportExcel}
                          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-paper-2 text-ink"
                        >
                          <Download size={14} className="text-emerald-500" />
                          <span>Exporter en Excel (.xlsx)</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={handleExportPdf}
                          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-paper-2 text-ink"
                        >
                          <Printer size={14} className="text-blue-500" />
                          <span>Imprimer Registre Officiel (PDF)</span>
                        </DropdownMenuItem>
                      </>
                    )}

                    {canManage && (
                      <DropdownMenuItem
                        onClick={() => setImportOpen(true)}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-paper-2 text-ink"
                      >
                        <FileSpreadsheet size={14} className="text-emerald-500" />
                        <span>Importer Tableur (Excel/CSV)</span>
                      </DropdownMenuItem>
                    )}

                    {canManage && tools.length > 0 && (
                      <>
                        <DropdownMenuSeparator className="my-1 border-line" />
                        <DropdownMenuItem
                          onClick={() => {
                            setDeleteAllConfirmText('');
                            setDeleteAllOpen(true);
                          }}
                          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-red-wash hover:text-red text-red-500"
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
            <ScrollableChipRail className="border-t border-line/40 pt-1 text-xs">
              {/* Onglets Principaux de Vue */}
              {canViewTools && (
                <button
                  type="button"
                  onClick={() => setActiveTab('tools')}
                  className={cx(
                    'h-8 px-3 rounded-full text-xs font-semibold shrink-0 transition-all flex items-center gap-1.5 border shadow-2xs',
                    activeTab === 'tools'
                      ? 'bg-amber text-white border-amber shadow-xs font-bold'
                      : 'bg-surface text-ink-soft border-line hover:border-ink-faint hover:text-ink',
                  )}
                >
                  <IconWrench size={14} />
                  <span>Matériel</span>
                  <span className={cx('text-xs tabular-nums font-mono font-bold px-1.5 py-0.2 rounded-full', activeTab === 'tools' ? 'bg-white/20 text-white' : 'bg-paper text-ink-faint')}>
                    {tools.length}
                  </span>
                </button>
              )}

              {canViewLoans && (
                <button
                  type="button"
                  onClick={() => setActiveTab('loans')}
                  className={cx(
                    'h-8 px-3 rounded-full text-xs font-semibold shrink-0 transition-all flex items-center gap-1.5 border shadow-2xs',
                    activeTab === 'loans'
                      ? 'bg-amber text-white border-amber shadow-xs font-bold'
                      : 'bg-surface text-ink-soft border-line hover:border-ink-faint hover:text-ink',
                  )}
                >
                  <Clock size={14} />
                  <span>Prêts</span>
                  {activeLoans.length > 0 && (
                    <span className={cx('text-xs tabular-nums font-mono font-bold px-1.5 py-0.2 rounded-full', activeTab === 'loans' ? 'bg-white/20 text-white' : 'bg-amber-wash text-amber')}>
                      {activeLoans.length}
                    </span>
                  )}
                </button>
              )}

              {canViewTools && (
                <button
                  type="button"
                  onClick={() => setActiveTab('fleet')}
                  className={cx(
                    'h-8 px-3 rounded-full text-xs font-semibold shrink-0 transition-all flex items-center gap-1.5 border shadow-2xs',
                    activeTab === 'fleet'
                      ? 'bg-amber text-white border-amber shadow-xs font-bold'
                      : 'bg-surface text-ink-soft border-line hover:border-ink-faint hover:text-ink',
                  )}
                >
                  <Truck size={14} />
                  <span>Flotte</span>
                  {fleetSummary && fleetSummary.alerts.total_urgent > 0 ? (
                    <span className="ml-1 rounded-full bg-red-500 text-white px-1.5 py-0.2 text-[10px] font-extrabold animate-pulse">
                      {fleetSummary.alerts.total_urgent}
                    </span>
                  ) : fleetSummary ? (
                    <span className={cx('text-xs tabular-nums font-mono font-bold px-1.5 py-0.2 rounded-full', activeTab === 'fleet' ? 'bg-white/20 text-white' : 'bg-paper text-ink-faint')}>
                      {fleetSummary.vehicles_count + fleetSummary.generators_count}
                    </span>
                  ) : null}
                </button>
              )}

              {activeTab === 'tools' && (
                <>
                  <span className="h-4 w-px bg-line shrink-0 mx-0.5" />

                  {/* Scope Chips */}
                  {[
                    { id: 'all', label: 'Tout le parc', count: tools.length },
                    { id: 'active', label: 'Magasins', count: activeTools.length },
                    ...(draftTools.length > 0 ? [{ id: 'drafts', label: 'À affecter', count: draftTools.length }] : []),
                  ].map((sc) => (
                    <button
                      key={sc.id}
                      type="button"
                      onClick={() => {
                        setScopeFilter(sc.id as any);
                        setSelectedToolIds(new Set());
                      }}
                      className={cx(
                        'h-8 px-3 rounded-full text-xs font-semibold shrink-0 transition-all flex items-center gap-1.5 border shadow-2xs',
                        scopeFilter === sc.id
                          ? 'bg-paper-2 text-ink border-amber shadow-xs font-bold'
                          : 'bg-surface text-ink-soft border-line hover:border-ink-faint hover:text-ink',
                      )}
                    >
                      <span>{sc.label}</span>
                      <span className={cx('text-xs tabular-nums font-mono font-bold px-1.5 py-0.2 rounded-full', scopeFilter === sc.id ? 'bg-white/20 text-white' : 'bg-paper text-ink-faint')}>{sc.count}</span>
                    </button>
                  ))}

                  <span className="h-4 w-px bg-line shrink-0 mx-0.5" />

                  {/* Status Chips */}
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
                      type="button"
                      onClick={() => setFilters((f) => ({ ...f, status: key }))}
                      className={cx(
                        'h-8 px-3 rounded-full text-xs font-semibold shrink-0 transition-all flex items-center gap-1.5 border shadow-2xs',
                        filters.status === key
                          ? 'bg-amber text-white border-amber shadow-xs font-bold'
                          : 'bg-surface text-ink-soft border-line hover:border-ink-faint hover:text-ink',
                      )}
                    >
                      <span>{label}</span>
                      <span className={cx('text-xs tabular-nums font-mono font-bold px-1.5 py-0.2 rounded-full', filters.status === key ? 'bg-white/20 text-white' : 'bg-paper text-ink-faint')}>{count}</span>
                    </button>
                  ))}

                  {/* Sélecteur Catégorie en puce */}
                  {facets.categories.length > 0 && (
                    <select
                      value={filters.category}
                      onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
                      className="h-8 rounded-full border border-line bg-surface px-3 text-xs font-semibold text-ink focus:border-amber focus:outline-none shadow-2xs shrink-0 max-w-[160px] truncate"
                      title="Filtrer par catégorie"
                    >
                      <option value="">Toutes catégories ({facets.categories.length})</option>
                      {facets.categories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  )}

                  {/* Sélecteur Magasin en puce */}
                  {magasins.length > 0 && (
                    <select
                      value={filters.magasin_id}
                      onChange={(e) => setFilters((f) => ({ ...f, magasin_id: e.target.value }))}
                      className="h-8 rounded-full border border-line bg-surface px-3 text-xs font-semibold text-ink focus:border-amber focus:outline-none shadow-2xs shrink-0 max-w-[160px] truncate"
                      title="Filtrer par magasin"
                    >
                      <option value="">Tous magasins ({magasins.length})</option>
                      {magasins.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  )}
                </>
              )}
            </ScrollableChipRail>
          </div>
        </div>

        {/* Tab 3: Flotte & Groupes */}
        {canViewTools && <TabsContent value="fleet" className="space-y-4">
          <FleetView
            summary={fleetSummary}
            canManage={canManage}
            onRefresh={() => {
              loadFleet();
              setReload((v) => v + 1);
            }}
          />
        </TabsContent>}

        {/* Tab 2: Prêts & Sorties en cours */}
        {canViewLoans && <TabsContent value="loans" className="space-y-3">
          {/* Active Loans Search & Overview */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-xl border border-line bg-surface shadow-xs">
            <div className="relative w-full sm:max-w-md">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">
                <IconSearch size={16} />
              </span>
              <input
                value={loansSearch}
                onChange={(e) => setLoansSearch(e.target.value)}
                placeholder="Rechercher emprunteur, outil, code ou chantier..."
                className="h-10 w-full rounded-lg border border-line bg-paper pl-9 pr-3 text-xs sm:text-sm focus:border-amber focus:bg-surface focus:outline-none transition-all"
              />
            </div>

            <div className="text-xs font-semibold text-ink-soft self-end sm:self-auto">
              <span>{filteredActiveLoans.length} prêt{filteredActiveLoans.length > 1 ? 's' : ''} actif{filteredActiveLoans.length > 1 ? 's' : ''} sur les chantiers</span>
            </div>
          </div>

          {filteredActiveLoans.length === 0 ? (
            <EmptyState
              title="Aucun prêt d’outil en cours"
              hint="Tous les outils et matériels sont actuellement disponibles dans leurs magasins et dépôts respectifs."
            />
          ) : (
            <>
              {/* Desktop Loans Table */}
              <StickyTableScroller
                stickyBelow="[data-tools-sticky-toolbar]"
                className="hidden lg:block"
                tableClassName="min-h-[380px]"
              >
                  <table className="w-full text-left border-separate border-spacing-0 text-xs table-rhythm">
                  <thead>
                    <tr className="bg-paper-2 text-ink-faint font-semibold uppercase tracking-wider text-[11px]">
                      <th className="sticky top-0 left-0 z-30 bg-paper-2 px-3 py-2.5 w-28 min-w-28 max-w-28 border-b border-r border-line">Réf. Outil</th>
                      <th className="sticky top-0 left-[112px] z-30 bg-paper-2 px-3 py-2.5 min-w-44 border-b freeze-pane-divider">Désignation Matériel</th>
                      <th className="sticky top-0 z-20 bg-paper-2 px-3 py-2.5 min-w-36 border-b border-r border-line">Travailleur Emprunteur</th>
                      <th className="sticky top-0 z-20 bg-paper-2 px-3 py-2.5 min-w-28 border-b border-r border-line text-center">Quantité Prêtée</th>
                      <th className="sticky top-0 z-20 bg-paper-2 px-3 py-2.5 min-w-32 border-b border-r border-line">Date de Sortie</th>
                      <th className="sticky top-0 z-20 bg-paper-2 px-3 py-2.5 min-w-44 border-b border-r border-line">Motif / Chantier</th>
                      <th className="sticky top-0 z-20 bg-paper-2 px-3 py-2.5 min-w-24 border-b border-r border-line text-center">État Sortie</th>
                      <th className="sticky top-0 z-20 bg-paper-2 px-3 py-2.5 min-w-44 text-right border-b border-line col-actions whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredActiveLoans.map((loan, idx) => {
                      const frozenLoanBg = idx % 2 === 0 ? 'bg-[#12151c] group-hover:bg-[#201c18]' : 'bg-[#181d28] group-hover:bg-[#25201c]';
                      return (
                      <tr
                        key={loan.id}
                        className={cx(
                          'transition-colors group',
                          idx % 2 === 0 ? 'bg-surface/95' : 'bg-surface-2/45',
                          'hover:bg-amber-wash/20',
                        )}
                      >
                        <td className={cx('sticky left-0 z-10 px-3 py-2 font-mono font-bold text-amber border-b border-r border-line w-28 min-w-28 max-w-28', frozenLoanBg)}>
                          <div className="flex items-center gap-1.5">
                            <IconQr size={13} className="text-ink-faint shrink-0" />
                            <span>{loan.tool_id}</span>
                          </div>
                        </td>
                        <td className={cx('sticky left-[112px] z-10 px-3 py-2 font-medium text-ink border-b freeze-pane-divider min-w-44', frozenLoanBg)}>
                          <span className="font-semibold">{loan.tool_name ?? 'Matériel'}</span>
                          {loan.tool_category ? (
                            <span className="block text-[10px] text-ink-faint">{loan.tool_category}</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 font-medium text-ink border-b border-r border-line">
                          <span className="font-semibold">{loan.employee_name ?? loan.full_name ?? '—'}</span>
                        </td>
                        <td className="px-3 py-2 text-center border-b border-r border-line">
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-wash border border-amber/30 px-2.5 py-0.5 text-xs font-bold text-amber tabular-nums">
                            {loan.qty ?? 1} unité{(loan.qty ?? 1) > 1 ? 's' : ''}
                          </span>
                          {(loan.returned_qty ?? 0) > 0 && (
                            <span className="block text-[10px] text-ink-faint">
                              ({loan.returned_qty} retourné{(loan.returned_qty ?? 0) > 1 ? 's' : ''})
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-ink-soft border-b border-r border-line font-mono text-[11px] tabular-nums">
                          {formatDateTime(loan.out_at)}
                        </td>
                        <td className="px-3 py-2 text-ink border-b border-r border-line">
                          <span className="font-medium">{loan.motive}</span>
                        </td>
                        <td className="px-3 py-2 text-center border-b border-r border-line">
                          <span className="inline-block rounded bg-paper px-2 py-0.5 text-[10px] font-medium text-ink-soft border border-line">
                            {loan.out_condition ?? 'bon'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right border-b border-line">
                          <div className="flex items-center justify-end gap-1.5">
                            {canManage && (
                              <button
                                onClick={() => {
                                  setEditLoanFor(loan);
                                  setEditLoanForm({
                                    qty: loan.qty ?? 1,
                                    motive: loan.motive ?? '',
                                  });
                                }}
                                className="rounded border border-line bg-paper px-2 py-1 text-[11px] font-medium text-ink-soft hover:bg-paper-2 hover:text-amber active:scale-95 transition-all flex items-center gap-1"
                                title="Ajuster la quantité prêtée ou le motif"
                              >
                                <Edit3 size={11} />
                                <span>Ajuster</span>
                              </button>
                            )}
                            {canReturn && (
                              <button
                                onClick={() => {
                                  setReturnFor(loan);
                                  setReturnForm({
                                    condition: 'bon',
                                    observations: '',
                                    qty: loan.remaining_qty ?? loan.qty ?? 1,
                                  });
                                }}
                                className="rounded bg-amber px-2.5 py-1 text-[11px] font-semibold text-white shadow-xs hover:bg-amber-2 active:scale-95 transition-all flex items-center gap-1"
                              >
                                <ArrowDownToLine size={11} />
                                <span>Retour</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  </tbody>
                  </table>
                </StickyTableScroller>

            {/* Mobile & Tablet Loans Cards View */}
            <div className="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredActiveLoans.map((loan) => (
                <ToolLoanCard
                  key={loan.id}
                  loan={loan}
                  canReturn={canReturn}
                  onReturn={() => {
                    setReturnFor(loan);
                    setReturnForm({
                      condition: 'bon',
                      observations: '',
                      qty: loan.remaining_qty ?? loan.qty ?? 1,
                    });
                  }}
                />
              ))}
            </div>
          </>
          )}
        </TabsContent>}

        {/* Tab 1: Matériel & Machines */}
        {canViewTools && <TabsContent value="tools" className="space-y-3">
          {/* Alerte brouillons d'outils si existants */}
          {draftTools.length > 0 && scopeFilter !== 'drafts' && (
            <div className="flex items-center justify-between p-2.5 rounded-xl border border-amber/30 bg-amber-wash/30 text-xs">
              <span className="text-ink font-medium">⚠️ {draftTools.length} outil{draftTools.length > 1 ? 's' : ''} en brouillon sans affectation</span>
              <button
                onClick={() => {
                  setScopeFilter('drafts');
                  setSelectedToolIds(new Set());
                }}
                className="font-bold text-amber hover:underline flex items-center gap-1"
              >
                <span>Voir les brouillons</span>
                <ArrowRight size={13} />
              </button>
            </div>
          )}

          {/* Mini-Bandeau Synthèse Mobile (libère l'écran pour afficher directement les machines sur smartphone !) */}
          <div className="sm:hidden flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-surface border border-line text-xs shadow-2xs">
            <div className="flex items-center gap-2 text-ink-soft flex-wrap">
              <span className="font-semibold text-green">{stats.disponible} dispo</span>
              <span className="text-line-strong">·</span>
              <span className="font-semibold text-amber">{stats.en_pret} en prêt</span>
              <span className="text-line-strong">·</span>
              <span className="font-semibold text-amber-500">{stats.maintenance} révis.</span>
              {(stats.manquant + stats.reforme) > 0 && (
                <>
                  <span className="text-line-strong">·</span>
                  <span className="font-semibold text-red">{stats.manquant + stats.reforme} écart</span>
                </>
              )}
            </div>
            {canViewReports && auditSummary.totalVnc > 0 && (
              <span className="font-mono font-bold text-green text-xs truncate max-w-[120px] ml-1">
                {formatCurrency(auditSummary.totalVnc)}
              </span>
            )}
          </div>

          {/* KPI Dashboard Cards (Affichés sur Tablette & Desktop) */}
          <div className="hidden sm:grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div className="rounded-xl border border-line bg-surface p-3.5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-faint">Total Parc</span>
                <span className="h-1.5 w-1.5 rounded-full bg-ink-faint" />
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-ink tabular-nums">{stats.total}</span>
                <span className="text-xs text-ink-faint">unités</span>
              </div>
            </div>

            <div className="rounded-xl border border-line bg-surface p-3.5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-faint">Disponibles</span>
                <span className="h-1.5 w-1.5 rounded-full bg-green" />
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-ink tabular-nums">{stats.disponible}</span>
                <span className="text-xs text-ink-faint">en rayon</span>
              </div>
            </div>

            <div className="rounded-xl border border-line bg-surface p-3.5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-faint">En Prêt</span>
                <span className="h-1.5 w-1.5 rounded-full bg-amber" />
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-ink tabular-nums">{stats.en_pret}</span>
                <span className="text-xs text-ink-faint">sur chantier</span>
              </div>
            </div>

            <div className="rounded-xl border border-line bg-surface p-3.5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-faint">Maintenance</span>
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-ink tabular-nums">{stats.maintenance}</span>
                <span className="text-xs text-ink-faint">à réparer</span>
              </div>
            </div>

            <div className="rounded-xl border border-line bg-surface p-3.5 shadow-xs col-span-2 sm:col-span-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-faint">Manquants</span>
                <span className="h-1.5 w-1.5 rounded-full bg-red" />
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-ink tabular-nums">{stats.manquant + stats.reforme}</span>
                <span className="text-xs text-ink-faint">perdus/rebut</span>
              </div>
            </div>
          </div>

      {/* Bandeau d'Amortissement Intelligent & Valorisation Patrimoniale */}
      {canViewReports && (
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
            {canExportReports && (
              <Button
                size="sm"
                variant="secondary"
                className="border-amber/30 bg-amber-wash/30 text-amber hover:bg-amber-wash hover:border-amber/50"
                icon={<FileSpreadsheet size={15} />}
                onClick={handleExportAuditReport}
              >
                Rapport d’Audit Patrimonial
              </Button>
            )}
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
      )}

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
      ) : viewMode === 'table' ? (
        <>
          {/* Tableur Google Sheets Style */}
          <StickyTableScroller
            stickyBelow="[data-tools-sticky-toolbar]"
            className="hidden lg:block"
            tableClassName="min-h-[460px]"
          >
              <table className="w-full text-left border-separate border-spacing-0 text-xs table-rhythm">
                <thead>
                  <tr className="bg-paper-2 text-ink-faint font-semibold uppercase tracking-wider text-[11px]">
                    {canManage && (
                      <th className="sticky top-0 left-0 z-30 bg-paper-2 px-2.5 py-2.5 w-10 min-w-10 max-w-10 text-center border-b border-r border-line">
                        <input
                          type="checkbox"
                          checked={displayedTools.length > 0 && selectedToolIds.size === displayedTools.length}
                          onChange={() => toggleSelectAll(displayedTools)}
                          className="h-4 w-4 rounded accent-amber cursor-pointer"
                          title="Tout sélectionner / désélectionner"
                        />
                      </th>
                    )}
                    <th className={cx(
                      'sticky top-0 z-30 bg-paper-2 px-1.5 py-2.5 w-16 min-w-16 max-w-16 border-b border-r border-line text-center whitespace-nowrap',
                      canManage ? 'left-[40px]' : 'left-0',
                    )}>
                      Photo
                    </th>
                    <th className={cx(
                      'sticky top-0 z-30 bg-paper-2 px-3 py-2.5 w-36 min-w-36 max-w-36 border-b border-r border-line',
                      canManage ? 'left-[104px]' : 'left-[64px]',
                    )}>
                      Réf / Code QR
                    </th>
                    <th className={cx(
                      'sticky top-0 z-30 bg-paper-2 px-3 py-2.5 min-w-64 border-b freeze-pane-divider',
                      canManage ? 'left-[248px]' : 'left-[208px]',
                    )}>
                      Désignation &amp; Marque
                    </th>
                    <th className="sticky top-0 z-20 bg-paper-2 px-3 py-2.5 min-w-28 border-b border-r border-line whitespace-nowrap">Catégorie</th>
                    <th className="sticky top-0 z-20 bg-paper-2 px-3 py-2.5 min-w-36 border-b border-r border-line whitespace-nowrap">Emplacement / Magasin</th>
                    <th className="sticky top-0 z-20 bg-paper-2 px-3 py-2.5 min-w-28 border-b border-r border-line text-center whitespace-nowrap">Stock &amp; Dispo</th>
                    {canViewFinancial && <th className="sticky top-0 z-20 bg-paper-2 px-3 py-2.5 min-w-24 border-b border-r border-line text-right whitespace-nowrap">VNC Nette</th>}
                    <th className="sticky top-0 z-20 bg-paper-2 px-3 py-2.5 min-w-24 border-b border-r border-line text-center whitespace-nowrap">État</th>
                    <th className="sticky top-0 z-20 bg-paper-2 px-3 py-2.5 min-w-28 border-b border-r border-line text-center whitespace-nowrap">Statut</th>
                    <th className="sticky top-0 z-20 bg-paper-2 px-3 py-2.5 min-w-44 text-right border-b border-line col-actions whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedTools.map((tool, idx) => {
                    const acc = computeToolAccounting(tool);
                    const isSelected = selectedToolIds.has(tool.id);
                    const frozenBg = isSelected
                      ? 'bg-[#2a2216] group-hover:bg-[#342a1b]'
                      : idx % 2 === 0
                      ? 'bg-[#12151c] group-hover:bg-[#201c18]'
                      : 'bg-[#181d28] group-hover:bg-[#25201c]';

                    return (
                      <tr
                        key={tool.id}
                        onClick={() => setSelectedId(tool.id)}
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
                        {canManage && (
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
                              onChange={() => toggleSelect(tool.id)}
                              className="h-4 w-4 rounded accent-amber cursor-pointer"
                            />
                          </td>
                        )}

                        {/* Photo Thumbnail */}
                        <td
                          className={cx(
                            'sticky z-10 px-1.5 py-1.5 text-center border-b border-r border-line w-16 min-w-16 max-w-16',
                            canManage ? 'left-[40px]' : 'left-0',
                            frozenBg,
                          )}
                          onClick={(e) => {
                            if (canPhoto) {
                              e.stopPropagation();
                              setPhotoTarget({ id: tool.id, current: tool.photo_path, name: tool.name });
                              setPhotoModalOpen(true);
                            }
                          }}
                        >
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

                        {/* ID Code QR */}
                        <td
                          className={cx(
                            'sticky z-10 px-3 py-2 font-mono font-bold text-amber border-b border-r border-line w-36 min-w-36 max-w-36',
                            canManage ? 'left-[104px]' : 'left-[64px]',
                            frozenBg,
                          )}
                        >
                          <div className="flex items-center gap-1.5">
                            <IconQr size={13} className="text-ink-faint shrink-0" />
                            <span>{tool.id}</span>
                          </div>
                        </td>

                        {/* Designation & Marque */}
                        <td
                          className={cx(
                            'sticky z-10 px-3 py-2 font-medium text-ink border-b freeze-pane-divider min-w-64',
                            canManage ? 'left-[248px]' : 'left-[208px]',
                            frozenBg,
                          )}
                        >
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
                        <td className="px-3 py-2 text-ink-soft border-b border-r border-line">
                          <span className="inline-block rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium border border-line text-ink-soft">
                            {tool.category}
                          </span>
                        </td>

                        {/* Magasin & Location */}
                        <td className="px-3 py-2 text-ink-soft border-b border-r border-line">
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

                        {/* Stock & Dispo */}
                        <td className="px-3 py-2 text-center border-b border-r border-line">
                          <div className="flex flex-col items-center">
                            <div className="flex items-center gap-1 font-mono font-bold">
                              <span
                                className={cx(
                                  'text-sm font-bold',
                                  (tool.available_qty ?? (tool.status === 'disponible' ? 1 : 0)) > 0
                                    ? 'text-green'
                                    : 'text-red',
                                )}
                              >
                                {tool.available_qty ?? (tool.status === 'disponible' ? 1 : 0)}
                              </span>
                              <span className="text-[10px] text-ink-faint font-normal">/</span>
                              <span className="text-xs text-ink">{tool.total_qty ?? 1}</span>
                            </div>
                            <span className="text-[9px] uppercase tracking-wider text-ink-faint">
                              {(tool.loaned_qty ?? 0) > 0 ? (
                                <span className="text-amber font-semibold">
                                  {tool.loaned_qty} prêté{(tool.loaned_qty ?? 0) > 1 ? 's' : ''}
                                </span>
                              ) : (
                                <span>unités</span>
                              )}
                            </span>
                          </div>
                        </td>

                        {/* VNC Nette */}
                        {canViewFinancial && (
                          <td className="px-3 py-2 text-right font-mono font-semibold text-ink border-b border-r border-line">
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
                        )}

                        {/* État */}
                        <td className="px-3 py-2 text-center border-b border-r border-line">
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
                        <td className="px-3 py-2 text-center border-b border-r border-line">
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
                        <td className="px-3 py-2 text-right border-b border-line">
                          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => setInventoryEditTarget({ kind: 'tool', item: tool })}
                                className="inline-flex min-h-8 items-center gap-1 rounded-md border border-line bg-paper px-2 text-[11px] font-medium text-ink-soft transition-colors hover:bg-paper-2 hover:text-ink"
                                title="Modifier la fiche complète"
                              >
                                <Edit3 size={12} />
                                Modifier
                              </button>
                            )}
                            {canManage && (
                              <button
                                onClick={() => {
                                  setMovementTool(tool);
                                  setMovementForm({
                                    type: 'in',
                                    qty: 1,
                                    magasin_id: tool.magasin_id || '',
                                    note: '',
                                    doc_ref: '',
                                  });
                                }}
                                className="rounded border border-amber/30 bg-amber-wash/60 px-2 py-1 text-[11px] font-semibold text-amber hover:bg-amber hover:text-white active:scale-95 transition-all flex items-center gap-1 shadow-2xs"
                                title="Mouvement de stock (Arrivage, Sortie chantier, Transfert, Régularisation)"
                              >
                                <Zap size={11} />
                                <span>Mvt</span>
                              </button>
                            )}

                            {canLoan && ((tool.available_qty ?? (tool.status === 'disponible' ? 1 : 0)) > 0) ? (
                              <button
                                onClick={() => {
                                  setLoanFor(tool);
                                  setLoanForm({
                                    employeeId: employees[0]?.id ?? '',
                                    motive: '',
                                    qty: 1,
                                    outCondition: 'bon',
                                  });
                                }}
                                className="rounded bg-amber px-2.5 py-1 text-[11px] font-semibold text-white shadow-xs hover:bg-amber-2 active:scale-95 transition-all"
                              >
                                Prêter
                              </button>
                            ) : null}

                            {(canEdit || canDelete) && (
                              <>
                                {canEdit && (
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
                                )}
                                {canDelete && (
                                  <button
                                    onClick={() => setDeleteSingleTool(tool)}
                                    className="rounded border border-line bg-paper p-1 text-ink-soft hover:bg-red-500/10 hover:text-red hover:border-red-500/30 active:scale-95 transition-all"
                                    title="Supprimer définitivement cet outil"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
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
            </StickyTableScroller>

          {/* Mobile & Tablet Mode Liste Accordéon */}
          <div className="lg:hidden space-y-2">
            {displayedTools.map((tool) => (
              <ToolListRow
                key={tool.id}
                tool={tool}
                isSelected={selectedToolIds.has(tool.id)}
                onSelect={() => toggleSelect(tool.id)}
                onClick={() => setSelectedId(tool.id)}
                onEdit={() => setInventoryEditTarget({ kind: 'tool', item: tool })}
                onLoan={() => {
                  setLoanFor(tool);
                  setLoanForm({
                    employeeId: employees[0]?.id ?? '',
                    motive: '',
                    qty: 1,
                    outCondition: 'bon',
                  });
                }}
                onMovement={() => {
                  setMovementTool(tool);
                  setMovementForm({
                    type: 'in',
                    qty: 1,
                    magasin_id: tool.magasin_id || '',
                    note: '',
                    doc_ref: '',
                  });
                }}
                onAssign={() => {
                  setAssignFor(tool);
                  setAssignMagasinId(tool.magasin_id ?? '');
                }}
                canManage={canManage}
                canEdit={canEdit}
                canLoan={canLoan}
              />
            ))}
          </div>
        </>
      ) : (
        /* Mode Grille Bento Élevée (Mobile, Tablette & Desktop) */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {displayedTools.map((tool) => {
            const acc = computeToolAccounting(tool);
            return (
              <ToolBentoCard
                key={tool.id}
                tool={tool}
                acc={acc}
                isSelected={selectedToolIds.has(tool.id)}
                onSelect={() => toggleSelect(tool.id)}
                onClick={() => setSelectedId(tool.id)}
                onEdit={() => setInventoryEditTarget({ kind: 'tool', item: tool })}
                onLoan={() => {
                  setLoanFor(tool);
                  setLoanForm({
                    employeeId: employees[0]?.id ?? '',
                    motive: '',
                    qty: 1,
                    outCondition: 'bon',
                  });
                }}
                onMovement={() => {
                  setMovementTool(tool);
                  setMovementForm({
                    type: 'in',
                    qty: 1,
                    magasin_id: tool.magasin_id || '',
                    note: '',
                    doc_ref: '',
                  });
                }}
                onAssign={() => {
                  setAssignFor(tool);
                  setAssignMagasinId(tool.magasin_id ?? '');
                }}
                onDelete={() => setDeleteSingleTool(tool)}
                canManage={canManage}
                canEdit={canEdit}
                canDelete={canDelete}
                canLoan={canLoan}
                canViewFinancial={canViewFinancial}
              />
            );
          })}
        </div>
      )}
        </TabsContent>}
      </Tabs>

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
                  {canPhoto ? (
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
                  {canPhoto ? (
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

            {/* Fiche Comptable / Caractéristiques */}
            {canViewFinancial ? (
              (() => {
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
              })()
            ) : (
              <div className="rounded-xl border border-line bg-surface p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-line pb-2.5">
                  <span className="text-xs font-bold text-ink uppercase tracking-wider">Caractéristiques techniques</span>
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
                    <span className="text-ink-faint block text-[11px]">Année de mise en service</span>
                    <span className="font-semibold text-ink">{detail.tool.acquisition_year || '—'}</span>
                  </div>
                </div>
              </div>
            )}

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
                  onClick={async () => {
                    try {
                      setPrintPreparing(true);
                      const codes = await makeToolQrSheet([detail.tool]);
                      print(<A4Sheet tools={[detail.tool]} codes={codes} />);
                    } catch {
                      toast('Impossible de préparer le QR pour l’impression.', 'error');
                    } finally {
                      setPrintPreparing(false);
                    }
                  }}
                >
                  Imprimer l’étiquette
                </Button>
              </div>
            </Card>

            {/* Stock & Disponibilité de la référence */}
            <div className="rounded-xl border border-line bg-paper p-3.5 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-ink-faint">
                  Stock Référence
                </span>
                <p className="text-xs font-semibold text-ink mt-0.5">
                  Unités physiques associées à ce code QR
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-ink-faint">Dispo</span>
                  <p className="text-base font-bold text-green tabular-nums">
                    {detail.tool.available_qty ?? (detail.tool.status === 'disponible' ? 1 : 0)}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-ink-faint">Prêté</span>
                  <p className="text-base font-bold text-amber tabular-nums">
                    {detail.tool.loaned_qty ?? 0}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-ink-faint">Total</span>
                  <p className="text-base font-bold text-ink tabular-nums">
                    {detail.tool.total_qty ?? 1}
                  </p>
                </div>
              </div>
            </div>

            {(canLoan || canReturn || canEditStatus || canEdit || canDelete || canManage) ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {canEdit ? (
                  <Button
                    variant="secondary"
                    icon={<Edit3 size={14} />}
                    onClick={() => setInventoryEditTarget({ kind: 'tool', item: detail.tool })}
                  >
                    Modifier la fiche
                  </Button>
                ) : null}
                {canManage ? (
                  <Button
                    variant="secondary"
                    icon={<Zap size={14} className="text-amber" />}
                    onClick={() => {
                      setMovementTool(detail.tool);
                      setMovementForm({
                        type: 'in',
                        qty: 1,
                        magasin_id: detail.tool.magasin_id || '',
                        note: '',
                        doc_ref: '',
                      });
                    }}
                  >
                    Mouvement de stock
                  </Button>
                ) : null}
                {canLoan && (detail.tool.available_qty ?? (detail.tool.status === 'disponible' ? 1 : 0)) > 0 ? (
                  <Button
                    variant="primary"
                    onClick={() => {
                      setLoanFor(detail.tool);
                      setLoanForm({
                        employeeId: employees[0]?.id ?? '',
                        motive: '',
                        qty: 1,
                        outCondition: 'bon',
                      });
                    }}
                  >
                    Prêter ({detail.tool.available_qty ?? 1} dispo)
                  </Button>
                ) : null}
                {canReturn && detail.loan ? (
                  <Button
                    variant="primary"
                    onClick={() => {
                      setReturnFor(detail.loan);
                      setReturnForm({
                        condition: 'bon',
                        observations: '',
                        qty: detail.loan?.remaining_qty ?? detail.loan?.qty ?? 1,
                      });
                    }}
                  >
                    Enregistrer le retour
                  </Button>
                ) : null}
                {canEditStatus ? (
                  <Button
                    onClick={() => {
                      setStatusFor(detail.tool);
                      setStatusForm({ status: detail.tool.status, reason: '' });
                    }}
                  >
                    Changer le statut
                  </Button>
                ) : null}
                {canEdit ? (
                  <Button
                    onClick={() => {
                      setAssignFor(detail.tool);
                      setAssignMagasinId(detail.tool.magasin_id ?? '');
                    }}
                  >
                    Affecter à un magasin
                  </Button>
                ) : null}
                {canDelete ? (
                  <Button
                    variant="outline-danger"
                    icon={<Trash2 size={14} />}
                    onClick={() => setDeleteSingleTool(detail.tool)}
                  >
                    Supprimer la fiche
                  </Button>
                ) : null}
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

      <InventoryEditModal
        target={inventoryEditTarget}
        onClose={() => setInventoryEditTarget(null)}
      />

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
              label="Quantité initiale en stock"
              value={newForm.total_qty}
              onChange={(event) => setNewForm((f) => ({ ...f, total_qty: event.target.value }))}
              placeholder="1"
              type="number"
              hint="Nombre d'unités physiques sous cette référence"
            />
          </div>

          <Field
            label="Numéro de série / lot (facultatif)"
            value={newForm.serial_number}
            onChange={(event) => setNewForm((f) => ({ ...f, serial_number: event.target.value }))}
            placeholder="ex. SN-8849201"
          />

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
          {canViewFinancial && (
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
          )}

          <TextArea
            label="Observations (facultatif)"
            value={newForm.observations}
            onChange={(event) => setNewForm((f) => ({ ...f, observations: event.target.value }))}
          />
        </div>
      </Modal>

      {/* Modal Prêt avec gestion de quantité et état de sortie */}
      <Modal
        open={!!loanFor}
        title={loanFor ? `Prêter : ${loanFor.id} · ${loanFor.name}` : 'Prêt'}
        onClose={() => setLoanFor(null)}
        footer={
          <>
            <Button onClick={() => setLoanFor(null)}>Annuler</Button>
            <Button
              variant="primary"
              disabled={Boolean(
                busy ||
                !loanForm.employeeId ||
                loanForm.motive.trim().length < 2 ||
                (loanForm.qty || 1) <= 0 ||
                (loanFor && (loanForm.qty || 1) > (loanFor.available_qty ?? 1)),
              )}
              onClick={() => void createLoan()}
            >
              {busy ? <Spinner /> : `Confirmer le prêt (${loanForm.qty || 1} unité${(loanForm.qty || 1) > 1 ? 's' : ''})`}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {loanFor && (
            <div className="rounded-xl border border-line bg-paper p-3 flex items-center justify-between">
              <div>
                <span className="font-mono text-xs font-bold text-amber">{loanFor.id}</span>
                <p className="text-xs font-bold text-ink">{loanFor.name}</p>
                <p className="text-[11px] text-ink-faint">
                  {loanFor.category} · {loanFor.magasin_name ?? loanFor.location}
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-ink-faint">Disponible</span>
                <p className="text-base font-bold text-green tabular-nums">
                  {loanFor.available_qty ?? (loanFor.status === 'disponible' ? 1 : 0)} / {loanFor.total_qty ?? 1}
                </p>
              </div>
            </div>
          )}

          <SelectField
            label="Travailleur bénéficiaire"
            value={loanForm.employeeId}
            onChange={(event) => setLoanForm((f) => ({ ...f, employeeId: event.target.value }))}
          >
            <option value="">— Sélectionner un salarié / menuisier —</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.full_name} — {employee.job_title}
              </option>
            ))}
          </SelectField>

          {/* Quantité prêtée avec stepper */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink">
              Quantité à prêter <span className="text-red">*</span>
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setLoanForm((f) => ({ ...f, qty: Math.max(1, (f.qty || 1) - 1) }))}
                className="h-10 w-10 rounded-lg border border-line bg-paper text-ink font-bold text-base hover:bg-paper-2 active:scale-95 transition-all flex items-center justify-center"
              >
                -
              </button>
              <input
                type="number"
                min={1}
                max={loanFor?.available_qty ?? 1}
                value={loanForm.qty || 1}
                onChange={(event) => {
                  const val = parseInt(event.target.value, 10);
                  const maxAllowed = loanFor?.available_qty ?? 1;
                  setLoanForm((f) => ({
                    ...f,
                    qty: isNaN(val) ? 1 : Math.min(maxAllowed, Math.max(1, val)),
                  }));
                }}
                className="h-10 w-24 rounded-lg border border-line bg-surface text-center font-bold text-base text-ink focus:border-amber focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  const maxAllowed = loanFor?.available_qty ?? 1;
                  setLoanForm((f) => ({ ...f, qty: Math.min(maxAllowed, (f.qty || 1) + 1) }));
                }}
                className="h-10 w-10 rounded-lg border border-line bg-paper text-ink font-bold text-base hover:bg-paper-2 active:scale-95 transition-all flex items-center justify-center"
              >
                +
              </button>
              <span className="text-xs text-ink-faint">
                (max {loanFor?.available_qty ?? 1} disponible{(loanFor?.available_qty ?? 1) > 1 ? 's' : ''})
              </span>
            </div>
          </div>

          <Field
            label="Motif / Chantier"
            value={loanForm.motive}
            onChange={(event) => setLoanForm((f) => ({ ...f, motive: event.target.value }))}
            placeholder="ex. Pose des menuiseries chapelle nord"
          />

          <SelectField
            label="État physique au départ"
            value={loanForm.outCondition}
            onChange={(event) =>
              setLoanForm((f) => ({
                ...f,
                outCondition: event.target.value as 'bon' | 'passable' | 'usure_normale',
              }))
            }
          >
            <option value="bon">Bon état (prêt normal)</option>
            <option value="passable">Passable (fonctionnel)</option>
            <option value="usure_normale">Usure normale d'usage</option>
          </SelectField>

          <p className="text-xs text-ink-faint">
            L’horodatage officiel sera consigné au serveur lors de la validation.
          </p>
        </div>
      </Modal>

      {/* Modal Retour Prêt (support retour partiel / total) */}
      <Modal
        open={!!returnFor}
        title={returnFor ? `Retour prêt #${returnFor.id} · ${returnFor.tool_name ?? returnFor.tool_id}` : 'Retour'}
        onClose={() => setReturnFor(null)}
        footer={
          <>
            <Button onClick={() => setReturnFor(null)}>Annuler</Button>
            <Button variant="primary" disabled={busy || returnForm.qty <= 0} onClick={() => void confirmReturn()}>
              {busy ? <Spinner /> : `Valider le retour (${returnForm.qty} unité${returnForm.qty > 1 ? 's' : ''})`}
            </Button>
          </>
        }
      >
        {returnFor && (
          <div className="space-y-4">
            <div className="rounded-xl border border-line bg-paper p-3 flex items-center justify-between">
              <div>
                <span className="font-mono text-xs font-bold text-amber">{returnFor.tool_id}</span>
                <p className="text-xs font-bold text-ink">{returnFor.tool_name}</p>
                <p className="text-[11px] text-ink-faint">
                  Emprunteur : {returnFor.employee_name ?? returnFor.full_name}
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-ink-faint">En prêt</span>
                <p className="text-sm font-bold text-ink">
                  {returnFor.remaining_qty ?? returnFor.qty ?? 1} unité(s)
                </p>
              </div>
            </div>

            {/* Quantité retournée avec stepper */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">
                Quantité retournée <span className="text-red">*</span>
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setReturnForm((f) => ({ ...f, qty: Math.max(1, f.qty - 1) }))}
                  className="h-10 w-10 rounded-lg border border-line bg-paper text-ink font-bold text-base hover:bg-paper-2 active:scale-95 transition-all flex items-center justify-center"
                >
                  -
                </button>
                <input
                  type="number"
                  min={1}
                  max={returnFor.remaining_qty ?? returnFor.qty ?? 1}
                  value={returnForm.qty}
                  onChange={(e) => {
                    const maxVal = returnFor.remaining_qty ?? returnFor.qty ?? 1;
                    const val = parseInt(e.target.value, 10);
                    setReturnForm((f) => ({ ...f, qty: isNaN(val) ? 1 : Math.min(maxVal, Math.max(1, val)) }));
                  }}
                  className="h-10 w-24 rounded-lg border border-line bg-surface text-center font-bold text-base text-ink focus:border-amber focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    const maxVal = returnFor.remaining_qty ?? returnFor.qty ?? 1;
                    setReturnForm((f) => ({ ...f, qty: Math.min(maxVal, f.qty + 1) }));
                  }}
                  className="h-10 w-10 rounded-lg border border-line bg-paper text-ink font-bold text-base hover:bg-paper-2 active:scale-95 transition-all flex items-center justify-center"
                >
                  +
                </button>
                <span className="text-xs text-ink-faint">
                  sur {returnFor.remaining_qty ?? returnFor.qty ?? 1} unité(s)
                </span>
              </div>
              {returnForm.qty < (returnFor.remaining_qty ?? returnFor.qty ?? 1) && (
                <p className="mt-1 text-[11px] text-amber font-semibold">
                  ⚠️ Retour partiel : {(returnFor.remaining_qty ?? returnFor.qty ?? 1) - returnForm.qty} unité(s) resteront en prêt chez l'emprunteur.
                </p>
              )}
            </div>

            <SelectField
              label="Diagnostic technique & État au retour"
              value={returnForm.condition}
              onChange={(event) =>
                setReturnForm((f) => ({
                  ...f,
                  condition: event.target.value as ToolCondition | 'lame_a_affuter' | 'endommage',
                }))
              }
            >
              <option value="bon">Bon état (réintégration immédiate au stock disponible)</option>
              <option value="lame_a_affuter">Lame / Fer à affûter (aiguisage atelier menuiserie)</option>
              <option value="a_reparer">À réparer (maintenance interne requise)</option>
              <option value="endommage">Endommagé (incident de chantier)</option>
              <option value="hors_service">Hors service (irréparable / réforme)</option>
            </SelectField>

            <TextArea
              label="Observations & Détails techniques"
              value={returnForm.observations}
              onChange={(event) => setReturnForm((f) => ({ ...f, observations: event.target.value }))}
              placeholder="Constat d'usure, affûtage requis, pièces manquantes…"
            />
          </div>
        )}
      </Modal>

      {/* Modal Ajustement Quantité Prêtée */}
      <Modal
        open={!!editLoanFor}
        title={editLoanFor ? `Ajuster le prêt #${editLoanFor.id} · ${editLoanFor.tool_name ?? editLoanFor.tool_id}` : 'Ajuster prêt'}
        onClose={() => setEditLoanFor(null)}
        footer={
          <>
            <Button onClick={() => setEditLoanFor(null)}>Annuler</Button>
            <Button
              variant="primary"
              disabled={busy || editLoanForm.qty <= 0}
              onClick={() => void saveEditLoan()}
            >
              {busy ? <Spinner /> : 'Enregistrer la modification'}
            </Button>
          </>
        }
      >
        {editLoanFor && (
          <div className="space-y-4">
            <div className="rounded-xl border border-line bg-paper p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-amber">{editLoanFor.tool_id}</span>
                <span className="text-xs text-ink-faint">Sorti le {formatDateTime(editLoanFor.out_at)}</span>
              </div>
              <p className="text-xs font-bold text-ink">{editLoanFor.tool_name}</p>
              <p className="text-xs text-ink-soft">
                Emprunteur : <strong>{editLoanFor.employee_name ?? editLoanFor.full_name}</strong>
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">
                Quantité prêtée corrigée <span className="text-red">*</span>
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditLoanForm((f) => ({ ...f, qty: Math.max(1, f.qty - 1) }))}
                  className="h-10 w-10 rounded-lg border border-line bg-paper text-ink font-bold text-base hover:bg-paper-2 active:scale-95 transition-all flex items-center justify-center"
                >
                  -
                </button>
                <input
                  type="number"
                  min={1}
                  value={editLoanForm.qty}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setEditLoanForm((f) => ({ ...f, qty: isNaN(val) ? 1 : Math.max(1, val) }));
                  }}
                  className="h-10 w-24 rounded-lg border border-line bg-surface text-center font-bold text-base text-ink focus:border-amber focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setEditLoanForm((f) => ({ ...f, qty: f.qty + 1 }))}
                  className="h-10 w-10 rounded-lg border border-line bg-paper text-ink font-bold text-base hover:bg-paper-2 active:scale-95 transition-all flex items-center justify-center"
                >
                  +
                </button>
                <span className="text-xs text-ink-faint">unités sorties</span>
              </div>
              <p className="mt-1 text-[11px] text-ink-faint">
                Permet de rectifier immédiatement une erreur de saisie ou un ajout d'outils remis au même travailleur.
              </p>
            </div>

            <Field
              label="Motif / Chantier"
              value={editLoanForm.motive}
              onChange={(e) => setEditLoanForm((f) => ({ ...f, motive: e.target.value }))}
              placeholder="ex. Travaux menuiserie chantier Fébé"
            />
          </div>
        )}
      </Modal>

      {/* Modal Mouvements de Stock Référence (Arrivage, Sortie Chantier, Transfert, Inventaire) */}
      <Modal
        open={!!movementTool}
        title={movementTool ? `Mouvement : ${movementTool.id} · ${movementTool.name}` : 'Mouvement'}
        onClose={() => setMovementTool(null)}
        footer={
          <>
            <Button onClick={() => setMovementTool(null)}>Annuler</Button>
            <Button
              variant="primary"
              disabled={busy || movementForm.qty <= 0}
              onClick={() => void submitToolMovement()}
            >
              {busy ? <Spinner /> : 'Valider le mouvement'}
            </Button>
          </>
        }
      >
        {movementTool && (
          <div className="space-y-4">
            {/* Header info */}
            <div className="rounded-xl border border-line bg-paper p-3 flex items-center justify-between">
              <div>
                <span className="font-mono text-xs font-bold text-amber">{movementTool.id}</span>
                <p className="text-xs font-bold text-ink">{movementTool.name}</p>
                <p className="text-[11px] text-ink-faint">{movementTool.magasin_name ?? movementTool.location}</p>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-ink-faint">Stock Actuel</span>
                <p className="text-base font-bold text-ink tabular-nums">
                  <span className="text-green">{movementTool.available_qty ?? 1} dispo</span> / {movementTool.total_qty ?? 1} total
                </p>
              </div>
            </div>

            {/* Type selector */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink">Type d'opération</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {[
                  { key: 'in', label: 'Arrivage (+)', sub: 'Entrée stock' },
                  { key: 'out', label: 'Sortie (-)', sub: 'Chantier ext.' },
                  { key: 'transfer', label: 'Transfert', sub: 'Inter-dépôt' },
                  { key: 'adjust', label: 'Inventaire', sub: 'Régularisation' },
                ].map(({ key, label, sub }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() =>
                      setMovementForm((f) => ({
                        ...f,
                        type: key as 'in' | 'out' | 'transfer' | 'adjust',
                      }))
                    }
                    className={cx(
                      'p-2 rounded-xl text-left border transition-all',
                      movementForm.type === key
                        ? 'border-amber bg-amber-wash/50 shadow-2xs'
                        : 'border-line bg-surface hover:bg-paper',
                    )}
                  >
                    <div className={cx('text-xs font-bold', movementForm.type === key ? 'text-amber' : 'text-ink')}>
                      {label}
                    </div>
                    <div className="text-[10px] text-ink-faint">{sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Quantité avec stepper */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">
                {movementForm.type === 'adjust' ? 'Nouveau stock total constaté' : 'Quantité concernée'}{' '}
                <span className="text-red">*</span>
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMovementForm((f) => ({ ...f, qty: Math.max(1, f.qty - 1) }))}
                  className="h-10 w-10 rounded-lg border border-line bg-paper text-ink font-bold text-base hover:bg-paper-2 active:scale-95 transition-all flex items-center justify-center"
                >
                  -
                </button>
                <input
                  type="number"
                  min={1}
                  value={movementForm.qty}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setMovementForm((f) => ({ ...f, qty: isNaN(val) ? 1 : Math.max(1, val) }));
                  }}
                  className="h-10 w-24 rounded-lg border border-line bg-surface text-center font-bold text-base text-ink focus:border-amber focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setMovementForm((f) => ({ ...f, qty: f.qty + 1 }))}
                  className="h-10 w-10 rounded-lg border border-line bg-paper text-ink font-bold text-base hover:bg-paper-2 active:scale-95 transition-all flex items-center justify-center"
                >
                  +
                </button>
                <span className="text-xs text-ink-faint">unité(s)</span>
              </div>
            </div>

            {/* Si transfert inter-dépôts, sélection du magasin destinataire */}
            {movementForm.type === 'transfer' && (
              <SelectField
                label="Magasin ou Atelier de destination"
                value={movementForm.magasin_id ?? ''}
                onChange={(e) => setMovementForm((f) => ({ ...f, magasin_id: e.target.value }))}
              >
                <option value="">— Sélectionner le magasin destinataire —</option>
                {magasins
                  .filter((m) => m.id !== movementTool.magasin_id)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.code})
                    </option>
                  ))}
              </SelectField>
            )}

            <Field
              label="N° Bon / Pièce justificative"
              value={movementForm.doc_ref}
              onChange={(e) => setMovementForm((f) => ({ ...f, doc_ref: e.target.value }))}
              placeholder="ex. BL-2026-042 ou BC-MENUISERIE-08"
            />

            <TextArea
              label="Motif / Observation"
              value={movementForm.note}
              onChange={(e) => setMovementForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="Détail du mouvement, destination chantier, état..."
            />
          </div>
        )}
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
              disabled={printPreparing || !tools.some((tool) => printPick[tool.id] && (printCopies[tool.id] ?? 1) > 0)}
              onClick={async () => {
                const labels = tools.flatMap((tool) => Array.from(
                  { length: printPick[tool.id] ? Math.min(100, Math.max(0, printCopies[tool.id] ?? 1)) : 0 },
                  () => tool,
                ));
                try {
                  setPrintPreparing(true);
                  const codes = await makeToolQrSheet(labels);
                  setToolPreviewContent(<A4Sheet tools={labels} codes={codes} format={labelFormat} paper={paperFormat} />);
                  setToolPreviewCount(labels.length);
                  setToolPreviewOpen(true);
                  setPrintOpen(false);
                } catch {
                  toast('Impossible de préparer les QR pour l’impression.', 'error');
                } finally {
                  setPrintPreparing(false);
                }
              }}
            >
              {printPreparing ? 'Préparation…' : 'Imprimer la sélection'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-medium text-ink-soft">Format de l’étiquette
              <select value={labelFormat} onChange={(event) => setLabelFormat(event.target.value as LabelFormat)} className="mt-1 h-10 w-full rounded-lg border border-line bg-surface px-2 text-ink">
                <option value="compact">Compact · 38 × 21 mm</option>
                <option value="standard">Standard · 63,5 × 38,1 mm</option>
              </select>
            </label>
            <label className="text-xs font-medium text-ink-soft">Papier
              <select value={paperFormat} onChange={(event) => setPaperFormat(event.target.value as PaperFormat)} className="mt-1 h-10 w-full rounded-lg border border-line bg-surface px-2 text-ink">
                <option value="A4">A4</option>
                <option value="Letter">Letter</option>
              </select>
            </label>
          </div>
          <div className="flex items-center justify-between border-b border-line pb-2">
            <span className="text-xs text-ink-soft">Choisissez les objets et le nombre d’étiquettes à tirer.</span>
            <button
              onClick={() => {
                const allSelected = tools.every((t) => printPick[t.id]);
                setPrintPick(Object.fromEntries(tools.map((t) => [t.id, !allSelected])));
                setPrintCopies(Object.fromEntries(tools.map((t) => [t.id, !allSelected ? Math.max(1, printCopies[t.id] ?? 1) : 0])));
              }}
              className="text-xs font-semibold text-amber hover:underline"
            >
              Tout cocher / décocher
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto space-y-1 pr-1">
            {tools.map((tool) => (
              <div
                key={tool.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-2 hover:bg-paper"
              >
                <input
                  id={`print-tool-${tool.id}`}
                  type="checkbox"
                  checked={!!printPick[tool.id]}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setPrintPick((p) => ({ ...p, [tool.id]: checked }));
                    setPrintCopies((p) => ({ ...p, [tool.id]: checked ? Math.max(1, p[tool.id] ?? 1) : 0 }));
                  }}
                  className="h-4 w-4 rounded accent-amber"
                />
                <label htmlFor={`print-tool-${tool.id}`} className="sr-only">Sélectionner {tool.name}</label>
                <span className="font-mono text-xs font-bold text-amber">{tool.id}</span>
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink">{tool.name}</span>
                <span className="hidden text-[11px] text-ink-faint sm:inline">{tool.category}</span>
                <input
                  aria-label={`Nombre d’étiquettes pour ${tool.name}`}
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  disabled={!printPick[tool.id]}
                  value={printCopies[tool.id] ?? 1}
                  onChange={(event) => setPrintCopies((p) => ({ ...p, [tool.id]: Math.min(100, Math.max(1, Math.trunc(Number(event.target.value) || 1))) }))}
                  className="h-8 w-16 rounded-md border border-line bg-paper px-2 text-center text-xs text-ink disabled:opacity-40"
                />
              </div>
            ))}
          </div>
        </div>
      </Modal>

      <PrintPreviewModal
        open={toolPreviewOpen}
        title="Aperçu de la planche d’outils"
        paper={paperFormat}
        copiesLabel={`${toolPreviewCount} étiquette(s)`}
        content={toolPreviewContent}
        pdfFilename={`planche-outils-qr-${toolPreviewCount}.pdf`}
        onClose={() => { setToolPreviewOpen(false); setPrintOpen(true); }}
        onPrint={() => { if (toolPreviewContent) print(toolPreviewContent); setToolPreviewOpen(false); }}
      />

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
        <Suspense fallback={<div className="fixed inset-0 z-50 grid place-items-center bg-charcoal/70"><Spinner /></div>}>
          <ExcelImportModal
            type="tools"
            onClose={() => setImportOpen(false)}
            onSuccess={() => {
              refresh();
            }}
          />
        </Suspense>
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
