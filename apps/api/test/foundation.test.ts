import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { query } from '../src/db';

describe('foundation', () => {
  it('health reports the database is reachable', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, db: true });
  });

  it('serves an OpenAPI 3.1 document that includes the health endpoint', async () => {
    const res = await request(app).get('/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(res.body.paths['/api/v1/health'].get.summary).toBeTruthy();
  });

  it('serves the Scalar API reference page', async () => {
    const res = await request(app).get('/docs');
    expect(res.status).toBe(200);
    expect(res.text).toContain('/openapi.json');
  });

  it('unknown API routes return the standard error shape', async () => {
    const res = await request(app).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: expect.any(String) } });
  });

  it('migration created the no-overlap exclusion constraint', async () => {
    const rows = await query(`SELECT conname FROM pg_constraint WHERE conname = 'no_overlap'`);
    expect(rows).toHaveLength(1);
  });
});
