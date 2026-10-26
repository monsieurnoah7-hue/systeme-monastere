import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type Magasin, type ScanResult, type Tool, type StockRef } from '../lib/api';
import {
  Button, Card, Chip, Drawer, EmptyState, Field,
  Modal, PageHeader, Skeleton, TextArea, useToast,
} from '../components/ui';
import { IconAlert, IconBox, IconPlus, IconSearch } from '../components/Icons';
import { STATUS_LABEL, STATUS_TONE } from '../lib/labels';
import { ArrowRightLeft, Trash2, Wrench, Package, X } from 'lucide-react';

type MagasinDetail = {
  magasin: Magasin;
  tools: (Pick<Tool, 'id' | 'name' | 'category' | 'status' | 'condition' | 'status_reason'>)[];
  stock: (Pick<StockRef, 'id' | 'name' | 'category' | 'unit' | 'qty' | 'min_qty'>)[];
};

export function Magasins({ user, scan }: { user: { role: string }; scan?: ScanResult | null }) {
  const toast = useToast();
  const canManage = user.role === 'magasinier' || user.role === 'direction';
  const [magasins, setMagasins] = useState<Magasin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MagasinDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [drawerFilter, setDrawerFilter] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Magasin | null>(null);
  const [form, setForm] = useState({ name: '', code: '', description: '' });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Deletion state
  const [deleteFor, setDeleteFor] = useState<Magasin | null>(null);
  const [deleteTargetMagasinId, setDeleteTargetMagasinId] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Single item action states
  const [transferToolItem, setTransferToolItem] = useState<{ id: string; name: string } | null>(null);
  const [transferTargetId, setTransferTargetId] = useState('');
  const [deleteToolItem, setDeleteToolItem] = useState<{ id: string; name: string } | null>(null);
  const [transferStockItem, setTransferStockItem] = useState<{ id: number; name: string } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    if (magasins.length === 0) setLoading(true);
    setError(null);
    try {
      const res = await api<{ magasins: Magasin[] }>('/api/magasins');
      setMagasins(res.magasins);
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

  useEffect(() => { load(); }, [load, reloadKey]);

  useEffect(() => {
    if (scan?.kind === 'tool' && scan.tool.magasin_id) setSelectedId(scan.tool.magasin_id);
  }, [scan]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
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

  const filtered = magasins.filter((m) => !q || m.name.toLowerCase().includes(q.toLowerCase()) || m.code.toLowerCase().includes(q.toLowerCase()));

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', code: '', description: '' });
    setFormError(null);
    setFormOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim() || !form.code.trim()) { setFormError('Nom et code obligatoires.'); return; }
    setBusy(true); setFormError(null);
    try {
      if (editing) {
        await api(`/api/magasins/${editing.id}`, { method: 'PATCH', body: JSON.stringify(form) });
        toast('Magasin mis à jour', 'success');
      } else {
        await api('/api/magasins', { method: 'POST', body: JSON.stringify(form) });
        toast('Magasin créé avec succès', 'success');
      }
      setFormOpen(false);
      setReloadKey((k) => k + 1);
      notifyChange();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Erreur');
    } finally { setBusy(false); }
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
      toast(res.message || 'Magasin supprimé avec succès', 'success');
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
      toast(`Référence stock transférée.`, 'success');
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

  const filteredTools = detail?.tools.filter((t) =>
    !drawerFilter || t.name.toLowerCase().includes(drawerFilter.toLowerCase()) || t.id.toLowerCase().includes(drawerFilter.toLowerCase())
  ) ?? [];

  const filteredStock = detail?.stock.filter((s) =>
    !drawerFilter || s.name.toLowerCase().includes(drawerFilter.toLowerCase())
  ) ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Magasins &amp; Dépôts"
        actions={
          canManage ? (
            <Button variant="primary" icon={<IconPlus size={16} />} onClick={openNew}>Nouveau magasin</Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher un magasin…"
            className="w-full rounded-xl border border-line bg-surface py-2.5 pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-amber focus:outline-none focus:ring-2 focus:ring-amber/20"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : error ? (
        <EmptyState icon={<IconAlert size={28} />} title="Erreur de chargement" hint={error} action={<Button onClick={() => setReloadKey((k) => k + 1)}>Réessayer</Button>} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<IconBox size={28} />} title="Aucun magasin" hint={canManage ? 'Créez le premier magasin pour commencer l’inventaire.' : undefined} action={canManage ? <Button variant="primary" onClick={openNew}>Créer</Button> : undefined} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((m) => (
            <button key={m.id} onClick={() => setSelectedId(m.id)} className="text-left group">
              <Card hover className="h-full transition-all group-hover:border-amber/40">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-charcoal text-[11px] font-bold text-amber">{m.code}</span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">{m.name}</p>
                        <p className="truncate text-xs text-ink-soft">{m.description || '—'}</p>
                      </div>
                    </div>
                  </div>
                  {!m.active && <Chip tone="red">Inactif</Chip>}
                </div>
                <div className="mt-3 flex gap-3 text-xs text-ink-soft">
                  <span className="flex items-center gap-1"><Wrench size={12} className="text-amber" /> {m.tools_count ?? 0} outil{(m.tools_count ?? 0) > 1 ? 's' : ''}</span>
                  <span className="flex items-center gap-1"><Package size={12} className="text-sky-400" /> {m.stock_count ?? 0} réf. stock</span>
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}

      {/* Drawer Détail Magasin & Gestion Interne */}
      <Drawer
        open={!!selectedId}
        title={detail?.magasin.name ?? 'Magasin'}
        subtitle={detail ? `${detail.magasin.code} · ${detail.tools.length} outils · ${detail.stock.length} réf. stock` : undefined}
        onClose={() => { setSelectedId(null); setDrawerFilter(''); }}
        wide
      >
        {detailLoading || !detail ? (
          <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
        ) : (
          <div className="space-y-5">
            {/* Header actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
              <div>
                <p className="text-xs text-ink-soft">{detail.magasin.description || 'Aucune description'}</p>
              </div>
              {canManage && (
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => { setEditing(detail.magasin); setForm({ name: detail.magasin.name, code: detail.magasin.code, description: detail.magasin.description ?? '' }); setFormOpen(true); }}>
                    Modifier
                  </Button>
                  <Button size="sm" variant="outline-danger" onClick={() => { setDeleteError(null); setDeleteTargetMagasinId(''); setDeleteFor(detail.magasin); }}>
                    Supprimer le magasin
                  </Button>
                </div>
              )}
            </div>

            {/* Quick search in drawer */}
            <div className="relative">
              <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                type="text"
                value={drawerFilter}
                onChange={(e) => setDrawerFilter(e.target.value)}
                placeholder="Filtrer outils et stocks de ce magasin..."
                className="w-full rounded-lg border border-line bg-surface py-2 pl-8 pr-8 text-xs text-ink placeholder:text-ink-faint focus:border-amber focus:outline-none"
              />
              {drawerFilter && (
                <button onClick={() => setDrawerFilter('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink">
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Outils rattachés */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-xs font-bold uppercase tracking-wider text-ink flex items-center gap-1.5">
                  <Wrench size={13} className="text-amber" /> Outils rattachés ({filteredTools.length})
                </p>
              </div>
              {filteredTools.length === 0 ? (
                <p className="text-xs text-ink-faint italic py-2">Aucun outil trouvé dans ce magasin.</p>
              ) : (
                <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                  {filteredTools.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-paper-2/40 transition-colors">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-xs font-semibold text-ink">{t.name}</p>
                          <Chip tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Chip>
                        </div>
                        <p className="text-[11px] text-ink-faint font-mono">{t.id} · {t.category}</p>
                        {t.status_reason && <p className="text-[11px] text-red">{t.status_reason}</p>}
                      </div>

                      {canManage && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => { setTransferToolItem({ id: t.id, name: t.name }); setTransferTargetId(''); }}
                            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border border-line hover:border-amber hover:text-amber text-ink-soft bg-surface-2 transition-colors"
                            title="Transférer vers un autre magasin"
                          >
                            <ArrowRightLeft size={12} />
                            <span>Transférer</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteToolItem({ id: t.id, name: t.name })}
                            className="p-1 rounded text-ink-faint hover:text-red hover:bg-red-wash transition-colors"
                            title="Supprimer cet outil"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Stock rattaché */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-xs font-bold uppercase tracking-wider text-ink flex items-center gap-1.5">
                  <Package size={13} className="text-sky-400" /> Stock rattaché ({filteredStock.length})
                </p>
              </div>
              {filteredStock.length === 0 ? (
                <p className="text-xs text-ink-faint italic py-2">Aucune référence de stock trouvée.</p>
              ) : (
                <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                  {filteredStock.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-paper-2/40 transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-ink">{r.name}</p>
                        <p className="text-[11px] text-ink-faint">{r.category} · Qté min: {r.min_qty} {r.unit}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-bold font-mono text-ink tabular-nums">{r.qty} {r.unit}</span>
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => { setTransferStockItem({ id: r.id, name: r.name }); setTransferTargetId(''); }}
                            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border border-line hover:border-sky-400 hover:text-sky-400 text-ink-soft bg-surface-2 transition-colors"
                            title="Transférer vers un autre magasin"
                          >
                            <ArrowRightLeft size={12} />
                            <span>Transférer</span>
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* Modal Créer / Modifier Magasin */}
      <Modal open={formOpen} title={editing ? 'Modifier le magasin' : 'Nouveau magasin'} onClose={() => setFormOpen(false)} footer={
        <>
          <Button variant="ghost" onClick={() => setFormOpen(false)}>Annuler</Button>
          <Button variant="primary" loading={busy} onClick={submit}>{editing ? 'Enregistrer' : 'Créer'}</Button>
        </>
      }>
        <div className="space-y-3">
          {formError && <div className="rounded-lg bg-red-wash px-3 py-2 text-sm text-red">{formError}</div>}
          <Field label="Nom du magasin" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Atelier Central, Magasin Bois…" />
          <Field label="Code abrégé" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="MAG-A, BOIS…" />
          <TextArea label="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Localisation, typologie d'articles stockés…" />
        </div>
      </Modal>

      {/* Modal Suppression Magasin Intelligente avec Réaffectation Automatique */}
      <Modal open={!!deleteFor} title="Suppression du magasin" onClose={() => setDeleteFor(null)} footer={
        <>
          <Button variant="ghost" onClick={() => setDeleteFor(null)}>Annuler</Button>
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
      }>
        <div className="space-y-4">
          {deleteError && <div className="rounded-lg bg-red-wash px-3 py-2 text-xs text-red font-medium">{deleteError}</div>}
          
          <p className="text-sm text-ink">
            Êtes-vous sûr de vouloir supprimer le magasin <strong className="text-amber">{deleteFor?.name}</strong> ({deleteFor?.code}) ?
          </p>

          {deleteFor && ((deleteFor.tools_count ?? 0) > 0 || (deleteFor.stock_count ?? 0) > 0) ? (
            <div className="rounded-xl border border-amber/30 bg-amber-wash/40 p-3.5 space-y-3">
              <div className="flex items-start gap-2 text-xs text-amber-900 dark:text-amber">
                <IconAlert size={16} className="shrink-0 mt-0.5" />
                <span>
                  Ce magasin contient actuellement <strong>{deleteFor.tools_count ?? 0} outil(s)</strong> et <strong>{deleteFor.stock_count ?? 0} référence(s) de stock</strong>.
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
            <Button variant="ghost" onClick={() => setTransferToolItem(null)}>Annuler</Button>
            <Button variant="primary" loading={actionBusy} disabled={!transferTargetId} onClick={() => void handleExecuteTransferTool()}>
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
        title={`Supprimer l'outil`}
        onClose={() => setDeleteToolItem(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteToolItem(null)}>Annuler</Button>
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

      {/* Modal Transfert Rapide d'une Référence Stock */}
      <Modal
        open={!!transferStockItem}
        title={`Transférer l'article de stock : ${transferStockItem?.name ?? ''}`}
        onClose={() => setTransferStockItem(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setTransferStockItem(null)}>Annuler</Button>
            <Button variant="primary" loading={actionBusy} disabled={!transferTargetId} onClick={() => void handleExecuteTransferStock()}>
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
