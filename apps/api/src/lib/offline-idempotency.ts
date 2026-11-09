import type { Sql } from '../db/index.js';

export async function withOfflineIdempotency<T>(
  db: Sql,
  userId: number,
  key: string | undefined,
  work: (tx: Sql) => Promise<T>,
): Promise<{ value: T; replayed: boolean }> {
  if (!key || !/^[0-9a-f-]{36}$/i.test(key)) {
    return { value: await db.transaction(work), replayed: false };
  }

  return db.transaction(async (tx) => {
    const claimed = await tx.query<{ mutation_id: string }>(
      `INSERT INTO offline_mutations (user_id, mutation_id) VALUES ($1, $2)
       ON CONFLICT (user_id, mutation_id) DO NOTHING RETURNING mutation_id`,
      [userId, key],
    );
    if (!claimed.length) {
      const existing = await tx.one<{ response: T | string | null }>(
        'SELECT response FROM offline_mutations WHERE user_id = $1 AND mutation_id = $2',
        [userId, key],
      );
      if (existing?.response) {
        const value = typeof existing.response === 'string' ? JSON.parse(existing.response) as T : existing.response;
        return { value, replayed: true };
      }
      throw new Error('Cette opération est déjà en cours de synchronisation. Réessayez dans quelques instants.');
    }

    const value = await work(tx);
    await tx.query(
      'UPDATE offline_mutations SET response = $3::jsonb WHERE user_id = $1 AND mutation_id = $2',
      [userId, key, JSON.stringify(value)],
    );
    return { value, replayed: false };
  });
}
