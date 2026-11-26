import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';

export interface Config {
  port: number;
  host: string;
  /** Путь к SQLite (только данные заведений). ':memory:' — для тестов. */
  dbPath: string;
  /** Доверять X-Forwarded-For: true/false или список адресов прокси через запятую */
  trustProxy: boolean | string;
  /** Секрет для идентификаторов зон (зона не раскрывает IP клиенту) */
  zoneSecret: string;
  /** Видеть людей на карте может только тот, кто сам на карте */
  mapReciprocal: boolean;
  /** k-анонимность статистики для заведений */
  minGroup: number;
  /** Сколько разных жалоб нужно для временной блокировки */
  reportThreshold: number;
  banHours: number;
  /** Собранный кабинет заведения (venue-dashboard/dist) */
  staticDir: string | null;
  logger: boolean;
}

function bool(v: string | undefined, def: boolean): boolean {
  if (v === undefined || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

function int(v: string | undefined, def: number): number {
  const n = v ? Number.parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : def;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const trust = env.TRUST_PROXY;
  const defaultStatic = path.resolve(import.meta.dirname, '../../venue-dashboard/dist');
  const staticDir = env.STATIC_DIR ?? (existsSync(defaultStatic) ? defaultStatic : null);
  return {
    port: int(env.PORT, 8080),
    host: env.HOST ?? '0.0.0.0',
    dbPath: env.DB_PATH ?? path.resolve(import.meta.dirname, '../data/ryadom.db'),
    trustProxy: trust === undefined ? false : ['true', 'false'].includes(trust) ? trust === 'true' : trust,
    zoneSecret: env.ZONE_SECRET ?? randomBytes(32).toString('hex'),
    mapReciprocal: bool(env.MAP_RECIPROCAL, true),
    minGroup: Math.max(1, int(env.MIN_GROUP, 3)),
    reportThreshold: Math.max(1, int(env.REPORT_THRESHOLD, 3)),
    banHours: Math.max(1, int(env.BAN_HOURS, 24)),
    staticDir: staticDir && existsSync(staticDir) ? staticDir : null,
    logger: bool(env.LOG, true),
  };
}
