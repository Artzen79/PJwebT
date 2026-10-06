import { describe, expect, it } from 'vitest';
import { admin, api, bearer, member, png } from './helpers';

describe('auth', () => {
  it('register creates a member, returns a token and sets an httpOnly cookie', async () => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ email: `New.${Date.now()}@Example.com`, password: 'secret1234', name: 'มานี มีนา', phone: '0899999999' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ role: 'member', status: 'active', name: 'มานี มีนา' });
    expect(res.body.user.email).toBe(res.body.user.email.toLowerCase());
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.headers['set-cookie'][0]).toMatch(/^token=.+HttpOnly/i);
  });

  it('register rejects a taken email', async () => {
    const { email } = await member();
    const res = await api().post('/api/v1/auth/register').send({ email, password: 'secret1234', name: 'ซ้ำ' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('register validates the password length', async () => {
    const res = await api().post('/api/v1/auth/register').send({ email: 'short@example.com', password: '123', name: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('login accepts the right password (email case-insensitive) and rejects a wrong one', async () => {
    const { email } = await member();
    const ok = await api().post('/api/v1/auth/login').send({ email: email.toUpperCase(), password: 'secret1234' });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toEqual(expect.any(String));
    const bad = await api().post('/api/v1/auth/login').send({ email, password: 'wrong-password' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('me works with a bearer token and with the login cookie, and 401s without either', async () => {
    const { token, email } = await member();
    expect((await api().get('/api/v1/auth/me').set(bearer(token))).body.email).toBe(email);
    const login = await api().post('/api/v1/auth/login').send({ email, password: 'secret1234' });
    const cookie = login.headers['set-cookie'][0].split(';')[0];
    expect((await api().get('/api/v1/auth/me').set('Cookie', cookie)).body.email).toBe(email);
    const anon = await api().get('/api/v1/auth/me');
    expect(anon.status).toBe(401);
    expect(anon.body.error.code).toBe('UNAUTHORIZED');
  });

  it('logout clears the cookie', async () => {
    const res = await api().post('/api/v1/auth/logout');
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie'][0]).toMatch(/^token=;/);
  });
});

describe('member profile', () => {
  it('updates name and phone', async () => {
    const { token } = await member();
    const res = await api().patch('/api/v1/users/me').set(bearer(token)).send({ name: 'สมหญิง รักกีฬา', phone: '0811111111' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'สมหญิง รักกีฬา', phone: '0811111111' });
  });

  it('changes password only when the current password is right', async () => {
    const { token, email } = await member();
    const wrong = await api()
      .patch('/api/v1/users/me')
      .set(bearer(token))
      .send({ currentPassword: 'nope-nope', newPassword: 'brandnew99' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe('WRONG_PASSWORD');
    await api().patch('/api/v1/users/me').set(bearer(token)).send({ currentPassword: 'secret1234', newPassword: 'brandnew99' }).expect(200);
    expect((await api().post('/api/v1/auth/login').send({ email, password: 'brandnew99' })).status).toBe(200);
  });

  it('uploads an avatar image that is then publicly served', async () => {
    const { token } = await member();
    const res = await api()
      .post('/api/v1/users/me/avatar')
      .set(bearer(token))
      .attach('image', png, { filename: 'me.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.avatarUrl).toMatch(/^\/uploads\/avatars\/.+\.png$/);
    const img = await api().get(res.body.avatarUrl);
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');
  });

  it('rejects non-image uploads', async () => {
    const { token } = await member();
    const res = await api()
      .post('/api/v1/users/me/avatar')
      .set(bearer(token))
      .attach('image', Buffer.from('<script>'), { filename: 'x.html', contentType: 'text/html' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FILE_ERROR');
  });
});

describe('admin user management', () => {
  it('lists and searches members; members get 403', async () => {
    const a = await admin();
    const m = await member('ค้นหา เจอแน่');
    const list = await api().get('/api/v1/users').query({ q: 'เจอแน่' }).set(bearer(a.token));
    expect(list.status).toBe(200);
    expect(list.body.map((u: { id: number }) => u.id)).toContain(m.user.id);
    const denied = await api().get('/api/v1/users').set(bearer(m.token));
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('FORBIDDEN');
  });

  it('shows one member with booking stats', async () => {
    const a = await admin();
    const m = await member();
    const res = await api().get(`/api/v1/users/${m.user.id}`).set(bearer(a.token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: m.user.id, bookingCount: 0, totalSpent: 0 });
  });

  it('suspending a member blocks their token and their login', async () => {
    const a = await admin();
    const m = await member();
    const res = await api().patch(`/api/v1/users/${m.user.id}/status`).set(bearer(a.token)).send({ status: 'suspended' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('suspended');
    expect((await api().get('/api/v1/auth/me').set(bearer(m.token))).body.error.code).toBe('ACCOUNT_SUSPENDED');
    const login = await api().post('/api/v1/auth/login').send({ email: m.email, password: 'secret1234' });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('admin cannot suspend or demote themself', async () => {
    const a = await admin();
    const res = await api().patch(`/api/v1/users/${a.user.id}/status`).set(bearer(a.token)).send({ status: 'suspended' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CANNOT_CHANGE_SELF');
    const role = await api().patch(`/api/v1/users/${a.user.id}/role`).set(bearer(a.token)).send({ role: 'member' });
    expect(role.body.error.code).toBe('CANNOT_CHANGE_SELF');
  });

  it('promotes a member to admin', async () => {
    const a = await admin();
    const m = await member();
    await api().patch(`/api/v1/users/${m.user.id}/role`).set(bearer(a.token)).send({ role: 'admin' }).expect(200);
    expect((await api().get('/api/v1/users').set(bearer(m.token))).status).toBe(200);
  });

  it('creates a new admin account that can log in', async () => {
    const a = await admin();
    const email = `staff.${Date.now()}@example.com`;
    const res = await api()
      .post('/api/v1/users')
      .set(bearer(a.token))
      .send({ email, password: 'staff12345', name: 'พนักงาน ใหม่', role: 'admin' });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('admin');
    expect((await api().post('/api/v1/auth/login').send({ email, password: 'staff12345' })).status).toBe(200);
  });
});
