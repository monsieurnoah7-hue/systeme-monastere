import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, type Magasin } from '../lib/api';
import { Button, Modal } from './ui';

type Props = {
  open: boolean;
  employeeId: string;
  employeeName: string;
  onClose: () => void;
  onCreated: () => void;
};

const inputClass = 'min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-blue';
const labelClass = 'mb-1.5 block text-xs font-semibold text-ink-soft';

export function CreateEtabliKitModal({ open, employeeId, employeeName, onClose, onCreated }: Props) {
  const [stores, setStores] = useState<Magasin[]>([]);
  const [storeId, setStoreId] = useState('');
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState('pièce');
  const [location, setLocation] = useState('');
  const [loadingStores, setLoadingStores] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedStore = useMemo(() => stores.find((store) => store.id === storeId), [stores, storeId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingStores(true);
    setError('');
    api<{ magasins: Magasin[] }>('/api/magasins', { bypassCache: true })
      .then(({ magasins }) => {
        if (cancelled) return;
        const activeStores = magasins.filter((store) => store.active);
        setStores(activeStores);
        setStoreId((current) => activeStores.some((store) => store.id === current) ? current : activeStores[0]?.id ?? '');
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Impossible de charger les magasins autorisés.');
      })
      .finally(() => {
        if (!cancelled) setLoadingStores(false);
      });
    return () => { cancelled = true; };
  }, [open]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!storeId) {
      setError('Choisissez le magasin de rattachement de cet établi.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api(`/api/kits/by-employee/${encodeURIComponent(employeeId)}/items`, {
        method: 'POST',
        body: JSON.stringify({
          name: itemName,
          qty: quantity,
          unit,
          source_magasin_id: storeId,
          location: location.trim() || undefined,
        }),
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'La création de l’établi a échoué.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Créer un établi et ajouter le premier outil"
      onClose={() => !saving && onClose()}
      footer={(
        <>
          <Button type="button" variant="secondary" disabled={saving} onClick={onClose}>Annuler</Button>
          <Button type="submit" form="create-etabli-kit-form" variant="primary" loading={saving} disabled={loadingStores || stores.length === 0 || !itemName.trim() || !storeId}>
            Créer l’établi
          </Button>
        </>
      )}
    >
      <form id="create-etabli-kit-form" onSubmit={(event) => void submit(event)} className="space-y-4">
        <p className="text-sm leading-relaxed text-ink-soft">
          Le premier outil crée la dotation nominative de <strong className="text-ink">{employeeName}</strong>. Le système attribue un numéro et un QR code uniques.
        </p>

        {error && <p role="alert" className="rounded-lg border border-red/30 bg-red-wash px-3 py-2 text-sm text-red">{error}</p>}

        <div>
          <label className={labelClass} htmlFor="new-kit-store">Magasin de rattachement</label>
          <select id="new-kit-store" required value={storeId} onChange={(event) => setStoreId(event.target.value)} disabled={loadingStores || saving} className={inputClass}>
            <option value="">{loadingStores ? 'Chargement des magasins…' : stores.length ? 'Choisir un magasin' : 'Aucun magasin autorisé'}</option>
            {stores.map((store) => <option key={store.id} value={store.id}>{store.name} · {store.code}</option>)}
          </select>
          <p className="mt-1 text-xs text-ink-faint">Ce choix indique où la dotation est suivie dans le système.</p>
        </div>

        <div>
          <label className={labelClass} htmlFor="new-kit-location">Emplacement précis <span className="font-normal">(facultatif)</span></label>
          <input id="new-kit-location" className={inputClass} value={location} onChange={(event) => setLocation(event.target.value)} maxLength={120} placeholder={selectedStore ? `${selectedStore.name} — emplacement à préciser` : 'Ex. Atelier de production, établi côté fenêtre'} disabled={saving} />
          <p className="mt-1 text-xs text-ink-faint">Sans précision, l’emplacement sera généré à partir du magasin et du numéro de l’établi.</p>
        </div>

        <fieldset className="space-y-3 rounded-xl border border-line bg-surface-2/40 p-3">
          <legend className="px-1 text-xs font-semibold text-ink">Premier outil de la dotation</legend>
          <div>
            <label className={labelClass} htmlFor="new-kit-item-name">Nom de l’outil</label>
            <input id="new-kit-item-name" required minLength={2} maxLength={120} autoFocus className={inputClass} value={itemName} onChange={(event) => setItemName(event.target.value)} placeholder="Ex. Mètre ruban" disabled={saving} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="new-kit-item-qty">Quantité</label>
              <input id="new-kit-item-qty" type="number" min={1} max={1000} step={1} required className={inputClass} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} disabled={saving} />
            </div>
            <div>
              <label className={labelClass} htmlFor="new-kit-item-unit">Unité</label>
              <input id="new-kit-item-unit" required minLength={1} maxLength={24} className={inputClass} value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="pièce" disabled={saving} />
            </div>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
