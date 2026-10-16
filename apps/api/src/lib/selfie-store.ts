import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { env } from '../env.js';
import { getDb } from '../db/index.js';

// Sur Vercel le disque est en lecture seule → stocker en base64 dans PostgreSQL.
// Sur Docker/local → fichier sur disque (performant, 150 Ko/image).
const isServerless = Boolean(process.env.VERCEL);

export async function saveSelfie(employeeId: string, punchType: string, stamp: string, dataUrl: string): Promise<string> {
  const b64 = (dataUrl.split(',')[1] ?? '').trim();
  if (!b64) throw new Error('Photo illisible.');
  const fileName = `${employeeId}_${stamp}_${punchType}.jpg`;

  if (isServerless) {
    const db = getDb();
    await db.query(
      `INSERT INTO selfie_blobs (file_name, data) VALUES ($1, $2)
       ON CONFLICT (file_name) DO UPDATE SET data = EXCLUDED.data`,
      [fileName, b64],
    );
    return fileName;
  }

  const dir = path.join(env.dataDir, 'selfies');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, fileName), Buffer.from(b64, 'base64'));
  return fileName;
}

export async function getSelfie(fileName: string): Promise<{ data: Buffer; contentType: string } | null> {
  if (isServerless) {
    const db = getDb();
    const row = await db.one<{ data: string }>('SELECT data FROM selfie_blobs WHERE file_name = $1', [fileName]);
    if (!row) return null;
    return { data: Buffer.from(row.data, 'base64'), contentType: 'image/jpeg' };
  }

  const { readFileSync } = await import('node:fs');
  try {
    const buf = readFileSync(path.join(env.dataDir, 'selfies', fileName));
    return { data: buf, contentType: 'image/jpeg' };
  } catch {
    return null;
  }
}
