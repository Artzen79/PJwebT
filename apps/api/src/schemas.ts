import { z } from 'zod';

// Shared request pieces and response models (each `id` becomes a named schema in the API docs)

export const dateTime = z.iso.datetime({ offset: true });
export const idParam = z.object({ id: z.coerce.number().int().positive().describe('รหัสของรายการ') });
export const email = z.email('อีเมลไม่ถูกต้อง').toLowerCase();
export const password = z.string().min(8, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร').max(100);
export const personName = z.string().trim().min(1, 'กรุณากรอกชื่อ').max(100);
export const phone = z.string().regex(/^0\d{8,9}$/, 'เบอร์โทรต้องเป็นตัวเลข 9-10 หลักขึ้นต้นด้วย 0');

export const Ok = z.object({ ok: z.literal(true) }).meta({ id: 'Ok' });

export const User = z
  .object({
    id: z.number().int(),
    email: z.email(),
    name: z.string(),
    phone: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    role: z.enum(['member', 'admin']),
    status: z.enum(['active', 'suspended']),
    createdAt: dateTime,
  })
  .meta({ id: 'User', description: 'ข้อมูลสมาชิก' });

export const UserDetail = User.extend({
  bookingCount: z.number().int().describe('จำนวนการจองที่ยืนยันแล้ว'),
  totalSpent: z.number().describe('ยอดชำระแล้วทั้งหมด (บาท)'),
}).meta({ id: 'UserDetail' });

export const AuthResult = z
  .object({ user: User, token: z.string().describe('JWT สำหรับ header Authorization: Bearer <token>') })
  .meta({ id: 'AuthResult' });
