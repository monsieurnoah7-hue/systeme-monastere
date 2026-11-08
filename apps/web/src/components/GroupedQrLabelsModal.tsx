import { useMemo, useState } from 'react';
import { Printer, Search } from 'lucide-react';
import { api, type StockRef, type Tool } from '../lib/api';
import { QR_PREFIX, qrDataUrl } from '../lib/qr';
import { usePrintSheet } from '../lib/print';
import { Button, Modal, Spinner, useToast } from './ui';
import { PrintPreviewModal } from './PrintPreviewModal';

type Label = { key: string; name: string; detail: string; store: string; qr: string };

function QrLabelSheet({ labels, paper }: { labels: Label[]; paper: 'A4' | 'Letter' }) {
  return <div className="a4-page label-grid" style={{ '--label-cols': 4, '--label-width': '45mm', '--label-height': '25mm', '--label-gap': '2mm', width: '190mm', minHeight: paper === 'A4' ? '277mm' : '260mm', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4, 45mm)', gridAutoRows: '25mm', gap: '2mm', alignContent: 'start', padding: '4mm', boxSizing: 'border-box', fontFamily: 'Arial, sans-serif' } as React.CSSProperties}>
    {labels.map((label, index) => <div key={`${label.key}-${index}`} className="tool-label-card" style={{ width: '45mm', height: '25mm', display: 'flex', overflow: 'hidden', border: '0.25mm solid #bbb', background: 'white', color: '#17181b', breakInside: 'avoid', boxSizing: 'border-box', padding: '1mm' }}>
      <img src={label.qr} alt={`QR ${label.name}`} style={{ width: '20mm', height: '20mm', objectFit: 'contain', alignSelf: 'center' }} />
      <div style={{ minWidth: 0, alignSelf: 'center', paddingLeft: '1mm' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8mm', marginBottom: '0.5mm' }}>
          <img src="/emblem.png" alt="" style={{ width: '3mm', height: '3mm', objectFit: 'contain' }} />
          <strong style={{ display: 'block', fontSize: '6pt' }}>CFTM</strong>
        </div>
        <span style={{ display: 'block', fontSize: '7pt', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label.name}</span>
        <span style={{ display: 'block', fontSize: '5.5pt', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label.detail}</span>
        <span style={{ display: 'block', fontSize: '5pt', color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label.store}</span>
      </div>
    </div>)}
  </div>;
}

export function GroupedQrLabelsModal({ canViewTools, canViewStock, storeScope }: { canViewTools: boolean; canViewStock: boolean; storeScope?: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tools, setTools] = useState<Tool[]>([]);
  const [refs, setRefs] = useState<StockRef[]>([]);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<'tools' | 'stock'>(canViewTools ? 'tools' : 'stock');
  const [store, setStore] = useState('');
  const [paper, setPaper] = useState<'A4' | 'Letter'>('A4');
  const [printContent, setPrintContent] = useState<React.ReactNode>(null);
  const [preparing, setPreparing] = useState(false);
  const { print, portal } = usePrintSheet();
  const records = useMemo(() => [
    ...(canViewTools ? tools.map((tool) => ({ key: `tool:${tool.id}`, name: tool.name, detail: tool.id, store: tool.magasin_name || 'Atelier', location: tool.location, prefix: QR_PREFIX.tool })) : []),
    ...(canViewStock ? refs.map((ref) => ({ key: `stock:${ref.id}`, name: ref.name, detail: `${ref.qty} ${ref.unit}`, store: ref.magasin_name || 'Magasin', location: ref.location, prefix: QR_PREFIX.stock })) : []),
  ].filter((entry) => entry.key.startsWith(`${source === 'tools' ? 'tool' : 'stock'}:`) && (!store || entry.store === store) && `${entry.name} ${entry.detail} ${entry.store} ${entry.location}`.toLowerCase().includes(query.toLowerCase())), [tools, refs, canViewTools, canViewStock, source, store, query]);
  const stores = [...new Set(records.map((item) => item.store))].sort();
  const selectedCount = records.reduce((sum, item) => sum + (selected[item.key] || 0), 0);
  const openModal = async () => {
    setStore(storeScope ?? '');
    setSelected({});
    setOpen(true); setLoading(true);
    const results = await Promise.allSettled([
      canViewTools ? api<{ tools: Tool[] }>('/api/tools').then((r) => setTools(r.tools)) : Promise.resolve(),
      canViewStock ? api<{ refs: StockRef[] }>('/api/stock/refs').then((r) => setRefs(r.refs)) : Promise.resolve(),
    ]);
    const failed = results.some((result) => result.status === 'rejected');
    if (failed) toast('Certaines étiquettes ne sont pas accessibles avec les droits de ce compte.', 'error');
    setLoading(false);
  };
  const preparePreview = async () => {
    const copies = records.flatMap((item) => Array.from({ length: selected[item.key] || 0 }, () => item));
    if (!copies.length || copies.length > 500) return;
    setPreparing(true);
    try {
      const labels = await Promise.all(copies.map(async (item) => ({ key: item.key, name: item.name, detail: item.detail, store: item.store, qr: await qrDataUrl(`${item.prefix}${item.key.split(':')[1]}`, 220) })));
      setPrintContent(<QrLabelSheet labels={labels} paper={paper} />);
      setOpen(false); setPreview(true);
    } catch { toast('Impossible de préparer cette planche QR.', 'error'); }
    finally { setPreparing(false); }
  };
  if (!canViewTools && !canViewStock) return null;
  return <>
    <Button size="sm" variant="secondary" icon={<Printer size={14} />} onClick={() => void openModal()}><span className="sm:hidden">QR groupés</span><span className="hidden sm:inline">Planche QR groupée</span></Button>
    <Modal open={open} title={`Planche QR · ${source === 'tools' ? 'Matériel & Machines' : 'Matières & Quincaillerie'}`} onClose={() => setOpen(false)} footer={<div className="flex w-full justify-between gap-2"><Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button variant="primary" disabled={loading || !selectedCount || selectedCount > 500 || preparing} icon={<Printer size={14} />} onClick={() => void preparePreview()}>{preparing ? 'Préparation…' : `Aperçu · ${selectedCount} étiquette(s)`}</Button></div>}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {canViewTools && canViewStock ? <label className="text-xs text-ink-soft">Famille de planche<select value={source} onChange={(e) => { setSource(e.target.value as typeof source); if (!storeScope) setStore(''); setSelected({}); }} className="mt-1 h-10 w-full rounded-lg border border-line bg-surface px-2 text-ink"><option value="tools">Matériel & Machines</option><option value="stock">Matières & Quincaillerie</option></select></label> : <div className="flex items-end text-xs font-semibold text-ink">{source === 'tools' ? 'Matériel & Machines' : 'Matières & Quincaillerie'}</div>}
          <label className="text-xs text-ink-soft">{storeScope ? 'Magasin sélectionné' : source === 'tools' ? 'Magasin / atelier' : 'Magasin'}<select value={store} disabled={!!storeScope} onChange={(e) => setStore(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-line bg-surface px-2 text-ink disabled:opacity-75"><option value="">Tous</option>{stores.map((name) => <option key={name}>{name}</option>)}</select></label>
          <label className="text-xs text-ink-soft">Papier<select value={paper} onChange={(e) => setPaper(e.target.value as typeof paper)} className="mt-1 h-10 w-full rounded-lg border border-line bg-surface px-2 text-ink"><option>A4</option><option>Letter</option></select></label>
        </div>
        <label className="relative block"><Search size={15} className="absolute left-3 top-3 text-ink-faint"/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={source === 'tools' ? 'Rechercher un outil ou une machine…' : 'Rechercher une matière ou une référence…'} className="h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm text-ink"/></label>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-soft"><span>{selectedCount} étiquette(s) sélectionnée(s)</span><div className="flex flex-wrap items-center gap-1.5">{[2, 3, 5, 9].map((count) => <button key={count} type="button" disabled={!records.length} onClick={() => setSelected(Object.fromEntries(records.slice(0, count).map((item) => [item.key, 1])))} className="rounded-md border border-line px-2 py-1 font-semibold text-ink-soft hover:bg-paper-2 disabled:opacity-40">{count}</button>)}<button type="button" onClick={() => setSelected(Object.fromEntries(records.map((item) => [item.key, 1])))} className="font-semibold text-amber">Tout</button></div></div>
        {selectedCount > 500 && <p className="text-xs text-red">Limite de 500 étiquettes par planche.</p>}
        <div className="max-h-[min(48vh,440px)] space-y-1 overflow-y-auto rounded-lg border border-line p-1">{loading ? <div className="flex justify-center p-8"><Spinner/></div> : records.map((item) => <label key={item.key} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-paper-2"><input type="checkbox" checked={(selected[item.key] || 0) > 0} onChange={(e) => setSelected((current) => ({ ...current, [item.key]: e.target.checked ? 1 : 0 }))} className="h-4 w-4 accent-amber"/><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-ink">{item.name}</strong><span className="block truncate text-xs text-ink-soft">{item.detail} · {item.store}</span></span><input aria-label={`Quantité ${item.name}`} type="number" min={1} max={100} disabled={!selected[item.key]} value={selected[item.key] || 1} onChange={(e) => setSelected((current) => ({ ...current, [item.key]: Math.min(100, Math.max(1, Number(e.target.value) || 1)) }))} className="h-9 w-16 rounded-md border border-line bg-surface text-center text-sm text-ink disabled:opacity-40"/></label>)}{!loading && !records.length && <p className="p-6 text-center text-sm text-ink-soft">Aucun élément ne correspond à votre recherche.</p>}</div>
      </div>
    </Modal>
    <PrintPreviewModal open={preview} title={`Aperçu · ${source === 'tools' ? 'Matériel & Machines' : 'Matières & Quincaillerie'}`} paper={paper} copiesLabel={`${selectedCount} étiquette(s)`} content={printContent} onClose={() => setPreview(false)} onPrint={() => { if (printContent) print(printContent); setPreview(false); }} />
    {portal}
  </>;
}
