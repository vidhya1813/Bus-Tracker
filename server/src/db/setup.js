// `npm run db:setup` — create tables and seed sample data in Supabase (DATABASE_URL).
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config } from '../config.js';
import { initDb, exec, query, tx } from './index.js';
import { seed } from './seed.js';

if (config.demoMode) {
  console.error('DATABASE_URL is empty. Set it in server/.env to your Supabase connection string first.');
  process.exit(1);
}

await initDb();
const dir = path.dirname(fileURLToPath(import.meta.url));
await exec(await readFile(path.join(dir, 'schema.sql'), 'utf8'));
console.log('Schema applied.');
console.log((await seed({ query, tx })) ? 'Sample data seeded.' : 'Data already present, seed skipped.');
process.exit(0);
