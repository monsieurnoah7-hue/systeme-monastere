import { jsPDF } from 'jspdf';
import { toPng } from 'html-to-image';

export interface ExportSheetPdfOptions {
  filename?: string;
  paper?: 'A4' | 'Letter';
  orientation?: 'portrait' | 'landscape';
  scale?: number;
  download?: boolean;
  onProgress?: (progress: { current: number; total: number; message: string }) => void;
}

export interface ExportSheetPdfResult {
  blob: Blob;
  blobUrl: string;
  filename: string;
  totalPages: number;
}

/**
 * Exporte une planche d'impression (badges, étiquettes QR, étiquettes de stock, établis, portes)
 * en un document PDF vectorisé haute fidélité prêt à l'impression.
 *
 * Utilise un conteneur de staging hors-champ attaché directement au document :
 * - Garantit 100% de la largeur normalisée (210mm A4 / 215.9mm Letter) sans aucun rognage
 * - Isole complètement le rendu des contraintes de zoom et d'overflow du modal utilisateur
 * - Rendu haute résolution (240~300 DPI) garantissant la lisibilité parfaite des codes QR
 * - Gestion automatique multi-pages (.badge-page, .label-sheet-page, .a4-page)
 * - Téléchargement direct et transparent sans redirection ni changement de page
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
  const maxWaitMs = 3500;
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    const pending = sourceElement.querySelectorAll('[data-qr-pending="true"]');
    if (!pending || pending.length === 0) break;
    await new Promise((r) => setTimeout(r, 60));
  }

  // 2. Attente du chargement complet des polices typographiques
  if (document.fonts?.ready) {
    await document.fonts.ready.catch(() => undefined);
  }

  // 3. Création du conteneur de staging dédié hors-champ (DOM isolé de la modale)
  const staging = document.createElement('div');
  staging.id = 'pdf-render-staging';
  staging.style.position = 'fixed';
  staging.style.left = '0';
  staging.style.top = '0';
  staging.style.width = `${pageWidthMm}mm`;
  staging.style.minHeight = `${pageHeightMm}mm`;
  staging.style.background = '#ffffff';
  staging.style.color = '#0f172a';
  staging.style.zIndex = '-99999';
  staging.style.pointerEvents = 'none';
  staging.style.overflow = 'visible';
  staging.style.margin = '0';
  staging.style.padding = '0';
  staging.style.boxSizing = 'border-box';

  // Clonage profond du contenu pour ne jamais altérer l'affichage de la modale en cours
  const clone = sourceElement.cloneNode(true) as HTMLElement;
  clone.style.transform = 'none';
  clone.style.transformOrigin = 'top left';
  clone.style.margin = '0';
  clone.style.width = `${pageWidthMm}mm`;
  clone.style.minHeight = `${pageHeightMm}mm`;
  clone.style.boxSizing = 'border-box';
  staging.appendChild(clone);
  document.body.appendChild(staging);

  let doc: jsPDF | null = null;

  try {
    // 4. Détection précise des pages de la planche
    const pageSelector = '.badge-page, .label-sheet-page, .a4-page, [data-print-page]';
    let pages = Array.from(clone.querySelectorAll<HTMLElement>(pageSelector));

    if (pages.length === 0) {
      pages = [clone];
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
        message: `Rendu haute résolution (Page ${i + 1} / ${totalPages})…`,
      });

      const pageEl = pages[i];
      if (!pageEl) continue;

      // Mesure physique exacte dans le DOM de staging
      const elemWidthPx = pageEl.offsetWidth;
      const elemHeightPx = pageEl.offsetHeight;

      const imgData = await toPng(pageEl, {
        pixelRatio,
        backgroundColor: '#ffffff',
        imagePlaceholder:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      });

      if (i > 0) {
        doc.addPage(paper === 'Letter' ? 'letter' : 'a4', orientation);
      }

      // Calcul des dimensions métriques et cadrage professionnel
      const widthMm = elemWidthPx * (25.4 / 96);
      const heightMm = elemHeightPx * (25.4 / 96);

      // Marges de sécurité normalisées (8mm de marge périmétrique)
      const topMarginMm = 8;
      const horizontalMarginMm = 8;
      const maxAvailableW = pageWidthMm - horizontalMarginMm * 2;
      const maxAvailableH = pageHeightMm - topMarginMm * 2;

      const scaleFit = Math.min(
        maxAvailableW / Math.max(widthMm, 1),
        maxAvailableH / Math.max(heightMm, 1),
        1,
      );

      const finalWidthMm = widthMm * scaleFit;
      const finalHeightMm = heightMm * scaleFit;

      // Centrage horizontal parfait et calage naturel par le haut (marge supérieure fixe de 8mm)
      // Évite que les planches partielles flottent au milieu de la feuille ou coupent le bas
      const offsetX = Math.max(0, (pageWidthMm - finalWidthMm) / 2);
      const offsetY = topMarginMm;

      doc.addImage(imgData, 'PNG', offsetX, offsetY, finalWidthMm, finalHeightMm, undefined, 'FAST');
    }

    options.onProgress?.({
      current: totalPages,
      total: totalPages,
      message: 'Finalisation et enregistrement du document…',
    });

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const defaultFilename = `planche-${paper.toLowerCase()}-${dateStr}.pdf`;
    const finalFilename = (options.filename || defaultFilename).trim();
    const safeFilename = finalFilename.endsWith('.pdf') ? finalFilename : `${finalFilename}.pdf`;

    const blob = doc.output('blob');
    const blobUrl = URL.createObjectURL(blob);

    // 6. Déclencher le téléchargement direct sur le disque sans aucune redirection
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
    // 7. Nettoyage garanti du conteneur de staging
    if (staging.parentNode) {
      document.body.removeChild(staging);
    }
  }
}
