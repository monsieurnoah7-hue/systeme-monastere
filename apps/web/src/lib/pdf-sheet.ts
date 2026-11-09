import { jsPDF } from 'jspdf';
import { toPng } from 'html-to-image';

export interface ExportSheetPdfOptions {
  filename?: string;
  paper?: 'A4' | 'Letter';
  orientation?: 'portrait' | 'landscape';
  scale?: number;
  download?: boolean;
  openInNewTab?: boolean;
  targetWindow?: Window | null;
  onProgress?: (progress: { current: number; total: number; message: string }) => void;
}

export interface ExportSheetPdfResult {
  blob: Blob;
  blobUrl: string;
  filename: string;
  totalPages: number;
}

/**
 * Exporte une planche d'impression (badges, étiquettes QR, étiquettes de stock, établis)
 * en un document PDF haute fidélité prêt à l'impression.
 *
 * Utilise html-to-image (moteur SVG vectoriel natif) combiné à jsPDF :
 * - Prise en charge native de Tailwind CSS v4 (oklch, color-mix, variables modernes)
 * - Rendu haute résolution (240~300 DPI) garantissant la lisibilité parfaite des codes QR
 * - Gestion automatique multi-pages (.badge-page, .label-sheet-page, .a4-page)
 * - Téléchargement immédiat sur le disque et ouverture automatique dans le visualiseur
 */
export async function exportSheetToPdf(
  sourceElement: HTMLElement,
  options: ExportSheetPdfOptions = {},
): Promise<ExportSheetPdfResult> {
  const paper = options.paper ?? 'A4';
  const orientation = options.orientation ?? 'portrait';
  const isLandscape = orientation === 'landscape';

  // Dimensions physiques normalisées en millimètres
  const baseWidthMm = paper === 'Letter' ? 215.9 : 210;
  const baseHeightMm = paper === 'Letter' ? 279.4 : 297;
  const pageWidthMm = isLandscape ? baseHeightMm : baseWidthMm;
  const pageHeightMm = isLandscape ? baseWidthMm : baseHeightMm;

  options.onProgress?.({
    current: 0,
    total: 100,
    message: 'Vérification et stabilisation des codes QR…',
  });

  // 1. Attente de la génération complète des codes QR
  const maxWaitMs = 3000;
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    const pending = sourceElement.querySelectorAll('[data-qr-pending="true"]');
    if (!pending || pending.length === 0) break;
    await new Promise((r) => setTimeout(r, 60));
  }

  // 2. Attente du chargement des polices typographiques
  if (document.fonts?.ready) {
    await document.fonts.ready.catch(() => undefined);
  }

  // 3. Sauvegarde et réinitialisation temporaire de la transformation zoom du viewport
  const prevTransform = sourceElement.style.transform;
  const prevTransformOrigin = sourceElement.style.transformOrigin;
  sourceElement.style.transform = 'none';
  sourceElement.style.transformOrigin = 'top left';

  let doc: jsPDF | null = null;

  try {
    // 4. Détection des pages de la planche
    const pageSelector = '.badge-page, .label-sheet-page, .a4-page, [data-print-page]';
    let pages = Array.from(sourceElement.querySelectorAll<HTMLElement>(pageSelector));

    if (pages.length === 0) {
      pages = [sourceElement];
    }

    doc = new jsPDF({
      orientation,
      unit: 'mm',
      format: paper === 'Letter' ? 'letter' : 'a4',
      compress: true,
    });

    const totalPages = pages.length;
    const pixelRatio = options.scale ?? 2.5;

    // 5. Rendu haute fidélité page par page
    for (let i = 0; i < totalPages; i++) {
      options.onProgress?.({
        current: i + 1,
        total: totalPages,
        message: `Rendu de la planche (Page ${i + 1} / ${totalPages})…`,
      });

      const pageEl = pages[i];
      if (!pageEl) continue;

      const imgData = await toPng(pageEl, {
        pixelRatio,
        backgroundColor: '#ffffff',
        imagePlaceholder:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      });

      if (i > 0) {
        doc.addPage(paper === 'Letter' ? 'letter' : 'a4', orientation);
      }

      // Calcul des dimensions métriques et centrage précis
      const elemWidthPx = pageEl.offsetWidth;
      const elemHeightPx = pageEl.offsetHeight;
      const widthMm = elemWidthPx * (25.4 / 96);
      const heightMm = elemHeightPx * (25.4 / 96);

      // Marge de sécurité de 3mm
      const maxAvailableW = pageWidthMm - 6;
      const maxAvailableH = pageHeightMm - 6;
      const scaleFit = Math.min(
        maxAvailableW / Math.max(widthMm, 1),
        maxAvailableH / Math.max(heightMm, 1),
        1,
      );

      const finalWidthMm = widthMm * scaleFit;
      const finalHeightMm = heightMm * scaleFit;
      const offsetX = Math.max(0, (pageWidthMm - finalWidthMm) / 2);
      const offsetY = Math.max(0, (pageHeightMm - finalHeightMm) / 2);

      doc.addImage(imgData, 'PNG', offsetX, offsetY, finalWidthMm, finalHeightMm, undefined, 'FAST');
    }

    options.onProgress?.({
      current: totalPages,
      total: totalPages,
      message: 'Finalisation et enregistrement du PDF…',
    });

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const defaultFilename = `planche-${paper.toLowerCase()}-${dateStr}.pdf`;
    const finalFilename = (options.filename || defaultFilename).trim();
    const safeFilename = finalFilename.endsWith('.pdf') ? finalFilename : `${finalFilename}.pdf`;

    const blob = doc.output('blob');
    const blobUrl = URL.createObjectURL(blob);

    // 6. Ouvrir dans l'onglet/fenêtre cible si demandé
    if (options.openInNewTab) {
      try {
        if (options.targetWindow && !options.targetWindow.closed) {
          options.targetWindow.location.href = blobUrl;
        } else {
          window.open(blobUrl, '_blank');
        }
      } catch (popupErr) {
        console.warn('Navigation de la fenêtre d’aperçu bloquée par le navigateur:', popupErr);
      }
    }

    // 7. Déclencher le téléchargement direct sur le disque
    if (options.download !== false) {
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = safeFilename;
      link.setAttribute('rel', 'noopener noreferrer');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    return {
      blob,
      blobUrl,
      filename: safeFilename,
      totalPages,
    };
  } finally {
    // 8. Restauration garantie du zoom du viewport
    sourceElement.style.transform = prevTransform;
    sourceElement.style.transformOrigin = prevTransformOrigin;
  }
}
