import { apiReference } from '@scalar/express-api-reference';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import { z } from 'zod';
import { env } from './env';
import { existsSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
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
import './routes/payments';
import './routes/checkin';
import './routes/reviews';
import './routes/events';
import './routes/admin';
import './routes/coupons';
import './routes/emails';
import './routes/settings';

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
app.get('/openapi.json', (req, res) => {
  openapi ??= buildOpenApi();
  res.json({ ...(openapi as object), servers: [{ url: `${req.protocol}://${req.get('host')}` }] });
});
// The API reference script is served from here, not a CDN, so the docs work offline at a demo.
// Mounted before helmet: the page renders with an inline bootstrap script.
// (the package does not export this file, so it is located inside our own node_modules)
const scalarBundle = fileURLToPath(new URL('../node_modules/@scalar/api-reference/dist/browser/standalone.js', import.meta.url));
app.get('/docs/scalar.js', (_req, res) => res.sendFile(scalarBundle, { maxAge: '1d' }));
app.use(
  '/docs',
  apiReference({
    url: '/openapi.json',
    pageTitle: 'SportHub API',
    cdn: '/docs/scalar.js',
    withDefaultFonts: false,
    // only our API on the page: no hosted AI chat, MCP generator, developer toolbar or telemetry
    agent: { disabled: true },
    mcp: { disabled: true },
    showDeveloperTools: 'never',
    telemetry: false,
  }),
);
// no upgrade-insecure-requests: a LAN demo over plain http must still load its own assets
app.use(helmet({ contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } } }));
app.use('/uploads', express.static(join(env.uploadDir, 'public')));
app.use(express.json());
app.use(loadUser);
app.use('/api/v1', mountRoutes());
app.use('/api', (_req, _res, next) => next(new HttpError(404, 'NOT_FOUND', 'ไม่พบ endpoint นี้')));

// Production: the built web app is served from this same origin (no CORS, first-party cookies).
if (existsSync(join(env.webDist, 'index.html'))) {
  app.use(
    express.static(env.webDist, {
      index: false,
      setHeaders: (res, path) => {
        if (path.includes(`${sep}assets${sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    }),
  );
  // client-side routes (/courts/3, /admin, ...) all boot the same index.html
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/uploads/') || !req.accepts('html')) return next();
    res.set('Cache-Control', 'no-cache').sendFile('index.html', { root: env.webDist });
  });
}
app.use(onError);
