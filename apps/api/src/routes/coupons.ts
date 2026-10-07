import { z } from 'zod';
import { one, query } from '../db';
import { found } from '../lib/http';
import { route } from '../lib/route';
import { removeOrExplain, setClause } from '../lib/sql';
import { Coupon, dateTime, idParam, Ok } from '../schemas';

const couponSelect = `
  SELECT id, code, percent_off AS "percentOff", amount_off AS "amountOff", min_total AS "minTotal", max_uses AS "maxUses",
    used_count AS "usedCount", expires_at AS "expiresAt", is_active AS "isActive", created_at AS "createdAt"
  FROM coupons`;

// percentOff and amountOff are mutually exclusive: the table's CHECK rejects both or neither (400)
const fields = {
  percentOff: z.number().int().min(1).max(100).nullable(),
  amountOff: z.number().positive().max(100_000).nullable(),
  minTotal: z.number().min(0).max(1_000_000),
  maxUses: z.number().int().positive().nullable(),
  expiresAt: dateTime.nullable(),
  isActive: z.boolean(),
};
const columns = {
  percentOff: 'percent_off',
  amountOff: 'amount_off',
  minTotal: 'min_total',
  maxUses: 'max_uses',
  expiresAt: 'expires_at',
  isActive: 'is_active',
};

route({
  method: 'get',
  path: '/coupons',
  tag: 'Admin',
  summary: 'คูปองส่วนลดทั้งหมด',
  access: 'admin',
  response: z.array(Coupon),
  handler: () => query(`${couponSelect} ORDER BY created_at DESC`),
});

route({
  method: 'post',
  path: '/coupons',
  tag: 'Admin',
  summary: 'สร้างคูปองส่วนลด',
  description: 'กำหนดอย่างใดอย่างหนึ่ง: `percentOff` (ลด %) หรือ `amountOff` (ลดเป็นบาท) รหัสจะถูกเก็บเป็นตัวพิมพ์ใหญ่',
  access: 'admin',
  body: z.object({
    code: z.string().trim().regex(/^[A-Za-z0-9_-]{3,30}$/, 'รหัส 3-30 ตัว ใช้ A-Z 0-9 - _').toUpperCase(),
    percentOff: fields.percentOff.default(null),
    amountOff: fields.amountOff.default(null),
    minTotal: fields.minTotal.default(0),
    maxUses: fields.maxUses.default(null),
    expiresAt: fields.expiresAt.default(null),
    isActive: fields.isActive.default(true),
  }),
  response: Coupon,
  status: 201,
  errors: { 400: 'ข้อมูลไม่ถูกต้อง หรือกำหนดทั้ง percentOff และ amountOff (VALIDATION_ERROR)', 409: 'มีรหัสนี้แล้ว (DUPLICATE)' },
  handler: async ({ body: b }) => {
    const { id } = await one(
      `INSERT INTO coupons (code, percent_off, amount_off, min_total, max_uses, expires_at, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [b.code, b.percentOff, b.amountOff, b.minTotal, b.maxUses, b.expiresAt, b.isActive],
    );
    return one(`${couponSelect} WHERE id = $1`, [id]);
  },
});

route({
  method: 'patch',
  path: '/coupons/:id',
  tag: 'Admin',
  summary: 'แก้ไขหรือปิดคูปอง',
  description: 'การจองที่ยืนยันแล้วล็อกส่วนลดไว้ แก้คูปองภายหลังไม่กระทบยอดเดิม',
  access: 'admin',
  params: idParam,
  body: z.object(fields).partial(),
  response: Coupon,
  errors: { 404: 'ไม่พบคูปอง (NOT_FOUND)' },
  handler: async ({ params, body }) => {
    const { set, values } = setClause(body, columns);
    found(await one(`UPDATE coupons SET ${set} WHERE id = $1 RETURNING id`, [params.id, ...values]), 'คูปอง');
    return one(`${couponSelect} WHERE id = $1`, [params.id]);
  },
});

route({
  method: 'delete',
  path: '/coupons/:id',
  tag: 'Admin',
  summary: 'ลบคูปอง',
  description: 'ลบได้เฉพาะคูปองที่ยังไม่มีการจองใช้ ถ้าเคยใช้แล้วให้ปิดคูปองด้วย `PATCH {isActive: false}` แทน',
  access: 'admin',
  params: idParam,
  response: Ok,
  errors: { 404: 'ไม่พบคูปอง (NOT_FOUND)', 409: 'มีการจองใช้คูปองนี้แล้ว (IN_USE)' },
  handler: async ({ params }) => {
    await removeOrExplain('DELETE FROM coupons WHERE id = $1 RETURNING id', params.id, 'คูปอง');
    return { ok: true };
  },
});
