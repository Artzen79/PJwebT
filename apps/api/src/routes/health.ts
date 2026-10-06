import { z } from 'zod';
import { one } from '../db';
import { route } from '../lib/route';

route({
  method: 'get',
  path: '/health',
  tag: 'System',
  summary: 'ตรวจสถานะเซิร์ฟเวอร์และฐานข้อมูล',
  response: z.object({ ok: z.boolean(), db: z.boolean() }),
  handler: async () => ({ ok: true, db: (await one('SELECT 1 AS up'))?.up === 1 }),
});
