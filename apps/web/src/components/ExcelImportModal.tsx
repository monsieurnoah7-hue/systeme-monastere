import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { api } from '../lib/api';
import { useToast } from './ui';

interface ExcelImportModalProps {
  type: 'stock' | 'tools';
  onClose: () => void;
  onSuccess: () => void;
}

interface ParsedStockRow {
  name: string;
  category?: string;
  unit?: string;
  location?: string;
  brand?: string;
  supplier?: string;
  unit_cost?: number;
  qty?: number;
  min_qty?: number;
  magasin_id?: string;
}

interface ParsedToolRow {
  name: string;
  category?: string;
  brand?: string;
  model?: string;
  serial_number?: string;
  location?: string;
  acquisition_cost?: number;
  acquisition_year?: number;
  lifespan_years?: number;
  observations?: string;
  magasin_id?: string;
}

export function ExcelImportModal({ type, onClose, onSuccess }: ExcelImportModalProps) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [parsedItems, setParsedItems] = useState<(ParsedStockRow | ParsedToolRow)[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [importResult, setImportResult] = useState<{ createdCount: number; updatedCount: number; message: string } | null>(null);

  const normalizeKey = (key: string) => {
    return key
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  };

  const processWorkbook = (workbook: XLSX.WorkBook, fileTitle: string) => {
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      toast('Le fichier ne contient aucune feuille de calcul.', 'error');
      return;
    }
    const sheet = workbook.Sheets[firstSheetName];
    if (!sheet) return;

    const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    if (!rawData || rawData.length === 0) {
      toast('La feuille sélectionnée est vide.', 'info');
      return;
    }

    setFileName(fileTitle);
    setRows(rawData);

    if (type === 'stock') {
      const items: ParsedStockRow[] = [];
      for (const row of rawData) {
        let name = '';
        let category = 'Quincaillerie';
        let unit = 'u';
        let location = 'Dépôt Magasin';
        let brand = '';
        let supplier = '';
        let unit_cost: number | undefined;
        let qty: number | undefined;
        let min_qty: number | undefined;
        let magasin_id: string | undefined;

        for (const [k, v] of Object.entries(row)) {
          const val = String(v ?? '').trim();
          const nk = normalizeKey(k);

          if (['nom', 'designation', 'article', 'name', 'item', 'description', 'reference'].includes(nk)) {
            name = val;
          } else if (['categorie', 'famille', 'category', 'type'].includes(nk)) {
            category = val || category;
          } else if (['unite', 'unit', 'mesure', 'cond'].includes(nk)) {
            unit = val || unit;
          } else if (['emplacement', 'rayon', 'location', 'lieu', 'etagere'].includes(nk)) {
            location = val || location;
          } else if (['marque', 'brand', 'fabricant'].includes(nk)) {
            brand = val;
          } else if (['fournisseur', 'supplier', 'provenance'].includes(nk)) {
            supplier = val;
          } else if (['cout', 'coutunitaire', 'prix', 'prixunitaire', 'cost', 'unitcost', 'pu'].includes(nk)) {
            const num = parseFloat(val.replace(',', '.'));
            if (!isNaN(num)) unit_cost = num;
          } else if (['quantite', 'stock', 'qte', 'qty', 'quantitedispo', 'dispo'].includes(nk)) {
            const num = parseFloat(val.replace(',', '.'));
            if (!isNaN(num)) qty = num;
          } else if (['min', 'seuil', 'seuilmin', 'stockmin', 'minqty'].includes(nk)) {
            const num = parseFloat(val.replace(',', '.'));
            if (!isNaN(num)) min_qty = num;
          } else if (['magasin', 'magasinid', 'depot', 'site'].includes(nk)) {
            magasin_id = val;
          }
        }

        if (name) {
          items.push({
            name,
            category: category || 'Quincaillerie',
            unit: unit || 'u',
            location: location || 'Dépôt Magasin',
            brand: brand || undefined,
            supplier: supplier || undefined,
            unit_cost,
            qty,
            min_qty,
            magasin_id: magasin_id || undefined,
          });
        }
      }
      setParsedItems(items);
    } else {
      // Type tools
      const items: ParsedToolRow[] = [];
      for (const row of rawData) {
        let name = '';
        let category = 'Divers';
        let brand = '';
        let model = '';
        let serial_number = '';
        let location = 'Magasin';
        let acquisition_cost: number | undefined;
        let acquisition_year: number | undefined;
        let lifespan_years: number | undefined;
        let observations = '';
        let magasin_id: string | undefined;

        for (const [k, v] of Object.entries(row)) {
          const val = String(v ?? '').trim();
          const nk = normalizeKey(k);

          if (['nom', 'designation', 'outil', 'name', 'tool', 'libelle', 'machine'].includes(nk)) {
            name = val;
          } else if (['categorie', 'famille', 'category', 'type'].includes(nk)) {
            category = val || category;
          } else if (['marque', 'brand', 'fabricant'].includes(nk)) {
            brand = val;
          } else if (['modele', 'model', 'reference'].includes(nk)) {
            model = val;
          } else if (['noserie', 'numerodeserie', 'serial', 'serialnumber', 'sn', 'serie'].includes(nk)) {
            serial_number = val;
          } else if (['emplacement', 'lieu', 'location', 'zone'].includes(nk)) {
            location = val || location;
          } else if (['cout', 'prix', 'coutacquisition', 'prixachat', 'cost'].includes(nk)) {
            const num = parseFloat(val.replace(',', '.'));
            if (!isNaN(num)) acquisition_cost = num;
          } else if (['annee', 'anneeacquisition', 'year'].includes(nk)) {
            const num = parseInt(val, 10);
            if (!isNaN(num)) acquisition_year = num;
          } else if (['duree', 'dureedevie', 'lifespan', 'amortissement'].includes(nk)) {
            const num = parseInt(val, 10);
            if (!isNaN(num)) lifespan_years = num;
          } else if (['observations', 'notes', 'remarques', 'etat'].includes(nk)) {
            observations = val;
          } else if (['magasin', 'magasinid', 'depot', 'site'].includes(nk)) {
            magasin_id = val;
          }
        }

        if (name) {
          items.push({
            name,
            category: category || 'Divers',
            brand: brand || undefined,
            model: model || undefined,
            serial_number: serial_number || undefined,
            location: location || 'Magasin',
            acquisition_cost,
            acquisition_year,
            lifespan_years,
            observations: observations || undefined,
            magasin_id: magasin_id || undefined,
          });
        }
      }
      setParsedItems(items);
    }
  };

  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        processWorkbook(workbook, file.name);
      } catch {
        toast('Erreur lors de la lecture du fichier Excel/CSV.', 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const executeImport = async () => {
    if (parsedItems.length === 0) return;
    setIsLoading(true);

    try {
      const endpoint = type === 'stock' ? '/api/stock/import' : '/api/tools/import';
      const data = await api<{ ok: boolean; createdCount: number; updatedCount: number; message: string }>(
        endpoint,
        {
          method: 'POST',
          body: JSON.stringify({ items: parsedItems }),
        },
      );

      setImportResult({
        createdCount: data.createdCount,
        updatedCount: data.updatedCount,
        message: data.message,
      });
      toast(`${data.createdCount} créé(s), ${data.updatedCount} mis à jour sans doublon !`, 'success');
      onSuccess();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Échec de l’importation.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="bg-surface border border-line rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line bg-paper-2/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-wash border border-amber/30 flex items-center justify-center text-amber font-bold text-lg">
              📊
            </div>
            <div>
              <h2 className="text-base font-semibold text-ink">
                Importation Intelligente Tableur ({type === 'stock' ? 'Stock & Quincaillerie' : 'Parc d’Outils'})
              </h2>
              <p className="text-xs text-ink-soft">
                Fichiers Excel (.xlsx, .xls) ou Google Sheets (.csv). Dédoublonnage automatique à 100%.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-paper-2 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {importResult ? (
            <div className="p-6 rounded-2xl bg-green-wash border border-green/30 text-center space-y-4">
              <div className="text-4xl">✅</div>
              <h3 className="text-xl font-bold text-green">Importation réussie avec succès !</h3>
              <p className="text-sm text-ink-soft">{importResult.message}</p>
              <div className="flex justify-center gap-4 pt-2">
                <div className="px-4 py-2 rounded-xl bg-surface border border-line">
                  <div className="text-xs text-ink-soft">Nouveaux créés</div>
                  <div className="text-2xl font-bold text-green">{importResult.createdCount}</div>
                </div>
                <div className="px-4 py-2 rounded-xl bg-surface border border-line">
                  <div className="text-xs text-ink-soft">Mis à jour (sans doublon)</div>
                  <div className="text-2xl font-bold text-amber">{importResult.updatedCount}</div>
                </div>
              </div>
              <div className="pt-4">
                <button
                  onClick={onClose}
                  className="px-6 py-2.5 rounded-xl bg-amber text-white font-semibold hover:bg-amber-600 transition-colors"
                >
                  Fermer et afficher les données
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Dropzone */}
              {!fileName && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                    isDragging
                      ? 'border-amber bg-amber-wash scale-[0.99]'
                      : 'border-line hover:border-amber/50 hover:bg-paper-2/40'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                    }}
                  />
                  <div className="text-4xl mb-3">📁</div>
                  <div className="text-base font-medium text-ink mb-1">
                    Glissez-déposez votre fichier Excel ou CSV ici
                  </div>
                  <div className="text-xs text-ink-soft mb-4">
                    Formats acceptés : .xlsx, .xls, .csv exporté de Google Sheets ou Excel
                  </div>
                  <span className="inline-block px-4 py-2 rounded-xl bg-surface border border-line text-xs font-semibold text-amber hover:bg-paper-2">
                    Parcourir mon ordinateur
                  </span>
                </div>
              )}

              {/* Preview & Confirmation */}
              {fileName && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-paper-2/50 border border-line">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">📄</span>
                      <div>
                        <div className="text-sm font-semibold text-ink">{fileName}</div>
                        <div className="text-xs text-ink-soft">
                          {rows.length} ligne(s) détectée(s) • {parsedItems.length} article(s) valide(s) identifié(s)
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setFileName(null);
                        setRows([]);
                        setParsedItems([]);
                      }}
                      className="text-xs text-red hover:underline font-medium px-2.5 py-1 rounded-lg hover:bg-red-wash transition-colors"
                    >
                      Changer de fichier
                    </button>
                  </div>

                  {/* Anti-duplicate guarantee badge */}
                  <div className="p-3.5 rounded-xl bg-amber-wash border border-amber/20 flex items-center gap-3 text-xs text-amber-900 dark:text-amber">
                    <span className="text-base">🛡️</span>
                    <div>
                      <strong className="font-semibold text-amber">Garantie Anti-Doublon :</strong> Si un article ou outil existe déjà avec le même nom ou même numéro de série, il ne sera jamais recréé en double. Ses informations et quantités seront simplement mises à jour fidèlement.
                    </div>
                  </div>

                  {/* Preview Table */}
                  <div>
                    <div className="text-xs font-semibold text-ink-soft uppercase tracking-wider mb-2">
                      Aperçu des 5 premières lignes à absorber
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-paper-2 text-ink-soft border-b border-line uppercase tracking-wider font-semibold">
                          <tr>
                            <th className="p-2.5">Article / Outil</th>
                            <th className="p-2.5">Catégorie</th>
                            {type === 'stock' ? (
                              <>
                                <th className="p-2.5">Unité</th>
                                <th className="p-2.5">Qté</th>
                                <th className="p-2.5">Coût Unit.</th>
                              </>
                            ) : (
                              <>
                                <th className="p-2.5">Marque / Modèle</th>
                                <th className="p-2.5">N° Série</th>
                                <th className="p-2.5">Emplacement</th>
                              </>
                            )}
                            <th className="p-2.5 text-right">Statut</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line text-ink">
                          {parsedItems.slice(0, 5).map((it, idx) => (
                            <tr key={idx} className="hover:bg-paper-2/30">
                              <td className="p-2.5 font-medium">{it.name}</td>
                              <td className="p-2.5 text-ink-soft">{it.category || '—'}</td>
                              {type === 'stock' ? (
                                <>
                                  <td className="p-2.5 text-ink-soft">{(it as ParsedStockRow).unit || 'u'}</td>
                                  <td className="p-2.5 font-bold text-amber">
                                    {(it as ParsedStockRow).qty !== undefined ? (it as ParsedStockRow).qty : '—'}
                                  </td>
                                  <td className="p-2.5 text-ink-soft">
                                    {(it as ParsedStockRow).unit_cost !== undefined ? `${(it as ParsedStockRow).unit_cost} F` : '—'}
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className="p-2.5 text-ink-soft">
                                    {[(it as ParsedToolRow).brand, (it as ParsedToolRow).model].filter(Boolean).join(' ') || '—'}
                                  </td>
                                  <td className="p-2.5 font-mono text-ink-soft">
                                    {(it as ParsedToolRow).serial_number || 'Auto-généré'}
                                  </td>
                                  <td className="p-2.5 text-ink-soft">{(it as ParsedToolRow).location || 'Magasin'}</td>
                                </>
                              )}
                              <td className="p-2.5 text-right">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-wash text-green border border-green/30">
                                  ✓ Prêt
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!importResult && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-line bg-paper-2/60">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-ink-soft hover:text-ink hover:bg-paper-2 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={() => void executeImport()}
              disabled={parsedItems.length === 0 || isLoading}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-amber text-white text-xs font-bold hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md shadow-amber/20"
            >
              {isLoading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Absorption en cours...
                </>
              ) : (
                <>
                  <span>📥</span>
                  Absorber et mettre à jour le système ({parsedItems.length} éléments)
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
