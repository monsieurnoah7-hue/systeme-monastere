import { useEffect, useState } from 'react';
import { api, type StockRef, type Tool } from '../lib/api';
import { Button, Field, Modal, TextArea, useToast } from './ui';

export type InventoryEditTarget =
  | { kind: 'tool'; item: Pick<Tool, 'id' | 'name' | 'category' | 'location'> & Partial<Pick<Tool, 'brand' | 'model' | 'serial_number' | 'observations'>> }
  | { kind: 'stock'; item: Pick<StockRef, 'id' | 'name' | 'category' | 'unit' | 'location' | 'min_qty'> & Partial<Pick<StockRef, 'brand' | 'supplier'>> };

type EditForm = {
  name: string;
  category: string;
  location: string;
  brand: string;
  model: string;
  serial_number: string;
  observations: string;
  unit: string;
  min_qty: string;
  supplier: string;
};

const EMPTY_FORM: EditForm = {
  name: '', category: '', location: '', brand: '', model: '', serial_number: '',
  observations: '', unit: '', min_qty: '0', supplier: '',
};

export function InventoryEditModal({
  target,
  onClose,
}: {
  target: InventoryEditTarget | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<EditForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!target) return;
    const item = target.item;
    const common = {
      ...EMPTY_FORM,
      name: item.name,
      category: item.category,
      location: item.location,
      brand: item.brand ?? '',
    };
    setForm(target.kind === 'tool'
      ? {
          ...common,
          model: target.item.model ?? '',
          serial_number: target.item.serial_number ?? '',
          observations: target.item.observations ?? '',
        }
      : {
          ...common,
          unit: target.item.unit,
          min_qty: String(target.item.min_qty),
          supplier: target.item.supplier ?? '',
        });
    setError('');
  }, [target]);

  async function save() {
    if (!target) return;
    if (form.name.trim().length < 2 || !form.category.trim() || !form.location.trim()) {
      setError('Renseignez le nom, la catégorie et l’emplacement.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (target.kind === 'tool') {
        await api(`/api/tools/${target.item.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: form.name.trim(),
            category: form.category.trim(),
            location: form.location.trim(),
            brand: form.brand.trim(),
            model: form.model.trim(),
            serial_number: form.serial_number.trim(),
            observations: form.observations.trim(),
          }),
        });
      } else {
        const minQty = Number(form.min_qty);
        if (!Number.isFinite(minQty) || minQty < 0) {
          setError('Le seuil d’alerte doit être un nombre positif ou nul.');
          return;
        }
        await api(`/api/stock/refs/${target.item.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: form.name.trim(),
            category: form.category.trim(),
            location: form.location.trim(),
            unit: form.unit.trim(),
            brand: form.brand.trim(),
            supplier: form.supplier.trim(),
            min_qty: minQty,
          }),
        });
      }
      window.dispatchEvent(new CustomEvent('mf-refresh-data'));
      toast('Fiche mise à jour dans le système.', 'success');
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'La fiche n’a pas pu être mise à jour.');
    } finally {
      setBusy(false);
    }
  }

  const isTool = target?.kind === 'tool';
  return (
    <Modal
      open={!!target}
      title={target ? `Modifier ${isTool ? 'le matériel' : 'la référence'} · ${target.item.name}` : 'Modifier la fiche'}
      onClose={onClose}
      footer={(
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>Annuler</Button>
          <Button variant="primary" disabled={busy} loading={busy} onClick={() => void save()}>Enregistrer</Button>
        </>
      )}
    >
      {target && (
        <div className="space-y-4">
          {error && <p role="alert" className="rounded-lg border border-red/30 bg-red-wash px-3 py-2 text-sm text-red">{error}</p>}
          <p className="text-sm text-ink-soft">
            Les changements mettent à jour cette même fiche partout où elle est utilisée. Le stock réel se corrige avec une entrée, une sortie ou un transfert.
          </p>
          <Field label="Nom / Désignation" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Catégorie" value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} />
            <Field label="Emplacement" value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Marque / Fabricant" value={form.brand} onChange={(event) => setForm((current) => ({ ...current, brand: event.target.value }))} />
            {isTool ? (
              <Field label="Modèle" value={form.model} onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))} />
            ) : (
              <Field label="Unité" value={form.unit} onChange={(event) => setForm((current) => ({ ...current, unit: event.target.value }))} />
            )}
          </div>
          {isTool ? (
            <>
              <Field label="Numéro de série" value={form.serial_number} onChange={(event) => setForm((current) => ({ ...current, serial_number: event.target.value }))} />
              <TextArea label="Observations" value={form.observations} onChange={(event) => setForm((current) => ({ ...current, observations: event.target.value }))} rows={3} />
            </>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Seuil d’alerte" type="number" min="0" value={form.min_qty} onChange={(event) => setForm((current) => ({ ...current, min_qty: event.target.value }))} />
              <Field label="Fournisseur" value={form.supplier} onChange={(event) => setForm((current) => ({ ...current, supplier: event.target.value }))} />
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
