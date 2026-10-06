import argon2 from 'argon2';
import type { RequestHandler, Response } from 'express';
import { jwtVerify, SignJWT } from 'jose';
import { one } from '../db';
import { env } from '../env';
import type { User } from '../types';

export const userColumns = `id, email, name, phone, avatar_url AS "avatarUrl", role, status, created_at AS "createdAt"`;

export const hashPassword = (plain: string) => argon2.hash(plain); // argon2id
export const verifyPassword = (hash: string, plain: string) => argon2.verify(hash, plain);

const week = 7 * 24 * 60 * 60;

export async function issueToken(res: Response, userId: number) {
  const token = await new SignJWT()
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(`${week}s`)
    .sign(env.jwtSecret);
  // Secure follows the actual request (https behind the production proxy, plain http on a LAN demo)
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', secure: res.req.secure, maxAge: week * 1000 });
  return token;
}

// Accepts `Authorization: Bearer <jwt>` (API clients) or the `token` cookie (the web app).
// The user is re-read every request so suspensions and role changes apply immediately.
export const loadUser: RequestHandler = async (req, _res, next) => {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1] ?? req.headers.cookie?.match(/(?:^|;\s*)token=([^;]+)/)?.[1];
  let userId: number | undefined;
  if (token) {
    try {
      userId = Number((await jwtVerify(token, env.jwtSecret, { algorithms: ['HS256'] })).payload.sub);
    } catch {
      // invalid or expired token: carry on as a guest
    }
  }
  if (userId) req.user = await one<User>(`SELECT ${userColumns} FROM users WHERE id = $1`, [userId]);
  next();
};
