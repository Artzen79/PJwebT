import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { query } from '../src/db';
import { bangkokDate, HOUR } from '../src/lib/time';
import { admin, api, bearer, member } from './helpers';

const day = (n: number) => bangkokDate(new Date(Date.now() + n * 24 * HOUR));
const at = (date: string, hour: number) => `${date}T${String(hour).padStart(2, '0')}:00:00+07:00`;

let adminToken: string;
let sportId: number;

beforeAll(async () => {
  adminToken = (await admin()).token;
  sportId = (await api().post('/api/v1/sports').set(bearer(adminToken)).send({ name: `ฟลอร์บอล-${Date.now()}`, icon: '🏑' })).body.id;
});

const newCourt = async () =>
  (await api().post('/api/v1/courts').set(bearer(adminToken)).send({ sportId, name: `คอร์ท ${Math.random()}`, pricePerHour: 100, openHour: 0, closeHour: 24 })).body;
const newItem = async () =>
  (await api().post('/api/v1/equipment').set(bearer(adminToken)).send({ sportId, name: `ไม้ ${Math.random()}`, totalQty: 5, rentPrice: 20 })).body;

describe('deleting courts and equipment', () => {
  it('deletes a court that was never booked', async () => {
    const court = await newCourt();
    expect((await api().delete(`/api/v1/courts/${court.id}`).set(bearer(adminToken))).body).toEqual({ ok: true });
    expect((await api().get(`/api/v1/courts/${court.id}`).set(bearer(adminToken))).status).toBe(404);
  });

  it('refuses to delete a court with booking history and suggests closing it instead', async () => {
    const court = await newCourt();
    const { token } = await member();
    await api().post('/api/v1/cart/slots').set(bearer(token)).send({ courtId: court.id, startAt: at(day(2), 10) }).expect(200);
    const res = await api().delete(`/api/v1/courts/${court.id}`).set(bearer(adminToken));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('IN_USE');
    expect(res.body.error.message).toContain('ปิด');
  });

  it('deletes unused equipment but not equipment that was rented', async () => {
    const free = await newItem();
    expect((await api().delete(`/api/v1/equipment/${free.id}`).set(bearer(adminToken))).body).toEqual({ ok: true });
    const used = await newItem();
    const { token } = await member();
    await api()
      .post('/api/v1/cart/equipment')
      .set(bearer(token))
      .send({ equipmentId: used.id, qty: 1, startAt: at(day(2), 10), endAt: at(day(2), 11) })
      .expect(200);
    expect((await api().delete(`/api/v1/equipment/${used.id}`).set(bearer(adminToken))).status).toBe(409);
  });

  it('members cannot delete', async () => {
    const court = await newCourt();
    const { token } = await member();
    expect((await api().delete(`/api/v1/courts/${court.id}`).set(bearer(token))).status).toBe(403);
  });
});

describe('managing coupons', () => {
  it('edits every coupon field and deletes an unused coupon', async () => {
    const code = `EDIT${Date.now() % 100000}`;
    const coupon = (await api().post('/api/v1/coupons').set(bearer(adminToken)).send({ code, percentOff: 10 })).body;
    const edited = await api()
      .patch(`/api/v1/coupons/${coupon.id}`)
      .set(bearer(adminToken))
      .send({ percentOff: null, amountOff: 75, minTotal: 300, maxUses: 3, expiresAt: '2099-12-31T23:59:59+07:00' });
    expect(edited.body).toMatchObject({ percentOff: null, amountOff: 75, minTotal: 300, maxUses: 3 });
    expect((await api().delete(`/api/v1/coupons/${coupon.id}`).set(bearer(adminToken))).body).toEqual({ ok: true });
  });

  it('refuses to delete a coupon that a booking has used', async () => {
    const code = `USED${Date.now() % 100000}`;
    const coupon = (await api().post('/api/v1/coupons').set(bearer(adminToken)).send({ code, amountOff: 10 })).body;
    const court = await newCourt();
    const { token } = await member();
    await api().post('/api/v1/cart/slots').set(bearer(token)).send({ courtId: court.id, startAt: at(day(2), 12) });
    await api().post('/api/v1/cart/coupon').set(bearer(token)).send({ code }).expect(200);
    const res = await api().delete(`/api/v1/coupons/${coupon.id}`).set(bearer(adminToken));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('IN_USE');
  });
});

describe('managing members', () => {
  it('edits a member’s name, email and phone; a taken email is refused', async () => {
    const m = await member();
    const other = await member();
    const email = `renamed.${Date.now()}@example.com`;
    const res = await api().patch(`/api/v1/users/${m.user.id}`).set(bearer(adminToken)).send({ name: 'ชื่อใหม่ ทดสอบ', email, phone: '0899990000' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'ชื่อใหม่ ทดสอบ', email, phone: '0899990000' });
    const taken = await api().patch(`/api/v1/users/${m.user.id}`).set(bearer(adminToken)).send({ email: other.email });
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('sets a new password the member can log in with', async () => {
    const m = await member();
    await api().post(`/api/v1/users/${m.user.id}/password`).set(bearer(adminToken)).send({ password: 'reset-pass-123' }).expect(200);
    expect((await api().post('/api/v1/auth/login').send({ email: m.email, password: 'reset-pass-123' })).status).toBe(200);
    expect((await api().post('/api/v1/auth/login').send({ email: m.email, password: 'secret1234' })).status).toBe(401);
  });

  it('members cannot edit other members', async () => {
    const m = await member();
    const other = await member();
    expect((await api().patch(`/api/v1/users/${other.user.id}`).set(bearer(m.token)).send({ name: 'x' })).status).toBe(403);
  });
});

describe('moderating reviews', () => {
  it('lists every review and deletes one, updating the court rating', async () => {
    const court = await newCourt();
    const m = await member('ผู้รีวิว ทดสอบ');
    await api().post('/api/v1/cart/slots').set(bearer(m.token)).send({ courtId: court.id, startAt: at(day(2), 15) });
    const booking = (await api().post('/api/v1/cart/confirm').set(bearer(m.token))).body;
    await query(`UPDATE bookings SET status = 'completed' WHERE id = $1`, [booking.id]);
    const review = (await api().post(`/api/v1/bookings/${booking.id}/review`).set(bearer(m.token)).send({ courtId: court.id, rating: 1, comment: 'ข้อความไม่สุภาพ' })).body;
    const list = await api().get('/api/v1/reviews').set(bearer(adminToken));
    expect(list.status).toBe(200);
    expect(list.body.find((r: { id: number }) => r.id === review.id)).toMatchObject({ courtName: court.name, userName: 'ผู้รีวิว ทดสอบ', rating: 1 });
    expect((await api().delete(`/api/v1/reviews/${review.id}`).set(bearer(adminToken))).body).toEqual({ ok: true });
    expect((await api().get(`/api/v1/courts/${court.id}`)).body).toMatchObject({ reviewCount: 0, rating: null });
    expect((await api().get('/api/v1/reviews').set(bearer(m.token))).status).toBe(403);
  });
});

describe('venue information in settings', () => {
  afterAll(() =>
    api().patch('/api/v1/settings').set(bearer(adminToken)).send({ announcement: null, contactPhone: null, contactLine: null, address: null }),
  );

  it('admins set an announcement and contact details that everyone can read', async () => {
    const res = await api()
      .patch('/api/v1/settings')
      .set(bearer(adminToken))
      .send({ announcement: 'ปิดปรับปรุงคอร์ทแบด 3 วันเสาร์นี้', contactPhone: '021234567', contactLine: '@sporthub', address: '99 ถนนกีฬา กรุงเทพฯ' });
    expect(res.status).toBe(200);
    const pub = await api().get('/api/v1/settings');
    expect(pub.body).toMatchObject({ announcement: 'ปิดปรับปรุงคอร์ทแบด 3 วันเสาร์นี้', contactPhone: '021234567', contactLine: '@sporthub' });
  });

  it('starts empty and rejects overly long text', async () => {
    await api().patch('/api/v1/settings').set(bearer(adminToken)).send({ announcement: null }).expect(200);
    expect((await api().get('/api/v1/settings')).body.announcement).toBe('');
    expect((await api().patch('/api/v1/settings').set(bearer(adminToken)).send({ announcement: 'ก'.repeat(501) })).status).toBe(400);
  });
});
