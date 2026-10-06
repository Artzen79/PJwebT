import pg from 'pg';
import { env } from './env';

// numeric/bigint arrive as strings by default; our money (2 decimals) and counts fit a JS number
pg.types.setTypeParser(pg.types.builtins.NUMERIC, Number);
pg.types.setTypeParser(pg.types.builtins.INT8, Number);

// session time zone = Thailand, so ::date, date_trunc and extract(hour) are local
export const pool = new pg.Pool({ connectionString: env.databaseUrl, options: '-c timezone=Asia/Bangkok' });

export type Db = Pick<pg.PoolClient, 'query'>;

export async function query<T = any>(text: string, params: unknown[] = [], db: Db = pool): Promise<T[]> {
  return (await db.query(text, params)).rows;
}

export async function one<T = any>(text: string, params: unknown[] = [], db: Db = pool): Promise<T | undefined> {
  return (await query<T>(text, params, db))[0];
}

export async function tx<T>(fn: (db: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
