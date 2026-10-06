import { beforeAll, describe, expect, it } from 'vitest';
import { admin, api, bearer, member, png } from './helpers';

let adminToken: string;
let memberToken: string;

beforeAll(async () => {
  adminToken = (await admin()).token;
  memberToken = (await member()).token;
});

const uniq = (s: string) => `${s} ${Date.now()}${Math.floor(Math.random() * 1000)}`;

async function createSport(name = uniq('แบดมินตัน')) {
  const res = await api().post('/api/v1/sports').set(bearer(adminToken)).send({ name, icon: '🏸' });
  expect(res.status).toBe(201);
  return res.body;
}

async function createCourt(sportId: number, extra = {}) {
  const res = await api()
    .post('/api/v1/courts')
    .set(bearer(adminToken))
    .send({ sportId, name: uniq('คอร์ท'), description: 'พื้นยางมาตรฐาน', pricePerHour: 150, openHour: 8, closeHour: 22, ...extra });
  expect(res.status).toBe(201);
  return res.body;
}

describe('sports', () => {
  it('admin creates a sport; it is listed publicly with counts', async () => {
    const sport = await createSport();
    expect(sport).toMatchObject({ icon: '🏸', courtCount: 0, equipmentCount: 0 });
    const list = await api().get('/api/v1/sports');
    expect(list.status).toBe(200);
    expect(list.body.map((s: { id: number }) => s.id)).toContain(sport.id);
  });

  it('members cannot create sports', async () => {
    const res = await api().post('/api/v1/sports').set(bearer(memberToken)).send({ name: 'x', icon: 'x' });
    expect(res.status).toBe(403);
  });

  it('rejects a duplicate sport name', async () => {
    const sport = await createSport();
    const res = await api().post('/api/v1/sports').set(bearer(adminToken)).send({ name: sport.name, icon: '🏸' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE');
  });

  it('renames, deletes an unused sport, and refuses to delete one in use', async () => {
    const sport = await createSport();
    const renamed = await api().patch(`/api/v1/sports/${sport.id}`).set(bearer(adminToken)).send({ name: uniq('ฟุตซอล') });
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toMatch(/^ฟุตซอล/);
    await createCourt(sport.id);
    const inUse = await api().delete(`/api/v1/sports/${sport.id}`).set(bearer(adminToken));
    expect(inUse.status).toBe(409);
    expect(inUse.body.error.code).toBe('IN_USE');
    const unused = await createSport();
    expect((await api().delete(`/api/v1/sports/${unused.id}`).set(bearer(adminToken))).body).toEqual({ ok: true });
  });
});

describe('courts', () => {
  it('admin creates a court with sport info and empty rating', async () => {
    const sport = await createSport();
    const court = await createCourt(sport.id);
    expect(court).toMatchObject({ sportId: sport.id, sportName: sport.name, pricePerHour: 150, openHour: 8, closeHour: 22, rating: null, reviewCount: 0, isActive: true });
  });

  it('rejects opening hours where close is not after open', async () => {
    const sport = await createSport();
    const res = await api().post('/api/v1/courts').set(bearer(adminToken)).send({ sportId: sport.id, name: 'x', pricePerHour: 100, openHour: 20, closeHour: 10 });
    expect(res.status).toBe(400);
  });

  it('rejects an unknown sport', async () => {
    const res = await api().post('/api/v1/courts').set(bearer(adminToken)).send({ sportId: 999999, name: 'x', pricePerHour: 100 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REFERENCE');
  });

  it('filters by sport and hides inactive courts from the public but not from admins', async () => {
    const sport = await createSport();
    const active = await createCourt(sport.id);
    const hidden = await createCourt(sport.id, { isActive: false });
    const pub = await api().get('/api/v1/courts').query({ sport: sport.id });
    expect(pub.body.map((c: { id: number }) => c.id)).toEqual([active.id]);
    const all = await api().get('/api/v1/courts').query({ sport: sport.id, includeInactive: true }).set(bearer(adminToken));
    expect(all.body.map((c: { id: number }) => c.id).sort()).toEqual([active.id, hidden.id].sort());
    expect((await api().get(`/api/v1/courts/${hidden.id}`)).status).toBe(404);
    expect((await api().get(`/api/v1/courts/${hidden.id}`).set(bearer(adminToken))).status).toBe(200);
  });

  it('searches courts by name', async () => {
    const sport = await createSport();
    const court = await createCourt(sport.id, { name: uniq('สนามริมน้ำ') });
    const res = await api().get('/api/v1/courts').query({ q: 'ริมน้ำ' });
    expect(res.body.map((c: { id: number }) => c.id)).toContain(court.id);
  });

  it('admin edits a court; members cannot', async () => {
    const sport = await createSport();
    const court = await createCourt(sport.id);
    const res = await api().patch(`/api/v1/courts/${court.id}`).set(bearer(adminToken)).send({ pricePerHour: 220, closeHour: 23 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ pricePerHour: 220, closeHour: 23, name: court.name });
    expect((await api().patch(`/api/v1/courts/${court.id}`).set(bearer(memberToken)).send({ pricePerHour: 1 })).status).toBe(403);
  });

  it('uploads a court image', async () => {
    const sport = await createSport();
    const court = await createCourt(sport.id);
    const res = await api().post(`/api/v1/courts/${court.id}/image`).set(bearer(adminToken)).attach('image', png, { filename: 'c.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.imageUrl).toMatch(/^\/uploads\/courts\/.+\.png$/);
  });

  it('availability lists one-hour slots across opening hours, past ones marked past', async () => {
    const sport = await createSport();
    const court = await createCourt(sport.id, { openHour: 9, closeHour: 12 });
    const future = await api().get(`/api/v1/courts/${court.id}/availability`).query({ date: '2099-01-15' });
    expect(future.status).toBe(200);
    expect(future.body.slots).toEqual([
      { hour: 9, startAt: '2099-01-15T09:00:00+07:00', endAt: '2099-01-15T10:00:00+07:00', status: 'free' },
      { hour: 10, startAt: '2099-01-15T10:00:00+07:00', endAt: '2099-01-15T11:00:00+07:00', status: 'free' },
      { hour: 11, startAt: '2099-01-15T11:00:00+07:00', endAt: '2099-01-15T12:00:00+07:00', status: 'free' },
    ]);
    const past = await api().get(`/api/v1/courts/${court.id}/availability`).query({ date: '2020-01-15' });
    expect(past.body.slots.every((s: { status: string }) => s.status === 'past')).toBe(true);
    expect((await api().get(`/api/v1/courts/${court.id}/availability`).query({ date: 'tomorrow' })).status).toBe(400);
  });
});

describe('equipment', () => {
  async function createEquipment(sportId: number) {
    const res = await api()
      .post('/api/v1/equipment')
      .set(bearer(adminToken))
      .send({ sportId, name: uniq('ไม้แบด Yonex'), description: 'น้ำหนักเบา', totalQty: 10, rentPrice: 30, deposit: 200 });
    expect(res.status).toBe(201);
    return res.body;
  }

  it('admin creates equipment; it is listed and filterable by sport', async () => {
    const sport = await createSport();
    const item = await createEquipment(sport.id);
    expect(item).toMatchObject({ sportId: sport.id, sportName: sport.name, totalQty: 10, rentPrice: 30, deposit: 200, isActive: true });
    const list = await api().get('/api/v1/equipment').query({ sport: sport.id });
    expect(list.body.map((e: { id: number }) => e.id)).toEqual([item.id]);
    expect((await api().get(`/api/v1/equipment/${item.id}`)).body.name).toBe(item.name);
  });

  it('admin edits equipment and uploads its image', async () => {
    const sport = await createSport();
    const item = await createEquipment(sport.id);
    const res = await api().patch(`/api/v1/equipment/${item.id}`).set(bearer(adminToken)).send({ totalQty: 12 });
    expect(res.body.totalQty).toBe(12);
    const img = await api().post(`/api/v1/equipment/${item.id}/image`).set(bearer(adminToken)).attach('image', png, { filename: 'e.png', contentType: 'image/png' });
    expect(img.body.imageUrl).toMatch(/^\/uploads\/equipment\//);
  });

  it('availability for a period equals total stock when nothing is rented', async () => {
    const sport = await createSport();
    const item = await createEquipment(sport.id);
    const res = await api()
      .get(`/api/v1/equipment/${item.id}/availability`)
      .query({ startAt: '2099-01-15T18:00:00+07:00', endAt: '2099-01-15T20:00:00+07:00' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ equipmentId: item.id, totalQty: 10, available: 10 });
    const bad = await api()
      .get(`/api/v1/equipment/${item.id}/availability`)
      .query({ startAt: '2099-01-15T20:00:00+07:00', endAt: '2099-01-15T18:00:00+07:00' });
    expect(bad.status).toBe(400);
  });
});
