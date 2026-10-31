import { env } from '../env.js';
import { DDL, MIGRATION_DDL, MIGRATION_NAME } from './ddl.js';
import { getDb } from './index.js';
import { syncOfficialCftmData } from './cftm-data.js';

// Un seul aller-retour par lot : verrou conseil inclus dans la même
// requête multi-énoncés → transaction implicite unique, les cold starts
// Vercel concurrents ne peuvent plus se marcher dessus.
const LOCK = env.databaseUrl ? 'SELECT pg_advisory_xact_lock(715827882);' : '';

async function runBatch(sql: string): Promise<void> {
  await getDb().query(`${LOCK}\n${sql}`);
}

async function runOneByOne(sql: string): Promise<void> {
  for (const statement of sql.split(';')) {
    const stmt = statement.trim();
    if (!stmt) continue;
    try {
      await getDb().query(stmt);
    } catch {
      // énoncé déjà appliqué ou non applicable sur ce schéma
    }
  }
}

async function runSql(sql: string): Promise<void> {
  try {
    await runBatch(sql);
  } catch {
    await runOneByOne(sql);
  }
}

export async function migrate(): Promise<void> {
  await runSql(DDL);
  await runSql(MIGRATION_DDL);
  await getDb().query('INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [MIGRATION_NAME]);
  await syncOfficialCftmData(getDb());
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
