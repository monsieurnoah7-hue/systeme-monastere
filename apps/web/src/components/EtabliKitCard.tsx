import React, { useState, useMemo } from 'react';
import {
  type EtabliKit,
  type EtabliKitItem,
  type EtabliKitAudit,
  api,
} from '../lib/api';
import { QrCode } from './QrCode';
import { QR_PREFIX } from '../lib/qr';
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
} from 'lucide-react';

interface EtabliKitCardProps {
  kit: EtabliKit;
  items: EtabliKitItem[];
  audits?: EtabliKitAudit[];
  onRefresh?: () => void;
  canManage?: boolean;
}

export const EtabliKitCard: React.FC<EtabliKitCardProps> = ({
  kit,
  items,
  audits = [],
  onRefresh,
  canManage = false,
}) => {
  const toast = useToast();
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [selectedItemForEdit, setSelectedItemForEdit] = useState<EtabliKitItem | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterState, setFilterState] = useState<'all' | 'alert'>('all');

  // Audit state
  const [auditStatus, setAuditStatus] = useState<'conforme' | 'anomalie' | 'incomplet'>('conforme');
  const [auditNotes, setAuditNotes] = useState('');
  const [itemAuditStates, setItemAuditStates] = useState<Record<number, { is_present: boolean; condition: EtabliKitItem['condition'] }>>({});

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
    <div className="space-y-4">
      {/* =========================================================================
          1. CARTE MAÎTRESSE ÉTABLI (Design Apple iOS Card — Zéro chevauchement)
      ========================================================================= */}
      <div className="rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950 p-4 shadow-xl">
        {/* Identité Établi */}
        <div className="flex items-center gap-3">
          <div className="relative flex-shrink-0">
            {kit.employee_photo ? (
              <img
                src={kit.employee_photo}
                alt={kit.employee_name}
                className="h-12 w-12 rounded-xl border border-emerald-500/30 object-cover shadow"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-400">
                <User className="h-6 w-6" />
              </div>
            )}
            <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-black text-slate-950 shadow">
              #{kit.etabli_number}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-base font-bold text-slate-100">
                Établi N°{kit.etabli_number}
              </h3>
              <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                {kit.code}
              </span>
            </div>
            <p className="truncate text-xs text-slate-400 mt-0.5">
              {kit.employee_name}
            </p>
            <p className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5 truncate">
              <Building className="h-3 w-3 text-slate-400 flex-shrink-0" />
              <span className="truncate">{kit.source_magasin_name}</span>
              <span>•</span>
              <MapPin className="h-3 w-3 text-slate-400 flex-shrink-0" />
              <span className="truncate">{kit.location}</span>
            </p>
          </div>
        </div>

        {/* 2 Blocs Métriques Aérés (50% / 50% — Aucun texte écrasé) */}
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {/* Bloc 1 : Santé du Kit */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Complétude
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className={`text-xl font-black ${percentage === 100 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {percentage}%
              </span>
              <span className="text-[11px] text-slate-400 font-medium">
                ({present}/{total})
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  percentage === 100 ? 'bg-emerald-500' : percentage >= 80 ? 'bg-amber-500' : 'bg-rose-500'
                }`}
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>

          {/* Bloc 2 : Dernier Audit */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Dernier Audit
            </span>
            <div className="mt-1">
              <span
                className={`inline-flex items-center gap-1 text-xs font-semibold ${
                  anomalies === 0 ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {anomalies === 0 ? (
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
            <div className="mt-1 text-[11px] text-slate-400 truncate">
              {kit.last_audited_at
                ? new Date(kit.last_audited_at).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'short',
                  })
                : 'Initialisé'}
              {kit.last_audited_by ? ` • ${kit.last_audited_by.split(' ')[0]}` : ''}
            </div>
          </div>
        </div>

        {/* 2 Boutons d'Action Ergonomiques Apple */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          {canManage && (
            <button
              type="button"
              onClick={openAudit}
              className="flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 text-xs font-bold text-white shadow-sm transition-all hover:bg-emerald-500 active:scale-[0.98]"
            >
              <ShieldCheck className="h-4 w-4" />
              <span>Contrôle Flash</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowPrintModal(true)}
            className={`flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 px-3 text-xs font-bold text-slate-200 transition-all hover:bg-slate-700 active:scale-[0.98] ${
              !canManage ? 'col-span-2' : ''
            }`}
          >
            <Printer className="h-4 w-4 text-slate-400" />
            <span>QR Codes Planche</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          2. LISTE DES OUTILS DU KIT (Apple Grouped Rows — Zéro coupure de texte)
      ========================================================================= */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Boîte à Outils ({total} pièces)
          </span>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setFilterState('all')}
              className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold transition-all ${
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
                className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold transition-all ${
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
            className="h-9 w-full rounded-xl border border-slate-800 bg-slate-900/80 pl-9 pr-3 text-xs text-slate-200 placeholder-slate-400 focus:border-emerald-500 focus:outline-none"
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
                  className={`group flex items-center justify-between gap-3 p-3 transition-colors ${
                    canManage ? 'cursor-pointer hover:bg-slate-800/60 active:bg-slate-800' : ''
                  } ${!isOk ? 'bg-amber-500/5' : ''}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
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

                  <div className="flex items-center gap-2 flex-shrink-0">
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
        title={`Planche QR Codes — Établi N°${kit.etabli_number}`}
        onClose={() => setShowPrintModal(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowPrintModal(false)}>
              Fermer
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => window.print()}
              className="gap-2 bg-emerald-600 text-white"
            >
              <Printer className="h-4 w-4" />
              <span>Imprimer la Planche</span>
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-700 bg-white p-4 text-slate-950 text-center">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">
              CFTM • MONASTÈRE MONT-FÉBÉ
            </div>
            <div className="text-base font-black text-slate-950 mt-0.5">
              PASSEPORT ÉTABLI N°{kit.etabli_number}
            </div>
            <div className="text-xs font-bold text-slate-700">
              {kit.employee_name}
            </div>

            <div className="my-3 flex justify-center">
              <QrCode value={`${QR_PREFIX.kit}${kit.id}`} size={150} />
            </div>

            <div className="font-mono text-xs font-bold text-slate-900">{kit.id}</div>
            <div className="text-[10px] text-slate-500 mt-1">
              {kit.source_magasin_name} • {kit.location}
            </div>
          </div>

          <div className="max-h-52 overflow-y-auto space-y-1.5 border-t border-slate-800 pt-3">
            <span className="text-xs font-bold text-slate-300">
              Mini-étiquettes d'outils ({items.length})
            </span>
            <div className="grid grid-cols-2 gap-2">
              {items.map((it) => (
                <div
                  key={it.id}
                  className="flex items-center gap-2 rounded border border-slate-700 bg-slate-800 p-1.5 text-[11px]"
                >
                  <QrCode value={`CFTM:TOOL:${it.tool_code}`} size={32} />
                  <div className="min-w-0">
                    <div className="font-mono font-bold text-emerald-400 truncate">
                      {it.tool_code}
                    </div>
                    <div className="text-slate-300 truncate text-[10px]">{it.name}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
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
    </div>
  );
};
