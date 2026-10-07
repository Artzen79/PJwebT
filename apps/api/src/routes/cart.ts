import { z } from 'zod';
import { one, query, tx } from '../db';
import { cartIdFor, getBooking, notifyBooking } from '../lib/bookings';
import { mail } from '../lib/mail';
import { fail, found } from '../lib/http';
import { route } from '../lib/route';
import { getSettings } from '../lib/settings';
import { stockFor } from '../lib/stock';
import { bangkokDate, bangkokHour, HOUR } from '../lib/time';
import { Booking, dateTime, idParam, Ok } from '../schemas';
import { getCourt, priceAt } from './courts';

function checkStart(start: Date, maxDaysAhead: number) {
  if (start.getTime() % HOUR !== 0) fail(400, 'INVALID_SLOT', 'เวลาเริ่มต้องตรงชั่วโมง เช่น 18:00');
  if (start.getTime() <= Date.now()) fail(400, 'SLOT_IN_PAST', 'ช่วงเวลานี้ผ่านไปแล้ว');
  // whole calendar days in Thailand: 1 = today and all of tomorrow
  if (bangkokDate(start) > bangkokDate(new Date(Date.now() + maxDaysAhead * 24 * HOUR))) {
    fail(
      400,
      'TOO_FAR_AHEAD',
      maxDaysAhead === 0 ? 'จองได้เฉพาะวันนี้' : maxDaysAhead === 1 ? 'จองล่วงหน้าได้ถึงพรุ่งนี้เท่านั้น' : `จองล่วงหน้าได้ไม่เกิน ${maxDaysAhead} วัน`,
    );
  }
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
  description: 'ส่ง `repeatWeeks` เพื่อจองประจำ: เพิ่มชั่วโมงเดียวกันทุกสัปดาห์ติดกัน ถ้าสัปดาห์ใดไม่ว่างจะไม่เพิ่มเลยสักรายการ',
  access: 'user',
  body: z.object({
    courtId: z.number().int().positive(),
    startAt: dateTime.describe('เวลาเริ่ม ตรงชั่วโมง เช่น 2026-10-08T18:00:00+07:00'),
    repeatWeeks: z.number().int().min(1).max(8).default(1).describe('จำนวนสัปดาห์ (1-8) ค่าเริ่มต้น 1'),
  }),
  response: Booking,
  errors: {
    400: 'เวลาไม่ตรงชั่วโมง (INVALID_SLOT) ผ่านไปแล้ว (SLOT_IN_PAST) นอกเวลาเปิด (OUTSIDE_HOURS) หรือไกลเกินกว่าที่จองล่วงหน้าได้ (TOO_FAR_AHEAD)',
    404: 'ไม่พบสนาม (NOT_FOUND)',
    409: 'อยู่ในตะกร้าแล้ว (ALREADY_IN_CART) หรือมีผู้จองแล้ว (SLOT_TAKEN)',
  },
  handler: async ({ user, body }) => {
    const first = new Date(body.startAt);
    const court = await getCourt(body.courtId);
    const hour = bangkokHour(first);
    if (hour < court.openHour || hour + 1 > court.closeHour) {
      fail(400, 'OUTSIDE_HOURS', `สนามนี้เปิด ${court.openHour}:00 - ${court.closeHour}:00 น.`);
    }
    // same local hour every week (no DST in Thailand, so +7 days is exact)
    const starts = Array.from({ length: body.repeatWeeks }, (_, w) => new Date(first.getTime() + w * 7 * 24 * HOUR));
    const { maxDaysAhead } = await getSettings();
    for (const start of starts) checkStart(start, maxDaysAhead);
    const cartId = await cartIdFor(user!.id);
    await tx(async (db) => {
      for (const start of starts) {
        const end = new Date(start.getTime() + HOUR);
        const when = dayMonth.format(start);
        if (await one('SELECT 1 FROM booking_slots WHERE booking_id = $1 AND court_id = $2 AND start_at = $3', [cartId, court.id, start], db)) {
          fail(409, 'ALREADY_IN_CART', `ช่วงเวลาวันที่ ${when} อยู่ในตะกร้าแล้ว`);
        }
        if (await one('SELECT 1 FROM booking_slots WHERE court_id = $1 AND active AND start_at < $3 AND end_at > $2', [court.id, start, end], db)) {
          fail(409, 'SLOT_TAKEN', `ช่วงเวลาวันที่ ${when} มีผู้จองแล้ว`);
        }
        await db.query('INSERT INTO booking_slots (booking_id, court_id, start_at, end_at, price) VALUES ($1, $2, $3, $4, $5)', [
          cartId,
          court.id,
          start,
          end,
          priceAt(court, hour),
        ]);
      }
    });
    return getBooking(cartId);
  },
});

route({
  method: 'post',
  path: '/cart/coupon',
  tag: 'Cart',
  summary: 'ใช้คูปองส่วนลดกับตะกร้า',
  description: 'ตะกร้าใช้ได้ทีละ 1 คูปอง (ใช้ใหม่จะแทนอันเดิม) ส่วนลดคำนวณจากยอดในตะกร้า และล็อกยอดตอนยืนยันการจอง ตัวพิมพ์เล็ก/ใหญ่ของรหัสไม่มีผล',
  access: 'user',
  body: z.object({ code: z.string().trim().min(1).toUpperCase().describe('รหัสคูปอง') }),
  response: Booking,
  errors: {
    400: 'ไม่พบคูปอง (INVALID_COUPON) หมดอายุ (COUPON_EXPIRED) ใช้ครบจำนวนแล้ว (COUPON_USED_UP) หรือยอดไม่ถึงขั้นต่ำ (COUPON_MIN_TOTAL)',
  },
  handler: async ({ user, body }) => {
    const cartId = await cartIdFor(user!.id);
    const coupon = await one('SELECT * FROM coupons WHERE code = $1 AND is_active', [body.code]);
    checkCoupon(coupon, (await one('SELECT subtotal FROM booking_totals WHERE booking_id = $1', [cartId])).subtotal);
    await query('UPDATE bookings SET coupon_id = $2 WHERE id = $1', [cartId, coupon.id]);
    return getBooking(cartId);
  },
});

route({
  method: 'delete',
  path: '/cart/coupon',
  tag: 'Cart',
  summary: 'เอาคูปองออกจากตะกร้า',
  access: 'user',
  response: Booking,
  handler: async ({ user }) => {
    const cartId = await cartIdFor(user!.id);
    await query('UPDATE bookings SET coupon_id = NULL WHERE id = $1', [cartId]);
    return getBooking(cartId);
  },
});

const dayMonth = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' });

type CouponRow = { id: number; min_total: number; max_uses: number | null; used_count: number; expires_at: Date | null };

function checkCoupon(coupon: CouponRow | undefined, subtotal: number): asserts coupon is CouponRow {
  if (!coupon) fail(400, 'INVALID_COUPON', 'ไม่พบคูปองนี้หรือคูปองถูกปิดใช้งาน');
  if (coupon.expires_at && coupon.expires_at.getTime() <= Date.now()) fail(400, 'COUPON_EXPIRED', 'คูปองนี้หมดอายุแล้ว');
  if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) fail(400, 'COUPON_USED_UP', 'คูปองนี้ถูกใช้ครบจำนวนแล้ว');
  if (subtotal < coupon.min_total) fail(400, 'COUPON_MIN_TOTAL', `ใช้คูปองนี้ได้เมื่อยอดถึง ${coupon.min_total.toLocaleString('th-TH')} บาท`);
}

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
    checkStart(start, (await getSettings()).maxDaysAhead);
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
  description: `ล็อกช่วงเวลาสนามและอุปกรณ์ทั้งหมดในตะกร้า แล้วเปลี่ยนเป็นสถานะ \`pending_payment\` ต้องแนบสลิปภายในเวลาที่ตั้งไว้ในระบบ (ค่าเริ่มต้น 15 นาที) หลังยืนยันแล้วแก้ไขรายการไม่ได้ ถ้ามีคนยืนยันช่วงเวลาเดียวกันพร้อมกัน ระบบ (PostgreSQL exclusion constraint) จะให้สำเร็จได้คนเดียว`,
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
      // re-check the coupon under a row lock (uses are limited), then freeze the discount
      const coupon = await one(
        'SELECT c.*, t.subtotal FROM bookings b JOIN coupons c ON c.id = b.coupon_id JOIN booking_totals t ON t.booking_id = b.id WHERE b.id = $1 FOR UPDATE OF c',
        [cart.id],
        db,
      );
      if (coupon) {
        checkCoupon(coupon.is_active ? coupon : undefined, coupon.subtotal);
        await db.query('UPDATE coupons SET used_count = used_count + 1 WHERE id = $1', [coupon.id]);
      }
      await db.query('UPDATE bookings SET discount = (SELECT discount FROM booking_totals WHERE booking_id = $1) WHERE id = $1', [cart.id]);
      // nothing to pay (fully discounted) means paid now, with no payment window
      await db.query(
        `UPDATE bookings SET confirmed_at = now(), checkin_token = gen_random_uuid(),
           status = CASE WHEN t.total = 0 THEN 'paid' ELSE 'pending_payment' END::booking_status,
           expires_at = CASE WHEN t.total = 0 THEN NULL ELSE now() + make_interval(mins => $2) END
         FROM booking_totals t WHERE t.booking_id = bookings.id AND bookings.id = $1`,
        [cart.id, (await getSettings(db)).payWithinMinutes],
      );
      return cart.id as number;
    });
    const booking = await getBooking(bookingId);
    notifyBooking(booking);
    if (booking.status === 'paid') await mail.approved(booking);
    else await mail.confirmed(booking);
    return booking;
  },
});
