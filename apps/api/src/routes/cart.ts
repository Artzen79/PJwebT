import { z } from 'zod';
import { one, query, tx } from '../db';
import { cartIdFor, getBooking, notifyBooking, PAY_WITHIN_MINUTES } from '../lib/bookings';
import { mail } from '../lib/mail';
import { fail, found } from '../lib/http';
import { route } from '../lib/route';
import { stockFor } from '../lib/stock';
import { bangkokHour, HOUR } from '../lib/time';
import { Booking, dateTime, idParam, Ok } from '../schemas';
import { getCourt } from './courts';

const MAX_DAYS_AHEAD = 60;

function checkStart(start: Date) {
  if (start.getTime() % HOUR !== 0) fail(400, 'INVALID_SLOT', 'เวลาเริ่มต้องตรงชั่วโมง เช่น 18:00');
  if (start.getTime() <= Date.now()) fail(400, 'SLOT_IN_PAST', 'ช่วงเวลานี้ผ่านไปแล้ว');
  if (start.getTime() > Date.now() + MAX_DAYS_AHEAD * 24 * HOUR) fail(400, 'TOO_FAR_AHEAD', `จองล่วงหน้าได้ไม่เกิน ${MAX_DAYS_AHEAD} วัน`);
}

route({
  method: 'get',
  path: '/cart',
  tag: 'Cart',
  summary: 'ดูตะกร้าการจองของฉัน',
  description: 'ถ้ายังไม่มีตะกร้าระบบจะสร้างให้พร้อมเลขที่การจอง ราคาในตะกร้ายังไม่ล็อกช่วงเวลา จนกว่าจะกดยืนยัน',
  access: 'user',
  response: Booking,
  handler: async ({ user }) => getBooking(await cartIdFor(user!.id)),
});

route({
  method: 'post',
  path: '/cart/slots',
  tag: 'Cart',
  summary: 'เพิ่มช่วงเวลาสนาม (1 ชั่วโมง) ลงตะกร้า',
  access: 'user',
  body: z.object({ courtId: z.number().int().positive(), startAt: dateTime.describe('เวลาเริ่ม ตรงชั่วโมง เช่น 2026-10-08T18:00:00+07:00') }),
  response: Booking,
  errors: {
    400: 'เวลาไม่ตรงชั่วโมง (INVALID_SLOT) ผ่านไปแล้ว (SLOT_IN_PAST) นอกเวลาเปิด (OUTSIDE_HOURS) หรือเกิน 60 วัน (TOO_FAR_AHEAD)',
    404: 'ไม่พบสนาม (NOT_FOUND)',
    409: 'อยู่ในตะกร้าแล้ว (ALREADY_IN_CART) หรือมีผู้จองแล้ว (SLOT_TAKEN)',
  },
  handler: async ({ user, body }) => {
    const start = new Date(body.startAt);
    const end = new Date(start.getTime() + HOUR);
    checkStart(start);
    const court = await getCourt(body.courtId);
    const hour = bangkokHour(start);
    if (hour < court.openHour || hour + 1 > court.closeHour) {
      fail(400, 'OUTSIDE_HOURS', `สนามนี้เปิด ${court.openHour}:00 - ${court.closeHour}:00 น.`);
    }
    const cartId = await cartIdFor(user!.id);
    if (await one('SELECT 1 FROM booking_slots WHERE booking_id = $1 AND court_id = $2 AND start_at = $3', [cartId, court.id, start])) {
      fail(409, 'ALREADY_IN_CART', 'ช่วงเวลานี้อยู่ในตะกร้าแล้ว');
    }
    if (await one('SELECT 1 FROM booking_slots WHERE court_id = $1 AND active AND start_at < $3 AND end_at > $2', [court.id, start, end])) {
      fail(409, 'SLOT_TAKEN', 'ช่วงเวลานี้มีผู้จองแล้ว');
    }
    await query('INSERT INTO booking_slots (booking_id, court_id, start_at, end_at, price) VALUES ($1, $2, $3, $4, $5)', [
      cartId,
      court.id,
      start,
      end,
      court.pricePerHour,
    ]);
    return getBooking(cartId);
  },
});

route({
  method: 'post',
  path: '/cart/equipment',
  tag: 'Cart',
  summary: 'เพิ่มอุปกรณ์ที่จะยืมลงตะกร้า',
  description: 'ค่าเช่าคิดต่อชิ้นต่อการจอง (`rentPrice × qty`) ส่วนมัดจำจ่ายหน้างาน ช่วงยืมเป็นชั่วโมงเต็ม 1-12 ชั่วโมง',
  access: 'user',
  body: z.object({
    equipmentId: z.number().int().positive(),
    qty: z.number().int().min(1).max(50),
    startAt: dateTime.describe('เริ่มยืม (ตรงชั่วโมง)'),
    endAt: dateTime.describe('คืน (ตรงชั่วโมง)'),
  }),
  response: Booking,
  errors: {
    400: 'ช่วงเวลาไม่ถูกต้อง (INVALID_PERIOD, SLOT_IN_PAST, TOO_FAR_AHEAD)',
    404: 'ไม่พบอุปกรณ์ (NOT_FOUND)',
    409: 'อุปกรณ์เหลือไม่พอ (OUT_OF_STOCK)',
  },
  handler: async ({ user, body }) => {
    const start = new Date(body.startAt);
    const end = new Date(body.endAt);
    checkStart(start);
    const hours = (end.getTime() - start.getTime()) / HOUR;
    if (!Number.isInteger(hours) || hours < 1 || hours > 12) fail(400, 'INVALID_PERIOD', 'ช่วงเวลายืมต้องเป็นชั่วโมงเต็ม 1-12 ชั่วโมง');
    const item = found(await one('SELECT rent_price AS "rentPrice" FROM equipment WHERE id = $1 AND is_active', [body.equipmentId]), 'อุปกรณ์');
    const stock = found(await stockFor(body.equipmentId, start, end), 'อุปกรณ์');
    if (stock.available < body.qty) fail(409, 'OUT_OF_STOCK', `ช่วงเวลานี้เหลือให้ยืม ${stock.available} ชิ้น`);
    const cartId = await cartIdFor(user!.id);
    await query(
      'INSERT INTO booking_equipment (booking_id, equipment_id, qty, start_at, end_at, price) VALUES ($1, $2, $3, $4, $5, $6)',
      [cartId, body.equipmentId, body.qty, start, end, item.rentPrice * body.qty],
    );
    return getBooking(cartId);
  },
});

for (const [kind, table, label] of [
  ['slots', 'booking_slots', 'ช่วงเวลาสนาม'],
  ['equipment', 'booking_equipment', 'อุปกรณ์'],
] as const) {
  route({
    method: 'delete',
    path: `/cart/${kind}/:id`,
    tag: 'Cart',
    summary: `ลบรายการ${label}ออกจากตะกร้า`,
    description: 'ลบได้เฉพาะรายการที่ยังอยู่ในตะกร้า การจองที่ยืนยันแล้วแก้ไขรายการไม่ได้',
    access: 'user',
    params: idParam,
    response: Booking,
    errors: { 404: 'ไม่พบรายการ (NOT_FOUND)', 409: 'การจองนี้ยืนยันแล้ว แก้ไขไม่ได้ (BOOKING_CONFIRMED)' },
    handler: async ({ user, params }) => {
      const row = found(
        await one(`SELECT b.id, b.status FROM ${table} i JOIN bookings b ON b.id = i.booking_id WHERE i.id = $1 AND b.user_id = $2`, [
          params.id,
          user!.id,
        ]),
        'รายการ',
      );
      if (row.status !== 'cart') fail(409, 'BOOKING_CONFIRMED', 'การจองนี้ยืนยันแล้ว แก้ไขรายการไม่ได้');
      await query(`DELETE FROM ${table} WHERE id = $1`, [params.id]);
      return getBooking(row.id);
    },
  });
}

route({
  method: 'delete',
  path: '/cart',
  tag: 'Cart',
  summary: 'ลบตะกร้าทั้งหมด',
  description: 'ลบทุกรายการพร้อมเลขที่การจองของตะกร้า (ไม่กระทบการจองที่ยืนยันแล้ว)',
  access: 'user',
  response: Ok,
  handler: async ({ user }) => {
    await query(`DELETE FROM bookings WHERE user_id = $1 AND status = 'cart'`, [user!.id]);
    return { ok: true };
  },
});

route({
  method: 'post',
  path: '/cart/confirm',
  tag: 'Cart',
  summary: 'ยืนยันการจอง',
  description: `ล็อกช่วงเวลาสนามและอุปกรณ์ทั้งหมดในตะกร้า แล้วเปลี่ยนเป็นสถานะ \`pending_payment\` ต้องแนบสลิปภายใน ${PAY_WITHIN_MINUTES} นาที หลังยืนยันแล้วแก้ไขรายการไม่ได้ ถ้ามีคนยืนยันช่วงเวลาเดียวกันพร้อมกัน ระบบ (PostgreSQL exclusion constraint) จะให้สำเร็จได้คนเดียว`,
  access: 'user',
  response: Booking,
  errors: {
    400: 'ตะกร้าว่าง (EMPTY_CART) หรือมีรายการเลยเวลาแล้ว (SLOT_IN_PAST)',
    409: 'ช่วงเวลาถูกจองไปแล้ว (SLOT_TAKEN) หรืออุปกรณ์ไม่พอ (OUT_OF_STOCK)',
  },
  handler: async ({ user }) => {
    const bookingId = await tx(async (db) => {
      const cart = await one(`SELECT id FROM bookings WHERE user_id = $1 AND status = 'cart' FOR UPDATE`, [user!.id], db);
      if (!cart) fail(400, 'EMPTY_CART', 'ตะกร้าว่าง');
      const slots = await query('SELECT start_at FROM booking_slots WHERE booking_id = $1', [cart.id], db);
      // lock equipment rows in id order so concurrent confirmations cannot deadlock
      const items = await query(
        `SELECT be.id, be.equipment_id, be.qty, be.start_at, be.end_at, e.name
         FROM booking_equipment be JOIN equipment e ON e.id = be.equipment_id
         WHERE be.booking_id = $1 ORDER BY be.equipment_id, be.id`,
        [cart.id],
        db,
      );
      if (!slots.length && !items.length) fail(400, 'EMPTY_CART', 'ตะกร้าว่าง');
      if ([...slots, ...items].some((i) => i.start_at.getTime() <= Date.now())) {
        fail(400, 'SLOT_IN_PAST', 'มีรายการที่เลยเวลาแล้ว กรุณาลบออกก่อนยืนยัน');
      }
      // the no_overlap exclusion constraint rejects (23P01 → SLOT_TAKEN) if someone else holds an overlapping slot
      await db.query('UPDATE booking_slots SET active = true WHERE booking_id = $1', [cart.id]);
      for (const item of items) {
        await db.query('SELECT 1 FROM equipment WHERE id = $1 FOR UPDATE', [item.equipment_id]);
        const stock = await stockFor(item.equipment_id, item.start_at, item.end_at, db);
        if (!stock || stock.available < item.qty) fail(409, 'OUT_OF_STOCK', `${item.name} เหลือไม่พอในช่วงเวลานี้`);
        await db.query('UPDATE booking_equipment SET active = true WHERE id = $1', [item.id]);
      }
      await db.query(
        `UPDATE bookings SET status = 'pending_payment', confirmed_at = now(),
           expires_at = now() + make_interval(mins => $2), checkin_token = gen_random_uuid()
         WHERE id = $1`,
        [cart.id, PAY_WITHIN_MINUTES],
      );
      return cart.id as number;
    });
    const booking = await getBooking(bookingId);
    notifyBooking(booking);
    mail.confirmed(booking);
    return booking;
  },
});
