import { z } from 'zod';
import { one, query } from '../db';
import { fail, found } from '../lib/http';
import { route } from '../lib/route';
import { removeOrExplain, setClause } from '../lib/sql';
import { stockFor } from '../lib/stock';
import { imageUpload, publicUrl, uploadedFile } from '../lib/upload';
import { dateTime, Equipment, idParam, Ok } from '../schemas';

const equipmentSelect = `
  SELECT e.id, e.sport_id AS "sportId", s.name AS "sportName", s.icon AS "sportIcon", e.name, e.description,
    e.total_qty AS "totalQty", e.rent_price AS "rentPrice", e.deposit, e.image_url AS "imageUrl", e.is_active AS "isActive"
  FROM equipment e JOIN sports s ON s.id = e.sport_id`;

export const getEquipment = async (id: number, includeInactive = false) =>
  found(await one(`${equipmentSelect} WHERE e.id = $1 AND (e.is_active OR $2)`, [id, includeInactive]), 'อุปกรณ์');

const fields = {
  sportId: z.number().int().positive(),
  name: z.string().trim().min(1, 'กรุณากรอกชื่ออุปกรณ์').max(100),
  description: z.string().max(2000),
  totalQty: z.number().int().min(0).max(10_000),
  rentPrice: z.number().min(0).max(100_000),
  deposit: z.number().min(0).max(100_000),
  isActive: z.boolean(),
};
const columns = {
  sportId: 'sport_id',
  name: 'name',
  description: 'description',
  totalQty: 'total_qty',
  rentPrice: 'rent_price',
  deposit: 'deposit',
  isActive: 'is_active',
};

route({
  method: 'get',
  path: '/equipment',
  tag: 'Equipment',
  summary: 'รายการอุปกรณ์ให้ยืมทั้งหมด',
  query: z.object({
    sport: z.coerce.number().int().optional().describe('กรองตามรหัสประเภทกีฬา'),
    q: z.string().optional().describe('ค้นหาจากชื่ออุปกรณ์'),
    includeInactive: z.stringbool().optional().describe('admin เท่านั้น: รวมอุปกรณ์ที่ปิดใช้งาน'),
  }),
  response: z.array(Equipment),
  handler: ({ query: q, user }) =>
    query(
      `${equipmentSelect}
       WHERE ($1::int IS NULL OR e.sport_id = $1) AND ($2::text IS NULL OR e.name ILIKE '%' || $2 || '%') AND (e.is_active OR $3)
       ORDER BY s.id, e.id`,
      [q.sport ?? null, q.q ?? null, Boolean(q.includeInactive && user?.role === 'admin')],
    ),
});

route({
  method: 'get',
  path: '/equipment/:id',
  tag: 'Equipment',
  summary: 'ข้อมูลอุปกรณ์ 1 รายการ',
  params: idParam,
  response: Equipment,
  errors: { 404: 'ไม่พบอุปกรณ์ (NOT_FOUND)' },
  handler: ({ params, user }) => getEquipment(params.id, user?.role === 'admin'),
});

route({
  method: 'post',
  path: '/equipment',
  tag: 'Equipment',
  summary: 'เพิ่มอุปกรณ์',
  access: 'admin',
  body: z.object({
    ...fields,
    description: fields.description.default(''),
    deposit: fields.deposit.default(0),
    isActive: fields.isActive.default(true),
  }),
  response: Equipment,
  status: 201,
  errors: { 400: 'ข้อมูลไม่ถูกต้อง หรือไม่พบกีฬา (INVALID_REFERENCE)' },
  handler: async ({ body: b }) => {
    const { id } = await one(
      `INSERT INTO equipment (sport_id, name, description, total_qty, rent_price, deposit, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [b.sportId, b.name, b.description, b.totalQty, b.rentPrice, b.deposit, b.isActive],
    );
    return getEquipment(id, true);
  },
});

route({
  method: 'patch',
  path: '/equipment/:id',
  tag: 'Equipment',
  summary: 'แก้ไขข้อมูลอุปกรณ์',
  description: 'ส่งเฉพาะช่องที่ต้องการแก้ เช่น ปรับจำนวนในคลัง `totalQty`',
  access: 'admin',
  params: idParam,
  body: z.object(fields).partial(),
  response: Equipment,
  errors: { 404: 'ไม่พบอุปกรณ์ (NOT_FOUND)' },
  handler: async ({ params, body }) => {
    const { set, values } = setClause(body, columns);
    found(await one(`UPDATE equipment SET ${set} WHERE id = $1 RETURNING id`, [params.id, ...values]), 'อุปกรณ์');
    return getEquipment(params.id, true);
  },
});

route({
  method: 'post',
  path: '/equipment/:id/image',
  tag: 'Equipment',
  summary: 'อัปโหลด/เปลี่ยนรูปอุปกรณ์',
  access: 'admin',
  params: idParam,
  middleware: [imageUpload('equipment')],
  upload: { field: 'image', description: 'ไฟล์รูป JPG, PNG, WEBP หรือ GIF ขนาดไม่เกิน 5 MB' },
  response: Equipment,
  errors: { 404: 'ไม่พบอุปกรณ์ (NOT_FOUND)' },
  handler: async ({ req, params }) => {
    const url = publicUrl('equipment', uploadedFile(req).filename);
    found(await one('UPDATE equipment SET image_url = $2 WHERE id = $1 RETURNING id', [params.id, url]), 'อุปกรณ์');
    return getEquipment(params.id, true);
  },
});

route({
  method: 'get',
  path: '/equipment/:id/availability',
  tag: 'Equipment',
  summary: 'จำนวนอุปกรณ์ที่ยืมได้ในช่วงเวลาที่เลือก',
  params: idParam,
  query: z.object({ startAt: dateTime.describe('เริ่มยืม'), endAt: dateTime.describe('คืน') }),
  response: z
    .object({ equipmentId: z.number().int(), totalQty: z.number().int(), available: z.number().int(), startAt: dateTime, endAt: dateTime })
    .meta({ id: 'EquipmentAvailability' }),
  errors: { 400: 'เวลาคืนต้องหลังเวลาเริ่ม (INVALID_PERIOD)', 404: 'ไม่พบอุปกรณ์ (NOT_FOUND)' },
  handler: async ({ params, query: q }) => {
    if (Date.parse(q.endAt) <= Date.parse(q.startAt)) fail(400, 'INVALID_PERIOD', 'เวลาคืนต้องหลังเวลาเริ่มยืม');
    const stock = found(await stockFor(params.id, q.startAt, q.endAt), 'อุปกรณ์');
    return { equipmentId: params.id, ...stock, startAt: q.startAt, endAt: q.endAt };
  },
});

route({
  method: 'delete',
  path: '/equipment/:id',
  tag: 'Equipment',
  summary: 'ลบอุปกรณ์',
  description: 'ลบได้เฉพาะอุปกรณ์ที่ยังไม่เคยถูกยืม ถ้ามีประวัติแล้วให้ปิดใช้งานด้วย `PATCH {isActive: false}` แทน',
  access: 'admin',
  params: idParam,
  response: Ok,
  errors: { 404: 'ไม่พบอุปกรณ์ (NOT_FOUND)', 409: 'มีประวัติการยืมแล้ว (IN_USE)' },
  handler: async ({ params }) => {
    await removeOrExplain('DELETE FROM equipment WHERE id = $1 RETURNING id', params.id, 'อุปกรณ์');
    return { ok: true };
  },
});
