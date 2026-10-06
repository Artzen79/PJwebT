import generatePayload from 'promptpay-qr';
import QRCode from 'qrcode';
import { z } from 'zod';
import { one, query, tx } from '../db';
import { env } from '../env';
import { getBooking, getVisibleBooking, PAY_WITHIN_MINUTES } from '../lib/bookings';
import { fail, found } from '../lib/http';
import { mail } from '../lib/mail';
import { route } from '../lib/route';
import { folderPath, imageUpload, uploadedFile } from '../lib/upload';
import { dateTime, idParam, PaymentSummary } from '../schemas';

const Payment = PaymentSummary.extend({
  bookingId: z.number().int(),
  bookingCode: z.string(),
  userId: z.number().int(),
  userName: z.string(),
  reviewedByName: z.string().nullable(),
  slipUrl: z.string().describe('URL รูปสลิป (ต้องเข้าสู่ระบบเป็นเจ้าของหรือ admin)'),
}).meta({ id: 'Payment', description: 'การชำระเงิน 1 ครั้ง (สลิป 1 ใบ)' });

const paymentSelect = `
  SELECT p.id, p.booking_id AS "bookingId", b.code AS "bookingCode", b.user_id AS "userId", u.name AS "userName",
    p.amount, p.status, p.note, p.created_at AS "createdAt", p.reviewed_at AS "reviewedAt", r.name AS "reviewedByName",
    '/api/v1/payments/' || p.id || '/slip' AS "slipUrl"
  FROM payments p
  JOIN bookings b ON b.id = p.booking_id
  JOIN users u ON u.id = b.user_id
  LEFT JOIN users r ON r.id = p.reviewed_by`;

const getPayment = async (id: number) => found(await one(`${paymentSelect} WHERE p.id = $1`, [id]), 'การชำระเงิน');

route({
  method: 'get',
  path: '/bookings/:id/promptpay',
  tag: 'Payments',
  summary: 'QR PromptPay สำหรับชำระค่าจอง',
  description: 'สร้าง QR ตามยอดของการจอง (มาตรฐาน EMVCo/PromptPay) สแกนด้วยแอปธนาคารได้ทันที',
  access: 'user',
  params: idParam,
  response: z
    .object({
      bookingId: z.number().int(),
      amount: z.number(),
      promptpayId: z.string().describe('เบอร์/เลขบัญชี PromptPay ของสนาม'),
      payload: z.string().describe('ข้อความใน QR'),
      qr: z.string().describe('รูป QR (data URL)'),
      expiresAt: dateTime.nullable(),
    })
    .meta({ id: 'PromptPayQr' }),
  errors: { 404: 'ไม่พบการจอง (NOT_FOUND)', 409: 'การจองไม่ได้รอชำระเงิน (INVALID_STATUS)' },
  handler: async ({ user, params }) => {
    const booking = await getVisibleBooking(params.id, user!);
    if (booking.status !== 'pending_payment') fail(409, 'INVALID_STATUS', 'การจองนี้ไม่ได้อยู่ในสถานะรอชำระเงิน');
    const payload = generatePayload(env.promptpayId, { amount: booking.total });
    return {
      bookingId: booking.id,
      amount: booking.total,
      promptpayId: env.promptpayId,
      payload,
      qr: await QRCode.toDataURL(payload, { margin: 1, width: 320 }),
      expiresAt: booking.expiresAt,
    };
  },
});

route({
  method: 'post',
  path: '/bookings/:id/payments',
  tag: 'Payments',
  summary: 'แนบสลิปการโอนเงิน',
  description: `ส่งสลิปเพื่อให้ admin ตรวจสอบ ระหว่างรอตรวจ การจองจะไม่หมดเวลา (หยุดนับ ${PAY_WITHIN_MINUTES} นาที) ส่งได้ทีละ 1 ใบจนกว่าจะตรวจเสร็จ`,
  access: 'user',
  params: idParam,
  middleware: [imageUpload('slips')],
  upload: { field: 'image', description: 'รูปสลิป JPG, PNG, WEBP หรือ GIF ขนาดไม่เกิน 5 MB' },
  response: Payment,
  status: 201,
  errors: {
    400: 'ไม่ได้แนบไฟล์ (FILE_REQUIRED) หรือไฟล์ไม่ใช่รูป (FILE_ERROR)',
    404: 'ไม่พบการจอง (NOT_FOUND)',
    409: 'ไม่ได้รอชำระ (INVALID_STATUS) หมดเวลาชำระ (PAYMENT_EXPIRED) หรือมีสลิปรอตรวจอยู่ (PAYMENT_PENDING)',
  },
  handler: async ({ req, user, params }) => {
    const slip = uploadedFile(req);
    const booking = await getVisibleBooking(params.id, user!);
    const paymentId = await tx(async (db) => {
      // row lock: serialises with a concurrent upload and with the expiry job
      const row = await one('SELECT status, expires_at FROM bookings WHERE id = $1 FOR UPDATE', [booking.id], db);
      if (row.status !== 'pending_payment') fail(409, 'INVALID_STATUS', 'การจองนี้ไม่ได้อยู่ในสถานะรอชำระเงิน');
      if (row.expires_at && row.expires_at.getTime() <= Date.now()) fail(409, 'PAYMENT_EXPIRED', 'หมดเวลาชำระเงินแล้ว');
      if (await one(`SELECT 1 FROM payments WHERE booking_id = $1 AND status = 'pending'`, [booking.id], db)) {
        fail(409, 'PAYMENT_PENDING', 'มีสลิปที่รอตรวจสอบอยู่แล้ว');
      }
      const payment = await one('INSERT INTO payments (booking_id, amount, slip_path) VALUES ($1, $2, $3) RETURNING id', [booking.id, booking.total, slip.filename], db);
      await db.query('UPDATE bookings SET expires_at = NULL WHERE id = $1', [booking.id]);
      return payment.id as number;
    });
    return getPayment(paymentId);
  },
});

route({
  method: 'get',
  path: '/payments',
  tag: 'Payments',
  summary: 'รายการสลิปทั้งหมด (สำหรับตรวจสอบ)',
  access: 'admin',
  query: z.object({
    status: z.enum(['pending', 'approved', 'rejected']).optional().describe('เช่น pending = รอตรวจ'),
    bookingId: z.coerce.number().int().optional(),
  }),
  response: z.array(Payment),
  handler: ({ query: q }) =>
    query(
      `${paymentSelect}
       WHERE ($1::payment_status IS NULL OR p.status = $1) AND ($2::int IS NULL OR p.booking_id = $2)
       ORDER BY p.created_at DESC LIMIT 500`,
      [q.status ?? null, q.bookingId ?? null],
    ),
});

route({
  method: 'get',
  path: '/payments/:id/slip',
  tag: 'Payments',
  summary: 'ดูรูปสลิป',
  description: 'คืนไฟล์รูป ดูได้เฉพาะเจ้าของการจองและ admin',
  access: 'user',
  params: idParam,
  response: z.string(),
  produces: 'image',
  errors: { 404: 'ไม่พบสลิป (NOT_FOUND)' },
  handler: async ({ user, params, res }) => {
    const slip = found(
      await one('SELECT p.slip_path, b.user_id FROM payments p JOIN bookings b ON b.id = p.booking_id WHERE p.id = $1', [params.id]),
      'สลิป',
    );
    if (user!.role !== 'admin' && slip.user_id !== user!.id) fail(404, 'NOT_FOUND', 'ไม่พบสลิป');
    await new Promise<void>((resolve, reject) =>
      res.sendFile(slip.slip_path, { root: folderPath('slips'), headers: { 'Cache-Control': 'private, max-age=3600' } }, (err) =>
        err ? reject(err) : resolve(),
      ),
    );
  },
});

route({
  method: 'patch',
  path: '/payments/:id',
  tag: 'Payments',
  summary: 'อนุมัติหรือปฏิเสธสลิป',
  description: `อนุมัติ: การจองเป็น \`paid\` และส่งอีเมลพร้อม QR เช็คอิน / ปฏิเสธ: สมาชิกได้เวลาแนบสลิปใหม่อีก ${PAY_WITHIN_MINUTES} นาที และได้รับอีเมลแจ้งเหตุผล`,
  access: 'admin',
  params: idParam,
  body: z.object({
    status: z.enum(['approved', 'rejected']),
    note: z.string().trim().max(500).optional().describe('เหตุผล (แนะนำให้ใส่เมื่อปฏิเสธ)'),
  }),
  response: Payment,
  errors: { 404: 'ไม่พบการชำระเงิน (NOT_FOUND)', 409: 'ตรวจสลิปนี้ไปแล้ว (INVALID_STATUS)' },
  handler: async ({ user, params, body }) => {
    const bookingId = await tx(async (db) => {
      const payment = found(await one('SELECT status, booking_id FROM payments WHERE id = $1 FOR UPDATE', [params.id], db), 'การชำระเงิน');
      if (payment.status !== 'pending') fail(409, 'INVALID_STATUS', 'สลิปนี้ตรวจสอบไปแล้ว');
      await db.query('UPDATE payments SET status = $2, note = $3, reviewed_by = $4, reviewed_at = now() WHERE id = $1', [
        params.id,
        body.status,
        body.note ?? null,
        user!.id,
      ]);
      await db.query(
        body.status === 'approved'
          ? `UPDATE bookings SET status = 'paid', expires_at = NULL WHERE id = $1 AND status = 'pending_payment'`
          : `UPDATE bookings SET expires_at = now() + make_interval(mins => ${PAY_WITHIN_MINUTES}) WHERE id = $1 AND status = 'pending_payment'`,
        [payment.booking_id],
      );
      return payment.booking_id as number;
    });
    const booking = await getBooking(bookingId);
    if (body.status === 'approved') mail.approved(booking);
    else mail.rejected(booking, body.note ?? null);
    return getPayment(params.id);
  },
});
