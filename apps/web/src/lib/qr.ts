import QRCode from 'qrcode';

export const QR_PREFIX = {
  tool: 'montfebe:tool:',
  badge: 'montfebe:badge:',
  punch: 'montfebe:punch:',
  stock: 'montfebe:stock:',
  magasin: 'montfebe:magasin:',
} as const;

export async function qrDataUrl(text: string, width = 220): Promise<string> {
  return QRCode.toDataURL(text, {
    width,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#17181b', light: '#ffffff' },
  });
}
