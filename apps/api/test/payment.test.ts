import { beforeAll, describe, expect, it } from 'vitest';
import { query } from '../src/db';
import { bangkokDate, HOUR } from '../src/lib/time';
import { admin, api, bearer, member, png } from './helpers';

const day = (n: number) => bangkokDate(new Date(Date.now() + n * 24 * HOUR));
const at = (date: string, hour: number) => `${date}T${String(hour).padStart(2, '0')}:00:00+07:00`;

let adminToken: string;
let courtId: number;

beforeAll(async () => {
  adminToken = (await admin()).token;
  const sport = await api().post('/api/v1/sports').set(bearer(adminToken)).send({ name: `เทนนิส-${Date.now()}`, icon: '🎾' });
  const court = await api()
    .post('/api/v1/courts')
    .set(bearer(adminToken))
    .send({ sportId: sport.body.id, name: 'คอร์ทเทนนิส 1', pricePerHour: 300, openHour: 0, closeHour: 24 });
  courtId = court.body.id;
});

let nextHour = 0;
// each booking gets its own slot on the given day so tests never collide
async function pendingBooking(token: string, daysAhead = 3) {
  const startAt = at(day(daysAhead), nextHour++ % 24);
  await api().post('/api/v1/cart/slots').set(bearer(token)).send({ courtId, startAt }).expect(200);
  return (await api().post('/api/v1/cart/confirm').set(bearer(token)).expect(200)).body;
}

const uploadSlip = (token: string, bookingId: number) =>
  api().post(`/api/v1/bookings/${bookingId}/payments`).set(bearer(token)).attach('image', png, { filename: 'slip.png', contentType: 'image/png' });

async function mailsTo(address: string, minCount = 1): Promise<{ Subject: string }[]> {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`http://localhost:8025/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`);
    const { messages } = await res.json();
    if (messages.length >= minCount) return messages;
    await new Promise((r) => setTimeout(r, 100));
  }
  return [];
}

describe('PromptPay', () => {
  it('gives a QR for the booking total while payment is pending', async () => {
    const { token } = await member();
    const booking = await pendingBooking(token);
    const res = await api().get(`/api/v1/bookings/${booking.id}/promptpay`).set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.amount).toBe(300);
    expect(res.body.payload).toMatch(/^000201/);
    expect(res.body.qr).toMatch(/^data:image\/png;base64,/);
  });

  it('is not available to other members or for cancelled bookings', async () => {
    const owner = await member();
    const stranger = await member();
    const booking = await pendingBooking(owner.token);
    expect((await api().get(`/api/v1/bookings/${booking.id}/promptpay`).set(bearer(stranger.token))).status).toBe(404);
    await api().post(`/api/v1/bookings/${booking.id}/cancel`).set(bearer(owner.token)).expect(200);
    const res = await api().get(`/api/v1/bookings/${booking.id}/promptpay`).set(bearer(owner.token));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATUS');
  });
});

describe('payment slips', () => {
  it('confirming a booking emails the member', async () => {
    const m = await member();
    const booking = await pendingBooking(m.token);
    const mails = await mailsTo(m.email);
    expect(mails.map((x) => x.Subject).join()).toContain(booking.code);
  });

  it('uploading a slip records a pending payment and stops the 15-minute clock; a second upload waits', async () => {
    const { token } = await member();
    const booking = await pendingBooking(token);
    const res = await uploadSlip(token, booking.id);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ bookingId: booking.id, amount: 300, status: 'pending' });
    const after = await api().get(`/api/v1/bookings/${booking.id}`).set(bearer(token));
    expect(after.body.expiresAt).toBeNull();
    const again = await uploadSlip(token, booking.id);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('PAYMENT_PENDING');
  });

  it('refuses a slip after the payment window has passed', async () => {
    const { token } = await member();
    const booking = await pendingBooking(token);
    await query(`UPDATE bookings SET expires_at = now() - interval '1 minute' WHERE id = $1`, [booking.id]);
    const res = await uploadSlip(token, booking.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PAYMENT_EXPIRED');
  });

  it('the slip image is visible to its owner and admins only', async () => {
    const owner = await member();
    const stranger = await member();
    const booking = await pendingBooking(owner.token);
    const payment = (await uploadSlip(owner.token, booking.id)).body;
    const mine = await api().get(`/api/v1/payments/${payment.id}/slip`).set(bearer(owner.token));
    expect(mine.status).toBe(200);
    expect(mine.headers['content-type']).toBe('image/png');
    expect((await api().get(`/api/v1/payments/${payment.id}/slip`).set(bearer(adminToken))).status).toBe(200);
    expect((await api().get(`/api/v1/payments/${payment.id}/slip`).set(bearer(stranger.token))).status).toBe(404);
    expect((await api().get(payment.slipUrl).set(bearer(owner.token))).status).toBe(200);
  });
});

describe('reviewing payments', () => {
  it('admins see pending slips; approving marks the booking paid, issues a check-in QR and emails the member', async () => {
    const m = await member();
    const booking = await pendingBooking(m.token);
    const payment = (await uploadSlip(m.token, booking.id)).body;
    const pending = await api().get('/api/v1/payments').query({ status: 'pending' }).set(bearer(adminToken));
    expect(pending.body.map((p: { id: number }) => p.id)).toContain(payment.id);
    const res = await api().patch(`/api/v1/payments/${payment.id}`).set(bearer(adminToken)).send({ status: 'approved' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('approved');
    const paid = await api().get(`/api/v1/bookings/${booking.id}`).set(bearer(m.token));
    expect(paid.body.status).toBe('paid');
    expect(paid.body.checkinToken).toEqual(expect.any(String));
    expect(paid.body.checkinQr).toMatch(/^data:image\/png;base64,/);
    const subjects = (await mailsTo(m.email, 2)).map((x) => x.Subject);
    expect(subjects.some((s) => s.includes('ชำระเงินสำเร็จ'))).toBe(true);
    const twice = await api().patch(`/api/v1/payments/${payment.id}`).set(bearer(adminToken)).send({ status: 'approved' });
    expect(twice.status).toBe(409);
    expect(twice.body.error.code).toBe('INVALID_STATUS');
  });

  it('rejecting gives the member another 15 minutes to send a new slip', async () => {
    const { token } = await member();
    const booking = await pendingBooking(token);
    const payment = (await uploadSlip(token, booking.id)).body;
    const res = await api().patch(`/api/v1/payments/${payment.id}`).set(bearer(adminToken)).send({ status: 'rejected', note: 'ยอดเงินไม่ตรง' });
    expect(res.body).toMatchObject({ status: 'rejected', note: 'ยอดเงินไม่ตรง' });
    const after = await api().get(`/api/v1/bookings/${booking.id}`).set(bearer(token));
    expect(after.body.status).toBe('pending_payment');
    expect((Date.parse(after.body.expiresAt) - Date.now()) / 60_000).toBeGreaterThan(14);
    expect((await uploadSlip(token, booking.id)).status).toBe(201);
  });

  it('members cannot review payments', async () => {
    const { token } = await member();
    const booking = await pendingBooking(token);
    const payment = (await uploadSlip(token, booking.id)).body;
    expect((await api().patch(`/api/v1/payments/${payment.id}`).set(bearer(token)).send({ status: 'approved' })).status).toBe(403);
  });
});

describe('cancelling a paid booking', () => {
  async function paidBooking(token: string, startAt: string) {
    await api().post('/api/v1/cart/slots').set(bearer(token)).send({ courtId, startAt }).expect(200);
    const booking = (await api().post('/api/v1/cart/confirm').set(bearer(token))).body;
    const payment = (await uploadSlip(token, booking.id)).body;
    await api().patch(`/api/v1/payments/${payment.id}`).set(bearer(adminToken)).send({ status: 'approved' }).expect(200);
    return booking;
  }
  const soon = () => new Date(Math.ceil(Date.now() / HOUR) * HOUR + HOUR).toISOString();

  it('is refused for members within 24 hours of the start but allowed for admins', async () => {
    const { token } = await member();
    const booking = await paidBooking(token, soon());
    const res = await api().post(`/api/v1/bookings/${booking.id}/cancel`).set(bearer(token));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TOO_LATE_TO_CANCEL');
    const byAdmin = await api().post(`/api/v1/bookings/${booking.id}/cancel`).set(bearer(adminToken));
    expect(byAdmin.body.status).toBe('cancelled');
  });

  it('is allowed for members more than 24 hours ahead', async () => {
    const { token } = await member();
    const booking = await paidBooking(token, at(day(5), 20));
    expect((await api().post(`/api/v1/bookings/${booking.id}/cancel`).set(bearer(token))).body.status).toBe('cancelled');
  });
});
