import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { env } from '../env.js';
import { getDb } from '../db/index.js';

const isServerless = Boolean(process.env.VERCEL);

/**
 * Enregistre une photo (outils, profils, employés, quincaillerie)
 * de manière résiliente : dans la table `image_blobs` (compatible serverless / Neon / Supabase / Vercel)
 * et sur disque local si non-serverless.
 */
export async function saveImage(prefix: string, dataUrl: string): Promise<string> {
  const parts = dataUrl.split(',');
  const raw = (parts.length > 1 ? parts[1] : parts[0]) ?? '';
  const b64 = raw.trim();
  if (!b64) throw new Error('Données photo invalides.');

  let contentType = 'image/jpeg';
  const match = dataUrl.match(/^data:([^;]+);base64,/);
  if (match?.[1]) contentType = match[1];

  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `${cleanPrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;

  const db = getDb();
  await db.query(
    `INSERT INTO image_blobs (file_name, data, content_type)
     VALUES ($1, $2, $3)
     ON CONFLICT (file_name) DO UPDATE SET data = EXCLUDED.data, content_type = EXCLUDED.content_type`,
    [fileName, b64, contentType],
  );

  if (!isServerless) {
    try {
      const dir = path.join(env.dataDir, 'photos');
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, fileName), Buffer.from(b64, 'base64'));
    } catch {
      // Ignoré si le disque est en lecture seule
    }
  }

  return `/api/images/${fileName}`;
}

export async function getImage(fileName: string): Promise<{ data: Buffer; contentType: string } | null> {
  const db = getDb();
  const row = await db.one<{ data: string; content_type: string }>(
    'SELECT data, content_type FROM image_blobs WHERE file_name = $1',
    [fileName],
  );
  if (row) {
    return {
      data: Buffer.from(row.data, 'base64'),
      contentType: row.content_type || 'image/jpeg',
    };
  }

  if (!isServerless) {
    try {
      const buf = readFileSync(path.join(env.dataDir, 'photos', fileName));
      const ext = path.extname(fileName).toLowerCase();
      const contentType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      return { data: buf, contentType };
    } catch {
      return null;
    }
  }

  return null;
}
