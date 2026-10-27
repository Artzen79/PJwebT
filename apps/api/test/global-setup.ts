import pg from 'pg';

// Wipes and re-migrates the *test* database before the run.
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgres://sporthub:sporthub@localhost:5433/sporthub_test';
  if (!new URL(url).pathname.endsWith('_test')) throw new Error(`refusing to reset non-test database: ${url}`);
  const client = new pg.Client(url);
  await client.connect();
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await client.end();
  process.env.DATABASE_URL = url;
  const { migrate } = await import('../src/migrate');
  await migrate();
  const { pool } = await import('../src/db');
  await pool.end();
}
