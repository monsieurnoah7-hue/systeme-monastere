import React, { useState, useMemo } from 'react';
import {
  type EtabliKit,
  type EtabliKitItem,
  type EtabliKitAudit,
  api,
} from '../lib/api';
import { QR_PREFIX, qrDataUrl } from '../lib/qr';
import { usePrintSheet } from '../lib/print';
import {
  Button,
  Modal,
  Spinner,
  useToast,
} from './ui';
import {
  CheckCircle2,
  AlertTriangle,
  Printer,
  History,
  MapPin,
  Building,
  ShieldCheck,
  User,
  Search,
  ChevronRight,
  Plus,
} from 'lucide-react';

interface EtabliKitCardProps {
  kit: EtabliKit;
  items: EtabliKitItem[];
  audits?: EtabliKitAudit[];
  onRefresh?: () => void;
  canManage?: boolean;
  canAddItems?: boolean;
}

type KitLabelFormat = 'compact' | 'standard';
type KitPaperFormat = 'A4' | 'Letter';

async function generateKitQrCodes(items: EtabliKitItem[]) {
  const uniqueItems = [...new Map(items.map((item) => [item.id, item])).values()];
  const entries = await Promise.all(uniqueItems.map(async (item) => [item.id, await qrDataUrl(`${QR_PREFIX.kitItem}${item.tool_code}`, 240)] as const));
  return Object.fromEntries(entries);
}

function EtabliLabelsSheet({ kit, labels, codes, kitQr, format, paper }: {
  kit: EtabliKit;
  labels: EtabliKitItem[];
  codes: Record<number, string>;
  kitQr: string;
  format: KitLabelFormat;
  paper: KitPaperFormat;
}) {
  const compact = format === 'compact';
  const labelWidth = compact ? '38mm' : '63.5mm';
  const labelHeight = compact ? '21mm' : '38.1mm';
  return (
    <div className="label-sheet" style={{ width: paper === 'A4' ? '200mm' : '203.2mm', margin: '0 auto', fontFamily: 'Arial, sans-serif' }}>
      <style>{`@page { size: ${paper} portrait; margin: 5mm; }`}</style>
      <div className="label-grid" style={{ gridTemplateColumns: `repeat(auto-fill, ${labelWidth})`, gap: '2mm' }}>
        <div className="tool-label-card flex overflow-hidden border border-gray-500 bg-white text-gray-900" style={{ width: labelWidth, height: labelHeight, boxSizing: 'border-box', breakInside: 'avoid' }}>
          <div className="flex shrink-0 items-center justify-center" style={{ width: compact ? '17mm' : '29mm', height: '100%', padding: compact ? '1mm' : '2mm', boxSizing: 'border-box' }}>
            <img src={kitQr} alt={`QR établi ${kit.etabli_number}`} className="h-full w-full object-contain" />
          </div>
          <div className={`flex min-w-0 flex-1 flex-col justify-center leading-tight ${compact ? 'py-[1mm] pr-[1mm]' : 'py-[2mm] pr-[2mm]'}`}>
            <div className="mb-[0.8mm] flex items-center gap-1 border-b border-gray-200 pb-[0.6mm]">
              <img src="/emblem.png" alt="" className={compact ? 'h-[3mm] w-[3mm] object-contain' : 'h-[4mm] w-[4mm] object-contain'} />
              <span className={`font-bold tracking-wide text-gray-800 ${compact ? 'text-[4.5pt]' : 'text-[6pt]'}`}>CFTM</span>
            </div>
            <p className={`truncate font-mono font-bold text-gray-950 ${compact ? 'text-[6pt]' : 'text-[6.5pt]'}`}>{kit.code}</p>
            <p className={`truncate font-semibold text-gray-800 ${compact ? 'text-[5.5pt]' : 'text-[7.5pt]'}`}>Établi N°{kit.etabli_number}</p>
            <p className={`truncate text-gray-600 ${compact ? 'text-[4.5pt]' : 'text-[6pt]'}`}>{kit.employee_name}</p>
          </div>
        </div>
        {labels.map((item, index) => (
          <div key={`${item.id}-${index}`} className="tool-label-card flex overflow-hidden border border-gray-500 bg-white text-gray-900" style={{ width: labelWidth, height: labelHeight, boxSizing: 'border-box', breakInside: 'avoid' }}>
            <div className="flex shrink-0 items-center justify-center" style={{ width: compact ? '17mm' : '29mm', height: '100%', padding: compact ? '1mm' : '2mm', boxSizing: 'border-box' }}>
              <img src={codes[item.id]} alt={`QR ${item.tool_code}`} className="h-full w-full object-contain" />
            </div>
            <div className={`flex min-w-0 flex-1 flex-col justify-center leading-tight ${compact ? 'py-[1mm] pr-[1mm]' : 'py-[2mm] pr-[2mm]'}`}>
              <div className="mb-[0.8mm] flex items-center gap-1 border-b border-gray-200 pb-[0.6mm]">
                <img src="/emblem.png" alt="" className={compact ? 'h-[3mm] w-[3mm] object-contain' : 'h-[4mm] w-[4mm] object-contain'} />
                <span className={`font-bold tracking-wide text-gray-800 ${compact ? 'text-[4.5pt]' : 'text-[6pt]'}`}>CFTM</span>
              </div>
              <p className={`truncate font-mono font-bold text-gray-950 ${compact ? 'text-[6pt]' : 'text-[6.5pt]'}`}>
                {compact ? `${kit.code}-${String(item.item_num).padStart(2, '0')}` : item.tool_code}
              </p>
              <p className={`truncate font-semibold text-gray-800 ${compact ? 'text-[5.5pt]' : 'text-[7.5pt]'}`}>{item.name}</p>
              <p className={`truncate text-gray-600 ${compact ? 'text-[4.5pt]' : 'text-[6pt]'}`}>Établi {kit.etabli_number}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export const EtabliKitCard: React.FC<EtabliKitCardProps> = ({
  kit,
  items,
  audits = [],
  onRefresh,
  canManage = false,
  canAddItems = false,
}) => {
  const toast = useToast();
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemUnit, setNewItemUnit] = useState('pièce');
  const [addItemBusy, setAddItemBusy] = useState(false);
  const [printBusy, setPrintBusy] = useState(false);
  const [labelFormat, setLabelFormat] = useState<KitLabelFormat>('compact');
  const [paperFormat, setPaperFormat] = useState<KitPaperFormat>('A4');
  const [labelCopies, setLabelCopies] = useState<Record<number, number>>({});
  const [selectedItemForEdit, setSelectedItemForEdit] = useState<EtabliKitItem | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterState, setFilterState] = useState<'all' | 'alert'>('all');

  // Audit state
  const [auditStatus, setAuditStatus] = useState<'conforme' | 'anomalie' | 'incomplet'>('conforme');
  const [auditNotes, setAuditNotes] = useState('');
  const [itemAuditStates, setItemAuditStates] = useState<Record<number, { is_present: boolean; condition: EtabliKitItem['condition'] }>>({});
  const { print, portal } = usePrintSheet();

  const openPrintModal = () => {
    setLabelCopies(Object.fromEntries(items.map((item) => [item.id, Math.min(100, Math.max(1, item.qty))])));
    setShowPrintModal(true);
  };

  const submitNewItem = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAddItemBusy(true);
    try {
      await api<{ item: EtabliKitItem }>(`/api/kits/${kit.id}/items`, {
        method: 'POST',
        body: JSON.stringify({ name: newItemName, qty: newItemQty, unit: newItemUnit }),
      });
      toast(`« ${newItemName.trim()} » ajouté à l’établi ${kit.etabli_number}. Son QR est prêt à imprimer.`, 'success');
      setNewItemName('');
      setNewItemQty(1);
      setNewItemUnit('pièce');
      setShowAddItemModal(false);
      onRefresh?.();
    } catch (err) {
      toast((err as Error).message || 'Impossible d’ajouter cet outil à l’établi.', 'error');
    } finally {
      setAddItemBusy(false);
    }
  };

  const openAudit = () => {
    const initial: Record<number, { is_present: boolean; condition: EtabliKitItem['condition'] }> = {};
    items.forEach((it) => {
      initial[it.id] = { is_present: it.is_present, condition: it.condition };
    });
    setItemAuditStates(initial);
    setAuditStatus('conforme');
    setAuditNotes('');
    setShowAuditModal(true);
  };

  const submitAudit = async () => {
    setIsAuditing(true);
    try {
      const itemsList = Object.entries(itemAuditStates).map(([id, state]) => ({
        id: Number(id),
        is_present: state.is_present,
        condition: state.condition,
      }));

      await api<unknown>(`/api/kits/${kit.id}/audit`, {
        method: 'POST',
        body: JSON.stringify({
          status: auditStatus,
          anomalies_note: auditNotes || undefined,
          items_status: itemsList,
        }),
      });

      toast(`Audit enregistré pour l'établi N°${kit.etabli_number}.`, 'success');
      setShowAuditModal(false);
      onRefresh?.();
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setIsAuditing(false);
    }
  };

  const handleUpdateItemCondition = async (condition: EtabliKitItem['condition'], isPresent: boolean) => {
    if (!selectedItemForEdit) return;
    try {
      await api<unknown>(`/api/kits/items/${selectedItemForEdit.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ condition, is_present: isPresent }),
      });
      toast(`Outil "${selectedItemForEdit.name}" mis à jour.`, 'success');
      setSelectedItemForEdit(null);
      onRefresh?.();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const total = items.length;
  const present = items.filter((i) => i.is_present && i.condition === 'bon').length;
  const anomalies = total - present;
  const percentage = total > 0 ? Math.round((present / total) * 100) : 100;
  const printLabelCount = items.reduce((sum, item) => sum + Math.max(0, labelCopies[item.id] ?? 0), 1);

  // Filtered tools
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((it) => {
      if (filterState === 'alert' && it.is_present && it.condition === 'bon') return false;
      if (!q) return true;
      return (
        it.name.toLowerCase().includes(q) ||
        it.tool_code.toLowerCase().includes(q) ||
        String(it.item_num) === q
      );
    });
  }, [items, searchQuery, filterState]);

  return (
    <div className="etabli-kit-container w-full min-w-0 space-y-4">
      {/* =========================================================================
          1. CARTE MAÎTRESSE ÉTABLI (Design Apple iOS Card — Zéro chevauchement)
      ========================================================================= */}
      <div className="etabli-kit-main min-w-0 rounded-2xl border border-line bg-surface p-3 shadow-card sm:p-4">
        {/* Identité Établi */}
        <div className="flex min-w-0 items-start gap-3">
          <div className="relative flex-shrink-0">
            {kit.employee_photo ? (
              <img
                src={kit.employee_photo}
                alt={kit.employee_name}
                className="h-12 w-12 rounded-xl border border-line-strong object-cover shadow-sm"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-surface-2 text-ink-soft">
                <User className="h-6 w-6" />
              </div>
            )}
            <span className="absolute -bottom-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-surface bg-green px-1 text-[9px] font-bold text-white shadow-sm">
              #{kit.etabli_number}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="min-w-0 text-base font-bold leading-tight text-ink">
                Établi N°{kit.etabli_number}
              </h3>
              <span className="max-w-full break-all rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ink-soft">
                {kit.code}
              </span>
            </div>
            <p className="mt-1 break-words text-sm font-medium text-ink-soft">
              {kit.employee_name}
            </p>
            <div className="mt-1.5 grid min-w-0 gap-1 text-xs text-ink-soft sm:grid-cols-2">
              <p className="flex min-w-0 items-start gap-1.5"><Building className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" /><span className="break-words">{kit.source_magasin_name}</span></p>
              <p className="flex min-w-0 items-start gap-1.5"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" /><span className="break-words">{kit.location}</span></p>
            </div>
          </div>
        </div>

        {/* 2 Blocs Métriques Aérés (50% / 50% — Aucun texte écrasé) */}
        <div className="etabli-kit-metrics mt-3 grid min-w-0 grid-cols-1 gap-2 sm:mt-4">
          {/* Bloc 1 : Santé du Kit */}
          <div className="min-w-0 rounded-xl border border-line bg-surface-2/70 p-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
              Complétude
            </span>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
              <span className={`text-xl font-bold tabular-nums ${percentage === 100 ? 'text-green' : 'text-amber'}`}>
                {percentage}%
              </span>
              <span className="text-xs text-ink-soft">
                ({present}/{total})
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-paper">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  percentage === 100 ? 'bg-green' : percentage >= 80 ? 'bg-amber' : 'bg-red'
                }`}
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>

          {/* Bloc 2 : Dernier Audit */}
          <div className="min-w-0 rounded-xl border border-line bg-surface-2/70 p-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
              Dernier Audit
            </span>
            <div className="mt-1">
              <span
                className={`inline-flex items-center gap-1 text-xs font-semibold ${
                  !kit.last_audited_at ? 'text-ink-faint' : anomalies === 0 ? 'text-green' : 'text-amber'
                }`}
              >
                {!kit.last_audited_at ? (
                  <>À contrôler</>
                ) : anomalies === 0 ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Conforme
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {anomalies} anomalie{anomalies > 1 ? 's' : ''}
                  </>
                )}
              </span>
            </div>
            <div className="mt-1 truncate text-[11px] text-ink-soft">
              {kit.last_audited_at
                ? new Date(kit.last_audited_at).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'short',
                  })
                : 'Aucun contrôle enregistré'}
              {kit.last_audited_by ? ` • ${kit.last_audited_by.split(' ')[0]}` : ''}
            </div>
          </div>
        </div>

        {/* 2 Boutons d'Action Ergonomiques Apple */}
        <div className="etabli-kit-actions mt-3 grid min-w-0 grid-cols-1 gap-2" data-actions={Number(canManage) + 1 + Number(canAddItems)}>
          {canManage && (
            <button
              type="button"
              onClick={openAudit}
              className="flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl bg-green px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue active:scale-[0.99]"
            >
              <ShieldCheck className="h-4 w-4" />
              <span>Contrôle flash</span>
            </button>
          )}

          <button
            type="button"
            onClick={openPrintModal}
            className="flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface-2 px-3 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue active:scale-[0.99]"
          >
            <Printer className="h-4 w-4 shrink-0 text-ink-soft" />
            <span>Imprimer les QR codes</span>
          </button>
          {canAddItems && (
            <button
              type="button"
              onClick={() => setShowAddItemModal(true)}
              className="flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface-2 px-3 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
            >
              <Plus className="h-4 w-4" />
              <span>Ajouter un outil</span>
            </button>
          )}
        </div>
      </div>

      {/* =========================================================================
          2. LISTE DES OUTILS DU KIT (Apple Grouped Rows — Zéro coupure de texte)
      ========================================================================= */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
            Boîte à Outils ({total} pièces)
          </span>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setFilterState('all')}
              className={`min-h-9 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all focus-visible:outline-2 focus-visible:outline-blue ${
                filterState === 'all'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Tous ({total})
            </button>
            {anomalies > 0 && (
              <button
                type="button"
                onClick={() => setFilterState('alert')}
                className={`min-h-9 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all focus-visible:outline-2 focus-visible:outline-blue ${
                  filterState === 'alert'
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'text-amber-400 hover:underline'
                }`}
              >
                Alertes ({anomalies})
              </button>
            )}
          </div>
        </div>

        {/* Barre de Recherche Simple */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filtrer un outil (marteau, ciseau, équerre...)"
            className="min-h-11 w-full rounded-xl border border-line bg-surface px-3 pl-9 text-sm text-ink placeholder:text-ink-faint focus:border-blue focus:outline-none focus-visible:ring-2 focus-visible:ring-blue/50"
          />
        </div>

        {/* Liste verticale en rangées 100% Mobile & Drawer Friendly */}
        <div className="divide-y divide-slate-800/80 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40">
          {filteredItems.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-400">
              Aucun outil ne correspond à la recherche.
            </div>
          ) : (
            filteredItems.map((item) => {
              const isOk = item.is_present && item.condition === 'bon';
              return (
                <div
                  key={item.id}
                  onClick={() => canManage && setSelectedItemForEdit(item)}
                  className={`group flex min-w-0 flex-wrap items-center justify-between gap-2 p-3 transition-colors sm:flex-nowrap ${
                    canManage ? 'cursor-pointer hover:bg-slate-800/60 active:bg-slate-800' : ''
                  } ${!isOk ? 'bg-amber-500/5' : ''}`}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-slate-800 font-mono text-xs font-bold text-slate-300">
                      {String(item.item_num).padStart(2, '0')}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-200 leading-snug">
                        {item.name}
                      </p>
                      <p className="flex items-center gap-1.5 font-mono text-[10px] text-slate-400 mt-0.5">
                        <span className="text-emerald-400 font-semibold">{item.tool_code}</span>
                        <span>•</span>
                        <span>{item.qty} {item.unit}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2 sm:ml-auto">
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        isOk
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : item.condition === 'a_affuter'
                          ? 'bg-amber-500/15 text-amber-400'
                          : item.condition === 'manquant' || !item.is_present
                          ? 'bg-rose-500/15 text-rose-400'
                          : 'bg-indigo-500/15 text-indigo-400'
                      }`}
                    >
                      {!item.is_present ? 'Manquant' : item.condition.replace('_', ' ')}
                    </span>
                    {canManage && (
                      <ChevronRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* =========================================================================
          3. HISTORIQUE DES AUDITS INOPINÉS
      ========================================================================= */}
      {audits.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3.5">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2 mb-2.5">
            <History className="h-3.5 w-3.5 text-slate-400" />
            Historique des Contrôles Inopinés
          </h4>
          <div className="divide-y divide-slate-800/80">
            {audits.slice(0, 3).map((a) => (
              <div key={a.id} className="py-2 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`h-2 w-2 flex-shrink-0 rounded-full ${
                      a.status === 'conforme' ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                  />
                  <span className="truncate font-medium text-slate-300">
                    {a.auditor_name}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 text-slate-400 text-[11px]">
                  <span>{a.items_present_count}/{a.items_total_count}</span>
                  <span>•</span>
                  <span>
                    {new Date(a.audited_at).toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =========================================================================
          4. MODAL CONTRÔLE FLASH INOPINÉ (Ergonomie tactile rapide)
      ========================================================================= */}
      <Modal
        open={showAuditModal}
        title={`Contrôle Inopiné — Établi N°${kit.etabli_number}`}
        onClose={() => setShowAuditModal(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowAuditModal(false)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={submitAudit}
              disabled={isAuditing}
              className="bg-emerald-600 text-white"
            >
              {isAuditing ? <Spinner /> : 'Valider le Contrôle'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-800/50 p-3 text-xs text-slate-300">
            Artisan contrôlé : <strong className="text-white">{kit.employee_name}</strong>.  
            Tous les outils sont présélectionnés <em>« Conformes »</em>. Cliquez sur un outil pour changer son statut.
          </div>

          <div className="max-h-72 overflow-y-auto space-y-1.5 divide-y divide-slate-800 pr-1">
            {items.map((it) => {
              const current = itemAuditStates[it.id] || {
                is_present: it.is_present,
                condition: it.condition,
              };
              return (
                <div key={it.id} className="pt-1.5 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-200 truncate pr-2">
                    {it.item_num}. {it.name}
                  </span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        setItemAuditStates({
                          ...itemAuditStates,
                          [it.id]: { is_present: true, condition: 'bon' },
                        })
                      }
                      className={`rounded px-2 py-1 font-semibold text-[11px] ${
                        current.is_present && current.condition === 'bon'
                          ? 'bg-emerald-500 text-white'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      ✓ Bon
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setItemAuditStates({
                          ...itemAuditStates,
                          [it.id]: { is_present: true, condition: 'a_affuter' },
                        })
                      }
                      className={`rounded px-2 py-1 font-semibold text-[11px] ${
                        current.is_present && current.condition === 'a_affuter'
                          ? 'bg-amber-500 text-white'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      À affûter
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setItemAuditStates({
                          ...itemAuditStates,
                          [it.id]: { is_present: false, condition: 'manquant' },
                        })
                      }
                      className={`rounded px-2 py-1 font-semibold text-[11px] ${
                        !current.is_present
                          ? 'bg-rose-500 text-white'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      Manquant
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-800">
            <label className="text-xs font-semibold text-slate-300">
              Résultat global du contrôle
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setAuditStatus('conforme')}
                className={`rounded-lg p-2 text-xs font-bold ${
                  auditStatus === 'conforme'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                ✓ Conforme
              </button>
              <button
                type="button"
                onClick={() => setAuditStatus('anomalie')}
                className={`rounded-lg p-2 text-xs font-bold ${
                  auditStatus === 'anomalie'
                    ? 'bg-amber-600 text-white shadow'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                ⚠ Anomalie
              </button>
              <button
                type="button"
                onClick={() => setAuditStatus('incomplet')}
                className={`rounded-lg p-2 text-xs font-bold ${
                  auditStatus === 'incomplet'
                    ? 'bg-rose-600 text-white shadow'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                ✕ Incomplet
              </button>
            </div>

            <textarea
              value={auditNotes}
              onChange={(e) => setAuditNotes(e.target.value)}
              placeholder="Observation pour le magasinier ou le chef d'atelier..."
              className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
              rows={2}
            />
          </div>
        </div>
      </Modal>

      {/* =========================================================================
          5. MODAL PLANCHE QR CODES (Impression A4)
      ========================================================================= */}
      <Modal
        open={showPrintModal}
        title={`Étiquettes de l’établi ${kit.etabli_number}`}
        onClose={() => setShowPrintModal(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowPrintModal(false)}>
              Fermer
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={printBusy || printLabelCount > 500 || !items.some((item) => (labelCopies[item.id] ?? 0) > 0)}
              onClick={async () => {
                const labels = items.flatMap((item) => Array.from({ length: Math.min(100, Math.max(0, labelCopies[item.id] ?? 0)) }, () => item));
                try {
                  setPrintBusy(true);
                  const [codes, kitQr] = await Promise.all([
                    generateKitQrCodes(labels),
                    qrDataUrl(`${QR_PREFIX.kit}${kit.id}`, 240),
                  ]);
                  print(<EtabliLabelsSheet kit={kit} labels={labels} codes={codes} kitQr={kitQr} format={labelFormat} paper={paperFormat} />);
                  setShowPrintModal(false);
                } catch {
                  toast('Impossible de préparer les QR de cet établi.', 'error');
                } finally {
                  setPrintBusy(false);
                }
              }}
              className="gap-2 bg-emerald-600 text-white"
            >
              <Printer className="h-4 w-4" />
              <span>{printBusy ? 'Préparation…' : 'Imprimer la planche'}</span>
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-semibold text-slate-300">Format des étiquettes
              <select value={labelFormat} onChange={(event) => setLabelFormat(event.target.value as KitLabelFormat)} className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 text-slate-100">
                <option value="compact">Compact · 38 × 21 mm</option>
                <option value="standard">Standard · 63,5 × 38,1 mm</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-300">Papier
              <select value={paperFormat} onChange={(event) => setPaperFormat(event.target.value as KitPaperFormat)} className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 text-slate-100">
                <option value="A4">A4</option>
                <option value="Letter">Letter</option>
              </select>
            </label>
          </div>
          <p className="text-xs text-slate-300">Chaque établi et chaque outil reçoit son QR propre. Les quantités commencent selon l’inventaire, mais restent modifiables avant impression.</p>
          <div className="max-h-72 space-y-1.5 overflow-y-auto border-t border-slate-700 pt-3">
            <div className="mb-2 flex items-center justify-between text-xs font-bold text-slate-200">
              <span>Établi + outils et sac ({items.length} références)</span>
              <span>{printLabelCount} étiquette(s)</span>
            </div>
            {printLabelCount > 500 && <p className="mb-2 text-xs text-amber-300">Limite de 500 étiquettes par planche pour conserver une impression fluide. Réduisez les quantités ou imprimez en plusieurs fois.</p>}
            {items.map((item) => (
              <label key={item.id} className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-slate-100">{item.name}</span>
                  <span className="block truncate font-mono text-[10px] text-slate-400">{item.tool_code}</span>
                </span>
                <span className="text-[10px] text-slate-400">Qté {item.qty}</span>
                <input
                  aria-label={`Nombre d’étiquettes pour ${item.name}`}
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={labelCopies[item.id] ?? 0}
                  onChange={(event) => {
                    const quantity = Math.min(100, Math.max(0, Math.trunc(Number(event.target.value) || 0)));
                    setLabelCopies((current) => ({ ...current, [item.id]: quantity }));
                  }}
                  className="h-9 w-16 rounded-md border border-slate-700 bg-slate-800 px-2 text-center text-sm text-slate-100"
                />
              </label>
            ))}
          </div>
        </div>
      </Modal>

      <Modal
        open={showAddItemModal}
        title={`Ajouter un outil · Établi ${kit.etabli_number}`}
        onClose={() => setShowAddItemModal(false)}
        footer={(
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowAddItemModal(false)}>Annuler</Button>
            <Button type="submit" form="etabli-add-item-form" variant="primary" size="sm" disabled={addItemBusy} className="bg-emerald-600 text-white">
              {addItemBusy ? <Spinner /> : 'Ajouter à cet établi'}
            </Button>
          </div>
        )}
      >
        <form id="etabli-add-item-form" onSubmit={(event) => void submitNewItem(event)} className="space-y-4">
          <p className="text-xs leading-relaxed text-slate-300">
            Cet objet sera enregistré uniquement dans la dotation de l’établi {kit.etabli_number}. Son code et son QR seront uniques à cet établi.
          </p>
          <label className="block text-xs font-semibold text-slate-200">
            Nom de l’outil ou du matériel
            <input autoFocus required minLength={2} maxLength={120} value={newItemName} onChange={(event) => setNewItemName(event.target.value)} placeholder="Ex. Sac de chantier" className="mt-1.5 h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 placeholder:text-slate-500" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-semibold text-slate-200">
              Quantité dotée
              <input type="number" min={1} max={1000} step={1} required value={newItemQty} onChange={(event) => setNewItemQty(Math.min(1000, Math.max(1, Math.trunc(Number(event.target.value) || 1))))} className="mt-1.5 h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100" />
            </label>
            <label className="block text-xs font-semibold text-slate-200">
              Unité
              <input required maxLength={24} value={newItemUnit} onChange={(event) => setNewItemUnit(event.target.value)} placeholder="pièce, jeu…" className="mt-1.5 h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100" />
            </label>
          </div>
        </form>
      </Modal>

      {/* =========================================================================
          6. MODAL MODIFICATION UNITAIRE D'UN OUTIL
      ========================================================================= */}
      <Modal
        open={!!selectedItemForEdit}
        title={selectedItemForEdit ? `Outil : ${selectedItemForEdit.name}` : ''}
        onClose={() => setSelectedItemForEdit(null)}
        footer={
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => setSelectedItemForEdit(null)}>
              Fermer
            </Button>
          </div>
        }
      >
        {selectedItemForEdit && (
          <div className="space-y-4 text-xs">
            <div className="rounded-xl bg-slate-800/60 p-3 text-slate-300 space-y-1">
              <div>
                <span className="text-slate-400">Code Unitaire :</span>{' '}
                <strong className="font-mono text-emerald-400">{selectedItemForEdit.tool_code}</strong>
              </div>
              <div>
                <span className="text-slate-400">Établi :</span>{' '}
                <strong className="text-white">N°{kit.etabli_number} ({kit.employee_name})</strong>
              </div>
              <div>
                <span className="text-slate-400">Dotation :</span>{' '}
                <strong className="text-slate-200">{kit.source_magasin_name}</strong>
              </div>
            </div>

            <div className="space-y-2">
              <span className="font-semibold text-slate-200">Modifier l'état :</span>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={selectedItemForEdit.condition === 'bon' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => handleUpdateItemCondition('bon', true)}
                >
                  ✓ Bon état (Actif)
                </Button>
                <Button
                  variant={selectedItemForEdit.condition === 'a_affuter' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => handleUpdateItemCondition('a_affuter', true)}
                >
                  🔪 À affûter
                </Button>
                <Button
                  variant={selectedItemForEdit.condition === 'a_reparer' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => handleUpdateItemCondition('a_reparer', true)}
                >
                  🔧 À réparer
                </Button>
                <Button
                  variant={!selectedItemForEdit.is_present ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => handleUpdateItemCondition('manquant', false)}
                  className="text-rose-400"
                >
                  ✕ Manquant
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
      {portal}
    </div>
  );
};
