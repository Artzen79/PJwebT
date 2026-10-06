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

export const Sport = z
  .object({
    id: z.number().int(),
    name: z.string(),
    icon: z.string().describe('emoji'),
    courtCount: z.number().int(),
    equipmentCount: z.number().int(),
  })
  .meta({ id: 'Sport', description: 'ประเภทกีฬา' });

export const Court = z
  .object({
    id: z.number().int(),
    sportId: z.number().int(),
    sportName: z.string(),
    sportIcon: z.string(),
    name: z.string(),
    description: z.string(),
    pricePerHour: z.number().describe('ราคาต่อชั่วโมง (บาท)'),
    openHour: z.number().int().describe('เปิด (ชั่วโมง 0-23)'),
    closeHour: z.number().int().describe('ปิด (ชั่วโมง 1-24)'),
    imageUrl: z.string().nullable(),
    isActive: z.boolean(),
    rating: z.number().nullable().describe('คะแนนรีวิวเฉลี่ย 1-5'),
    reviewCount: z.number().int(),
  })
  .meta({ id: 'Court', description: 'สนามกีฬา' });

export const Slot = z
  .object({
    hour: z.number().int(),
    startAt: dateTime,
    endAt: dateTime,
    status: z.enum(['free', 'booked', 'mine', 'in_cart', 'past']).describe('free=ว่าง booked=มีคนจองแล้ว mine=การจองของฉัน in_cart=อยู่ในตะกร้าของฉัน past=เลยเวลาแล้ว'),
  })
  .meta({ id: 'Slot' });

export const Equipment = z
  .object({
    id: z.number().int(),
    sportId: z.number().int(),
    sportName: z.string(),
    sportIcon: z.string(),
    name: z.string(),
    description: z.string(),
    totalQty: z.number().int().describe('จำนวนทั้งหมดในคลัง'),
    rentPrice: z.number().describe('ค่าเช่าต่อชิ้นต่อการจอง (บาท)'),
    deposit: z.number().describe('ค่ามัดจำต่อชิ้น จ่ายหน้างานและได้คืนเมื่อคืนของ'),
    imageUrl: z.string().nullable(),
    isActive: z.boolean(),
  })
  .meta({ id: 'Equipment', description: 'อุปกรณ์กีฬาให้ยืม' });

export const AuthResult = z
  .object({ user: User, token: z.string().describe('JWT สำหรับ header Authorization: Bearer <token>') })
  .meta({ id: 'AuthResult' });
