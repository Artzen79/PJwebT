import { z } from 'zod';
import { one, query } from '../db';
import { getVisibleBooking } from '../lib/bookings';
import { fail } from '../lib/http';
import { route } from '../lib/route';
import { dateTime, idParam } from '../schemas';
import { getCourt } from './courts';

const Review = z
  .object({
    id: z.number().int(),
    courtId: z.number().int(),
    userName: z.string(),
    rating: z.number().int().min(1).max(5),
    comment: z.string(),
    createdAt: dateTime,
  })
  .meta({ id: 'Review', description: 'รีวิวสนาม' });

const reviewSelect = `
  SELECT r.id, r.court_id AS "courtId", u.name AS "userName", r.rating, r.comment, r.created_at AS "createdAt"
  FROM reviews r JOIN users u ON u.id = r.user_id`;

route({
  method: 'get',
  path: '/courts/:id/reviews',
  tag: 'Reviews',
  summary: 'รีวิวของสนาม',
  description: 'เรียงจากใหม่ไปเก่า สูงสุด 100 รายการ',
  params: idParam,
  response: z.array(Review),
  errors: { 404: 'ไม่พบสนาม (NOT_FOUND)' },
  handler: async ({ params }) => {
    await getCourt(params.id);
    return query(`${reviewSelect} WHERE r.court_id = $1 ORDER BY r.created_at DESC LIMIT 100`, [params.id]);
  },
});

route({
  method: 'post',
  path: '/bookings/:id/review',
  tag: 'Reviews',
  summary: 'รีวิวสนามหลังใช้บริการ',
  description: 'รีวิวได้เมื่อการจองเสร็จสิ้น (completed) แล้ว สนามละ 1 ครั้งต่อการจอง',
  access: 'user',
  params: idParam,
  body: z.object({
    courtId: z.number().int().positive(),
    rating: z.number().int().min(1).max(5).describe('คะแนน 1-5 ดาว'),
    comment: z.string().trim().max(1000).default(''),
  }),
  response: Review,
  status: 201,
  errors: {
    400: 'สนามนี้ไม่อยู่ในการจอง (COURT_NOT_IN_BOOKING)',
    404: 'ไม่พบการจอง (NOT_FOUND)',
    409: 'ยังใช้บริการไม่เสร็จ (INVALID_STATUS) หรือรีวิวแล้ว (ALREADY_REVIEWED)',
  },
  handler: async ({ user, params, body }) => {
    const booking = await getVisibleBooking(params.id, user!);
    if (booking.userId !== user!.id) fail(404, 'NOT_FOUND', 'ไม่พบการจอง');
    if (booking.status !== 'completed') fail(409, 'INVALID_STATUS', 'รีวิวได้หลังใช้บริการเสร็จแล้ว');
    if (!booking.slots.some((s) => s.courtId === body.courtId)) fail(400, 'COURT_NOT_IN_BOOKING', 'สนามนี้ไม่ได้อยู่ในการจองนี้');
    if (await one('SELECT 1 FROM reviews WHERE booking_id = $1 AND court_id = $2', [booking.id, body.courtId])) {
      fail(409, 'ALREADY_REVIEWED', 'รีวิวสนามนี้ไปแล้ว');
    }
    const { id } = await one(
      'INSERT INTO reviews (booking_id, user_id, court_id, rating, comment) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [booking.id, user!.id, body.courtId, body.rating, body.comment],
    );
    return one(`${reviewSelect} WHERE r.id = $1`, [id]);
  },
});
