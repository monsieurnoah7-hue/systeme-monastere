import { DDL, MIGRATION_DDL, MIGRATION_NAME } from './ddl.js';
import { getDb } from './index.js';

export async function migrate(): Promise<void> {
  const db = getDb();
  for (const statement of DDL.split(';')) {
    const sql = statement.trim();
    if (!sql) continue;
    await db.query(sql);
  }
  for (const statement of MIGRATION_DDL.split(';')) {
    const sql = statement.trim();
    if (!sql) continue;
    try {
      await db.query(sql);
    } catch {
      // constraint may not exist on fresh DBs
    }
  }
  const row = await db.one<{ name: string }>('SELECT name FROM _migrations WHERE name = $1', [MIGRATION_NAME]);
  if (!row) {
    await db.query('INSERT INTO _migrations (name) VALUES ($1)', [MIGRATION_NAME]);
  }
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  migrate()
    .then(() => {
      console.log('[db] migrations appliquées');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[db] échec des migrations', err);
      process.exit(1);
    });
}
