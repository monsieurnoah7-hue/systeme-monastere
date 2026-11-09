import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Imprime uniquement la planche dans une fenêtre isolée ou en mode dédié.
 * Garantit que la planche est mise en page à 100%, que tous les QR codes et polices sont chargés,
 * qu'aucun doublon visuel n'apparaît et qu'aucun blocage d'interface n'est possible.
 */
export function usePrintSheet() {
  const [content, setContent] = useState<ReactNode>(null);
  const popupRef = useRef<Window | null>(null);
  const printStartedRef = useRef(false);
  const isFallbackRef = useRef(false);

  const print = useCallback((nextContent: ReactNode) => {
    // Si une impression précédente est terminée ou fenêtre fermée, réinitialiser
    if (popupRef.current && popupRef.current.closed) {
      popupRef.current = null;
      printStartedRef.current = false;
    }

    if (printStartedRef.current) return;

    // Tentative d'ouverture synchrone au clic pour éviter le blocage popup
    let popup: Window | null = null;
    try {
      popup = window.open('', '_blank');
    } catch {
      popup = null;
    }

    printStartedRef.current = true;

    if (popup) {
      isFallbackRef.current = false;
      popupRef.current = popup;
      popup.document.open();
      popup.document.write(`<!doctype html>
<html class="printing" lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <base href="${window.location.origin}/">
  <title>Planche à imprimer · CFTM</title>
  <style>
    @page {
      margin: 6mm;
      size: auto;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
      color: #0f172a !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    #print-root {
      display: block !important;
      visibility: visible !important;
      width: 100% !important;
      margin: 0 auto !important;
      padding: 0 !important;
    }
    img {
      max-width: 100%;
      image-rendering: -webkit-optimize-contrast;
      image-rendering: crisp-edges;
    }
    .badge-card,
    .tool-label-card,
    .stock-bin-label,
    .door-label-card,
    .receipt-page {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .badge-page,
    .label-sheet-page {
      box-sizing: border-box !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      break-after: page;
      page-break-after: always;
      width: 100%;
      margin: 0 auto;
    }
    .badge-page:last-child,
    .label-sheet-page:last-child {
      break-after: auto !important;
      page-break-after: auto !important;
    }
  </style>
</head>
<body>
  <main id="print-root"></main>
</body>
</html>`);
      popup.document.close();
    } else {
      // Fallback direct dans la fenêtre principale si la popup est bloquée
      isFallbackRef.current = true;
      popupRef.current = null;
      document.documentElement.classList.add('printing');
    }

    setContent(nextContent);
  }, []);

  useEffect(() => {
    if (content === null) return;
    let cancelled = false;
    const popup = popupRef.current;
    const isFallback = isFallbackRef.current;
    const sourceRoot = document.getElementById('print-root');

    const finish = () => {
      if (popup && !popup.closed) {
        try {
          popup.close();
        } catch {}
      }
      popupRef.current = null;
      printStartedRef.current = false;
      isFallbackRef.current = false;
      document.documentElement.classList.remove('printing');
      setContent(null);
    };

    // Watchdog : réinitialisation en cas de fermeture manuelle ou focus
    const onWindowFocus = () => {
      if (popup && popup.closed) {
        finish();
      }
    };
    window.addEventListener('focus', onWindowFocus);

    // Timeout de sécurité : garantit que l'UI ne reste jamais bloquée
    const safetyTimeout = window.setTimeout(() => {
      if (printStartedRef.current) {
        finish();
      }
    }, 25000);

    const afterPrint = () => finish();
    if (popup) {
      popup.addEventListener('afterprint', afterPrint, { once: true });
    } else {
      window.addEventListener('afterprint', afterPrint, { once: true });
    }

    const prepareAndPrint = async () => {
      // 1. Attendre la stabilisation du DOM source (QR codes, images)
      let attempts = 0;
      while (attempts < 25) {
        if (cancelled) return;
        const pending = sourceRoot?.querySelectorAll('[data-qr-pending="true"]');
        if (!pending || pending.length === 0) break;
        await new Promise((r) => setTimeout(r, 40));
        attempts++;
      }

      // Petite pause pour s'assurer que les images locales sont peintes
      await new Promise((r) => setTimeout(r, 60));

      if (cancelled) return;

      if (!isFallback && popup && !popup.closed && sourceRoot) {
        const head = popup.document.head;
        const stylesheets: Promise<void>[] = [];
        document.head.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
          const clone = node.cloneNode(true) as HTMLElement;
          if (clone instanceof HTMLLinkElement && clone.rel === 'stylesheet') {
            stylesheets.push(
              new Promise<void>((resolve) => {
                clone.addEventListener('load', () => resolve(), { once: true });
                clone.addEventListener('error', () => resolve(), { once: true });
                window.setTimeout(resolve, 3000);
              }),
            );
          }
          head.appendChild(clone);
        });

        const targetRoot = popup.document.getElementById('print-root');
        if (!targetRoot) {
          finish();
          return;
        }

        targetRoot.innerHTML = sourceRoot.innerHTML;

        await Promise.all(stylesheets);

        // Décoder toutes les images dans la popup pour éviter le blanc lors de l'impression
        const images = Array.from(targetRoot.querySelectorAll('img'));
        await Promise.all(
          images.map(async (image) => {
            if (typeof image.decode === 'function') {
              await image.decode().catch(() => undefined);
              return;
            }
            if (image.complete) return;
            await new Promise<void>((resolve) => {
              image.addEventListener('load', () => resolve(), { once: true });
              image.addEventListener('error', () => resolve(), { once: true });
              window.setTimeout(resolve, 3000);
            });
          }),
        );

        if (popup.document.fonts?.ready) {
          await popup.document.fonts.ready.catch(() => undefined);
        }

        await new Promise<void>((resolve) =>
          popup.requestAnimationFrame(() => popup.requestAnimationFrame(() => resolve())),
        );
        targetRoot.getBoundingClientRect();

        if (!cancelled && !popup.closed) {
          popup.print();
        }
      } else if (isFallback) {
        // Mode direct in-page
        if (document.fonts?.ready) {
          await document.fonts.ready.catch(() => undefined);
        }
        await new Promise<void>((resolve) =>
          window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())),
        );
        if (!cancelled) {
          window.print();
        }
      }
    };

    void prepareAndPrint().catch(() => finish());

    return () => {
      cancelled = true;
      window.clearTimeout(safetyTimeout);
      window.removeEventListener('focus', onWindowFocus);
      popup?.removeEventListener('afterprint', afterPrint);
      window.removeEventListener('afterprint', afterPrint);
    };
  }, [content]);

  const portal =
    content !== null
      ? createPortal(
          <div style={{ padding: '0', margin: '0' }}>{content}</div>,
          document.getElementById('print-root') ?? document.body,
        )
      : null;

  return { print, portal };
}
