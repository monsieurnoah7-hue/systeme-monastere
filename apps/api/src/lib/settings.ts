import { getDb } from '../db/index.js';
import { DEFAULT_SETTINGS, type Settings } from './time.js';

export { DEFAULT_SETTINGS, type Settings };

export async function loadSettings(): Promise<Settings> {
  const rows = await getDb().query<{ key: string; value: unknown }>('SELECT key, value FROM settings');
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const row of rows) merged[row.key] = row.value;
  return merged as Settings;
}

export async function saveSetting(key: string, value: unknown): Promise<void> {
  await getDb().query(
    `INSERT INTO settings (key, value) VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, JSON.stringify(value)],
  );
}
