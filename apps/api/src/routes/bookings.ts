import { z } from 'zod';
import { query, tx } from '../db';
import { firstStart, getBooking, getVisibleBooking, notifyBooking, release } from '../lib/bookings';
import { fail } from '../lib/http';
import { mail } from '../lib/mail';
import { route } from '../lib/route';
import { getSettings } from '../lib/settings';
import { HOUR } from '../lib/time';
import { Booking, BookingSummary, bookingStatus, idParam } from '../schemas';

route({
  method: 'get',
  path: '/bookings',
  tag: 'Bookings',
  summary: 'รายการจองทั้งหมด (ประวัติการจอง)',
  description: 'สมาชิกเห็นเฉพาะของตัวเอง admin เห็นทุกคน และกรองตามสมาชิกด้วย `userId` ได้ ไม่รวมตะกร้าที่ยังไม่ยืนยัน',
  access: 'user',
  query: z.object({
    userId: z.coerce.number().int().optional().describe('admin: ดูของสมาชิกคนนี้'),
    status: bookingStatus.exclude(['cart']).optional(),
    code: z.string().optional().describe('admin: ค้นหาจากเลขที่การจอง'),
  }),
  response: z.array(BookingSummary),
  // ponytail: capped at 500 rows, add paging when a real venue outgrows it
  handler: ({ user, query: q }) =>
    query(
      `SELECT b.id, b.code, b.status, b.user_id AS "userId", u.name AS "userName", b.created_at AS "createdAt",
         b.confirmed_at AS "confirmedAt", t.total,
         LEAST((SELECT min(start_at) FROM booking_slots WHERE booking_id = b.id),
               (SELECT min(start_at) FROM booking_equipment WHERE booking_id = b.id)) AS "firstStartAt",
         (SELECT count(*) FROM booking_slots WHERE booking_id = b.id)
           + (SELECT count(*) FROM booking_equipment WHERE booking_id = b.id) AS "itemCount"
       FROM bookings b JOIN users u ON u.id = b.user_id JOIN booking_totals t ON t.booking_id = b.id
       WHERE b.status <> 'cart' AND ($1::int IS NULL OR b.user_id = $1)
         AND ($2::booking_status IS NULL OR b.status = $2) AND ($3::text IS NULL OR b.code LIKE $3 || '%')
       ORDER BY b.confirmed_at DESC NULLS LAST, b.id DESC
       LIMIT 500`,
      [user!.role === 'admin' ? (q.userId ?? null) : user!.id, q.status ?? null, q.code ?? null],
    ),
});

route({
  method: 'get',
  path: '/bookings/:id',
  tag: 'Bookings',
  summary: 'รายละเอียดการจอง 1 รายการ',
  description: 'รวมรายการสนาม อุปกรณ์ ประวัติการชำระเงิน และ QR เช็คอิน (เมื่อชำระแล้ว)',
  access: 'user',
  params: idParam,
  response: Booking,
  errors: { 404: 'ไม่พบการจอง หรือไม่ใช่การจองของคุณ (NOT_FOUND)' },
  handler: ({ user, params }) => getVisibleBooking(params.id, user!),
});

route({
  method: 'post',
  path: '/bookings/:id/cancel',
  tag: 'Bookings',
  summary: 'ยกเลิกการจอง',
  description: `ยกเลิกได้ระหว่างรอชำระเงิน หรือหลังชำระแล้วถ้าเหลือเวลาก่อนเริ่มไม่น้อยกว่าที่ตั้งในระบบ (ค่าเริ่มต้น 24 ชั่วโมง) (admin ยกเลิกได้ทุกเวลา และคืนเงินให้สมาชิกนอกระบบ) ช่วงเวลาและอุปกรณ์จะว่างทันที`,
  access: 'user',
  params: idParam,
  response: Booking,
  errors: {
    400: 'เหลือเวลาก่อนเริ่มน้อยเกินไป (TOO_LATE_TO_CANCEL)',
    404: 'ไม่พบการจอง (NOT_FOUND)',
    409: 'สถานะนี้ยกเลิกไม่ได้ (INVALID_STATUS)',
  },
  handler: async ({ user, params }) => {
    const booking = await getVisibleBooking(params.id, user!);
    if (!['pending_payment', 'paid'].includes(booking.status)) fail(409, 'INVALID_STATUS', 'การจองในสถานะนี้ยกเลิกไม่ได้');
    const { cancelBeforeHours } = await getSettings();
    if (user!.role !== 'admin' && booking.status === 'paid' && firstStart(booking) - Date.now() < cancelBeforeHours * HOUR) {
      fail(400, 'TOO_LATE_TO_CANCEL', `ยกเลิกได้ก่อนเวลาเริ่มอย่างน้อย ${cancelBeforeHours} ชั่วโมง`);
    }
    await tx((db) => release(booking.id, 'cancelled', db));
    notifyBooking(booking);
    const cancelled = await getBooking(booking.id);
    await mail.cancelled(cancelled, user!.id === booking.userId ? 'ยกเลิกตามคำขอของคุณ' : 'ยกเลิกโดยผู้ดูแลระบบ');
    return cancelled;
  },
});
