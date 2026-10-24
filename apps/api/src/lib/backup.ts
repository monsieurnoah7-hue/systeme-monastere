import { del, list, put } from '@vercel/blob';
import { gzipSync } from 'node:zlib';
import { getDb } from '../db/index.js';
import { MIGRATION_NAME } from '../db/ddl.js';
import { env } from '../env.js';

export const BACKUP_PREFIX = 'backups/';

export type DatabaseDump = {
  meta: { app: string; createdAt: string; retentionDays: number; migration: string };
  tables: Record<string, Record<string, unknown>[]>;
};

export function blobAuth(): { token?: string } {
  return env.blobToken ? { token: env.blobToken } : {};
}

export async function dumpDatabase(): Promise<DatabaseDump> {
  const db = getDb();
  const catalog = await db.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name`,
  );
  const tables: DatabaseDump['tables'] = {};
  for (const { table_name } of catalog) {
    tables[table_name] = await db.query<Record<string, unknown>>(`SELECT * FROM "${table_name.replaceAll('"', '""')}"`);
  }
  return {
    meta: {
      app: 'systeme-monastere',
      createdAt: new Date().toISOString(),
      retentionDays: env.backupRetentionDays,
      migration: MIGRATION_NAME,
    },
    tables,
  };
}

export function dumpRowCount(dump: DatabaseDump): number {
  return Object.values(dump.tables).reduce((n, rows) => n + rows.length, 0);
}

export function gzipDump(dump: DatabaseDump): Buffer {
  return gzipSync(Buffer.from(JSON.stringify(dump)), { level: 9 });
}

export function backupPathname(date = new Date()): string {
  const stamp = date.toISOString().replace(/[:.]/g, '-').replace('Z', 'Z');
  return `${BACKUP_PREFIX}monastere-${stamp}.json.gz`;
}

export async function uploadBackup(payload: Buffer, pathname = backupPathname()): Promise<{ pathname: string; size: number }> {
  const res = await put(pathname, payload, { access: 'private', ...blobAuth(), allowOverwrite: true });
  return { pathname: res.pathname, size: payload.length };
}

export async function listBackups(): Promise<{ pathname: string; uploadedAt: string; size: number }[]> {
  const res = await list({ prefix: BACKUP_PREFIX, limit: 1000, ...blobAuth() });
  return res.blobs.map((b) => ({
    pathname: b.pathname,
    uploadedAt: new Date(b.uploadedAt as unknown as string).toISOString(),
    size: b.size,
  }));
}

export async function purgeOldBackups(): Promise<number> {
  const cutoff = Date.now() - env.backupRetentionDays * 86_400_000;
  const old = (await listBackups()).filter((b) => new Date(b.uploadedAt).getTime() < cutoff);
  if (old.length === 0) return 0;
  await del(
    old.map((b) => b.pathname),
    blobAuth(),
  );
  return old.length;
}

export async function purgeAllBackups(): Promise<number> {
  const backups = await listBackups();
  if (backups.length === 0) return 0;
  await del(
    backups.map((b) => b.pathname),
    blobAuth(),
  );
  return backups.length;
}

export async function runCloudBackup(): Promise<{
  pathname: string;
  size: number;
  gzSize: number;
  tables: number;
  rows: number;
  purged: number;
}> {
  const dump = await dumpDatabase();
  const gz = gzipDump(dump);
  const up = await uploadBackup(gz);
  const purged = await purgeOldBackups();
  return {
    pathname: up.pathname,
    size: up.size,
    gzSize: gz.length,
    tables: Object.keys(dump.tables).length,
    rows: dumpRowCount(dump),
    purged,
  };
}
