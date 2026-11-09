import QRCode from 'qrcode';

export const QR_PREFIX = {
  tool: 'montfebe:tool:',
  badge: 'montfebe:badge:',
  punch: 'montfebe:punch:',
  stock: 'montfebe:stock:',
  magasin: 'montfebe:magasin:',
  kit: 'montfebe:kit:',
  kitItem: 'montfebe:kit-item:',
} as const;

const qrCache = new Map<string, string>();
const qrPromiseCache = new Map<string, Promise<string>>();

function getCacheKey(text: string, width: number): string {
  return `${text}:::${width}`;
}

export function getCachedQr(text: string, width = 220): string | undefined {
  return qrCache.get(getCacheKey(text, width));
}

export async function qrDataUrl(text: string, width = 220): Promise<string> {
  const key = getCacheKey(text, width);
  const resolved = qrCache.get(key);
  if (resolved) return resolved;

  const existingPromise = qrPromiseCache.get(key);
  if (existingPromise) return existingPromise;

  const promise = QRCode.toDataURL(text, {
    width,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#0a0a0c', light: '#ffffff' },
  }).then((dataUrl) => {
    qrCache.set(key, dataUrl);
    qrPromiseCache.delete(key);
    return dataUrl;
  }).catch((err) => {
    qrPromiseCache.delete(key);
    throw err;
  });

  qrPromiseCache.set(key, promise);
  return promise;
}
