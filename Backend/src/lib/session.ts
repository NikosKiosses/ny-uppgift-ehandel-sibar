// Shoppens EGEN inloggning
// Googles tokens används bara en gång i callbacken efter det är det den här som gäller.

import type { CookieOptions, NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { isHttps } from '../integrations/googleAdapter.ts';

const SECRET = process.env.SESSION_TOKEN_SECRET;
const SESSION_HOURS = Number(process.env.SESSION_HOURS ?? 8);
export const SESSION_COOKIE = 'session';

function secret(): string {
  if (!SECRET) throw new Error('SESSION_TOKEN_SECRET is missing in .env');
  return SECRET;
}


export const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: isHttps(),
  sameSite: 'lax',
  path: '/',
});

export type Customer = { id: number; name: string; email: string };

export function startSession(res: Response, customer: Customer) {
  const token = jwt.sign({ name: customer.name, email: customer.email }, secret(), {
    subject: String(customer.id),
    expiresIn: SESSION_HOURS * 60 * 60,
  });
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: SESSION_HOURS * 60 * 60 * 1000 });
}

export function endSession(res: Response) {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

const SessionPayload = z.object({
  sub: z.coerce.number().int().positive(),
  name: z.string(),
  email: z.string(),
});


export function readCustomer(req: Request): Customer | null {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== 'string' || !token) return null;
  try {
    const payload = SessionPayload.safeParse(jwt.verify(token, secret()));
    if (!payload.success) return null;
    return { id: payload.data.sub, name: payload.data.name, email: payload.data.email };
  } catch {
    return null;
  }
}

export function requireCustomer(req: Request, res: Response, next: NextFunction) {
  const customer = readCustomer(req);
  if (!customer) {
    res.status(401).json({ error: 'Du måste logga in för att se det här' });
    return;
  }
  res.locals.customer = customer;
  next();
}