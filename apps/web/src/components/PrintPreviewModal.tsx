import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, Download, ExternalLink, Minus, Plus, Printer } from 'lucide-react';
import { Button, Modal, Spinner, useToast } from './ui';
import { exportSheetToPdf } from '../lib/pdf-sheet';

export type PrintPaper = 'A4' | 'Letter';

export function PrintPreviewModal({
  open,
  title,
  paper,
  copiesLabel,
  content,
  onClose,
  onPrint,
  printing = false,
  pdfFilename,
  onDownloadPdf,
}: {
  open: boolean;
  title: string;
  paper: PrintPaper;
  copiesLabel: string;
  content: ReactNode;
  onClose: () => void;
  onPrint: () => void;
  printing?: boolean;
  pdfFilename?: string;
  onDownloadPdf?: () => Promise<void> | void;
}) {
  const toast = useToast();
  const viewport = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(0.8);
  const [zoom, setZoom] = useState(1);
  const [contentHeight, setContentHeight] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<string | null>(null);
  const [downloadedInfo, setDownloadedInfo] = useState<{ url: string; filename: string; pages: number } | null>(null);

  const pageWidthMm = paper === 'A4' ? 210 : 215.9;
  const pageHeightMm = paper === 'A4' ? 297 : 279.4;
  const pageWidthPx = pageWidthMm * (96 / 25.4);

  useEffect(() => {
    if (!open || !viewport.current) return;
    const node = viewport.current;
    const measure = () => {
      const clientW = node.clientWidth;
      if (!clientW) return;
      // 32px de marge intérieure (p-4 = 16px de chaque côté)
      const availableWidth = clientW - 32;
      const fit = Math.min(1.0, Math.max(0.25, availableWidth / pageWidthPx));
      setFitScale(fit);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    const rAF = requestAnimationFrame(measure);
    const timer = setTimeout(measure, 120);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(rAF);
      clearTimeout(timer);
    };
  }, [open, pageWidthPx]);

  useEffect(() => {
    if (!open || !canvas.current) return;
    const node = canvas.current;
    const measure = () =>
      setContentHeight(
        Math.max(node.scrollHeight, node.getBoundingClientRect().height / Math.max(fitScale * zoom, 0.01)),
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [open, content, fitScale, zoom]);

  useEffect(() => {
    if (open) {
      setZoom(1);
      setExporting(false);
      setExportProgress(null);
    } else {
      if (downloadedInfo?.url) {
        URL.revokeObjectURL(downloadedInfo.url);
      }
      setDownloadedInfo(null);
    }
  }, [open]);

  const scale = fitScale * zoom;
  const pageHeightPx = pageHeightMm * (96 / 25.4);
  const canvasHeight = Math.max(pageHeightPx, contentHeight) * scale;
  const zoomLabel = useMemo(() => `${Math.round(scale * 100)} %`, [scale]);

  const handleDownloadPdf = useCallback(async () => {
    if (!canvas.current || exporting || printing) return;

    try {
      setExporting(true);
      setExportProgress('Préparation du document PDF…');

      if (onDownloadPdf) {
        await onDownloadPdf();
      } else {
        const cleanSlug =
          title
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'planche-impression';
        const now = new Date();
        const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const filename = pdfFilename || `${cleanSlug}-${paper.toLowerCase()}-${dateStr}.pdf`;

        const result = await exportSheetToPdf(canvas.current, {
          paper,
          filename,
          onProgress: (p) => setExportProgress(p.message),
        });

        setDownloadedInfo({
          url: result.blobUrl,
          filename: result.filename,
          pages: result.totalPages,
        });

        toast(
          `Planche PDF « ${result.filename} » enregistrée (${result.totalPages} page${result.totalPages > 1 ? 's' : ''})`,
          'success',
        );
      }
    } catch (err: unknown) {
      console.error('Erreur export PDF planche:', err);
      const detailMsg = err instanceof Error ? ` (${err.message})` : '';
      toast(`Échec de la génération du document PDF${detailMsg}.`, 'error');
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  }, [exporting, printing, onDownloadPdf, title, paper, pdfFilename, toast]);

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      wide="sheet"
      footer={(
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="ghost" disabled={printing || exporting} onClick={onClose}>
            Retour aux réglages
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              disabled={printing || exporting}
              onClick={handleDownloadPdf}
              icon={exporting ? <Spinner /> : <Download size={14} />}
              title="Télécharger la planche en PDF prêt à l’impression sur votre appareil"
            >
              {exporting ? 'Export en cours…' : downloadedInfo ? 'Retélécharger le PDF' : 'Télécharger le PDF'}
            </Button>
            <Button
              variant="primary"
              disabled={printing || exporting}
              onClick={onPrint}
              icon={<Printer size={14} />}
              title="Lancer l'impression directe de la planche"
            >
              {printing ? 'Préparation…' : 'Imprimer cette planche'}
            </Button>
          </div>
        </div>
      )}
    >
      <div className="space-y-2">
        <div className="flex min-h-10 flex-wrap items-center justify-between gap-2 text-xs text-ink-soft">
          <span>{paper} · {copiesLabel}</span>
          <div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-1" aria-label="Zoom de l’aperçu">
            <button
              type="button"
              className="grid h-8 w-8 place-items-center rounded-md hover:bg-paper-2 disabled:opacity-40"
              aria-label="Réduire le zoom"
              disabled={zoom <= 0.6}
              onClick={() => setZoom((value) => Math.max(0.6, Math.round((value - 0.15) * 100) / 100))}
            >
              <Minus size={14} />
            </button>
            <span className="min-w-12 text-center tabular-nums">{zoomLabel}</span>
            <button
              type="button"
              className="grid h-8 w-8 place-items-center rounded-md hover:bg-paper-2 disabled:opacity-40"
              aria-label="Agrandir l’aperçu"
              disabled={zoom >= 1.8}
              onClick={() => setZoom((value) => Math.min(1.8, Math.round((value + 0.15) * 100) / 100))}
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        {exporting && (
          <div className="flex items-center gap-2.5 rounded-lg border border-amber/30 bg-amber/10 px-3.5 py-2.5 text-xs font-medium text-amber">
            <Spinner />
            <span>{exportProgress || 'Génération du document PDF prêt à l’impression…'}</span>
          </div>
        )}

        {downloadedInfo && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-400">
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
              <span className="truncate">
                Planche enregistrée : <strong className="font-semibold text-ink">{downloadedInfo.filename}</strong> ({downloadedInfo.pages} page{downloadedInfo.pages > 1 ? 's' : ''})
              </span>
            </div>
            <a
              href={downloadedInfo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-300 hover:bg-emerald-500/30 transition-colors shrink-0"
              title="Ouvrir le document PDF téléchargé dans un nouvel onglet"
            >
              <span>Afficher le PDF</span>
              <ExternalLink size={12} />
            </a>
          </div>
        )}

        <div
          ref={viewport}
          className="print-preview-viewport max-h-[64vh] max-h-[64dvh] overflow-auto rounded-xl border border-line bg-[#222222] p-4 text-center"
        >
          <div
            className="mx-auto inline-block text-left"
            style={{
              width: `${Math.round(pageWidthPx * scale)}px`,
              minHeight: `${Math.round(canvasHeight)}px`,
            }}
          >
            <div
              ref={canvas}
              className="print-preview-page shadow-2xl"
              style={{
                width: `${pageWidthMm}mm`,
                minHeight: `${pageHeightMm}mm`,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
                backgroundColor: '#ffffff',
                color: '#0f172a',
                boxSizing: 'border-box',
              }}
            >
              {content}
            </div>
          </div>
        </div>
        <p className="text-[11px] text-ink-faint">
          Vérifiez les codes et la disposition. Le bouton Télécharger enregistre la planche prête à l'impression directement sur votre appareil.
        </p>
      </div>
    </Modal>
  );
}
