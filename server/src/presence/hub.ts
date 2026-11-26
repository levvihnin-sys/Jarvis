// Хаб присутствия: кто сейчас в какой сети, кто кого видит, пересылка сообщений.
// Всё состояние — в памяти и живёт, пока устройство подключено. На диск ничего не пишется.

import { createHmac } from 'node:crypto';
import {
  coarsenLocation,
  isBBoxValid,
  bboxContains,
  type BBox,
  type ClientMessage,
  type ErrorCode,
  type Hello,
  type InterestId,
  type MapPerson,
  type NetType,
  type Peer,
  type Profile,
  type PublicVenue,
  type ServerMessage,
  type VenueStats,
  type Visibility,
  type ZoneInfo,
  CLOSE_CODES,
  MAX_LIST,
} from '@ryadom/shared';

export interface Conn {
  send(msg: ServerMessage): void;
  close(code: number, reason: string): void;
}

export interface Client {
  id: string;
  boxPk: string;
  keySig: string;
  conn: Conn;
  networkKey: string;
  ssidHash: string | null;
  netType: NetType;
  profile: Profile;
  visibility: Visibility;
  blocked: Set<string>;
  contacts: Set<string>;
  location: { lat: number; lon: number; at: number } | null;
  venue: PublicVenue | null;
  zoneId: string;
  since: number;
}

export interface HubOptions {
  zoneSecret: string;
  mapReciprocal: boolean;
  minGroup: number;
  reportThreshold: number;
  banMs: number;
  locationTtlMs?: number;
  mapLimit?: number;
  now?: () => number;
  resolveVenue(networkKey: string, ssidHash: string | null): PublicVenue | null;
  onReport?(report: { target: string; reporter: string; reason: string; note?: string; banned: boolean }): void;
}

const REPORT_WINDOW_MS = 24 * 3600 * 1000;
const REPLY_LIMIT = 500;

export class Hub {
  private clients = new Map<string, Client>();
  private groups = new Map<string, Set<Client>>();
  /** target → (reporter → время жалобы) */
  private reports = new Map<string, Map<string, number>>();
  private bans = new Map<string, number>();
  /** кому разрешено ответить: получатель → отправители, написавшие ему первыми */
  private replyAllowed = new Map<string, Set<string>>();
  private readonly now: () => number;
  private readonly locationTtl: number;
  private readonly mapLimit: number;

  constructor(private readonly opts: HubOptions) {
    this.now = opts.now ?? Date.now;
    this.locationTtl = opts.locationTtlMs ?? 30 * 60 * 1000;
    this.mapLimit = opts.mapLimit ?? 300;
  }

  get size(): number {
    return this.clients.size;
  }

  // ── Подключение ──────────────────────────────────────────────────────────

  join(conn: Conn, hello: Hello, networkKey: string): Client | { error: ErrorCode } {
    const now = this.now();
    const bannedUntil = this.bans.get(hello.id);
    if (bannedUntil && bannedUntil > now) return { error: 'banned' };

    const existing = this.clients.get(hello.id);
    if (existing) {
      this.leave(existing);
      existing.conn.close(CLOSE_CODES.replaced, 'replaced by a new connection');
    }

    // Через мобильный интернет «одной сети» не бывает (CGNAT объединяет тысячи
    // незнакомых абонентов), поэтому такой клиент попадает в зону из одного себя.
    const effectiveKey = hello.net.type === 'cellular' ? `cell:${hello.id}` : networkKey;
    const client: Client = {
      id: hello.id,
      boxPk: hello.boxPk,
      keySig: hello.keySig,
      conn,
      networkKey: effectiveKey,
      ssidHash: hello.net.type === 'cellular' ? null : hello.net.ssidHash,
      netType: hello.net.type,
      profile: hello.profile,
      visibility: hello.visibility,
      blocked: new Set(hello.blocked.filter((id) => id !== hello.id)),
      contacts: new Set(hello.contacts.filter((id) => id !== hello.id)),
      location: null,
      venue: null,
      zoneId: '',
      since: now,
    };
    client.venue = hello.net.type === 'cellular' ? null : this.opts.resolveVenue(effectiveKey, client.ssidHash);
    client.zoneId = createHmac('sha256', this.opts.zoneSecret)
      .update(`${effectiveKey}|${client.ssidHash ?? ''}`)
      .digest('base64url')
      .slice(0, 16);

    this.clients.set(client.id, client);
    let group = this.groups.get(effectiveKey);
    if (!group) this.groups.set(effectiveKey, (group = new Set()));
    group.add(client);

    conn.send({
      t: 'welcome',
      you: client.id,
      zone: this.zoneInfo(client),
      peers: this.visiblePeers(client),
      features: { mapReciprocal: this.opts.mapReciprocal, minGroup: this.opts.minGroup },
    });
    for (const other of group) {
      if (this.canSeeInZone(other, client)) other.conn.send({ t: 'peer', peer: this.toPeer(client, other) });
    }
    return client;
  }

  leave(client: Client): void {
    if (this.clients.get(client.id) !== client) return;
    const watchers = this.zoneWatchers(client);
    this.clients.delete(client.id);
    const group = this.groups.get(client.networkKey);
    group?.delete(client);
    if (group && group.size === 0) this.groups.delete(client.networkKey);
    for (const w of watchers) w.conn.send({ t: 'peer_left', id: client.id });
  }

  // ── Сообщения клиента ────────────────────────────────────────────────────

  handle(c: Client, msg: Exclude<ClientMessage, Hello>): void {
    switch (msg.t) {
      case 'profile':
        return this.updateProfile(c, msg.profile);
      case 'visibility':
        return this.setVisibility(c, msg.visibility);
      case 'location':
        return this.setLocation(c, msg.lat, msg.lon);
      case 'map_query':
        return this.mapQuery(c, msg.bbox);
      case 'get_profile':
        return this.getProfile(c, msg.id);
      case 'dm':
        return this.dm(c, msg);
      case 'contact':
        if (msg.on && c.contacts.size < MAX_LIST && msg.id !== c.id) c.contacts.add(msg.id);
        else if (!msg.on) c.contacts.delete(msg.id);
        return;
      case 'block':
        return this.block(c, msg.id, msg.on);
      case 'report':
        return this.report(c, msg.id, msg.reason, msg.note);
      case 'ping':
        return c.conn.send({ t: 'pong', time: this.now() });
    }
  }

  updateProfile(c: Client, profile: Profile): void {
    c.profile = profile;
    for (const w of this.zoneWatchers(c)) w.conn.send({ t: 'peer', peer: this.toPeer(c, w) });
  }

  setVisibility(c: Client, visibility: Visibility): void {
    const before = new Set(this.zoneWatchers(c));
    c.visibility = visibility;
    if (visibility.mode !== 'map') c.location = null;
    else if (c.location) c.location = { ...coarsenLocation(c.location.lat, c.location.lon, visibility.precision), at: c.location.at };
    const after = new Set(this.zoneWatchers(c));
    for (const w of before) if (!after.has(w)) w.conn.send({ t: 'peer_left', id: c.id });
    for (const w of after) if (!before.has(w)) w.conn.send({ t: 'peer', peer: this.toPeer(c, w) });
    c.conn.send({ t: 'peers', peers: this.visiblePeers(c) });
  }

  setLocation(c: Client, lat: number, lon: number): void {
    if (c.visibility.mode !== 'map') {
      return this.error(c, 'map_requires_sharing', 'Включите показ на карте, чтобы делиться местоположением');
    }
    // Повторное огрубление на сервере: точные координаты не сохраняются даже в памяти.
    const p = coarsenLocation(lat, lon, c.visibility.precision);
    c.location = { ...p, at: this.now() };
  }

  mapQuery(c: Client, bbox: BBox): void {
    if (this.opts.mapReciprocal && c.visibility.mode !== 'map') {
      return this.error(c, 'map_requires_sharing', 'Людей на карте видят только те, кто сам показывается на карте');
    }
    if (!isBBoxValid(bbox)) return this.error(c, 'bad_message', 'Слишком большая область карты');
    const people: MapPerson[] = [];
    let truncated = false;
    for (const t of this.clients.values()) {
      if (t === c || !this.mapVisible(c, t) || !bboxContains(bbox, t.location!)) continue;
      if (people.length >= this.mapLimit) {
        truncated = true;
        break;
      }
      people.push({
        id: t.id,
        nickname: t.profile.nickname,
        avatar: t.profile.avatar,
        interests: t.profile.interests,
        status: t.profile.status,
        lat: t.location!.lat,
        lon: t.location!.lon,
        precision: t.visibility.precision,
        venueName: t.venue?.name,
      });
    }
    c.conn.send({ t: 'map', bbox, people, truncated });
  }

  getProfile(c: Client, id: string): void {
    const t = this.clients.get(id);
    const allowed = t && (this.canSeeInZone(c, t) || this.mapVisible(c, t) || this.canMessage(c, t));
    c.conn.send({ t: 'profile', id, peer: allowed ? this.toPeer(t, c, true) : null });
  }

  dm(c: Client, msg: Extract<ClientMessage, { t: 'dm' }>): void {
    const t = this.clients.get(msg.to);
    // Если адресат заблокировал отправителя, отвечаем «не в сети», чтобы не раскрывать блокировку.
    if (!t || t.blocked.has(c.id)) return c.conn.send({ t: 'dm_status', mid: msg.mid, to: msg.to, status: 'offline' });
    if (!this.canMessage(c, t)) return c.conn.send({ t: 'dm_status', mid: msg.mid, to: msg.to, status: 'forbidden' });
    t.conn.send({
      t: 'dm',
      mid: msg.mid,
      from: c.id,
      boxPk: c.boxPk,
      keySig: c.keySig,
      nonce: msg.nonce,
      box: msg.box,
      ts: this.now(),
    });
    let set = this.replyAllowed.get(t.id);
    if (!set) this.replyAllowed.set(t.id, (set = new Set()));
    if (set.size >= REPLY_LIMIT) set.delete(set.values().next().value!);
    set.add(c.id);
    c.conn.send({ t: 'dm_status', mid: msg.mid, to: msg.to, status: 'delivered' });
  }

  block(c: Client, id: string, on: boolean): void {
    if (id === c.id) return;
    const t = this.clients.get(id);
    const sawBefore = t ? [this.canSeeInZone(c, t), this.canSeeInZone(t, c)] : [false, false];
    if (on) {
      if (c.blocked.size < MAX_LIST) c.blocked.add(id);
      this.replyAllowed.get(c.id)?.delete(id);
      this.replyAllowed.get(id)?.delete(c.id);
    } else {
      c.blocked.delete(id);
    }
    if (!t) return;
    const seeNow = [this.canSeeInZone(c, t), this.canSeeInZone(t, c)];
    if (sawBefore[0] && !seeNow[0]) c.conn.send({ t: 'peer_left', id: t.id });
    if (sawBefore[1] && !seeNow[1]) t.conn.send({ t: 'peer_left', id: c.id });
    if (!sawBefore[0] && seeNow[0]) c.conn.send({ t: 'peer', peer: this.toPeer(t, c) });
    if (!sawBefore[1] && seeNow[1]) t.conn.send({ t: 'peer', peer: this.toPeer(c, t) });
  }

  report(c: Client, id: string, reason: string, note?: string): void {
    const t = this.clients.get(id);
    // Жалоба засчитывается, только если жалующийся действительно мог видеть человека.
    if (!t || t === c) return;
    if (!(this.canSeeInZone(c, t) || this.mapVisible(c, t) || this.canMessage(c, t) || c.blocked.has(t.id))) return;
    const now = this.now();
    let byReporter = this.reports.get(id);
    if (!byReporter) this.reports.set(id, (byReporter = new Map()));
    byReporter.set(c.id, now);
    for (const [r, at] of byReporter) if (now - at > REPORT_WINDOW_MS) byReporter.delete(r);
    const banned = byReporter.size >= this.opts.reportThreshold;
    this.opts.onReport?.({ target: id, reporter: c.id, reason, note, banned });
    if (banned) {
      this.bans.set(id, now + this.opts.banMs);
      this.reports.delete(id);
      this.leave(t);
      t.conn.close(CLOSE_CODES.banned, 'banned');
    }
  }

  // ── Заведения ────────────────────────────────────────────────────────────

  /** Пересчитать заведение для всех подключённых (после изменений в кабинете). */
  refreshVenues(): void {
    const cache = new Map<string, PublicVenue | null>();
    for (const c of this.clients.values()) {
      if (c.netType === 'cellular') continue;
      const key = `${c.networkKey}|${c.ssidHash ?? ''}`;
      if (!cache.has(key)) cache.set(key, this.opts.resolveVenue(c.networkKey, c.ssidHash));
      const venue = cache.get(key) ?? null;
      if (JSON.stringify(venue) !== JSON.stringify(c.venue)) {
        c.venue = venue;
        c.conn.send({ t: 'zone', zone: this.zoneInfo(c) });
      }
    }
  }

  /** Обезличенная статистика: числа только для групп не меньше minGroup. */
  venueStats(venueId: string): VenueStats {
    const min = this.opts.minGroup;
    const here = [...this.clients.values()].filter((c) => c.venue?.id === venueId && c.visibility.mode !== 'hidden');
    if (here.length < min) return { online: null, interests: null, minGroup: min, updatedAt: this.now() };
    const counts: Partial<Record<InterestId, number>> = {};
    for (const c of here) for (const i of c.profile.interests) counts[i] = (counts[i] ?? 0) + 1;
    for (const k of Object.keys(counts) as InterestId[]) if ((counts[k] ?? 0) < min) delete counts[k];
    return { online: here.length, interests: counts, minGroup: min, updatedAt: this.now() };
  }

  shutdown(): void {
    for (const c of this.clients.values()) c.conn.close(1001, 'server shutdown');
    this.clients.clear();
    this.groups.clear();
  }

  // ── Правила видимости ────────────────────────────────────────────────────

  private blockedEither(a: Client, b: Client): boolean {
    return a.blocked.has(b.id) || b.blocked.has(a.id);
  }

  /** a видит b в списке «здесь» (отношение симметрично) */
  canSeeInZone(a: Client, b: Client): boolean {
    return (
      a !== b &&
      a.networkKey === b.networkKey &&
      (a.ssidHash === null || b.ssidHash === null || a.ssidHash === b.ssidHash) &&
      a.visibility.mode !== 'hidden' &&
      b.visibility.mode !== 'hidden' &&
      !this.blockedEither(a, b)
    );
  }

  /** viewer видит t на карте */
  mapVisible(viewer: Client, t: Client): boolean {
    return (
      viewer !== t &&
      t.visibility.mode === 'map' &&
      t.location !== null &&
      this.now() - t.location.at <= this.locationTtl &&
      (!this.opts.mapReciprocal || viewer.visibility.mode === 'map') &&
      !this.blockedEither(viewer, t)
    );
  }

  canMessage(a: Client, b: Client): boolean {
    if (a === b || this.blockedEither(a, b)) return false;
    return (
      this.canSeeInZone(a, b) ||
      this.mapVisible(a, b) ||
      (a.contacts.has(b.id) && b.contacts.has(a.id)) ||
      (this.replyAllowed.get(a.id)?.has(b.id) ?? false)
    );
  }

  private zoneWatchers(c: Client): Client[] {
    const group = this.groups.get(c.networkKey);
    if (!group) return [];
    return [...group].filter((o) => this.canSeeInZone(o, c));
  }

  private visiblePeers(c: Client): Peer[] {
    const group = this.groups.get(c.networkKey);
    if (!group) return [];
    return [...group].filter((o) => this.canSeeInZone(c, o)).map((o) => this.toPeer(o, c));
  }

  private toPeer(c: Client, viewer: Client, withPhoto = false): Peer {
    const { photo, ...rest } = c.profile;
    return {
      id: c.id,
      boxPk: c.boxPk,
      keySig: c.keySig,
      profile: withPhoto && photo ? { ...rest, photo } : rest,
      hasPhoto: Boolean(photo),
      conf: c.ssidHash && viewer.ssidHash && c.ssidHash === viewer.ssidHash ? 'wifi' : 'network',
      since: c.since,
    };
  }

  private zoneInfo(c: Client): ZoneInfo {
    return { id: c.zoneId, conf: c.ssidHash ? 'wifi' : 'network', netType: c.netType, venue: c.venue };
  }

  private error(c: Client, code: ErrorCode, message: string): void {
    c.conn.send({ t: 'error', code, message });
  }
}
