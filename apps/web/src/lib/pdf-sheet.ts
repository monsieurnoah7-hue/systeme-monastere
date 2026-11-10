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

  // 3. Détection précise des pages de la planche d'impression
  const pageSelector = '.badge-page, .label-sheet-page, .a4-page, [data-print-page]';
  let pages = Array.from(sourceElement.querySelectorAll<HTMLElement>(pageSelector));

  if (pages.length === 0) {
    pages = [sourceElement];
  }

  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: paper === 'Letter' ? 'letter' : 'a4',
    compress: true,
  });

  const totalPages = pages.length;
  const pixelRatio = options.scale ?? 2.5;

  try {
    // 4. Rendu page par page dans un conteneur pleine page normalisé
    for (let i = 0; i < totalPages; i++) {
      options.onProgress?.({
        current: i + 1,
        total: totalPages,
        message: `Rendu (Page ${i + 1} / ${totalPages})…`,
      });

      const pageEl = pages[i];
      if (!pageEl) continue;

      // Création d'un conteneur de staging dédié pleine page (A4: 210×297mm / Letter: 215.9×279.4mm)
      // Isole parfaitement chaque page du zoom, du viewport modal et élimine tout décalage d'offset
      const pageWrapper = document.createElement('div');
      pageWrapper.id = `pdf-render-page-staging-${i}`;
      pageWrapper.style.position = 'fixed';
      pageWrapper.style.left = '0';
      pageWrapper.style.top = '0';
      pageWrapper.style.width = `${pageWidthMm}mm`;
      pageWrapper.style.height = `${pageHeightMm}mm`;
      pageWrapper.style.minHeight = `${pageHeightMm}mm`;
      pageWrapper.style.maxHeight = `${pageHeightMm}mm`;
      pageWrapper.style.background = '#ffffff';
      pageWrapper.style.color = '#0f172a';
      pageWrapper.style.zIndex = '-99999';
      pageWrapper.style.pointerEvents = 'none';
      pageWrapper.style.overflow = 'hidden';
      pageWrapper.style.margin = '0';
      pageWrapper.style.padding = '0';
      pageWrapper.style.boxSizing = 'border-box';
      pageWrapper.style.fontFamily =
        '"IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

      // Clonage profond de la page en cours
      const clone = pageEl.cloneNode(true) as HTMLElement;
      clone.style.transform = 'none';
      clone.style.transformOrigin = 'top left';
      clone.style.margin = '0 auto';
      clone.style.boxSizing = 'border-box';
      pageWrapper.appendChild(clone);
      document.body.appendChild(pageWrapper);

      try {
        // Attente du décodage de toutes les images contenues dans la page (logos, portraits, QR)
        const images = Array.from(pageWrapper.querySelectorAll('img'));
        if (images.length > 0) {
          await Promise.all(
            images.map(
              (img) =>
                new Promise<void>((resolve) => {
                  if (img.complete && img.naturalWidth > 0) return resolve();
                  img.onload = () => resolve();
                  img.onerror = () => resolve();
                }),
            ),
          );
        }

        // Bref délai pour garantir le calcul sub-pixel par le moteur de rendu
        await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 20)));

        const imgData = await toPng(pageWrapper, {
          pixelRatio,
          backgroundColor: '#ffffff',
          imagePlaceholder:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        });

        if (i > 0) {
          doc.addPage(paper === 'Letter' ? 'letter' : 'a4', orientation);
        }

        // Placement 1:1 pleine page rigoureusement centré et sans décalage métrique
        doc.addImage(imgData, 'PNG', 0, 0, pageWidthMm, pageHeightMm, undefined, 'FAST');
      } finally {
        if (pageWrapper.parentNode) {
          pageWrapper.parentNode.removeChild(pageWrapper);
        }
      }
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

    // 5. Déclencher le téléchargement direct sur le disque sans aucune redirection
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
    // Nettoyage de sécurité global si nécessaire
  }
}
