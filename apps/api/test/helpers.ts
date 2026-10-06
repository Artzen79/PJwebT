import request from 'supertest';
import { app } from '../src/app';
import { one } from '../src/db';
import { hashPassword } from '../src/lib/auth';

let seq = 0;
const uniqueEmail = (prefix: string) => `${prefix}.${Date.now()}.${seq++}@example.com`;

export const api = () => request(app);
export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

// 1x1 transparent PNG
export const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

export async function member(name = 'สมชาย ใจดี') {
  const email = uniqueEmail('member');
  const res = await api().post('/api/v1/auth/register').send({ email, password: 'secret1234', name, phone: '0812345678' });
  if (res.status !== 201) throw new Error(`register failed: ${JSON.stringify(res.body)}`);
  return { token: res.body.token as string, user: res.body.user, email };
}

export async function admin() {
  const email = uniqueEmail('admin');
  await one(`INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, 'ผู้ดูแล สนาม', 'admin')`, [
    email,
    await hashPassword('admin1234'),
  ]);
  const res = await api().post('/api/v1/auth/login').send({ email, password: 'admin1234' });
  return { token: res.body.token as string, user: res.body.user, email };
}
