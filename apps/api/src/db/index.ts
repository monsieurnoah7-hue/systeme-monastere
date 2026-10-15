import { mkdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { env } from '../env.js';

export type Sql = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  one<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T | undefined>;
  transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
};

function makeSql(query: (text: string, params: unknown[]) => Promise<unknown[]>, tx: (fn: (inner: Sql) => Promise<unknown>) => Promise<unknown>): Sql {
  const sql: Sql = {
    async query<T>(text: string, params: unknown[] = []): Promise<T[]> {
      return (await query(text, params)) as T[];
    },
    async one<T>(text: string, params: unknown[] = []): Promise<T | undefined> {
      const rows = await query(text, params);
      return rows[0] as T | undefined;
    },
    async transaction<T>(fn: (inner: Sql) => Promise<T>): Promise<T> {
      return (await tx(async (inner) => fn(inner))) as T;
    },
  };
  return sql;
}

function fromPool(pool: pg.Pool): Sql {
  return makeSql(
    async (text, params) => (await pool.query(text, params as unknown[])).rows,
    async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const inner = makeSql(
          async (text, params) => (await client.query(text, params as unknown[])).rows,
          async () => {
            throw new Error('nested transactions are not supported');
          },
        );
        const out = await fn(inner);
        await client.query('COMMIT');
        return out;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
  );
}

function fromPglite(db: PGlite): Sql {
  return makeSql(
    async (text, params) => ((await db.query(text, params)) as { rows: unknown[] }).rows,
    async (fn) =>
      db.transaction(async (tx) => {
        const inner = makeSql(
          async (text, params) => ((await tx.query(text, params)) as { rows: unknown[] }).rows,
          async () => {
            throw new Error('nested transactions are not supported');
          },
        );
        return fn(inner);
      }),
  );
}

let instance: Sql | undefined;

export function getDb(): Sql {
  if (instance) return instance;
  if (env.databaseUrl) {
    const pool = new pg.Pool({ connectionString: env.databaseUrl, max: 10 });
    instance = fromPool(pool);
  } else {
    mkdirSync(env.dataDir, { recursive: true });
    const db = new PGlite(`${env.dataDir}/pglite`);
    instance = fromPglite(db);
  }
  return instance;
}
