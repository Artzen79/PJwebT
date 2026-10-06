import { readdir, readFile } from 'node:fs/promises';
import { pool, tx } from './db';

const dir = new URL('../db/migrations/', import.meta.url);

// ponytail: numbered .sql files + a ledger table; switch to node-pg-migrate if this ever needs down-migrations
export async function migrate() {
  await pool.query('CREATE TABLE IF NOT EXISTS migrations (name text PRIMARY KEY, run_at timestamptz NOT NULL DEFAULT now())');
  const done = new Set((await pool.query('SELECT name FROM migrations')).rows.map((r) => r.name));
  for (const name of (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(name)) continue;
    const sql = await readFile(new URL(name, dir), 'utf8');
    await tx(async (db) => {
      await db.query(sql);
      await db.query('INSERT INTO migrations (name) VALUES ($1)', [name]);
    });
    console.log(`migrated ${name}`);
  }
}

if (process.argv[1]?.endsWith('migrate.ts')) await migrate().finally(() => pool.end());
