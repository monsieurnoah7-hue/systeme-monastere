import { useState, useRef, useEffect, useCallback, type MouseEvent as ReactMouseEvent, type TouchEvent as ReactTouchEvent } from 'react';
import { Modal, Button, cx } from './ui';
import { ZoomIn, ZoomOut, RotateCcw, Check, Move } from 'lucide-react';

interface ManualPhotoCropperModalProps {
  open: boolean;
  imageUrl: string | null;
  targetName?: string;
  aspectRatio?: number; // width / height, défaut 16/10 = 1.6
  onClose: () => void;
  onSave: (croppedImageUrl: string, position: 'top' | 'center' | 'bottom') => Promise<void> | void;
}

/**
 * Modal de cadrage et recadrage manuel interactif façon WhatsApp / Instagram.
 * Permet de glisser (drag/pan), zoomer et découper l'image directement à la souris ou au doigt.
 */
export function ManualPhotoCropperModal({
  open,
  imageUrl,
  targetName,
  aspectRatio = 16 / 10,
  onClose,
  onSave,
}: ManualPhotoCropperModalProps) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Réinitialiser la position à l'ouverture
  useEffect(() => {
    if (open) {
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    }
  }, [open, imageUrl]);

  // Déplacement souris
  const handleMouseDown = (e: ReactMouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Déplacement tactile (smartphone / tablette)
  const handleTouchStart = (e: ReactTouchEvent) => {
    if (e.touches.length === 1 && e.touches[0]) {
      const touch = e.touches[0];
      setIsDragging(true);
      setDragStart({ x: touch.clientX - offset.x, y: touch.clientY - offset.y });
    }
  };

  const handleTouchMove = (e: ReactTouchEvent) => {
    if (!isDragging || e.touches.length !== 1 || !e.touches[0]) return;
    const touch = e.touches[0];
    setOffset({
      x: touch.clientX - dragStart.x,
      y: touch.clientY - dragStart.y,
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Préréglages rapides
  const applyPreset = (preset: 'top' | 'center' | 'bottom') => {
    if (!containerRef.current || !imageRef.current) return;
    const contH = containerRef.current.clientHeight;
    const imgH = imageRef.current.clientHeight * zoom;
    const diff = Math.max(0, imgH - contH);

    if (preset === 'top') {
      setOffset((prev) => ({ ...prev, y: diff / 2 }));
    } else if (preset === 'bottom') {
      setOffset((prev) => ({ ...prev, y: -diff / 2 }));
    } else {
      setOffset((prev) => ({ ...prev, y: 0 }));
    }
  };

  // Découpe Canvas et enregistrement
  const handleConfirm = async () => {
    if (!imageRef.current || !containerRef.current) return;
    setBusy(true);

    try {
      const img = imageRef.current;
      const cont = containerRef.current;

      const canvas = document.createElement('canvas');
      const exportWidth = 800;
      const exportHeight = Math.round(exportWidth / aspectRatio);
      canvas.width = exportWidth;
      canvas.height = exportHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Impossible de créer le contexte 2D');

      // Fond neutre
      ctx.fillStyle = '#1e2430';
      ctx.fillRect(0, 0, exportWidth, exportHeight);

      // Calcul des coordonnées d'échelle
      const scaleRatio = exportWidth / cont.clientWidth;
      const drawWidth = img.clientWidth * zoom * scaleRatio;
      const drawHeight = img.clientHeight * zoom * scaleRatio;
      const drawX = (exportWidth - drawWidth) / 2 + offset.x * scaleRatio;
      const drawY = (exportHeight - drawHeight) / 2 + offset.y * scaleRatio;

      ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

      const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.92);

      // Déduire la position dominante
      const positionLabel: 'top' | 'center' | 'bottom' =
        offset.y > 20 ? 'top' : offset.y < -20 ? 'bottom' : 'center';

      await onSave(croppedDataUrl, positionLabel);
      onClose();
    } catch (err) {
      console.error('Erreur lors du recadrage:', err);
    } finally {
      setBusy(false);
    }
  };

  if (!open || !imageUrl) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={targetName ? `Cadrage — ${targetName}` : 'Cadrage manuel de la photo'}
      wide
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <Button
            variant="ghost"
            onClick={() => {
              setZoom(1);
              setOffset({ x: 0, y: 0 });
            }}
            icon={<RotateCcw size={14} />}
          >
            Réinitialiser
          </Button>

          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirm}
              loading={busy}
              icon={<Check size={16} />}
            >
              Appliquer le cadrage
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Consigne d'interaction style WhatsApp */}
        <div className="flex items-center justify-between text-xs text-ink-soft bg-paper-2 rounded-lg px-3 py-2 border border-line">
          <div className="flex items-center gap-2">
            <Move size={14} className="text-amber" />
            <span>Glissez l’image pour ajuster le cadrage comme sur WhatsApp</span>
          </div>
          <span className="font-semibold text-ink-faint hidden sm:inline">Format carte 16:10</span>
        </div>

        {/* Zone de recadrage avec masque et grille de tiers */}
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ aspectRatio }}
          className={cx(
            'relative w-full max-h-[50vh] overflow-hidden rounded-xl border-2 border-dashed border-amber/60 bg-black/80 select-none touch-none',
            isDragging ? 'cursor-grabbing' : 'cursor-grab',
          )}
        >
          {/* Image manipulable */}
          <div
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
              transition: isDragging ? 'none' : 'transform 0.15s ease-out',
            }}
            className="h-full w-full flex items-center justify-center pointer-events-none"
          >
            <img
              ref={imageRef}
              src={imageUrl}
              alt="À recadrer"
              crossOrigin="anonymous"
              className="max-h-full max-w-full object-contain pointer-events-none select-none"
              draggable={false}
            />
          </div>

          {/* Grille de composition photographique (Règle des tiers) */}
          <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 border border-white/20">
            <div className="border-r border-b border-white/20" />
            <div className="border-r border-b border-white/20" />
            <div className="border-b border-white/20" />
            <div className="border-r border-b border-white/20" />
            <div className="border-r border-b border-white/20" />
            <div className="border-b border-white/20" />
            <div className="border-r border-white/20" />
            <div className="border-r border-white/20" />
            <div />
          </div>

          {/* Coins de cadrage visuel */}
          <div className="pointer-events-none absolute left-2 top-2 h-4 w-4 border-l-2 border-t-2 border-amber" />
          <div className="pointer-events-none absolute right-2 top-2 h-4 w-4 border-r-2 border-t-2 border-amber" />
          <div className="pointer-events-none absolute left-2 bottom-2 h-4 w-4 border-l-2 border-b-2 border-amber" />
          <div className="pointer-events-none absolute right-2 bottom-2 h-4 w-4 border-r-2 border-b-2 border-amber" />
        </div>

        {/* Barre d'outils : Zoom & Préréglages */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3">
          {/* Zoom progressif */}
          <div className="flex items-center gap-2.5 flex-1 min-w-[200px]">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.6, z - 0.15))}
              className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-paper-2 text-ink-soft hover:text-ink hover:bg-paper"
              title="Dézoomer"
            >
              <ZoomOut size={15} />
            </button>
            <input
              type="range"
              min="0.6"
              max="2.5"
              step="0.05"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-lg bg-line accent-amber"
              title="Ajuster le zoom"
            />
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(2.5, z + 0.15))}
              className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-paper-2 text-ink-soft hover:text-ink hover:bg-paper"
              title="Zoomer"
            >
              <ZoomIn size={15} />
            </button>
            <span className="font-mono text-xs font-bold text-amber shrink-0 tabular-nums">
              {Math.round(zoom * 100)}%
            </span>
          </div>

          {/* Préréglages rapides de hauteur */}
          <div className="flex items-center gap-1.5 border-t sm:border-t-0 sm:border-l border-line pt-2 sm:pt-0 sm:pl-3 w-full sm:w-auto justify-end">
            <span className="text-[11px] font-semibold text-ink-faint mr-1">Aligner :</span>
            <button
              type="button"
              onClick={() => applyPreset('top')}
              className="rounded-md border border-line bg-paper-2 px-2.5 py-1 text-xs font-semibold text-ink-soft hover:text-ink hover:border-amber/50"
            >
              Haut (Visages)
            </button>
            <button
              type="button"
              onClick={() => applyPreset('center')}
              className="rounded-md border border-line bg-paper-2 px-2.5 py-1 text-xs font-semibold text-ink-soft hover:text-ink hover:border-amber/50"
            >
              Centre
            </button>
            <button
              type="button"
              onClick={() => applyPreset('bottom')}
              className="rounded-md border border-line bg-paper-2 px-2.5 py-1 text-xs font-semibold text-ink-soft hover:text-ink hover:border-amber/50"
            >
              Bas
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
