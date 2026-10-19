export type ImageCheck =
  | { ok: true; reason?: undefined; mime: 'image/jpeg' | 'image/png'; bytes: number; width: number; height: number }
  | { ok: false; reason: string };

const MIN_EDGE = 160;
const MIN_BYTES = 8 * 1024;

function jpegSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) return null;
    const marker = buf[offset + 1] ?? 0;
    const size = buf.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
    }
    offset += 2 + size;
  }
  return null;
}

function pngSize(buf: Buffer): { width: number; height: number } | null {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 24 || !buf.subarray(0, 8).equals(signature)) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/**
 * Contrôle simple du selfie (CDC 4.6.4 « photo ancienne ou importée »).
 * On vérifie qu'il s'agit d'une image caméra exploitable : format jpeg/png,
 * dimensions minimales et poids minimal (un cadre vide ne passe pas).
 * La détection de visage à proprement parler relève d'un modèle externe —
 * point à valider en recette.
 */
export function checkSelfie(dataUrl: string): ImageCheck {
  const match = /^data:(image\/jpeg|image\/png);base64,(.+)$/.exec(dataUrl ?? '');
  if (!match) return { ok: false, reason: 'Format de photo non accepté (jpeg ou png attendu).' };
  const mime = match[1] as 'image/jpeg' | 'image/png';
  const b64 = match[2] ?? '';
  if (b64.length < MIN_BYTES) {
    return { ok: false, reason: 'Photo trop légère : capture obligatoire avec la caméra en direct.' };
  }
  let buf: Buffer;
  try {
    buf = Buffer.from(b64, 'base64');
  } catch {
    return { ok: false, reason: 'Photo illisible.' };
  }
  const size = mime === 'image/jpeg' ? jpegSize(buf) : pngSize(buf);
  if (!size) return { ok: false, reason: 'Photo illisible.' };
  if (size.width < MIN_EDGE || size.height < MIN_EDGE) {
    return { ok: false, reason: `Résolution insuffisante (${size.width}×${size.height}, ${MIN_EDGE}×${MIN_EDGE} attendu).` };
  }
  return { ok: true, mime, bytes: buf.length, width: size.width, height: size.height };
}
