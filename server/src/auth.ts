import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type { Account } from '@ryadom/shared';
import { HttpError, unauthorized } from './errors';
import type { Store } from './store';

const SCRYPT = { N: 16384, r: 8, p: 1 };
export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;

function scrypt(password: string, salt: Buffer, keylen: number, opts: typeof SCRYPT): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 32, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = await scrypt(password, Buffer.from(salt, 'base64url'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const newToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('base64url');

export function bearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  return h?.startsWith('Bearer ') ? h.slice(7).trim() || null : null;
}

export function requireAccount(store: Store, req: FastifyRequest): Account {
  const token = bearer(req);
  if (!token) throw unauthorized();
  const account = store.sessionAccount(hashToken(token), Date.now());
  if (!account) throw unauthorized('Сессия истекла, войдите снова');
  return account;
}

/** Простой ограничитель попыток входа по ключу (IP или e-mail). */
export class AttemptLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}
  check(key: string): void {
    const now = Date.now();
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length >= this.max) throw new HttpError(429, 'rate_limited', 'Слишком много попыток, попробуйте позже');
    list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > 10_000) this.hits.clear();
  }
}
