import { z } from 'zod';
import { one, query } from '../db';
import { found } from '../lib/http';
import { route } from '../lib/route';
import { setClause } from '../lib/sql';
import { idParam, Ok, Sport } from '../schemas';

const sportSelect = `
  SELECT s.id, s.name, s.icon,
    (SELECT count(*) FROM courts c WHERE c.sport_id = s.id AND c.is_active) AS "courtCount",
    (SELECT count(*) FROM equipment e WHERE e.sport_id = s.id AND e.is_active) AS "equipmentCount"
  FROM sports s`;

const getSport = async (id: number) => found(await one(`${sportSelect} WHERE s.id = $1`, [id]), 'ประเภทกีฬา');

const fields = {
  name: z.string().trim().min(1, 'กรุณากรอกชื่อกีฬา').max(50),
  icon: z.string().trim().min(1).max(16).describe('emoji เช่น 🏸'),
};

route({
  method: 'get',
  path: '/sports',
  tag: 'Sports',
  summary: 'ประเภทกีฬาทั้งหมด',
  description: 'พร้อมจำนวนสนามและอุปกรณ์ที่เปิดให้บริการของแต่ละกีฬา',
  response: z.array(Sport),
  handler: () => query(`${sportSelect} ORDER BY s.id`),
});

route({
  method: 'post',
  path: '/sports',
  tag: 'Sports',
  summary: 'เพิ่มประเภทกีฬา',
  access: 'admin',
  body: z.object({ ...fields, icon: fields.icon.default('🏅') }),
  response: Sport,
  status: 201,
  errors: { 409: 'มีชื่อกีฬานี้แล้ว (DUPLICATE)' },
  handler: async ({ body }) => getSport((await one('INSERT INTO sports (name, icon) VALUES ($1, $2) RETURNING id', [body.name, body.icon])).id),
});

route({
  method: 'patch',
  path: '/sports/:id',
  tag: 'Sports',
  summary: 'แก้ไขประเภทกีฬา',
  access: 'admin',
  params: idParam,
  body: z.object(fields).partial(),
  response: Sport,
  errors: { 404: 'ไม่พบประเภทกีฬา (NOT_FOUND)', 409: 'มีชื่อกีฬานี้แล้ว (DUPLICATE)' },
  handler: async ({ params, body }) => {
    const { set, values } = setClause(body, { name: 'name', icon: 'icon' });
    found(await one(`UPDATE sports SET ${set} WHERE id = $1 RETURNING id`, [params.id, ...values]), 'ประเภทกีฬา');
    return getSport(params.id);
  },
});

route({
  method: 'delete',
  path: '/sports/:id',
  tag: 'Sports',
  summary: 'ลบประเภทกีฬา',
  description: 'ลบได้เฉพาะกีฬาที่ยังไม่มีสนามหรืออุปกรณ์ผูกอยู่',
  access: 'admin',
  params: idParam,
  response: Ok,
  errors: { 404: 'ไม่พบประเภทกีฬา (NOT_FOUND)', 409: 'ยังมีสนามหรืออุปกรณ์ใช้กีฬานี้อยู่ (IN_USE)' },
  handler: async ({ params }) => {
    found(await one('DELETE FROM sports WHERE id = $1 RETURNING id', [params.id]), 'ประเภทกีฬา');
    return { ok: true };
  },
});
