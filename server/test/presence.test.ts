import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CLOSE_CODES, decryptDm, encryptDm, type ServerMessage } from '@ryadom/shared';
import { baseProfile, startServer, TestClient } from './helpers';

type Srv = Awaited<ReturnType<typeof startServer>>;

let srv: Srv;
const clients: TestClient[] = [];

async function client(opts: ConstructorParameters<typeof TestClient>[1]) {
  const c = new TestClient(srv.url, opts);
  clients.push(c);
  return c;
}

beforeEach(async () => {
  srv = await startServer({ REPORT_THRESHOLD: '2' });
});

afterEach(async () => {
  for (const c of clients.splice(0)) c.close();
  await srv.app.close();
});

describe('zones', () => {
  it('people on the same Wi‑Fi see each other, others do not', async () => {
    const anna = await client({ ip: '203.0.113.10', profile: baseProfile('Аня', { interests: ['coffee', 'flirt'] }) });
    const boris = await client({ ip: '203.0.113.10', profile: baseProfile('Борис') });
    const stranger = await client({ ip: '203.0.113.99' });

    const welcomeA = await anna.connect();
    expect(welcomeA.peers).toEqual([]);
    expect(welcomeA.zone.conf).toBe('wifi');

    const annaSeesBoris = anna.next('peer');
    const welcomeB = await boris.connect();
    expect(welcomeB.peers.map((p) => p.profile.nickname)).toEqual(['Аня']);
    expect(welcomeB.peers[0]!.profile.interests).toEqual(['coffee', 'flirt']);
    expect(welcomeB.peers[0]!.conf).toBe('wifi');
    expect((await annaSeesBoris).peer.profile.nickname).toBe('Борис');

    const welcomeS = await stranger.connect();
    expect(welcomeS.peers).toEqual([]);
    await anna.expectNo('peer');

    const left = anna.next('peer_left');
    boris.close();
    expect((await left).id).toBe(boris.id);
  });

  it('IPv6 devices in the same /64 share a zone', async () => {
    const a = await client({ ip: '2001:db8:aa:1::10' });
    const b = await client({ ip: '2001:db8:aa:1:ffff::20' });
    await a.connect();
    const wb = await b.connect();
    expect(wb.peers.map((p) => p.id)).toEqual([a.id]);
  });

  it('different SSIDs behind one IP are separated; unknown SSID sees both', async () => {
    const guest = await client({ ip: '203.0.113.20', ssid: 'Hotel-Guest' });
    const staff = await client({ ip: '203.0.113.20', ssid: 'Hotel-Staff' });
    const web = await client({ ip: '203.0.113.20', ssid: null, netType: 'unknown' });
    await guest.connect();
    expect((await staff.connect()).peers).toEqual([]);
    const w = await web.connect();
    expect(w.peers.map((p) => p.id).sort()).toEqual([guest.id, staff.id].sort());
    expect(w.peers.every((p) => p.conf === 'network')).toBe(true);
    expect(w.zone.conf).toBe('network');
  });

  it('cellular connections never share a zone (CGNAT)', async () => {
    const a = await client({ ip: '100.64.0.1', netType: 'cellular', ssid: null });
    const b = await client({ ip: '100.64.0.1', netType: 'cellular', ssid: null });
    await a.connect();
    const wb = await b.connect();
    expect(wb.peers).toEqual([]);
    expect(wb.zone.netType).toBe('cellular');
  });

  it('hidden mode: invisible and sees nobody; switching back announces the user', async () => {
    const a = await client({ ip: '203.0.113.30' });
    const ghost = await client({ ip: '203.0.113.30', visibility: { mode: 'hidden', precision: 'area' } });
    await a.connect();
    const wg = await ghost.connect();
    expect(wg.peers).toEqual([]);
    await a.expectNo('peer');

    const appear = a.next('peer');
    const peersList = ghost.next('peers');
    ghost.send({ t: 'visibility', visibility: { mode: 'zone', precision: 'area' } });
    expect((await appear).peer.id).toBe(ghost.id);
    expect((await peersList).peers.map((p) => p.id)).toEqual([a.id]);

    const gone = a.next('peer_left');
    ghost.send({ t: 'visibility', visibility: { mode: 'hidden', precision: 'area' } });
    expect((await gone).id).toBe(ghost.id);
  });

  it('profile updates are broadcast; photos only via get_profile', async () => {
    const photo = 'data:image/jpeg;base64,' + 'A'.repeat(400);
    const a = await client({ ip: '203.0.113.40', profile: baseProfile('A', { photo }) });
    const b = await client({ ip: '203.0.113.40' });
    await a.connect();
    const wb = await b.connect();
    expect(wb.peers[0]!.hasPhoto).toBe(true);
    expect(wb.peers[0]!.profile.photo).toBeUndefined();

    const prof = b.next('profile');
    b.send({ t: 'get_profile', id: a.id });
    expect((await prof).peer!.profile.photo).toBe(photo);

    const upd = b.next('peer');
    a.send({ t: 'profile', profile: baseProfile('A', { status: 'У окна, столик 4', interests: ['play'] }) });
    const u = await upd;
    expect(u.peer.profile.status).toBe('У окна, столик 4');
    expect(u.peer.hasPhoto).toBe(false);
  });
});

describe('handshake', () => {
  it('rejects a wrong challenge signature', async () => {
    const c = await client({ ip: '203.0.113.50', badSig: true });
    const err = c.next('error');
    await c.connect().catch(() => undefined);
    expect((await err).code).toBe('bad_signature');
    expect(await c.waitClose()).toBe(CLOSE_CODES.badHello);
  });

  it('a second connection with the same identity replaces the first', async () => {
    const first = await client({ ip: '203.0.113.51' });
    await first.connect();
    const second = await client({ ip: '203.0.113.51', identity: first.identity });
    await second.connect();
    expect(await first.waitClose()).toBe(CLOSE_CODES.replaced);
    expect(srv.hub.size).toBe(1);
  });

  it('validates messages', async () => {
    const c = await client({ ip: '203.0.113.52' });
    await c.connect();
    const err = c.next('error');
    c.send({ t: 'location', lat: 999, lon: 0 });
    expect((await err).code).toBe('bad_message');
  });
});

describe('direct messages', () => {
  it('relays end-to-end encrypted messages the server cannot read', async () => {
    const a = await client({ ip: '203.0.113.60' });
    const b = await client({ ip: '203.0.113.60' });
    await a.connect();
    const wb = await b.connect();
    const peerA = wb.peers[0]!;

    const text = 'Привет! Ты тоже ждёшь поезд на 19:40?';
    const enc = encryptDm({ kind: 'text', text }, a.identity.boxPk, b.identity);
    const incoming = a.next('dm');
    const status = b.next('dm_status');
    b.send({ t: 'dm', mid: 'm1', to: peerA.id, ...enc });
    expect((await status).status).toBe('delivered');
    const dm = await incoming;
    expect(dm.from).toBe(b.id);
    expect(dm.box).not.toContain('Привет');
    expect(decryptDm(dm.box, dm.nonce, dm.boxPk, a.identity)).toEqual({ kind: 'text', text });
  });

  it('forbids messaging people you cannot see; allows mutual contacts anywhere', async () => {
    const a = await client({ ip: '203.0.113.61' });
    const b = await client({ ip: '198.51.100.61' });
    await a.connect();
    await b.connect();
    const enc = encryptDm({ kind: 'wave' }, b.identity.boxPk, a.identity);
    const st = a.next('dm_status');
    a.send({ t: 'dm', mid: 'x', to: b.id, ...enc });
    expect((await st).status).toBe('forbidden');

    // Взаимные контакты: оба устройства прислали друг друга
    const a2 = await client({ ip: '203.0.113.61', identity: a.identity, contacts: [b.identity.id] });
    await a2.connect();
    const st2 = a2.next('dm_status');
    a2.send({ t: 'dm', mid: 'y', to: b.id, ...enc });
    expect((await st2).status).toBe('forbidden'); // b ещё не подтвердил контакт

    b.send({ t: 'contact', id: a.identity.id, on: true });
    await new Promise((r) => setTimeout(r, 50));
    const st3 = a2.next('dm_status');
    const got = b.next('dm');
    a2.send({ t: 'dm', mid: 'z', to: b.id, ...enc });
    expect((await st3).status).toBe('delivered');
    expect(decryptDm((await got).box, (await got).nonce, a.identity.boxPk, b.identity)).toEqual({ kind: 'wave' });
  });

  it('reports offline recipients', async () => {
    const a = await client({ ip: '203.0.113.62' });
    await a.connect();
    const st = a.next('dm_status');
    a.send({ t: 'dm', mid: 'q', to: new TestClient(srv.url, { ip: '1.1.1.1' }).id, nonce: 'A'.repeat(32), box: 'AAAA' });
    expect((await st).status).toBe('offline');
  });

  it('the recipient may reply after leaving the zone', async () => {
    const a = await client({ ip: '203.0.113.63' });
    const b = await client({ ip: '203.0.113.63' });
    await a.connect();
    await b.connect();
    const got = b.next('dm');
    a.send({ t: 'dm', mid: '1', to: b.id, ...encryptDm({ kind: 'wave' }, b.identity.boxPk, a.identity) });
    await got;
    // b уходит в другую сеть и отвечает
    b.close();
    const b2 = await client({ ip: '198.51.100.63', identity: b.identity });
    await b2.connect();
    const st = b2.next('dm_status');
    b2.send({ t: 'dm', mid: '2', to: a.id, ...encryptDm({ kind: 'text', text: 'ок' }, a.identity.boxPk, b.identity) });
    expect((await st).status).toBe('delivered');
  });
});

describe('blocking and reports', () => {
  it('blocking hides both people from each other and stops messages', async () => {
    const a = await client({ ip: '203.0.113.70' });
    const b = await client({ ip: '203.0.113.70' });
    await a.connect();
    await b.connect();
    const goneForA = a.next('peer_left');
    const goneForB = b.next('peer_left');
    a.send({ t: 'block', id: b.id, on: true });
    expect((await goneForA).id).toBe(b.id);
    expect((await goneForB).id).toBe(a.id);
    const st = b.next('dm_status');
    b.send({ t: 'dm', mid: 'b1', to: a.id, ...encryptDm({ kind: 'wave' }, a.identity.boxPk, b.identity) });
    expect((await st).status).toBe('offline'); // блокировка не раскрывается
  });

  it('block list from the device applies on connect', async () => {
    const a = await client({ ip: '203.0.113.71' });
    await a.connect();
    const b = await client({ ip: '203.0.113.71', blocked: [a.id] });
    expect((await b.connect()).peers).toEqual([]);
    await a.expectNo('peer');
  });

  it('enough distinct reports temporarily ban the user', async () => {
    const bad = await client({ ip: '203.0.113.72' });
    const r1 = await client({ ip: '203.0.113.72' });
    const r2 = await client({ ip: '203.0.113.72' });
    const outsider = await client({ ip: '198.51.100.72' });
    await bad.connect();
    await r1.connect();
    await r2.connect();
    await outsider.connect();
    outsider.send({ t: 'report', id: bad.id, reason: 'spam' }); // не видит — не считается
    r1.send({ t: 'report', id: bad.id, reason: 'harassment' });
    r1.send({ t: 'report', id: bad.id, reason: 'harassment' }); // повтор не считается
    await bad.expectNo('pong', 100);
    expect(bad.closeCode).toBeNull();
    r2.send({ t: 'report', id: bad.id, reason: 'spam' });
    expect(await bad.waitClose()).toBe(CLOSE_CODES.banned);

    const again = await client({ ip: '203.0.113.72', identity: bad.identity });
    const err = again.next('error');
    await again.connect().catch(() => undefined);
    expect((await err).code).toBe('banned');
  });
});

describe('map', () => {
  const moscow = { lat: 55.751244, lon: 37.618423 };
  const bbox = [37.5, 55.7, 37.7, 55.8];

  it('shows only people who opted in, with coarse location, to people who opted in', async () => {
    const mapA = await client({ ip: '203.0.113.80', visibility: { mode: 'map', precision: 'block' } });
    const mapB = await client({ ip: '198.51.100.80', visibility: { mode: 'map', precision: 'area' } });
    const zoneOnly = await client({ ip: '192.0.2.80' });
    await mapA.connect();
    await mapB.connect();
    await zoneOnly.connect();

    mapA.send({ t: 'location', ...moscow });
    zoneOnly.send({ t: 'location', ...moscow });
    const notAllowed = zoneOnly.next('error');
    expect((await notAllowed).code).toBe('map_requires_sharing');

    const res = mapB.next('map');
    mapB.send({ t: 'map_query', bbox });
    const { people } = await res;
    expect(people.map((p) => p.id)).toEqual([mapA.id]);
    expect(people[0]!.lat).not.toBe(moscow.lat);
    expect(Math.abs(people[0]!.lat - moscow.lat)).toBeLessThan(0.003);
    expect(people[0]).not.toHaveProperty('photo');

    // нельзя смотреть людей на карте, не показываясь самому
    const denied = zoneOnly.next('error');
    zoneOnly.send({ t: 'map_query', bbox });
    expect((await denied).code).toBe('map_requires_sharing');

    // а написать человеку с карты можно
    const st = mapB.next('dm_status');
    mapB.send({ t: 'dm', mid: 'm', to: mapA.id, ...encryptDm({ kind: 'wave' }, mapA.identity.boxPk, mapB.identity) });
    expect((await st).status).toBe('delivered');

    // ушёл с карты — пропал из выдачи
    mapA.send({ t: 'visibility', visibility: { mode: 'zone', precision: 'block' } });
    await mapA.next('peers');
    const res2 = mapB.next('map');
    mapB.send({ t: 'map_query', bbox });
    expect((await res2).people).toEqual([]);
  });

  it('rejects huge areas', async () => {
    const m = await client({ ip: '203.0.113.81', visibility: { mode: 'map', precision: 'area' } });
    await m.connect();
    const err = m.next('error');
    m.send({ t: 'map_query', bbox: [-100, -50, 100, 50] });
    expect((await err).code).toBe('bad_message');
  });
});

describe('rate limiting', () => {
  it('throttles floods', async () => {
    const c = await client({ ip: '203.0.113.90' });
    await c.connect();
    const limited = c.next('error', (m) => m.code === 'rate_limited');
    for (let i = 0; i < 60; i++) c.send({ t: 'ping' });
    expect((await limited).code).toBe('rate_limited');
    const pongs = c.messages.filter((m: ServerMessage) => m.t === 'pong').length;
    expect(pongs).toBeLessThanOrEqual(31);
  });
});
