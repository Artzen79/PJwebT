import { z } from 'zod';
import { one, query } from '../db';
import { hashPassword, userColumns, verifyPassword } from '../lib/auth';
import { fail, found } from '../lib/http';
import { route } from '../lib/route';
import { imageUpload, publicUrl, uploadedFile } from '../lib/upload';
import { email, idParam, password, personName, phone, User, UserDetail } from '../schemas';

route({
  method: 'patch',
  path: '/users/me',
  tag: 'Users',
  summary: 'แก้ไขข้อมูลส่วนตัว',
  description: 'ส่งเฉพาะช่องที่ต้องการแก้ ถ้าจะเปลี่ยนรหัสผ่านต้องส่ง `currentPassword` คู่กับ `newPassword` ส่ง `phone: null` เพื่อลบเบอร์',
  access: 'user',
  body: z.object({
    name: personName.optional(),
    phone: phone.nullable().optional(),
    currentPassword: z.string().optional(),
    newPassword: password.optional(),
  }),
  response: User,
  errors: { 400: 'ข้อมูลไม่ถูกต้อง หรือรหัสผ่านปัจจุบันผิด (WRONG_PASSWORD)' },
  handler: async ({ user, body }) => {
    let hash: string | null = null;
    if (body.newPassword) {
      const row = await one('SELECT password_hash FROM users WHERE id = $1', [user!.id]);
      if (!body.currentPassword || !(await verifyPassword(row.password_hash, body.currentPassword))) {
        fail(400, 'WRONG_PASSWORD', 'รหัสผ่านปัจจุบันไม่ถูกต้อง');
      }
      hash = await hashPassword(body.newPassword);
    }
    return one(
      `UPDATE users SET name = COALESCE($2, name),
         phone = CASE WHEN $3::boolean THEN $4 ELSE phone END,
         password_hash = COALESCE($5, password_hash)
       WHERE id = $1 RETURNING ${userColumns}`,
      [user!.id, body.name ?? null, body.phone !== undefined, body.phone ?? null, hash],
    );
  },
});

route({
  method: 'post',
  path: '/users/me/avatar',
  tag: 'Users',
  summary: 'อัปโหลด/เปลี่ยนรูปโปรไฟล์',
  access: 'user',
  middleware: [imageUpload('avatars')],
  upload: { field: 'image', description: 'ไฟล์รูป JPG, PNG, WEBP หรือ GIF ขนาดไม่เกิน 5 MB' },
  response: User,
  errors: { 400: 'ไม่ได้แนบไฟล์ (FILE_REQUIRED) หรือไฟล์ไม่ใช่รูป/ใหญ่เกินไป (FILE_ERROR)' },
  handler: ({ req, user }) =>
    one(`UPDATE users SET avatar_url = $2 WHERE id = $1 RETURNING ${userColumns}`, [
      user!.id,
      publicUrl('avatars', uploadedFile(req).filename),
    ]),
});

route({
  method: 'get',
  path: '/users',
  tag: 'Users',
  summary: 'รายชื่อสมาชิกทั้งหมด',
  access: 'admin',
  query: z.object({
    q: z.string().optional().describe('ค้นหาจากชื่อหรืออีเมล'),
    role: z.enum(['member', 'admin']).optional(),
    status: z.enum(['active', 'suspended']).optional(),
  }),
  response: z.array(User),
  handler: ({ query: q }) =>
    query(
      `SELECT ${userColumns} FROM users
       WHERE ($1::text IS NULL OR name ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%')
         AND ($2::user_role IS NULL OR role = $2)
         AND ($3::user_status IS NULL OR status = $3)
       ORDER BY created_at DESC`,
      [q.q ?? null, q.role ?? null, q.status ?? null],
    ),
});

route({
  method: 'get',
  path: '/users/:id',
  tag: 'Users',
  summary: 'ข้อมูลสมาชิก 1 คน พร้อมสถิติการจอง',
  description: 'ดูประวัติการจองทั้งหมดของสมาชิกคนนี้ได้ที่ `GET /api/v1/bookings?userId={id}`',
  access: 'admin',
  params: idParam,
  response: UserDetail,
  errors: { 404: 'ไม่พบสมาชิก (NOT_FOUND)' },
  handler: async ({ params }) =>
    found(
      await one(
        `SELECT ${userColumns},
           (SELECT count(*) FROM bookings b WHERE b.user_id = u.id AND b.status <> 'cart') AS "bookingCount",
           (SELECT COALESCE(sum(t.total), 0) FROM bookings b JOIN booking_totals t ON t.booking_id = b.id
             WHERE b.user_id = u.id AND b.status IN ('paid', 'checked_in', 'completed')) AS "totalSpent"
         FROM users u WHERE u.id = $1`,
        [params.id],
      ),
      'สมาชิก',
    ),
});

route({
  method: 'post',
  path: '/users',
  tag: 'Users',
  summary: 'เพิ่มผู้ใช้ใหม่ (เช่น เพิ่ม admin)',
  access: 'admin',
  body: z.object({ email, password, name: personName, phone: phone.optional(), role: z.enum(['member', 'admin']).default('member') }),
  response: User,
  status: 201,
  errors: { 409: 'อีเมลนี้ถูกใช้แล้ว (EMAIL_TAKEN)' },
  handler: async ({ body }) => {
    if (await one('SELECT 1 FROM users WHERE email = $1', [body.email])) fail(409, 'EMAIL_TAKEN', 'อีเมลนี้ถูกใช้แล้ว');
    return one(
      `INSERT INTO users (email, password_hash, name, phone, role) VALUES ($1, $2, $3, $4, $5) RETURNING ${userColumns}`,
      [body.email, await hashPassword(body.password), body.name, body.phone ?? null, body.role],
    );
  },
});

for (const [field, label, values] of [
  ['status', 'เปลี่ยนสถานะสมาชิก (ระงับ/เปิดใช้งาน)', ['active', 'suspended']],
  ['role', 'เปลี่ยนสิทธิ์ (member/admin)', ['member', 'admin']],
] as const) {
  route({
    method: 'patch',
    path: `/users/:id/${field}`,
    tag: 'Users',
    summary: label,
    description: field === 'status' ? 'สมาชิกที่ถูกระงับจะเข้าสู่ระบบและใช้ token เดิมไม่ได้ทันที' : undefined,
    access: 'admin',
    params: idParam,
    body: z.object({ [field]: z.enum(values) }),
    response: User,
    errors: { 400: 'เปลี่ยนของตัวเองไม่ได้ (CANNOT_CHANGE_SELF)', 404: 'ไม่พบสมาชิก (NOT_FOUND)' },
    handler: async ({ user, params, body }) => {
      if (params.id === user!.id) fail(400, 'CANNOT_CHANGE_SELF', 'ไม่สามารถเปลี่ยนสถานะหรือสิทธิ์ของตัวเองได้');
      return found(
        await one(`UPDATE users SET ${field} = $2 WHERE id = $1 RETURNING ${userColumns}`, [params.id, (body as Record<string, string>)[field]]),
        'สมาชิก',
      );
    },
  });
}
