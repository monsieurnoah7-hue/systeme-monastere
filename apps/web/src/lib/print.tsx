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
    const timer = window.setTimeout(() => window.print(), 280);
    return () => {
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
