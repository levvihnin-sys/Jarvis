// Постоянное хранилище. Здесь ТОЛЬКО данные заведений: аккаунты владельцев,
// заведения, их Wi‑Fi сети и события. Данные пользователей приложения сюда не попадают.

import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import {
  describeNetworkKey,
  type Account,
  type BBox,
  type EventInput,
  type InterestId,
  type PublicVenue,
  type Venue,
  type VenueCategory,
  type VenueEvent,
  type VenueInput,
  type VenueNetwork,
} from '@ryadom/shared';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS venues (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  lat REAL,
  lon REAL,
  published INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS venues_account ON venues(account_id);
CREATE INDEX IF NOT EXISTS venues_geo ON venues(lat, lon);
CREATE TABLE IF NOT EXISTS venue_networks (
  id TEXT PRIMARY KEY,
  venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  ssid TEXT,
  ssid_hash TEXT,
  network_key TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS venue_networks_key ON venue_networks(network_key);
CREATE UNIQUE INDEX IF NOT EXISTS venue_networks_uniq ON venue_networks(network_key, IFNULL(ssid_hash, ''));
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  interests TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS events_venue ON events(venue_id, ends_at);
`;

/** Сколько вперёд показывать события гостям */
export const EVENTS_HORIZON_MS = 7 * 24 * 3600 * 1000;

type Row = Record<string, unknown>;

export const newId = () => randomBytes(12).toString('base64url');

interface VenueRow {
  id: string;
  account_id: string;
  name: string;
  category: string;
  description: string;
  address: string;
  lat: number | null;
  lon: number | null;
  published: number;
  created_at: number;
}

interface EventRow {
  id: string;
  venue_id: string;
  title: string;
  description: string;
  starts_at: number;
  ends_at: number;
  interests: string;
}

interface NetworkRow {
  id: string;
  venue_id: string;
  ssid: string | null;
  ssid_hash: string | null;
  network_key: string;
  created_at: number;
}

const toVenue = (r: VenueRow): Venue & { accountId: string } => ({
  id: r.id,
  accountId: r.account_id,
  name: r.name,
  category: r.category as VenueCategory,
  description: r.description,
  address: r.address,
  lat: r.lat,
  lon: r.lon,
  published: r.published === 1,
  createdAt: r.created_at,
});

const toEvent = (r: EventRow): VenueEvent => ({
  id: r.id,
  venueId: r.venue_id,
  title: r.title,
  description: r.description,
  startsAt: r.starts_at,
  endsAt: r.ends_at,
  interests: JSON.parse(r.interests) as InterestId[],
});

const toNetwork = (r: NetworkRow): VenueNetwork => ({
  id: r.id,
  venueId: r.venue_id,
  ssid: r.ssid,
  networkKey: r.network_key,
  addressLabel: describeNetworkKey(r.network_key),
  createdAt: r.created_at,
});

export class Store {
  private db: DatabaseSync;

  constructor(dbPath: string) {
    if (dbPath !== ':memory:') mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  private get<T>(sql: string, ...args: SQLInputValue[]): T | undefined {
    return this.db.prepare(sql).get(...args) as T | undefined;
  }

  private all<T>(sql: string, ...args: SQLInputValue[]): T[] {
    return this.db.prepare(sql).all(...args) as T[];
  }

  private run(sql: string, ...args: SQLInputValue[]): number {
    return Number(this.db.prepare(sql).run(...args).changes);
  }

  // ── Аккаунты и сессии ────────────────────────────────────────────────────

  createAccount(email: string, passwordHash: string): Account | 'exists' {
    const id = newId();
    try {
      this.run(
        'INSERT INTO accounts (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)',
        id,
        email,
        passwordHash,
        Date.now(),
      );
    } catch (e) {
      if (String(e).includes('UNIQUE')) return 'exists';
      throw e;
    }
    return { id, email };
  }

  findAccountByEmail(email: string): (Account & { passwordHash: string }) | null {
    const r = this.get<Row>('SELECT id, email, password_hash FROM accounts WHERE email = ?', email);
    return r ? { id: r.id as string, email: r.email as string, passwordHash: r.password_hash as string } : null;
  }

  createSession(tokenHash: string, accountId: string, expiresAt: number): void {
    this.run('DELETE FROM sessions WHERE expires_at < ?', Date.now());
    this.run('INSERT INTO sessions (token_hash, account_id, expires_at) VALUES (?, ?, ?)', tokenHash, accountId, expiresAt);
  }

  sessionAccount(tokenHash: string, now: number): Account | null {
    const r = this.get<Row>(
      `SELECT a.id, a.email FROM sessions s JOIN accounts a ON a.id = s.account_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
      tokenHash,
      now,
    );
    return r ? { id: r.id as string, email: r.email as string } : null;
  }

  deleteSession(tokenHash: string): void {
    this.run('DELETE FROM sessions WHERE token_hash = ?', tokenHash);
  }

  // ── Заведения ────────────────────────────────────────────────────────────

  listVenues(accountId: string): Venue[] {
    return this.all<VenueRow>('SELECT * FROM venues WHERE account_id = ? ORDER BY created_at', accountId).map((r) =>
      stripAccount(toVenue(r)),
    );
  }

  /** Заведение, если оно принадлежит аккаунту */
  ownedVenue(accountId: string, venueId: string): Venue | null {
    const r = this.get<VenueRow>('SELECT * FROM venues WHERE id = ? AND account_id = ?', venueId, accountId);
    return r ? stripAccount(toVenue(r)) : null;
  }

  createVenue(accountId: string, v: VenueInput): Venue {
    const id = newId();
    const now = Date.now();
    this.run(
      `INSERT INTO venues (id, account_id, name, category, description, address, lat, lon, published, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      accountId,
      v.name,
      v.category,
      v.description,
      v.address,
      v.lat,
      v.lon,
      v.published ? 1 : 0,
      now,
    );
    return { ...v, id, createdAt: now };
  }

  updateVenue(venueId: string, v: VenueInput): void {
    this.run(
      `UPDATE venues SET name = ?, category = ?, description = ?, address = ?, lat = ?, lon = ?, published = ?
       WHERE id = ?`,
      v.name,
      v.category,
      v.description,
      v.address,
      v.lat,
      v.lon,
      v.published ? 1 : 0,
      venueId,
    );
  }

  deleteVenue(venueId: string): void {
    this.run('DELETE FROM venues WHERE id = ?', venueId);
  }

  // ── Сети ─────────────────────────────────────────────────────────────────

  listNetworks(venueId: string): VenueNetwork[] {
    return this.all<NetworkRow>('SELECT * FROM venue_networks WHERE venue_id = ? ORDER BY created_at', venueId).map(
      toNetwork,
    );
  }

  createNetwork(
    venueId: string,
    ssid: string | null,
    ssidHash: string | null,
    networkKey: string,
  ): VenueNetwork | 'conflict' {
    const id = newId();
    const now = Date.now();
    try {
      this.run(
        'INSERT INTO venue_networks (id, venue_id, ssid, ssid_hash, network_key, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        id,
        venueId,
        ssid,
        ssidHash,
        networkKey,
        now,
      );
    } catch (e) {
      if (String(e).includes('UNIQUE')) return 'conflict';
      throw e;
    }
    return toNetwork({ id, venue_id: venueId, ssid, ssid_hash: ssidHash, network_key: networkKey, created_at: now });
  }

  deleteNetwork(venueId: string, networkId: string): boolean {
    return this.run('DELETE FROM venue_networks WHERE id = ? AND venue_id = ?', networkId, venueId) > 0;
  }

  // ── События ──────────────────────────────────────────────────────────────

  listEvents(venueId: string): VenueEvent[] {
    return this.all<EventRow>('SELECT * FROM events WHERE venue_id = ? ORDER BY starts_at', venueId).map(toEvent);
  }

  createEvent(venueId: string, e: EventInput): VenueEvent {
    const id = newId();
    this.run(
      `INSERT INTO events (id, venue_id, title, description, starts_at, ends_at, interests, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      venueId,
      e.title,
      e.description,
      e.startsAt,
      e.endsAt,
      JSON.stringify(e.interests),
      Date.now(),
    );
    return { ...e, id, venueId };
  }

  updateEvent(venueId: string, eventId: string, e: EventInput): VenueEvent | null {
    const changed = this.run(
      `UPDATE events SET title = ?, description = ?, starts_at = ?, ends_at = ?, interests = ?
       WHERE id = ? AND venue_id = ?`,
      e.title,
      e.description,
      e.startsAt,
      e.endsAt,
      JSON.stringify(e.interests),
      eventId,
      venueId,
    );
    return changed ? { ...e, id: eventId, venueId } : null;
  }

  deleteEvent(venueId: string, eventId: string): boolean {
    return this.run('DELETE FROM events WHERE id = ? AND venue_id = ?', eventId, venueId) > 0;
  }

  // ── Публичные данные ─────────────────────────────────────────────────────

  private upcomingEvents(venueIds: string[], now: number): Map<string, VenueEvent[]> {
    const out = new Map<string, VenueEvent[]>();
    if (venueIds.length === 0) return out;
    const placeholders = venueIds.map(() => '?').join(',');
    const rows = this.all<EventRow>(
      `SELECT * FROM events WHERE venue_id IN (${placeholders}) AND ends_at > ? AND starts_at < ?
       ORDER BY starts_at`,
      ...venueIds,
      now,
      now + EVENTS_HORIZON_MS,
    );
    for (const r of rows) {
      const list = out.get(r.venue_id) ?? [];
      if (list.length < 10) list.push(toEvent(r));
      out.set(r.venue_id, list);
    }
    return out;
  }

  private toPublic(rows: VenueRow[], now: number): PublicVenue[] {
    const events = this.upcomingEvents(
      rows.map((r) => r.id),
      now,
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category as VenueCategory,
      description: r.description,
      address: r.address,
      lat: r.lat,
      lon: r.lon,
      events: events.get(r.id) ?? [],
    }));
  }

  publicVenue(venueId: string, now: number): PublicVenue | null {
    const r = this.get<VenueRow>('SELECT * FROM venues WHERE id = ? AND published = 1', venueId);
    return r ? this.toPublic([r], now)[0]! : null;
  }

  publicVenuesInBBox([minLon, minLat, maxLon, maxLat]: BBox, now: number, limit = 300): PublicVenue[] {
    const rows = this.all<VenueRow>(
      `SELECT * FROM venues WHERE published = 1 AND lat IS NOT NULL
       AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? LIMIT ?`,
      minLat,
      maxLat,
      minLon,
      maxLon,
      limit,
    );
    return this.toPublic(rows, now);
  }

  /**
   * Заведение, к Wi‑Fi которого подключён гость.
   * Совпадение: ключ сети равен, а SSID совпадает или неизвестен с одной из сторон.
   * Приоритет: точное совпадение SSID → сеть без SSID → гость без SSID.
   */
  resolveVenue(networkKey: string, ssidHash: string | null, now: number): PublicVenue | null {
    const rows = this.all<VenueRow & { ssid_hash: string | null; net_created: number }>(
      `SELECT v.*, n.ssid_hash, n.created_at AS net_created FROM venue_networks n
       JOIN venues v ON v.id = n.venue_id
       WHERE n.network_key = ? AND v.published = 1
       ORDER BY n.created_at`,
      networkKey,
    );
    const rank = (h: string | null) => (ssidHash && h === ssidHash ? 0 : h === null ? 1 : ssidHash === null ? 2 : 9);
    const best = rows.map((r) => ({ r, rank: rank(r.ssid_hash) })).filter((x) => x.rank < 9).sort((a, b) => a.rank - b.rank)[0];
    return best ? this.toPublic([best.r], now)[0]! : null;
  }
}

function stripAccount(v: Venue & { accountId: string }): Venue {
  const { accountId: _ignored, ...rest } = v;
  return rest;
}
