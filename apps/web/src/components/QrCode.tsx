import { useEffect, useState } from 'react';
import { getCachedQr, qrDataUrl } from '../lib/qr';

export function QrCode({ value, size = 96, alt }: { value: string; size?: number; alt?: string }) {
  const targetWidth = Math.max(96, size * 2);
  const [src, setSrc] = useState<string | null>(() => getCachedQr(value, targetWidth) ?? null);

  useEffect(() => {
    let cancelled = false;
    const cached = getCachedQr(value, targetWidth);
    if (cached) {
      setSrc(cached);
      return;
    }
    void qrDataUrl(value, targetWidth).then((next) => {
      if (!cancelled) setSrc(next);
    });
    return () => {
      cancelled = true;
    };
  }, [value, targetWidth]);

  if (!src) {
    return (
      <div
        data-qr-pending="true"
        style={{ width: size, height: size }}
        className="flex items-center justify-center bg-gray-50 text-[10px] text-gray-400"
        aria-hidden
      >
        ...
      </div>
    );
  }

  return (
    <img
      data-qr-ready="true"
      src={src}
      alt={alt ?? `QR ${value}`}
      style={{
        width: size,
        height: size,
        imageRendering: '-webkit-optimize-contrast',
      }}
      className="shrink-0 object-contain"
    />
  );
}
