import { beforeAll, describe, expect, it } from 'vitest';
import { bangkokDate, HOUR } from '../src/lib/time';
import { admin, api, bearer, member } from './helpers';

const day = (n: number) => bangkokDate(new Date(Date.now() + n * 24 * HOUR));
const at = (date: string, hour: number) => `${date}T${String(hour).padStart(2, '0')}:00:00+07:00`;

let adminToken: string;
let sportId: number;

beforeAll(async () => {
  adminToken = (await admin()).token;
  sportId = (await api().post('/api/v1/sports').set(bearer(adminToken)).send({ name: `บาส-${Date.now()}`, icon: '🏀' })).body.id;
});

const newCourt = async (extra = {}) =>
  (
    await api()
      .post('/api/v1/courts')
      .set(bearer(adminToken))
      .send({ sportId, name: `คอร์ท ${Math.random()}`, pricePerHour: 150, openHour: 8, closeHour: 22, ...extra })
  ).body;

describe('weekly repeat booking', () => {
  it('adds the same hour for several consecutive weeks', async () => {
    const court = await newCourt();
    const { token } = await member();
    const res = await api().post('/api/v1/cart/slots').set(bearer(token)).send({ courtId: court.id, startAt: at(day(2), 19), repeatWeeks: 4 });
    expect(res.status).toBe(200);
    expect(res.body.slots.map((s: { startAt: string }) => s.startAt.slice(0, 10))).toEqual([day(2), day(9), day(16), day(23)]);
    expect(res.body.total).toBe(600);
  });

  it('adds nothing when any of the weeks is already taken', async () => {
    const court = await newCourt();
    const other = await member();
    await api().post('/api/v1/cart/slots').set(bearer(other.token)).send({ courtId: court.id, startAt: at(day(16), 19) });
    await api().post('/api/v1/cart/confirm').set(bearer(other.token)).expect(200);
    const { token } = await member();
    const res = await api().post('/api/v1/cart/slots').set(bearer(token)).send({ courtId: court.id, startAt: at(day(2), 19), repeatWeeks: 4 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLOT_TAKEN');
    expect(res.body.error.message).toContain(day(16).slice(8, 10).replace(/^0/, ''));
    expect((await api().get('/api/v1/cart').set(bearer(token))).body.slots).toEqual([]);
  });

  it('respects the booking horizon for the last week', async () => {
    const court = await newCourt();
    const { token } = await member();
    const res = await api().post('/api/v1/cart/slots').set(bearer(token)).send({ courtId: court.id, startAt: at(day(20), 19), repeatWeeks: 8 }) // last week = day 69;
    expect(res.body.error.code).toBe('TOO_FAR_AHEAD');
  });
});

describe('coupons', () => {
  const createCoupon = async (body: object) => api().post('/api/v1/coupons').set(bearer(adminToken)).send(body);
  const uniqueCode = (p: string) => `${p}${Date.now() % 100000}${Math.floor(Math.random() * 100)}`;

  it('admins create coupons with upper-case codes; members cannot', async () => {
    const code = uniqueCode('sale');
    const res = await createCoupon({ code, percentOff: 10, minTotal: 200, maxUses: 5 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ code: code.toUpperCase(), percentOff: 10, amountOff: null, minTotal: 200, maxUses: 5, usedCount: 0 });
    expect((await createCoupon({ code, percentOff: 5 })).body.error.code).toBe('DUPLICATE');
    expect((await createCoupon({ code: uniqueCode('X'), percentOff: 5, amountOff: 50 })).status).toBe(400);
    const { token } = await member();
    expect((await api().post('/api/v1/coupons').set(bearer(token)).send({ code: uniqueCode('m'), percentOff: 5 })).status).toBe(403);
    const list = await api().get('/api/v1/coupons').set(bearer(adminToken));
    expect(list.body.map((c: { code: string }) => c.code)).toContain(code.toUpperCase());
  });

  it('applies a percentage coupon once the minimum spend is met and freezes it on confirm', async () => {
    const court = await newCourt();
    const code = uniqueCode('ten');
    const coupon = (await createCoupon({ code, percentOff: 10, minTotal: 200 })).body;
    const { token } = await member();
    await api().post('/api/v1/cart/slots').set(bearer(token)).send({ courtId: court.id, startAt: at(day(4), 10) });
    const tooSmall = await api().post('/api/v1/cart/coupon').set(bearer(token)).send({ code: code.toLowerCase() });
    expect(tooSmall.body.error.code).toBe('COUPON_MIN_TOTAL');
    await api().post('/api/v1/cart/slots').set(bearer(token)).send({ courtId: court.id, startAt: at(day(4), 11) });
    const cart = (await api().post('/api/v1/cart/coupon').set(bearer(token)).send({ code })).body;
    expect(cart).toMatchObject({ subtotal: 300, discount: 30, total: 270, couponCode: code.toUpperCase() });
    const booking = (await api().post('/api/v1/cart/confirm').set(bearer(token))).body;
    expect(booking.total).toBe(270);
    await api().patch(`/api/v1/coupons/${coupon.id}`).set(bearer(adminToken)).send({ percentOff: 50 }).expect(200);
    expect((await api().get(`/api/v1/bookings/${booking.id}`).set(bearer(token))).body.total).toBe(270);
    expect((await api().get(`/api/v1/bookings/${booking.id}/promptpay`).set(bearer(token))).body.amount).toBe(270);
    const used = (await api().get('/api/v1/coupons').set(bearer(adminToken))).body.find((c: { id: number }) => c.id === coupon.id);
    expect(used.usedCount).toBe(1);
  });

  it('caps a fixed-amount coupon at the subtotal and can be removed', async () => {
    const court = await newCourt();
    const code = uniqueCode('baht');
    await createCoupon({ code, amountOff: 500 });
    const { token } = await member();
    await api().post('/api/v1/cart/slots').set(bearer(token)).send({ courtId: court.id, startAt: at(day(5), 10) });
    const cart = (await api().post('/api/v1/cart/coupon').set(bearer(token)).send({ code })).body;
    expect(cart).toMatchObject({ subtotal: 150, discount: 150, total: 0 });
    const removed = (await api().delete('/api/v1/cart/coupon').set(bearer(token))).body;
    expect(removed).toMatchObject({ discount: 0, total: 150, couponCode: null });
  });

  it('a booking discounted to zero is paid on confirm, with no slip to send', async () => {
    const court = await newCourt();
    const code = uniqueCode('free');
    await createCoupon({ code, amountOff: 1000 });
    const { token } = await member();
    await api().post('/api/v1/cart/slots').set(bearer(token)).send({ courtId: court.id, startAt: at(day(5), 15) });
    await api().post('/api/v1/cart/coupon').set(bearer(token)).send({ code }).expect(200);
    const booking = (await api().post('/api/v1/cart/confirm').set(bearer(token))).body;
    expect(booking).toMatchObject({ total: 0, status: 'paid', expiresAt: null });
    expect(booking.checkinToken).toEqual(expect.any(String));
    expect((await api().get(`/api/v1/bookings/${booking.id}/promptpay`).set(bearer(token))).status).toBe(409);
  });

  it('rejects unknown, expired and used-up coupons', async () => {
    const court = await newCourt();
    const { token } = await member();
    await api().post('/api/v1/cart/slots').set(bearer(token)).send({ courtId: court.id, startAt: at(day(6), 10) });
    const apply = (code: string) => api().post('/api/v1/cart/coupon').set(bearer(token)).send({ code });
    expect((await apply('NOPE')).body.error.code).toBe('INVALID_COUPON');
    const expired = uniqueCode('old');
    await createCoupon({ code: expired, percentOff: 10, expiresAt: '2020-01-01T00:00:00+07:00' });
    expect((await apply(expired)).body.error.code).toBe('COUPON_EXPIRED');
    const once = uniqueCode('once');
    const c = (await createCoupon({ code: once, percentOff: 10, maxUses: 1 })).body;
    await api().patch(`/api/v1/coupons/${c.id}`).set(bearer(adminToken)).send({ isActive: false });
    expect((await apply(once)).body.error.code).toBe('INVALID_COUPON');
    await api().patch(`/api/v1/coupons/${c.id}`).set(bearer(adminToken)).send({ isActive: true });
    const other = await member();
    await api().post('/api/v1/cart/slots').set(bearer(other.token)).send({ courtId: court.id, startAt: at(day(6), 12) });
    await api().post('/api/v1/cart/coupon').set(bearer(other.token)).send({ code: once }).expect(200);
    await api().post('/api/v1/cart/confirm').set(bearer(other.token)).expect(200);
    expect((await apply(once)).body.error.code).toBe('COUPON_USED_UP');
  });

  it('limits uses per member and reports who used a coupon', async () => {
    const court = await newCourt();
    const code = uniqueCode('per');
    const c = (await createCoupon({ code, name: 'โปรทดสอบ', amountOff: 20, maxUses: 10, perUserLimit: 1 })).body;
    expect(c).toMatchObject({ name: 'โปรทดสอบ', perUserLimit: 1, usedCount: 0, userCount: 0, discountGiven: 0 });

    const first = await member();
    await api().post('/api/v1/cart/slots').set(bearer(first.token)).send({ courtId: court.id, startAt: at(day(7), 10) });
    await api().post('/api/v1/cart/coupon').set(bearer(first.token)).send({ code }).expect(200);
    const booking = (await api().post('/api/v1/cart/confirm').set(bearer(first.token)).expect(200)).body;
    // the same member cannot use it again, another member still can
    await api().post('/api/v1/cart/slots').set(bearer(first.token)).send({ courtId: court.id, startAt: at(day(7), 12) });
    expect((await api().post('/api/v1/cart/coupon').set(bearer(first.token)).send({ code })).body.error.code).toBe('COUPON_USER_LIMIT');
    const second = await member();
    await api().post('/api/v1/cart/slots').set(bearer(second.token)).send({ courtId: court.id, startAt: at(day(7), 14) });
    await api().post('/api/v1/cart/coupon').set(bearer(second.token)).send({ code }).expect(200);
    await api().post('/api/v1/cart/confirm').set(bearer(second.token)).expect(200);

    const report = (await api().get(`/api/v1/coupons/${c.id}/usage`).set(bearer(adminToken)).expect(200)).body;
    expect(report.coupon).toMatchObject({ usedCount: 2, userCount: 2, discountGiven: 40 });
    expect(report.uses).toHaveLength(2);
    expect(report.uses.find((u: { code: string }) => u.code === booking.code)).toMatchObject({
      userEmail: first.email,
      status: 'pending_payment',
      subtotal: 150,
      discount: 20,
      total: 130,
    });
    expect((await api().get(`/api/v1/coupons/${c.id}/usage`).set(bearer(first.token))).status).toBe(403);
    expect((await api().get('/api/v1/coupons/999999/usage').set(bearer(adminToken))).status).toBe(404);
  });
});

describe('peak pricing', () => {
  it('charges the peak price from the peak hour onwards', async () => {
    const court = await newCourt({ peakPricePerHour: 250, peakFromHour: 18 });
    expect(court).toMatchObject({ peakPricePerHour: 250, peakFromHour: 18 });
    const { token } = await member();
    const date = day(3);
    await api().post('/api/v1/cart/slots').set(bearer(token)).send({ courtId: court.id, startAt: at(date, 17) }).expect(200);
    const cart = (await api().post('/api/v1/cart/slots').set(bearer(token)).send({ courtId: court.id, startAt: at(date, 18) })).body;
    expect(cart.slots.map((s: { price: number }) => s.price)).toEqual([150, 250]);
    expect(cart.total).toBe(400);
  });

  it('shows each hour’s price in the availability', async () => {
    const court = await newCourt({ peakPricePerHour: 300, peakFromHour: 20 });
    const res = await api().get(`/api/v1/courts/${court.id}/availability`).query({ date: day(3) });
    const price = (h: number) => res.body.slots.find((s: { hour: number }) => s.hour === h).price;
    expect([price(19), price(20), price(21)]).toEqual([150, 300, 300]);
  });

  it('requires price and start hour together, and can be switched off', async () => {
    const bad = await api()
      .post('/api/v1/courts')
      .set(bearer(adminToken))
      .send({ sportId, name: 'x', pricePerHour: 100, peakPricePerHour: 200 });
    expect(bad.status).toBe(400);
    const court = await newCourt({ peakPricePerHour: 250, peakFromHour: 18 });
    const off = await api().patch(`/api/v1/courts/${court.id}`).set(bearer(adminToken)).send({ peakPricePerHour: null, peakFromHour: null });
    expect(off.body).toMatchObject({ peakPricePerHour: null, peakFromHour: null });
  });
});
