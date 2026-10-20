import { gunzipSync } from 'node:zlib';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Sql } from './index.js';
import { getDb } from './index.js';
import { fkInsertionOrder } from './fk-order.js';

type Dump = {
  meta?: { createdAt?: string; migration?: string; app?: string };
  tables: Record<string, Record<string, unknown>[]>;
};

const [, , fileArg, ...flags] = process.argv;
const confirmed = flags.includes('--yes') || flags.includes('-y');

function die(message: string): never {
  console.error(`ERREUR : ${message}`);
  process.exit(1);
}

if (!fileArg) {
  console.log('Usage : npx tsx src/db/restore.ts <dump.json.gz|dump.json> --yes');
  console.log('  Le dump provient de : /api/admin/backup (téléchargement) ou du Blob store "monastere-backups".');
  console.log('  ATTENTION : la restauration écrase la base cible (DATABASE_URL). --yes est obligatoire.');
  process.exit(1);
}
if (!confirmed) die('Ajoutez --yes pour confirmer l\'écrasement de la base cible.');

const path = resolve(fileArg);
if (!existsSync(path)) die(`fichier introuvable : ${path}`);

const raw = readFileSync(path);
const bytes = path.endsWith('.gz') ? gunzipSync(raw) : raw;
let dump: Dump;
try {
  dump = JSON.parse(bytes.toString('utf8'));
} catch {
  die('fichier illisible (JSON invalide)');
}
if (!dump || typeof dump.tables !== 'object' || !dump.tables) die('format de dump invalide (champ "tables" manquant)');

const db = getDb();

async function tableExists(name: string): Promise<boolean> {
  const row = await db.one<{ n: number }>(
    "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name = $1",
    [name],
  );
  return (row?.n ?? 0) > 0;
}


async function insertRows(
  tx: Sql,
  table: string,
  rows: Record<string, unknown>[],
  overrideIdentity: boolean,
  jsonCols: Set<string>,
): Promise<void> {
  const first = rows[0];
  if (!first) return;
  const columns = Object.keys(first);
  const quoted = columns.map((c) => `"${c.replaceAll('"', '""')}"`).join(', ');
  const override = overrideIdentity ? ' OVERRIDING SYSTEM VALUE' : '';
  const perStatement = Math.max(1, Math.floor(30_000 / columns.length));
  for (let i = 0; i < rows.length; i += perStatement) {
    const chunk = rows.slice(i, i + perStatement);
    const values: unknown[] = [];
    const tuples = chunk
      .map((row, rowIndex) => {
        const placeholders = columns.map((c, colIndex) => {
          const value = row[c] ?? null;
          // pg convertit les objets/tableaux en littéraux de tableaux Postgres
          // ({1,2}) : il faut sérialiser en JSON pour les colonnes json/jsonb.
          const stored = value !== null && jsonCols.has(`${table}.${c}`) ? JSON.stringify(value) : value;
          values.push(stored);
          return `$${rowIndex * columns.length + colIndex + 1}`;
        });
        return `(${placeholders.join(', ')})`;
      })
      .join(', ');
    await tx.query(`INSERT INTO "${table.replaceAll('"', '""')}" (${quoted})${override} VALUES ${tuples}`, values);
  }
}

const started = Date.now();
const dumpTables = Object.keys(dump.tables);
const missing: string[] = [];
for (const name of dumpTables) {
  if (!(await tableExists(name))) missing.push(name);
}
if (missing.length > 0) die(`tables absentes de la base cible : ${missing.join(', ')}`);

const order = await fkInsertionOrder(db, dumpTables);
const identityCols = await db.query<{ table_name: string; column_name: string }>(
  `SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND is_identity = 'YES' AND identity_generation = 'ALWAYS'
    ORDER BY table_name, ordinal_position`,
);
const identity = new Set(identityCols.map((r) => r.table_name));
const jsonCols = new Set(
  (
    await db.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND data_type IN ('json', 'jsonb')`,
    )
  ).map((r) => `${r.table_name}.${r.column_name}`),
);
const totalRows = dumpTables.reduce((n, t) => n + (dump.tables[t]?.length ?? 0), 0);

console.log(`Restauration de : ${path}`);
console.log(`  Dump du : ${dump.meta?.createdAt ?? 'date inconnue'} (migration ${dump.meta?.migration ?? '?'})`);
console.log(`  ${dumpTables.length} tables, ${totalRows} lignes`);
const targetUrl = process.env.DATABASE_URL?.trim();
const targetLabel = targetUrl ? new URL(targetUrl).host || 'postgres' : 'PGlite local';
console.log(`  Base cible : ${targetLabel}`);

await db.transaction(async (tx) => {
  await tx.query(`TRUNCATE ${dumpTables.map((t) => `"${t.replaceAll('"', '""')}"`).join(', ')} CASCADE`);
  for (const table of order) {
    const rows = dump.tables[table];
    if (rows) await insertRows(tx, table, rows, identity.has(table), jsonCols);
  }
  // Les ids réinsérés explicitement ne déplacent pas les séquences :
  // on les réaligne sur le max pour éviter des conflits de clé au prochain INSERT.
  for (const { table_name, column_name } of identityCols) {
    if (!dumpTables.includes(table_name)) continue;
    await tx.query(
      `SELECT setval(pg_get_serial_sequence($1, $2), GREATEST(COALESCE((SELECT max("${column_name.replaceAll('"', '""')}") FROM "${table_name.replaceAll('"', '""')}"), 0)::bigint, 1))`,
      [table_name, column_name],
    );
  }
});

let failed = 0;
for (const table of dumpTables.sort()) {
  const row = await db.one<{ n: number }>(`SELECT count(*)::int AS n FROM "${table.replaceAll('"', '""')}"`);
  const expected = dump.tables[table]?.length ?? -1;
  const ok = row?.n === expected;
  if (!ok) {
    failed++;
    console.log(`FAIL ${table}: ${row?.n ?? 0} lignes au lieu de ${expected}`);
  }
}
console.log(failed === 0 ? `RESTAURATION OK (${dumpTables.length} tables, ${Date.now() - started} ms)` : `${failed} table(s) en échec`);
process.exit(failed === 0 ? 0 : 1);
