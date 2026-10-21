import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type Magasin, type ScanResult, type Tool, type StockRef } from '../lib/api';
import {
  Button, Card, Chip, Drawer, EmptyState, Field,
  Modal, PageHeader, Skeleton, TextArea, useToast,
} from '../components/ui';
import { IconAlert, IconBox, IconPlus, IconSearch } from '../components/Icons';
import { STATUS_LABEL, STATUS_TONE } from '../lib/labels';

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
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Magasin | null>(null);
  const [form, setForm] = useState({ name: '', code: '', description: '' });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ magasins: Magasin[] }>('/api/magasins');
      setMagasins(res.magasins);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, reloadKey]);

  useEffect(() => {
    if (scan?.kind === 'tool' && scan.tool.magasin_id) setSelectedId(scan.tool.magasin_id);
  }, [scan]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    setDetailLoading(true);
    api<MagasinDetail>(`/api/magasins/${selectedId}`)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  const filtered = magasins.filter((m) => !q || m.name.toLowerCase().includes(q.toLowerCase()) || m.code.toLowerCase().includes(q.toLowerCase()));

  const openNew = () => { setEditing(null); setForm({ name: '', code: '', description: '' }); setFormError(null); setFormOpen(true); };

  const submit = async () => {
    if (!form.name.trim() || !form.code.trim()) { setFormError('Nom et code obligatoires.'); return; }
    setBusy(true); setFormError(null);
    try {
      if (editing) {
        await api(`/api/magasins/${editing.id}`, { method: 'PATCH', body: JSON.stringify(form) });
        toast('Magasin mis à jour', 'success');
      } else {
        await api('/api/magasins', { method: 'POST', body: JSON.stringify(form) });
        toast('Magasin créé', 'success');
      }
      setFormOpen(false); setReloadKey((k) => k + 1);
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Erreur');
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Inventaire"
        title="Magasins"
        hint="Magasins, ateliers et quincaillerie — rattachement des outils et du stock"
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
            className="w-full rounded-xl border border-line bg-surface py-2.5 pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-amber-3 focus:outline-none focus:ring-2 focus:ring-amber/20"
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
            <button key={m.id} onClick={() => setSelectedId(m.id)} className="text-left">
              <Card hover className="h-full">
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
                  <span>{m.tools_count ?? 0} outil{(m.tools_count ?? 0) > 1 ? 's' : ''}</span>
                  <span>{m.stock_count ?? 0} réf. stock</span>
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}

      <Drawer
        open={!!selectedId}
        title={detail?.magasin.name ?? 'Magasin'}
        subtitle={detail ? `${detail.magasin.code} · ${detail.tools.length} outils · ${detail.stock.length} réf. stock` : undefined}
        onClose={() => setSelectedId(null)}
        wide
      >
        {detailLoading || !detail ? (
          <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">Outils rattachés</p>
              {canManage && <Button size="sm" variant="ghost" onClick={() => { setEditing(detail.magasin); setForm({ name: detail.magasin.name, code: detail.magasin.code, description: detail.magasin.description ?? '' }); setFormOpen(true); }}>Modifier</Button>}
            </div>
            {detail.tools.length === 0 ? (
              <p className="text-sm text-ink-faint">Aucun outil dans ce magasin.</p>
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {detail.tools.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{t.name}</p>
                      <p className="text-xs text-ink-soft">{t.id} · {t.category}</p>
                      {t.status_reason && <p className="text-xs text-red">{t.status_reason}</p>}
                    </div>
                    <Chip tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Chip>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-sm font-semibold text-ink">Stock rattaché</p>
            {detail.stock.length === 0 ? (
              <p className="text-sm text-ink-faint">Aucune référence de stock dans ce magasin.</p>
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {detail.stock.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{r.name}</p>
                      <p className="text-xs text-ink-soft">{r.category}</p>
                    </div>
                    <span className="text-sm font-semibold text-ink num">{r.qty} {r.unit}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Drawer>

      <Modal open={formOpen} title={editing ? 'Modifier le magasin' : 'Nouveau magasin'} onClose={() => setFormOpen(false)} footer={
        <>
          <Button variant="ghost" onClick={() => setFormOpen(false)}>Annuler</Button>
          <Button variant="primary" loading={busy} onClick={submit}>{editing ? 'Enregistrer' : 'Créer'}</Button>
        </>
      }>
        <div className="space-y-3">
          {formError && <div className="rounded-lg bg-red-wash px-3 py-2 text-sm text-red">{formError}</div>}
          <Field label="Nom" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Magasin C" />
          <Field label="Code (court)" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="MGC" />
          <TextArea label="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Réserve principale, atelier…" />
        </div>
      </Modal>
    </div>
  );
}
