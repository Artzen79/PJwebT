import { z } from 'zod';
import { one, query } from '../db';
import { found } from '../lib/http';
import { route } from '../lib/route';
import { removeOrExplain, setClause } from '../lib/sql';
import { bookingStatus, Coupon, dateTime, idParam, Ok } from '../schemas';

// usage figures count bookings that were confirmed with the coupon (open carts holding it do not count)
const couponSelect = `
  SELECT c.id, c.code, c.name, c.percent_off AS "percentOff", c.amount_off AS "amountOff", c.min_total AS "minTotal",
    c.max_uses AS "maxUses", c.per_user_limit AS "perUserLimit", c.used_count AS "usedCount",
    COALESCE(u.users, 0) AS "userCount", COALESCE(u.discount, 0) AS "discountGiven",
    c.expires_at AS "expiresAt", c.is_active AS "isActive", c.created_at AS "createdAt"
  FROM coupons c
  LEFT JOIN LATERAL (
    SELECT count(DISTINCT user_id)::int AS users, sum(discount) AS discount FROM bookings WHERE coupon_id = c.id AND status <> 'cart'
  ) u ON true`;

// percentOff and amountOff are mutually exclusive: the table's CHECK rejects both or neither (400)
const fields = {
  name: z.string().trim().max(100).describe('ชื่อแคมเปญ เช่น โปรเปิดเทอม'),
  percentOff: z.number().int().min(1).max(100).nullable(),
  amountOff: z.number().positive().max(100_000).nullable(),
  minTotal: z.number().min(0).max(1_000_000),
  maxUses: z.number().int().positive().nullable().describe('ใช้ได้ทั้งหมดกี่ครั้ง (null = ไม่จำกัด)'),
  perUserLimit: z.number().int().positive().nullable().describe('สมาชิก 1 คนใช้ได้กี่ครั้ง เช่น 1 (null = ไม่จำกัด)'),
  expiresAt: dateTime.nullable(),
  isActive: z.boolean(),
};
const columns = {
  name: 'name',
  percentOff: 'percent_off',
  amountOff: 'amount_off',
  minTotal: 'min_total',
  maxUses: 'max_uses',
  perUserLimit: 'per_user_limit',
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
  handler: () => query(`${couponSelect} ORDER BY c.created_at DESC`),
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
    name: fields.name.default(''),
    percentOff: fields.percentOff.default(null),
    amountOff: fields.amountOff.default(null),
    minTotal: fields.minTotal.default(0),
    maxUses: fields.maxUses.default(null),
    perUserLimit: fields.perUserLimit.default(null),
    expiresAt: fields.expiresAt.default(null),
    isActive: fields.isActive.default(true),
  }),
  response: Coupon,
  status: 201,
  errors: { 400: 'ข้อมูลไม่ถูกต้อง หรือกำหนดทั้ง percentOff และ amountOff (VALIDATION_ERROR)', 409: 'มีรหัสนี้แล้ว (DUPLICATE)' },
  handler: async ({ body: b }) => {
    const { id } = await one(
      `INSERT INTO coupons (code, name, percent_off, amount_off, min_total, max_uses, per_user_limit, expires_at, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [b.code, b.name, b.percentOff, b.amountOff, b.minTotal, b.maxUses, b.perUserLimit, b.expiresAt, b.isActive],
    );
    return one(`${couponSelect} WHERE c.id = $1`, [id]);
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
    return one(`${couponSelect} WHERE c.id = $1`, [params.id]);
  },
});

const CouponUse = z
  .object({
    bookingId: z.number().int(),
    code: z.string().describe('เลขที่การจอง'),
    status: bookingStatus,
    userId: z.number().int(),
    userName: z.string(),
    userEmail: z.string(),
    confirmedAt: dateTime.nullable(),
    subtotal: z.number().describe('ยอดก่อนส่วนลด'),
    discount: z.number().describe('ส่วนลดที่ได้'),
    total: z.number().describe('ยอดสุทธิ'),
  })
  .meta({ id: 'CouponUse', description: 'การจองหนึ่งรายการที่ใช้คูปอง' });

route({
  method: 'get',
  path: '/coupons/:id/usage',
  tag: 'Admin',
  summary: 'รายละเอียดการใช้คูปอง',
  description: 'ทุกการจองที่ยืนยันพร้อมคูปองนี้ ใหม่สุดก่อน: ใครใช้ เลขที่การจอง สถานะ ยอดก่อนลด ส่วนลด และยอดสุทธิ',
  access: 'admin',
  params: idParam,
  response: z.object({ coupon: Coupon, uses: z.array(CouponUse) }),
  errors: { 404: 'ไม่พบคูปอง (NOT_FOUND)' },
  handler: async ({ params }) => ({
    coupon: found(await one(`${couponSelect} WHERE c.id = $1`, [params.id]), 'คูปอง'),
    uses: await query(
      `SELECT b.id AS "bookingId", b.code, b.status, u.id AS "userId", u.name AS "userName", u.email AS "userEmail",
         b.confirmed_at AS "confirmedAt", t.subtotal, t.discount, t.total
       FROM bookings b JOIN users u ON u.id = b.user_id JOIN booking_totals t ON t.booking_id = b.id
       WHERE b.coupon_id = $1 AND b.status <> 'cart'
       ORDER BY b.confirmed_at DESC NULLS LAST, b.id DESC`,
      [params.id],
    ),
  }),
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
