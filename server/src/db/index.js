// One tiny query interface over two engines:
//  - Supabase / any Postgres via `pg` (DATABASE_URL set)
//  - PGlite (real Postgres compiled to WASM, in-memory) for demo mode
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config } from '../config.js';

const DATE_OID = 1082;
const keepAsString = (v) => v;

let engine; // { query(sql, params) -> rows, tx(fn) }

async function createPg() {
  const { default: pg } = await import('pg');
  pg.types.setTypeParser(DATE_OID, keepAsString); // keep 'YYYY-MM-DD' (no timezone shifts)
  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    ssl: /localhost|127\.0\.0\.1/.test(config.databaseUrl) ? false : { rejectUnauthorized: false },
    max: 10,
  });
  return {
    query: async (sql, params = []) => (await pool.query(sql, params)).rows,
    tx: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({ query: async (s, p = []) => (await client.query(s, p)).rows });
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
    exec: async (sql) => pool.query(sql),
  };
}

async function createPglite() {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite({ parsers: { [DATE_OID]: keepAsString } });
  await db.waitReady;
  // PGlite is single-connection, so serialise transactions to keep them isolated.
  let chain = Promise.resolve();
  const tx = (fn) => {
    const run = chain.then(() =>
      db.transaction((t) => fn({ query: async (s, p = []) => (await t.query(s, p)).rows })),
    );
    chain = run.catch(() => {});
    return run;
  };
  return {
    query: async (sql, params = []) => (await db.query(sql, params)).rows,
    tx,
    exec: (sql) => db.exec(sql),
  };
}

export async function initDb() {
  engine = config.demoMode ? await createPglite() : await createPg();
  if (config.demoMode) {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    await engine.exec(await readFile(path.join(dir, 'schema.sql'), 'utf8'));
    const { seed } = await import('./seed.js');
    await seed({ query, tx, demo: true });
  }
}

export const query = (sql, params) => engine.query(sql, params);
export const one = async (sql, params) => (await engine.query(sql, params))[0] || null;
export const tx = (fn) => engine.tx(fn);
export const exec = (sql) => engine.exec(sql);
