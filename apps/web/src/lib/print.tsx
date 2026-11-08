import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Flux d’impression du prototype : le contenu est porté dans #print-root
 * (masqué à l’écran, visible en @media print via la classe html.printing),
 * window.print() est appelé après un court délai, puis le DOM est nettoyé.
 */
export function usePrintSheet() {
  const [content, setContent] = useState<ReactNode>(null);

  useEffect(() => {
    if (content === null) return;
    document.documentElement.classList.add('printing');
    const after = () => setContent(null);
    window.addEventListener('afterprint', after);
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        // Allow Safari/iOS to commit the print-only DOM and styles before the
        // native dialog snapshots the page.
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        const root = document.getElementById('print-root');
        const images = Array.from(root?.querySelectorAll('img') ?? []);
        await Promise.all(images.map(async (image) => {
          if (typeof image.decode === 'function') {
            await image.decode().catch(() => undefined);
            return;
          }
          if (image.complete) return;
          await new Promise<void>((resolve) => {
            const finish = () => resolve();
            image.addEventListener('load', finish, { once: true });
            image.addEventListener('error', finish, { once: true });
            window.setTimeout(finish, 5000);
          });
        }));
        if (document.fonts?.ready) await document.fonts.ready.catch(() => undefined);
        root?.getBoundingClientRect();
        if (!cancelled) window.print();
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', after);
      document.documentElement.classList.remove('printing');
      const root = document.getElementById('print-root');
      if (root) root.innerHTML = '';
    };
  }, [content]);

  const portal =
    content !== null
      ? createPortal(<div style={{ padding: '6mm 0' }}>{content}</div>, document.getElementById('print-root') ?? document.body)
      : null;

  return { print: setContent, portal };
}
