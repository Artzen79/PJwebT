import { beforeAll, describe, expect, it } from 'vitest';
import { bangkokDate } from '../src/lib/time';
import { admin, api, bearer, member } from './helpers';

const day = (n: number) => bangkokDate(new Date(Date.now() + n * 24 * 3_600_000));
const at = (date: string, hour: number) => `${date}T${String(hour).padStart(2, '0')}:00:00+07:00`;

let adminToken: string;
let courtId: number;
let equipmentId: number;

beforeAll(async () => {
  adminToken = (await admin()).token;
  const sport = await api().post('/api/v1/sports').set(bearer(adminToken)).send({ name: `แบดมินตัน-${Date.now()}`, icon: '🏸' });
  const court = await api()
    .post('/api/v1/courts')
    .set(bearer(adminToken))
    .send({ sportId: sport.body.id, name: 'คอร์ท A', pricePerHour: 150, openHour: 8, closeHour: 22 });
  courtId = court.body.id;
  const item = await api()
    .post('/api/v1/equipment')
    .set(bearer(adminToken))
    .send({ sportId: sport.body.id, name: 'ไม้แบด', totalQty: 3, rentPrice: 30, deposit: 100 });
  equipmentId = item.body.id;
});

const addSlot = (token: string, startAt: string, court = courtId) =>
  api().post('/api/v1/cart/slots').set(bearer(token)).send({ courtId: court, startAt });
const addGear = (token: string, qty: number, startAt: string, endAt: string) =>
  api().post('/api/v1/cart/equipment').set(bearer(token)).send({ equipmentId, qty, startAt, endAt });
const confirm = (token: string) => api().post('/api/v1/cart/confirm').set(bearer(token));
const slotStatus = async (date: string, hour: number, token?: string) => {
  const req = api().get(`/api/v1/courts/${courtId}/availability`).query({ date });
  if (token) req.set(bearer(token));
  return (await req).body.slots.find((s: { hour: number }) => s.hour === hour).status;
};

describe('cart', () => {
  it('a new member gets an empty cart with an order code', async () => {
    const { token } = await member();
    const res = await api().get('/api/v1/cart').set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'cart', total: 0, slots: [], equipment: [] });
    expect(res.body.code).toMatch(/^\d{12,}$/);
  });

  it('adding a slot prices it and shows it as in_cart to me only (a cart does not hold the slot)', async () => {
    const { token } = await member();
    const other = await member();
    const date = day(3);
    const res = await addSlot(token, at(date, 10));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(150);
    expect(res.body.slots).toHaveLength(1);
    expect(res.body.slots[0]).toMatchObject({ courtId, courtName: 'คอร์ท A', price: 150, taken: false });
    expect(await slotStatus(date, 10, token)).toBe('in_cart');
    expect(await slotStatus(date, 10, other.token)).toBe('free');
  });

  it('rejects the same slot twice, past slots, off-the-hour starts, closed hours and far-future dates', async () => {
    const { token } = await member();
    const date = day(3);
    await addSlot(token, at(date, 11)).expect(200);
    expect((await addSlot(token, at(date, 11))).body.error.code).toBe('ALREADY_IN_CART');
    expect((await addSlot(token, at(day(-1), 11))).body.error.code).toBe('SLOT_IN_PAST');
    expect((await addSlot(token, `${date}T11:30:00+07:00`)).body.error.code).toBe('INVALID_SLOT');
    expect((await addSlot(token, at(date, 6))).body.error.code).toBe('OUTSIDE_HOURS');
    expect((await addSlot(token, at(date, 21))).status).toBe(200);
    expect((await addSlot(token, at(day(90), 11))).body.error.code).toBe('TOO_FAR_AHEAD');
  });

  it('adds equipment priced per piece and refuses more than is in stock', async () => {
    const { token } = await member();
    const date = day(4);
    const res = await addGear(token, 2, at(date, 18), at(date, 20));
    expect(res.status).toBe(200);
    expect(res.body.equipment[0]).toMatchObject({ equipmentId, qty: 2, price: 60, deposit: 200 });
    expect(res.body.total).toBe(60);
    const tooMany = await addGear(token, 4, at(date, 18), at(date, 20));
    expect(tooMany.status).toBe(409);
    expect(tooMany.body.error.code).toBe('OUT_OF_STOCK');
  });

  it('removes single items and the whole cart before confirming', async () => {
    const { token } = await member();
    const date = day(5);
    await addSlot(token, at(date, 9));
    const withGear = await addGear(token, 1, at(date, 9), at(date, 10));
    const slotItem = withGear.body.slots[0].id;
    const gearItem = withGear.body.equipment[0].id;
    const afterSlot = await api().delete(`/api/v1/cart/slots/${slotItem}`).set(bearer(token));
    expect(afterSlot.body.slots).toEqual([]);
    const afterGear = await api().delete(`/api/v1/cart/equipment/${gearItem}`).set(bearer(token));
    expect(afterGear.body.equipment).toEqual([]);
    await addSlot(token, at(date, 10));
    const code = (await api().get('/api/v1/cart').set(bearer(token))).body.code;
    expect((await api().delete('/api/v1/cart').set(bearer(token))).body).toEqual({ ok: true });
    const fresh = await api().get('/api/v1/cart').set(bearer(token));
    expect(fresh.body.code).not.toBe(code);
    expect(fresh.body.slots).toEqual([]);
  });

  it('refuses to confirm an empty cart', async () => {
    const { token } = await member();
    const res = await confirm(token);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('EMPTY_CART');
  });
});

describe('confirming', () => {
  it('turns the cart into a pending-payment booking that holds the slot, then starts a fresh cart', async () => {
    const { token } = await member();
    const other = await member();
    const date = day(6);
    await addSlot(token, at(date, 12));
    const res = await confirm(token);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending_payment');
    const minutesLeft = (Date.parse(res.body.expiresAt) - Date.now()) / 60_000;
    expect(minutesLeft).toBeGreaterThan(14);
    expect(minutesLeft).toBeLessThanOrEqual(15);
    expect(await slotStatus(date, 12, token)).toBe('mine');
    expect(await slotStatus(date, 12, other.token)).toBe('booked');
    const cart = await api().get('/api/v1/cart').set(bearer(token));
    expect(cart.body.code).not.toBe(res.body.code);
    expect((await addSlot(other.token, at(date, 12))).body.error.code).toBe('SLOT_TAKEN');
  });

  it('the all-courts board shows held slots as booked and filters by sport', async () => {
    const { token } = await member();
    const date = day(6);
    await addSlot(token, at(date, 17));
    await confirm(token).expect(200);
    const court = (await api().get(`/api/v1/courts/${courtId}`)).body;
    const res = await api().get('/api/v1/availability').query({ date, sport: court.sportId });
    expect(res.status).toBe(200);
    expect(res.body.date).toBe(date);
    expect(res.body.courts).toHaveLength(1);
    const row = res.body.courts[0];
    expect(row).toMatchObject({ courtId, courtName: 'คอร์ท A', pricePerHour: 150 });
    expect(row.slots.find((s: { hour: number }) => s.hour === 17).status).toBe('booked');
    expect(row.slots.find((s: { hour: number }) => s.hour === 8).status).toBe('free');
  });

  it('items of a confirmed booking can no longer be removed', async () => {
    const { token } = await member();
    const date = day(6);
    await addSlot(token, at(date, 13));
    const booking = (await confirm(token)).body;
    const res = await api().delete(`/api/v1/cart/slots/${booking.slots[0].id}`).set(bearer(token));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('BOOKING_CONFIRMED');
  });

  it('when two members confirm the same slot at once, exactly one wins', async () => {
    const a = await member();
    const b = await member();
    const date = day(7);
    await addSlot(a.token, at(date, 15)).expect(200);
    await addSlot(b.token, at(date, 15)).expect(200);
    const results = await Promise.all([confirm(a.token), confirm(b.token)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const loser = results.find((r) => r.status === 409)!;
    expect(loser.body.error.code).toBe('SLOT_TAKEN');
    const loserToken = loser === results[0] ? a.token : b.token;
    const loserCart = await api().get('/api/v1/cart').set(bearer(loserToken));
    expect(loserCart.body.slots[0].taken).toBe(true);
  });

  it('when two members confirm more equipment than exists at once, one gets OUT_OF_STOCK', async () => {
    const a = await member();
    const b = await member();
    const date = day(8);
    await addGear(a.token, 2, at(date, 18), at(date, 20)).expect(200);
    await addGear(b.token, 2, at(date, 19), at(date, 21)).expect(200);
    const results = await Promise.all([confirm(a.token), confirm(b.token)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409)!.body.error.code).toBe('OUT_OF_STOCK');
  });
});

describe('booking history', () => {
  it('lists my confirmed bookings (not the cart) and shows details', async () => {
    const { token, user } = await member();
    const date = day(9);
    await addSlot(token, at(date, 16));
    await addGear(token, 1, at(date, 16), at(date, 17));
    const booking = (await confirm(token)).body;
    await addSlot(token, at(date, 17)); // stays in the cart
    const list = await api().get('/api/v1/bookings').set(bearer(token));
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ id: booking.id, code: booking.code, status: 'pending_payment', total: 180, itemCount: 2, userId: user.id });
    const detail = await api().get(`/api/v1/bookings/${booking.id}`).set(bearer(token));
    expect(detail.body).toMatchObject({ id: booking.id, total: 180, payments: [] });
    expect(detail.body.equipment[0]).toMatchObject({ name: 'ไม้แบด', qty: 1, price: 30 });
  });

  it('members cannot see other members\' bookings; admins can list any member\'s', async () => {
    const owner = await member();
    const stranger = await member();
    await addSlot(owner.token, at(day(10), 8));
    const booking = (await confirm(owner.token)).body;
    expect((await api().get(`/api/v1/bookings/${booking.id}`).set(bearer(stranger.token))).status).toBe(404);
    const strangerList = await api().get('/api/v1/bookings').query({ userId: owner.user.id }).set(bearer(stranger.token));
    expect(strangerList.body).toEqual([]);
    const adminList = await api().get('/api/v1/bookings').query({ userId: owner.user.id }).set(bearer(adminToken));
    expect(adminList.body.map((b: { id: number }) => b.id)).toEqual([booking.id]);
    expect((await api().get(`/api/v1/bookings/${booking.id}`).set(bearer(adminToken))).status).toBe(200);
  });
});

describe('cancelling', () => {
  it('a pending booking can be cancelled and frees its slot; cancelling twice is refused', async () => {
    const { token } = await member();
    const date = day(11);
    await addSlot(token, at(date, 14));
    const booking = (await confirm(token)).body;
    const res = await api().post(`/api/v1/bookings/${booking.id}/cancel`).set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
    expect(await slotStatus(date, 14)).toBe('free');
    const again = await api().post(`/api/v1/bookings/${booking.id}/cancel`).set(bearer(token));
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('INVALID_STATUS');
  });
});
