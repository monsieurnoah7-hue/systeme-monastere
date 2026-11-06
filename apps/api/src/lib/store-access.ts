import { getDb } from '../db/index.js';

export type StoreCapability = 'can_view' | 'can_scan' | 'can_move_stock' | 'can_lend_tools' | 'can_return_tools';

export async function hasStoreScope(userId: number): Promise<boolean> {
  const row = await getDb().one<{ scoped: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM user_magasin_access WHERE user_id = $1) AS scoped',
    [userId],
  );
  return Boolean(row?.scoped);
}

export async function canAccessStore(userId: number, rawStoreId: unknown, capability: StoreCapability = 'can_view'): Promise<boolean> {
  const storeId = typeof rawStoreId === 'string' ? rawStoreId : null;
  if (!storeId) return !(await hasStoreScope(userId));
  if (!(await hasStoreScope(userId))) return true;
  const row = await getDb().one<{ allowed: boolean }>(
    `SELECT ${capability} AS allowed FROM user_magasin_access WHERE user_id = $1 AND magasin_id = $2`,
    [userId, storeId],
  );
  return Boolean(row?.allowed);
}

export async function visibleStoreIds(userId: number): Promise<string[] | null> {
  if (!(await hasStoreScope(userId))) return null;
  const rows = await getDb().query<{ magasin_id: string }>(
    'SELECT magasin_id FROM user_magasin_access WHERE user_id = $1 AND can_view = true ORDER BY magasin_id',
    [userId],
  );
  return rows.map((row) => row.magasin_id);
}
