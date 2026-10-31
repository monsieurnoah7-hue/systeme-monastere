import React, { useState } from 'react';
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
  Chip,
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
  Box,
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

      toast(`Contrôle Inopiné validé pour l'établi N°${kit.etabli_number}.`, 'success');
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
      toast(`Statut de "${selectedItemForEdit.name}" mis à jour.`, 'success');
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

  return (
    <div className="space-y-6">
      {/* Kit Banner Header */}
      <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-900/90 via-slate-800/80 to-slate-900/90 p-5 shadow-xl backdrop-blur">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="relative">
              {kit.employee_photo ? (
                <img
                  src={kit.employee_photo}
                  alt={kit.employee_name}
                  className="h-16 w-16 rounded-2xl border-2 border-emerald-500/40 object-cover shadow-lg"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-700 bg-slate-800 text-slate-400">
                  <User className="h-8 w-8" />
                </div>
              )}
              <span className="absolute -bottom-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-slate-950 shadow">
                #{kit.etabli_number}
              </span>
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-bold text-slate-100">
                  Établi N°{kit.etabli_number} — {kit.employee_name}
                </h3>
                <Chip tone="neutral">
                  {kit.code}
                </Chip>
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                <Building className="h-3.5 w-3.5 text-slate-400" />
                <span>Dotation : </span>
                <span className="font-semibold text-slate-300">{kit.source_magasin_name}</span>
                <span className="text-slate-600">•</span>
                <MapPin className="h-3.5 w-3.5 text-slate-400" />
                <span>{kit.location}</span>
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowPrintModal(true)}
              className="gap-2"
            >
              <Printer className="h-4 w-4" />
              <span>Planche QR Codes</span>
            </Button>
            {canManage && (
              <Button
                variant="primary"
                size="sm"
                onClick={openAudit}
                className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                <ShieldCheck className="h-4 w-4" />
                <span>Contrôle Inopiné</span>
              </Button>
            )}
          </div>
        </div>

        {/* Status Bar */}
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-4 rounded-xl bg-slate-950/60 p-3.5 border border-slate-800">
          <div>
            <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Complétude du Kit
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-100">{percentage}%</span>
              <span className="text-xs text-slate-400">
                ({present}/{total} conformes)
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  percentage === 100 ? 'bg-emerald-500' : percentage >= 80 ? 'bg-amber-500' : 'bg-rose-500'
                }`}
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Dernier Contrôle
            </span>
            <div className="mt-1 text-sm font-semibold text-slate-200">
              {kit.last_audited_at
                ? new Date(kit.last_audited_at).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Initialisé (26/10/2026)'}
            </div>
            <p className="text-xs text-slate-400">
              Par : {kit.last_audited_by || 'Direction & Chef Atelier'}
            </p>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Statut Opérationnel
            </span>
            <div className="mt-1">
              <span
                className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold ${
                  anomalies === 0
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                }`}
              >
                {anomalies === 0 ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Kit Intact & Conforme
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {anomalies} outil(s) à signaler
                  </>
                )}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-end">
            <div className="text-right">
              <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                Passeport Établi
              </span>
              <div className="mt-0.5 text-xs font-mono font-bold text-slate-300">
                {kit.id}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid of Tools in Kit */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <Box className="h-4 w-4 text-emerald-400" />
            Inventaire des {items.length} Outils du Kit
          </h4>
          <span className="text-xs text-slate-400">
            QR codes personnalisés : <code className="text-emerald-400 font-mono">CFTM-{kit.code}-...</code>
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const isOk = item.is_present && item.condition === 'bon';
            return (
              <div
                key={item.id}
                onClick={() => canManage && setSelectedItemForEdit(item)}
                className={`group relative flex items-center justify-between rounded-xl border p-3 transition-all ${
                  canManage ? 'cursor-pointer hover:border-slate-500 hover:shadow-md' : ''
                } ${
                  isOk
                    ? 'border-slate-800 bg-slate-900/60'
                    : 'border-amber-500/40 bg-amber-500/5'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-slate-800 text-xs font-mono font-bold text-slate-300">
                    {String(item.item_num).padStart(2, '0')}
                  </span>
                  <div>
                    <h5 className="text-sm font-semibold text-slate-200 line-clamp-1">
                      {item.name}
                    </h5>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] font-mono text-slate-400">
                        {item.tool_code}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        • {item.qty} {item.unit}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      item.condition === 'bon' && item.is_present
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : item.condition === 'a_affuter'
                        ? 'bg-amber-500/15 text-amber-400'
                        : item.condition === 'manquant'
                        ? 'bg-rose-500/15 text-rose-400'
                        : 'bg-indigo-500/15 text-indigo-400'
                    }`}
                  >
                    {!item.is_present ? 'Manquant' : item.condition.replace('_', ' ')}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Audit History */}
      {audits.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2 mb-3">
            <History className="h-4 w-4 text-slate-400" />
            Historique des Contrôles Inopinés & Audits
          </h4>
          <div className="divide-y divide-slate-800/80">
            {audits.map((a) => (
              <div key={a.id} className="py-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-2 w-2 rounded-full ${
                      a.status === 'conforme'
                        ? 'bg-emerald-400'
                        : a.status === 'anomalie'
                        ? 'bg-amber-400'
                        : 'bg-rose-400'
                    }`}
                  />
                  <div>
                    <span className="font-semibold text-slate-200">
                      Audit par {a.auditor_name}
                    </span>
                    {a.anomalies_note && (
                      <p className="text-slate-400 mt-0.5 italic text-[11px]">
                        « {a.anomalies_note} »
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-right">
                  <span className="font-mono text-slate-400">
                    {a.items_present_count}/{a.items_total_count} outils
                  </span>
                  <span className="text-slate-400">
                    {new Date(a.audited_at).toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal Audit Inopiné */}
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
              {isAuditing ? <Spinner className="h-4 w-4" /> : 'Enregistrer le Contrôle'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-800/50 p-3 text-xs text-slate-300">
            Vérifiez la présence et l'état des outils sur l'établi de{' '}
            <strong className="text-slate-100">{kit.employee_name}</strong>. Cliquez sur un
            outil si une anomalie est constatée.
          </div>

          <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-800">
            {items.map((it) => {
              const current = itemAuditStates[it.id] || {
                is_present: it.is_present,
                condition: it.condition,
              };
              return (
                <div key={it.id} className="pt-1.5 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-200">
                    {it.item_num}. {it.name}
                  </span>
                  <div className="flex items-center gap-1.5">
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
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      ✓ Conforme
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
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
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
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Manquant
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-2 pt-2">
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
                ✓ Conforme (100%)
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
                ⚠ Anomalie mineure
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
                ✕ Incomplet / Perte
              </button>
            </div>

            <textarea
              value={auditNotes}
              onChange={(e) => setAuditNotes(e.target.value)}
              placeholder="Remarques / actions correctives éventuelles..."
              className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
              rows={2}
            />
          </div>
        </div>
      </Modal>

      {/* Modal Planche d'Impression QR Codes */}
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
              <span>Lancer l'impression</span>
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-800/60 p-3 text-xs text-slate-300">
            Cette planche est formatée pour être imprimée sur feuille adhésive A4. Le grand QR
            code est à coller sur la servante ou le panneau mural, et les mini-étiquettes sur les
            manches des outils.
          </div>

          {/* Grand QR Code Maître */}
          <div className="rounded-xl border border-slate-700 bg-white p-4 text-slate-900 text-center">
            <div className="text-xs font-black uppercase tracking-wider text-slate-600">
              CFTM • MONASTÈRE BÉNÉDICTIN MONT-FÉBÉ
            </div>
            <div className="text-base font-black text-slate-950 mt-0.5">
              PASSEPORT ÉTABLI N°{kit.etabli_number}
            </div>
            <div className="text-xs font-bold text-slate-700">
              {kit.employee_name} — {kit.employee_job}
            </div>

            <div className="my-3 flex justify-center">
              <QrCode value={`${QR_PREFIX.kit}${kit.id}`} size={160} />
            </div>

            <div className="font-mono text-xs font-bold text-slate-800">{kit.id}</div>
            <div className="text-[10px] text-slate-500 mt-1">
              Dotation : {kit.source_magasin_name} • {kit.location}
            </div>
          </div>

          {/* Mini étiquettes d'outils */}
          <div className="max-h-60 overflow-y-auto space-y-2 border-t border-slate-800 pt-3">
            <span className="text-xs font-bold text-slate-300">
              Mini-étiquettes avec initiales ({items.length} outils)
            </span>
            <div className="grid grid-cols-2 gap-2">
              {items.slice(0, 10).map((it) => (
                <div
                  key={it.id}
                  className="flex items-center gap-2 rounded border border-slate-700 bg-slate-800 p-2 text-[11px]"
                >
                  <QrCode value={`CFTM:TOOL:${it.tool_code}`} size={36} />
                  <div className="min-w-0">
                    <div className="font-mono font-bold text-emerald-400 truncate">
                      {it.tool_code}
                    </div>
                    <div className="text-slate-300 truncate">{it.name}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal Modification d'un outil */}
      <Modal
        open={!!selectedItemForEdit}
        title={selectedItemForEdit ? `Gestion Outil : ${selectedItemForEdit.name}` : ''}
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
            <div className="rounded-lg bg-slate-800/60 p-3 text-slate-300 space-y-1">
              <div>
                <span className="text-slate-400">Code Outil :</span>{' '}
                <strong className="font-mono text-emerald-400">{selectedItemForEdit.tool_code}</strong>
              </div>
              <div>
                <span className="text-slate-400">Établi :</span>{' '}
                <strong className="text-slate-200">N°{kit.etabli_number} ({kit.employee_name})</strong>
              </div>
              <div>
                <span className="text-slate-400">Dotation d'origine :</span>{' '}
                <strong className="text-slate-200">{kit.source_magasin_name}</strong>
              </div>
            </div>

            <div className="space-y-2">
              <span className="font-semibold text-slate-200">État de l'outil :</span>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={selectedItemForEdit.condition === 'bon' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => handleUpdateItemCondition('bon', true)}
                >
                  ✓ Bon état (En service)
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
                  ✕ Manquant / Perdu
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
