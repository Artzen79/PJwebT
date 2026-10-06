import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { one } from '../db';
import { env } from '../env';
import { hashPassword, issueToken, userColumns, verifyPassword } from '../lib/auth';
import { fail } from '../lib/http';
import { route } from '../lib/route';
import { AuthResult, email, Ok, password, personName, phone, User } from '../schemas';
import type { User as UserRow } from '../types';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => env.test,
  handler: (_req, res) => {
    res.status(429).json({ error: { code: 'TOO_MANY_REQUESTS', message: 'ลองหลายครั้งเกินไป กรุณารอสักครู่' } });
  },
});

route({
  method: 'post',
  path: '/auth/register',
  tag: 'Auth',
  summary: 'สมัครสมาชิก',
  description: 'สร้างบัญชีสมาชิกใหม่ (role = member) แล้วเข้าสู่ระบบให้ทันที',
  middleware: [limiter],
  body: z.object({ email, password, name: personName, phone: phone.optional() }),
  response: AuthResult,
  status: 201,
  errors: { 409: 'อีเมลนี้ถูกใช้แล้ว (EMAIL_TAKEN)', 429: 'เรียกถี่เกินไป (TOO_MANY_REQUESTS)' },
  handler: async ({ body, res }) => {
    if (await one('SELECT 1 FROM users WHERE email = $1', [body.email])) fail(409, 'EMAIL_TAKEN', 'อีเมลนี้ถูกใช้แล้ว');
    const user = (await one<UserRow>(
      `INSERT INTO users (email, password_hash, name, phone) VALUES ($1, $2, $3, $4) RETURNING ${userColumns}`,
      [body.email, await hashPassword(body.password), body.name, body.phone ?? null],
    ))!;
    return { user, token: await issueToken(res, user.id) };
  },
});

route({
  method: 'post',
  path: '/auth/login',
  tag: 'Auth',
  summary: 'เข้าสู่ระบบ',
  description: 'ตรวจอีเมลและรหัสผ่าน คืน token และตั้ง httpOnly cookie `token` (อายุ 7 วัน)',
  middleware: [limiter],
  body: z.object({ email, password: z.string().min(1, 'กรุณากรอกรหัสผ่าน') }),
  response: AuthResult,
  errors: {
    401: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง (INVALID_CREDENTIALS)',
    403: 'บัญชีถูกระงับ (ACCOUNT_SUSPENDED)',
    429: 'เรียกถี่เกินไป (TOO_MANY_REQUESTS)',
  },
  handler: async ({ body, res }) => {
    const row = await one(`SELECT ${userColumns}, password_hash FROM users WHERE email = $1`, [body.email]);
    if (!row || !(await verifyPassword(row.password_hash, body.password))) fail(401, 'INVALID_CREDENTIALS', 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    if (row.status === 'suspended') fail(403, 'ACCOUNT_SUSPENDED', 'บัญชีนี้ถูกระงับการใช้งาน');
    const { password_hash: _, ...user } = row;
    return { user, token: await issueToken(res, user.id) };
  },
});

route({
  method: 'post',
  path: '/auth/logout',
  tag: 'Auth',
  summary: 'ออกจากระบบ',
  description: 'ลบ cookie `token` (ฝั่งที่ใช้ Bearer token ให้ทิ้ง token เอง)',
  response: Ok,
  handler: ({ req, res }) => {
    res.clearCookie('token', { httpOnly: true, sameSite: 'lax', secure: req.secure });
    return { ok: true };
  },
});

route({
  method: 'get',
  path: '/auth/me',
  tag: 'Auth',
  summary: 'ข้อมูลผู้ใช้ที่เข้าสู่ระบบอยู่',
  access: 'user',
  response: User,
  handler: ({ user }) => user,
});
