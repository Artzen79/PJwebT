import { apiReference } from '@scalar/express-api-reference';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import { z } from 'zod';
import { env } from './env';
import { join } from 'node:path';
import { loadUser } from './lib/auth';
import { HttpError } from './lib/http';
import { mountRoutes } from './lib/route';
import { buildOpenApi } from './openapi';
import './routes/health';
import './routes/auth';
import './routes/users';
import './routes/sports';
import './routes/courts';
import './routes/equipment';
import './routes/cart';
import './routes/bookings';

const pgErrors: Record<string, [number, string, string]> = {
  '23P01': [409, 'SLOT_TAKEN', 'ช่วงเวลานี้มีผู้จองแล้ว'],
  '23505': [409, 'DUPLICATE', 'ข้อมูลนี้มีอยู่แล้ว'],
  '23503': [409, 'IN_USE', 'ข้อมูลนี้ถูกใช้งานอยู่ ลบไม่ได้'],
  '23514': [400, 'VALIDATION_ERROR', 'ข้อมูลไม่ผ่านเงื่อนไขของระบบ'],
  '40P01': [409, 'CONFLICT', 'มีการทำรายการเดียวกันพร้อมกัน กรุณาลองใหม่'],
};

const onError: ErrorRequestHandler = (err, _req, res, _next) => {
  const send = (status: number, code: string, message: string, extra = {}) =>
    res.status(status).json({ error: { code, message, ...extra } });
  if (err instanceof HttpError) return send(err.status, err.code, err.message);
  if (err instanceof z.ZodError) return send(400, 'VALIDATION_ERROR', z.prettifyError(err), { issues: err.issues });
  if (err?.name === 'MulterError') return send(400, 'FILE_ERROR', err.message);
  // a foreign key that points nowhere (insert/update) is the caller's mistake, not an in-use conflict
  if (err?.code === '23503' && /is not present/.test(err.detail)) return send(400, 'INVALID_REFERENCE', 'ไม่พบข้อมูลที่อ้างถึง');
  if (pgErrors[err?.code]) return send(...pgErrors[err.code]);
  if (typeof err?.status === 'number' && err.status < 500) return send(err.status, 'BAD_REQUEST', err.message);
  console.error(err);
  send(500, 'INTERNAL', 'เกิดข้อผิดพลาดในระบบ');
};

let openapi: unknown;

export const app = express();
app.set('trust proxy', env.prod ? 1 : false);
app.get('/openapi.json', (_req, res) => {
  openapi ??= buildOpenApi();
  res.json(openapi);
});
// before helmet: the reference page loads its script from the Scalar CDN
app.use('/docs', apiReference({ url: '/openapi.json', pageTitle: 'SportHub API' }));
app.use(helmet());
app.use('/uploads', express.static(join(env.uploadDir, 'public')));
app.use(express.json());
app.use(loadUser);
app.use('/api/v1', mountRoutes());
app.use('/api', (_req, _res, next) => next(new HttpError(404, 'NOT_FOUND', 'ไม่พบ endpoint นี้')));
app.use(onError);
