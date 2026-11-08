import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button, Modal } from './ui';

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
}: {
  open: boolean;
  title: string;
  paper: PrintPaper;
  copiesLabel: string;
  content: ReactNode;
  onClose: () => void;
  onPrint: () => void;
  printing?: boolean;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [contentHeight, setContentHeight] = useState(0);
  const pageWidthMm = paper === 'A4' ? 210 : 215.9;
  const pageHeightMm = paper === 'A4' ? 297 : 279.4;
  const pageWidthPx = pageWidthMm * (96 / 25.4);

  useEffect(() => {
    if (!open || !viewport.current) return;
    const node = viewport.current;
    const measure = () => setFitScale(Math.min(1, Math.max(0.32, (node.clientWidth - 24) / pageWidthPx)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [open, pageWidthPx]);

  useEffect(() => {
    if (!open || !canvas.current) return;
    const node = canvas.current;
    const measure = () => setContentHeight(Math.max(node.scrollHeight, node.getBoundingClientRect().height / Math.max(fitScale * zoom, 0.01)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [open, content, fitScale, zoom]);

  useEffect(() => {
    if (open) setZoom(1);
  }, [open]);

  const scale = fitScale * zoom;
  const pageHeightPx = pageHeightMm * (96 / 25.4);
  const canvasHeight = Math.max(pageHeightPx, contentHeight) * scale;
  const zoomLabel = useMemo(() => `${Math.round(scale * 100)} %`, [scale]);

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      wide
      footer={(
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="ghost" onClick={onClose}>Retour aux réglages</Button>
          <Button variant="primary" disabled={printing} onClick={onPrint}>
            {printing ? 'Préparation…' : 'Imprimer cette planche'}
          </Button>
        </div>
      )}
    >
      <div className="space-y-2">
        <div className="flex min-h-10 flex-wrap items-center justify-between gap-2 text-xs text-ink-soft">
          <span>{paper} · {copiesLabel}</span>
          <div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-1" aria-label="Zoom de l’aperçu">
            <button type="button" className="grid h-8 w-8 place-items-center rounded-md hover:bg-paper-2 disabled:opacity-40" aria-label="Réduire le zoom" disabled={zoom <= 0.75} onClick={() => setZoom((value) => Math.max(0.75, Math.round((value - 0.15) * 100) / 100))}>
              <Minus size={14} />
            </button>
            <span className="min-w-12 text-center tabular-nums">{zoomLabel}</span>
            <button type="button" className="grid h-8 w-8 place-items-center rounded-md hover:bg-paper-2 disabled:opacity-40" aria-label="Agrandir l’aperçu" disabled={zoom >= 1.8} onClick={() => setZoom((value) => Math.min(1.8, Math.round((value + 0.15) * 100) / 100))}>
              <Plus size={14} />
            </button>
          </div>
        </div>
        <div ref={viewport} className="print-preview-viewport max-h-[62vh] max-h-[62dvh] overflow-auto rounded-xl border border-line bg-[#333] p-3">
          <div className="mx-auto" style={{ width: pageWidthPx * scale, height: canvasHeight }}>
            <div
              ref={canvas}
              className="print-preview-page"
              style={{
                width: `${pageWidthMm}mm`,
                minHeight: `${pageHeightMm}mm`,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
              }}
            >
              {content}
            </div>
          </div>
        </div>
        <p className="text-[11px] text-ink-faint">Vérifiez les codes et la disposition. Le navigateur ouvrira ensuite ses paramètres d’impression.</p>
      </div>
    </Modal>
  );
}
