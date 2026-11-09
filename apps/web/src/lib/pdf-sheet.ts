import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

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
 * Fonctionnalités clés :
 * - Rendu haute résolution (240~300 DPI) garantissant la lisibilité parfaite des codes QR par les scanners
 * - Gestion automatique multi-pages (classes .badge-page, .label-sheet-page, .a4-page)
 * - Découpage intelligent pour les conteneurs sans pagination explicite
 * - Attente de la stabilisation des images et codes QR (évite les zones blanches)
 * - Isolation DOM unclipped pour éviter tout rognage causé par des ascendants scrollables
 * - Téléchargement immédiat sur le disque et ouverture automatique dans le visualiseur de l'appareil
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
  const maxWaitMs = 4000;
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

  // 3. Création d'une zone de préparation isolée et non rognée dans le DOM
  const staging = document.createElement('div');
  staging.setAttribute('data-pdf-staging', 'true');
  staging.style.position = 'fixed';
  staging.style.top = '0';
  staging.style.left = '0';
  staging.style.width = `${pageWidthMm}mm`;
  staging.style.background = '#ffffff';
  staging.style.color = '#0f172a';
  staging.style.zIndex = '-9999';
  staging.style.pointerEvents = 'none';
  staging.style.overflow = 'visible';
  staging.style.margin = '0';
  staging.style.padding = '0';

  let doc: jsPDF | null = null;

  try {
    // 4. Clonage en profondeur du contenu pour neutraliser les styles de zoom du viewport
    const clone = sourceElement.cloneNode(true) as HTMLElement;
    clone.style.transform = 'none';
    clone.style.transformOrigin = 'top left';
    clone.style.margin = '0';
    clone.style.width = `${pageWidthMm}mm`;
    staging.appendChild(clone);
    document.body.appendChild(staging);

    // Synchronisation des canvas s'il y en a dans la source
    const srcCanvases = sourceElement.querySelectorAll('canvas');
    const cloneCanvases = clone.querySelectorAll('canvas');
    for (let i = 0; i < srcCanvases.length; i++) {
      const srcCanvas = srcCanvases[i];
      const cloneCanvas = cloneCanvases[i];
      if (srcCanvas && cloneCanvas) {
        cloneCanvas.width = srcCanvas.width;
        cloneCanvas.height = srcCanvas.height;
        const ctx = cloneCanvas.getContext('2d');
        if (ctx) ctx.drawImage(srcCanvas, 0, 0);
      }
    }

    // Décodage de toutes les images pour garantir le rendu complet
    const images = Array.from(clone.querySelectorAll('img'));
    await Promise.all(
      images.map(async (img) => {
        if (typeof img.decode === 'function') {
          await img.decode().catch(() => undefined);
        } else if (!img.complete) {
          await new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
            setTimeout(resolve, 2000);
          });
        }
      }),
    );

    // Pause courte pour permettre au moteur de rendu du navigateur d'appliquer le layout
    await new Promise((r) => setTimeout(r, 60));

    // 5. Détection des pages de la planche
    const pageSelector = '.badge-page, .label-sheet-page, .a4-page, [data-print-page]';
    let pages = Array.from(clone.querySelectorAll<HTMLElement>(pageSelector));

    if (pages.length === 0) {
      if (clone.matches(pageSelector)) {
        pages = [clone];
      } else {
        pages = [clone];
      }
    }

    doc = new jsPDF({
      orientation,
      unit: 'mm',
      format: paper === 'Letter' ? 'letter' : 'a4',
      compress: true,
    });

    const totalPages = pages.length;
    const renderScale = options.scale ?? 2.5;

    // 6. Rendu haute fidélité page par page
    for (let i = 0; i < totalPages; i++) {
      options.onProgress?.({
        current: i + 1,
        total: totalPages,
        message: `Rendu de la planche (Page ${i + 1} / ${totalPages})…`,
      });

      const pageEl = pages[i];
      if (!pageEl) continue;

      const pageCanvas = await html2canvas(pageEl, {
        scale: renderScale,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        imageTimeout: 10000,
        windowWidth: Math.max(1200, Math.ceil(pageWidthMm * (96 / 25.4))),
      });

      // Si le conteneur n'a qu'une seule page déclarée mais dépasse la hauteur de page standard
      const pxPerMm = (96 / 25.4) * renderScale;
      const expectedPageHeightPx = pageHeightMm * pxPerMm;

      if (totalPages === 1 && pageCanvas.height > expectedPageHeightPx * 1.15) {
        // Découpage automatique multi-pages pour les longues listes
        let renderedY = 0;
        let sliceIndex = 0;
        const sliceHeightPx = Math.floor(expectedPageHeightPx * 0.95);

        while (renderedY < pageCanvas.height) {
          if (sliceIndex > 0) {
            doc.addPage(paper === 'Letter' ? 'letter' : 'a4', orientation);
          }

          const currentSliceH = Math.min(sliceHeightPx, pageCanvas.height - renderedY);
          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = pageCanvas.width;
          sliceCanvas.height = currentSliceH;
          const sliceCtx = sliceCanvas.getContext('2d');
          if (sliceCtx) {
            sliceCtx.fillStyle = '#ffffff';
            sliceCtx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
            sliceCtx.drawImage(
              pageCanvas,
              0, renderedY, pageCanvas.width, currentSliceH,
              0, 0, pageCanvas.width, currentSliceH,
            );
          }

          const sliceData = sliceCanvas.toDataURL('image/png');
          const sliceHeightMm = (currentSliceH / pxPerMm);
          const sliceWidthMm = (pageCanvas.width / pxPerMm);
          const scaleFit = Math.min((pageWidthMm - 6) / sliceWidthMm, (pageHeightMm - 6) / sliceHeightMm, 1);
          const finalW = sliceWidthMm * scaleFit;
          const finalH = sliceHeightMm * scaleFit;
          const posX = Math.max(0, (pageWidthMm - finalW) / 2);
          const posY = Math.max(0, (pageHeightMm - finalH) / 2);

          doc.addImage(sliceData, 'PNG', posX, posY, finalW, finalH, undefined, 'FAST');

          renderedY += currentSliceH;
          sliceIndex++;
        }
      } else {
        if (i > 0) {
          doc.addPage(paper === 'Letter' ? 'letter' : 'a4', orientation);
        }

        const imgData = pageCanvas.toDataURL('image/png');

        // Calcul des dimensions métriques et centrage précis
        const elemWidthPx = pageEl.offsetWidth || (pageCanvas.width / renderScale);
        const elemHeightPx = pageEl.offsetHeight || (pageCanvas.height / renderScale);
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
        // Si l'étiquette est petite (ex. étiquette unique), la centrer verticalement
        const offsetY = finalHeightMm < pageHeightMm * 0.8
          ? Math.max(0, (pageHeightMm - finalHeightMm) / 2)
          : Math.max(0, (pageHeightMm - finalHeightMm) / 2);

        doc.addImage(imgData, 'PNG', offsetX, offsetY, finalWidthMm, finalHeightMm, undefined, 'FAST');
      }
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

    // 1. Ouvrir dans l'onglet/fenêtre cible si demandé
    if (options.openInNewTab) {
      if (options.targetWindow && !options.targetWindow.closed) {
        options.targetWindow.location.href = blobUrl;
      } else {
        try {
          window.open(blobUrl, '_blank');
        } catch {
          // Ignoré si bloqué par le navigateur
        }
      }
    }

    // 2. Déclencher le téléchargement effectif du fichier sur le disque
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
    // 7. Nettoyage garanti de la zone isolée
    if (staging.parentNode) {
      staging.parentNode.removeChild(staging);
    }
  }
}
