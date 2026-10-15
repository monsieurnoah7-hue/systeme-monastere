import { useEffect, useState } from 'react';
import { qrDataUrl } from '../lib/qr';

export function QrCode({ value, size = 96, alt }: { value: string; size?: number; alt?: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void qrDataUrl(value, Math.max(96, size * 2)).then((next) => {
      if (!cancelled) setSrc(next);
    });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!src) return <div style={{ width: size, height: size }} aria-hidden />;
  return <img src={src} alt={alt ?? `QR ${value}`} style={{ width: size, height: size }} />;
}
