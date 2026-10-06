import { z } from 'zod';
import { one, query } from '../db';
import { found } from '../lib/http';
import { route } from '../lib/route';
import { setClause } from '../lib/sql';
import { atBangkok, bangkokIso, HOUR } from '../lib/time';
import { imageUpload, publicUrl, uploadedFile } from '../lib/upload';
import { Court, idParam, Slot } from '../schemas';

const courtSelect = `
  SELECT c.id, c.sport_id AS "sportId", s.name AS "sportName", s.icon AS "sportIcon", c.name, c.description,
    c.price_per_hour AS "pricePerHour", c.open_hour AS "openHour", c.close_hour AS "closeHour",
    c.image_url AS "imageUrl", c.is_active AS "isActive", r.rating, r.count AS "reviewCount"
  FROM courts c
  JOIN sports s ON s.id = c.sport_id
  LEFT JOIN LATERAL (SELECT round(avg(rating), 1) AS rating, count(*) AS count FROM reviews WHERE court_id = c.id) r ON true`;

// inactive courts are visible to admins only
export const getCourt = async (id: number, includeInactive = false) =>
  found(await one(`${courtSelect} WHERE c.id = $1 AND (c.is_active OR $2)`, [id, includeInactive]), 'สนาม');

const fields = {
  sportId: z.number().int().positive(),
  name: z.string().trim().min(1, 'กรุณากรอกชื่อสนาม').max(100),
  description: z.string().max(2000),
  pricePerHour: z.number().min(0).max(100_000),
  openHour: z.number().int().min(0).max(23),
  closeHour: z.number().int().min(1).max(24),
  isActive: z.boolean(),
};
const columns = {
  sportId: 'sport_id',
  name: 'name',
  description: 'description',
  pricePerHour: 'price_per_hour',
  openHour: 'open_hour',
  closeHour: 'close_hour',
  isActive: 'is_active',
};

route({
  method: 'get',
  path: '/courts',
  tag: 'Courts',
  summary: 'รายการสนามทั้งหมด',
  query: z.object({
    sport: z.coerce.number().int().optional().describe('กรองตามรหัสประเภทกีฬา'),
    q: z.string().optional().describe('ค้นหาจากชื่อสนาม'),
    includeInactive: z.stringbool().optional().describe('admin เท่านั้น: รวมสนามที่ปิดใช้งาน'),
  }),
  response: z.array(Court),
  handler: ({ query: q, user }) =>
    query(
      `${courtSelect}
       WHERE ($1::int IS NULL OR c.sport_id = $1) AND ($2::text IS NULL OR c.name ILIKE '%' || $2 || '%') AND (c.is_active OR $3)
       ORDER BY s.name, c.name`,
      [q.sport ?? null, q.q ?? null, Boolean(q.includeInactive && user?.role === 'admin')],
    ),
});

route({
  method: 'get',
  path: '/courts/:id',
  tag: 'Courts',
  summary: 'ข้อมูลสนาม 1 สนาม',
  params: idParam,
  response: Court,
  errors: { 404: 'ไม่พบสนาม (NOT_FOUND)' },
  handler: ({ params, user }) => getCourt(params.id, user?.role === 'admin'),
});

route({
  method: 'post',
  path: '/courts',
  tag: 'Courts',
  summary: 'เพิ่มสนาม',
  access: 'admin',
  body: z.object({
    ...fields,
    description: fields.description.default(''),
    openHour: fields.openHour.default(8),
    closeHour: fields.closeHour.default(22),
    isActive: fields.isActive.default(true),
  }),
  response: Court,
  status: 201,
  errors: { 400: 'ข้อมูลไม่ถูกต้อง เช่น เวลาปิดไม่หลังเวลาเปิด หรือไม่พบกีฬา (INVALID_REFERENCE)' },
  handler: async ({ body: b }) => {
    const { id } = await one(
      `INSERT INTO courts (sport_id, name, description, price_per_hour, open_hour, close_hour, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [b.sportId, b.name, b.description, b.pricePerHour, b.openHour, b.closeHour, b.isActive],
    );
    return getCourt(id, true);
  },
});

route({
  method: 'patch',
  path: '/courts/:id',
  tag: 'Courts',
  summary: 'แก้ไขข้อมูลสนาม',
  description: 'ส่งเฉพาะช่องที่ต้องการแก้ ปิดสนามชั่วคราวด้วย `isActive: false`',
  access: 'admin',
  params: idParam,
  body: z.object(fields).partial(),
  response: Court,
  errors: { 404: 'ไม่พบสนาม (NOT_FOUND)' },
  handler: async ({ params, body }) => {
    const { set, values } = setClause(body, columns);
    found(await one(`UPDATE courts SET ${set} WHERE id = $1 RETURNING id`, [params.id, ...values]), 'สนาม');
    return getCourt(params.id, true);
  },
});

route({
  method: 'post',
  path: '/courts/:id/image',
  tag: 'Courts',
  summary: 'อัปโหลด/เปลี่ยนรูปสนาม',
  access: 'admin',
  params: idParam,
  middleware: [imageUpload('courts')],
  upload: { field: 'image', description: 'ไฟล์รูป JPG, PNG, WEBP หรือ GIF ขนาดไม่เกิน 5 MB' },
  response: Court,
  errors: { 404: 'ไม่พบสนาม (NOT_FOUND)' },
  handler: async ({ req, params }) => {
    const url = publicUrl('courts', uploadedFile(req).filename);
    found(await one('UPDATE courts SET image_url = $2 WHERE id = $1 RETURNING id', [params.id, url]), 'สนาม');
    return getCourt(params.id, true);
  },
});

route({
  method: 'get',
  path: '/courts/:id/availability',
  tag: 'Courts',
  summary: 'ตารางช่วงเวลาว่างของสนามในวันที่เลือก',
  description: 'แบ่งเป็นช่องละ 1 ชั่วโมงตามเวลาเปิด-ปิดของสนาม ถ้าส่ง token มาด้วยจะบอกช่องที่อยู่ในตะกร้า/การจองของตัวเอง',
  params: idParam,
  query: z.object({ date: z.iso.date().describe('วันที่ YYYY-MM-DD (เวลาประเทศไทย)') }),
  response: z.object({ courtId: z.number().int(), date: z.iso.date(), slots: z.array(Slot) }).meta({ id: 'CourtAvailability' }),
  errors: { 404: 'ไม่พบสนาม (NOT_FOUND)' },
  handler: async ({ params, query: q, user }) => {
    const court = await getCourt(params.id);
    const slots = await slotsFor([court], q.date, user?.id ?? null);
    return { courtId: court.id, date: q.date, slots: slots.get(court.id)! };
  },
});

route({
  method: 'get',
  path: '/availability',
  tag: 'Courts',
  summary: 'กระดานเวลาว่างของทุกสนามในวันที่เลือก',
  description: 'รวมตารางช่วงเวลาของทุกสนามที่เปิดให้บริการไว้ในครั้งเดียว (ใช้แสดงหน้าแรก) กรองตามกีฬาได้',
  query: z.object({
    date: z.iso.date().describe('วันที่ YYYY-MM-DD (เวลาประเทศไทย)'),
    sport: z.coerce.number().int().optional().describe('กรองตามรหัสประเภทกีฬา'),
  }),
  response: z
    .object({
      date: z.iso.date(),
      courts: z.array(
        z
          .object({
            courtId: z.number().int(),
            courtName: z.string(),
            sportId: z.number().int(),
            sportName: z.string(),
            sportIcon: z.string(),
            pricePerHour: z.number(),
            slots: z.array(Slot),
          })
          .meta({ id: 'BoardRow' }),
      ),
    })
    .meta({ id: 'Board' }),
  handler: async ({ query: q, user }) => {
    const courts = await query(`${courtSelect} WHERE c.is_active AND ($1::int IS NULL OR c.sport_id = $1) ORDER BY s.name, c.name`, [q.sport ?? null]);
    const slots = await slotsFor(courts, q.date, user?.id ?? null);
    return {
      date: q.date,
      courts: courts.map((c) => ({
        courtId: c.id,
        courtName: c.name,
        sportId: c.sportId,
        sportName: c.sportName,
        sportIcon: c.sportIcon,
        pricePerHour: c.pricePerHour,
        slots: slots.get(c.id)!,
      })),
    };
  },
});

type Hours = { id: number; openHour: number; closeHour: number };

// One-hour slots per court for a local date: held slots of anyone, plus this member's own cart items.
async function slotsFor(courts: Hours[], date: string, userId: number | null) {
  const rows: { courtId: number; startAt: Date; endAt: Date; active: boolean; mine: boolean | null }[] = await query(
    `SELECT s.court_id AS "courtId", s.start_at AS "startAt", s.end_at AS "endAt", s.active, b.user_id = $4 AS mine
     FROM booking_slots s JOIN bookings b ON b.id = s.booking_id
     WHERE s.court_id = ANY($1::int[]) AND s.start_at < $3 AND s.end_at > $2
       AND (s.active OR (b.status = 'cart' AND b.user_id = $4))`,
    [courts.map((c) => c.id), atBangkok(date, 0), atBangkok(date, 24), userId],
  );
  const result = new Map<number, { hour: number; startAt: string; endAt: string; status: string }[]>();
  for (const court of courts) {
    const slots = [];
    for (let hour = court.openHour; hour < court.closeHour; hour++) {
      const start = atBangkok(date, hour);
      const end = new Date(start.getTime() + HOUR);
      const hits = rows.filter((r) => r.courtId === court.id && r.startAt < end && r.endAt > start);
      const status =
        start.getTime() <= Date.now()
          ? 'past'
          : hits.some((r) => r.active && r.mine)
            ? 'mine'
            : hits.some((r) => r.active)
              ? 'booked'
              : hits.length
                ? 'in_cart'
                : 'free';
      slots.push({ hour, startAt: bangkokIso(start), endAt: bangkokIso(end), status });
    }
    result.set(court.id, slots);
  }
  return result;
}
