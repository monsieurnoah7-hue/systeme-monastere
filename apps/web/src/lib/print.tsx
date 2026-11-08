import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Imprime uniquement la planche dans une fenêtre isolée. Ainsi, les aperçus,
 * modales et contrôles de l'application ne peuvent pas être capturés avec elle.
 */
export function usePrintSheet() {
  const [content, setContent] = useState<ReactNode>(null);
  const popupRef = useRef<Window | null>(null);
  const printStartedRef = useRef(false);

  const print = useCallback((nextContent: ReactNode) => {
    if (printStartedRef.current) return;

    // L'ouverture doit rester synchrone au clic pour ne pas être bloquée par le navigateur.
    const popup = window.open('', '_blank');
    if (!popup) {
      window.alert("La fenêtre d’impression a été bloquée. Autorisez les fenêtres pop-up pour ce site, puis réessayez.");
      return;
    }

    printStartedRef.current = true;
    popupRef.current = popup;
    popup.document.open();
    popup.document.write(`<!doctype html><html class="printing"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><base href="${window.location.origin}/"><title>Planche à imprimer</title></head><body><main id="print-root"></main></body></html>`);
    popup.document.close();
    setContent(nextContent);
  }, []);

  useEffect(() => {
    if (content === null) return;
    let cancelled = false;
    const popup = popupRef.current;
    const sourceRoot = document.getElementById('print-root');

    const finish = () => {
      if (popup && !popup.closed) popup.close();
      popupRef.current = null;
      printStartedRef.current = false;
      setContent(null);
    };

    const afterPrint = () => finish();
    popup?.addEventListener('afterprint', afterPrint, { once: true });

    const timer = window.setTimeout(() => {
      void (async () => {
        if (!popup || popup.closed || !sourceRoot) {
          finish();
          return;
        }

        const head = popup.document.head;
        const stylesheets: Promise<void>[] = [];
        document.head.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
          const clone = node.cloneNode(true) as HTMLElement;
          if (clone instanceof HTMLLinkElement && clone.rel === 'stylesheet') {
            stylesheets.push(new Promise<void>((resolve) => {
              clone.addEventListener('load', () => resolve(), { once: true });
              clone.addEventListener('error', () => resolve(), { once: true });
              window.setTimeout(resolve, 5000);
            }));
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
        const images = Array.from(targetRoot.querySelectorAll('img'));
        await Promise.all(images.map(async (image) => {
          if (typeof image.decode === 'function') {
            await image.decode().catch(() => undefined);
            return;
          }
          if (image.complete) return;
          await new Promise<void>((resolve) => {
            image.addEventListener('load', () => resolve(), { once: true });
            image.addEventListener('error', () => resolve(), { once: true });
            window.setTimeout(resolve, 5000);
          });
        }));
        if (popup.document.fonts?.ready) await popup.document.fonts.ready.catch(() => undefined);
        await new Promise<void>((resolve) => popup.requestAnimationFrame(() => popup.requestAnimationFrame(() => resolve())));
        targetRoot.getBoundingClientRect();
        if (!cancelled && !popup.closed) popup.print();
      })().catch(() => finish());
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      popup?.removeEventListener('afterprint', afterPrint);
    };
  }, [content]);

  const portal = content !== null
    ? createPortal(<div style={{ padding: '6mm 0' }}>{content}</div>, document.getElementById('print-root') ?? document.body)
    : null;

  return { print, portal };
}
