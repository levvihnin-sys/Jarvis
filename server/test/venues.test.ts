import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AuthResponse, PublicVenue, Venue, VenueEvent, VenueNetwork, VenueStats } from '@ryadom/shared';
import { api, baseProfile, startServer, TestClient } from './helpers';

type Srv = Awaited<ReturnType<typeof startServer>>;
let srv: Srv;
const clients: TestClient[] = [];

beforeEach(async () => {
  srv = await startServer();
});
afterEach(async () => {
  for (const c of clients.splice(0)) c.close();
  await srv.app.close();
});

const VENUE_IP = '203.0.113.200';
const venueInput = {
  name: 'Кофейня «Зерно»',
  category: 'cafe',
  description: 'Настолки по пятницам',
  address: 'Москва, Тверская 1',
  lat: 55.7577,
  lon: 37.6136,
  published: true,
};

async function owner(email = 'owner@example.com') {
  const r = await api<AuthResponse>(srv.url, 'POST', '/api/auth/register', { email, password: 'secret-123' });
  expect(r.status).toBe(201);
  return r.body.token;
}

describe('auth', () => {
  it('register, login, me, logout', async () => {
    const token = await owner();
    expect((await api(srv.url, 'GET', '/api/auth/me', undefined, token)).status).toBe(200);
    const dup = await api(srv.url, 'POST', '/api/auth/register', { email: 'OWNER@example.com', password: 'secret-123' });
    expect(dup.status).toBe(409);
    const bad = await api(srv.url, 'POST', '/api/auth/login', { email: 'owner@example.com', password: 'wrong-pass' });
    expect(bad.status).toBe(401);
    const ok = await api<AuthResponse>(srv.url, 'POST', '/api/auth/login', {
      email: 'owner@example.com',
      password: 'secret-123',
    });
    expect(ok.status).toBe(200);
    expect((await api(srv.url, 'POST', '/api/auth/logout', undefined, ok.body.token)).status).toBe(204);
    expect((await api(srv.url, 'GET', '/api/auth/me', undefined, ok.body.token)).status).toBe(401);
  });

  it('validation errors list fields', async () => {
    const r = await api<{ error: string; issues: { path: string }[] }>(srv.url, 'POST', '/api/auth/register', {
      email: 'nope',
      password: '1',
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('validation');
    expect(r.body.issues.map((i) => i.path).sort()).toEqual(['email', 'password']);
  });

  it('cabinet requires a token and isolates accounts', async () => {
    expect((await api(srv.url, 'GET', '/api/cabinet/venues')).status).toBe(401);
    const t1 = await owner('a@example.com');
    const t2 = await owner('b@example.com');
    const v = await api<Venue>(srv.url, 'POST', '/api/cabinet/venues', venueInput, t1);
    expect(v.status).toBe(201);
    expect((await api(srv.url, 'GET', `/api/cabinet/venues/${v.body.id}`, undefined, t2)).status).toBe(404);
    expect((await api(srv.url, 'DELETE', `/api/cabinet/venues/${v.body.id}`, undefined, t2)).status).toBe(404);
  });
});

describe('venue lifecycle', () => {
  it('binds Wi‑Fi from the owner’s current connection; guests see the venue and its events live', async () => {
    const token = await owner();
    const { body: venue } = await api<Venue>(srv.url, 'POST', '/api/cabinet/venues', venueInput, token);

    // гость уже сидит в кафе до того, как владелец настроил сеть
    const guest = new TestClient(srv.url, { ip: VENUE_IP, ssid: 'Zerno-Free', profile: baseProfile('Гость') });
    clients.push(guest);
    const w = await guest.connect();
    expect(w.zone.venue).toBeNull();

    const zoneUpdate = guest.next('zone');
    const net = await api<VenueNetwork>(
      srv.url,
      'POST',
      `/api/cabinet/venues/${venue.id}/networks`,
      { ssid: 'Zerno-Free', address: null },
      token,
      VENUE_IP,
    );
    expect(net.status).toBe(201);
    expect(net.body.addressLabel).toBe(VENUE_IP);
    expect((await zoneUpdate).zone.venue?.name).toBe('Кофейня «Зерно»');

    const now = Date.now();
    const evUpdate = guest.next('zone');
    const ev = await api<VenueEvent>(
      srv.url,
      'POST',
      `/api/cabinet/venues/${venue.id}/events`,
      { title: 'Турнир по «Каркассону»', description: '', startsAt: now + 3600e3, endsAt: now + 3 * 3600e3, interests: ['play'] },
      token,
    );
    expect(ev.status).toBe(201);
    expect((await evUpdate).zone.venue?.events.map((e) => e.title)).toEqual(['Турнир по «Каркассону»']);

    // новый гость получает заведение сразу в welcome
    const g2 = new TestClient(srv.url, { ip: VENUE_IP, ssid: 'Zerno-Free' });
    clients.push(g2);
    expect((await g2.connect()).zone.venue?.id).toBe(venue.id);

    // другой SSID за тем же адресом — не гость заведения
    const neighbour = new TestClient(srv.url, { ip: VENUE_IP, ssid: 'Office-Upstairs' });
    clients.push(neighbour);
    expect((await neighbour.connect()).zone.venue).toBeNull();

    // та же сеть второй раз — конфликт
    const dup = await api(srv.url, 'POST', `/api/cabinet/venues/${venue.id}/networks`, { ssid: 'Zerno-Free', address: VENUE_IP }, token);
    expect(dup.status).toBe(409);

    // снятие с публикации убирает заведение у гостей
    const hidden = guest.next('zone');
    await api(srv.url, 'PUT', `/api/cabinet/venues/${venue.id}`, { ...venueInput, published: false }, token);
    expect((await hidden).zone.venue).toBeNull();
  });

  it('rejects bad events and unparseable addresses', async () => {
    const token = await owner();
    const { body: venue } = await api<Venue>(srv.url, 'POST', '/api/cabinet/venues', venueInput, token);
    const now = Date.now();
    const r = await api(srv.url, 'POST', `/api/cabinet/venues/${venue.id}/events`, { title: 'X1', description: '', startsAt: now, endsAt: now - 1, interests: [] }, token);
    expect(r.status).toBe(400);
    const n = await api(srv.url, 'POST', `/api/cabinet/venues/${venue.id}/networks`, { ssid: null, address: 'not-an-ip' }, token);
    expect(n.status).toBe(400);
  });

  it('public map endpoint returns published venues with upcoming events only', async () => {
    const token = await owner();
    const { body: v1 } = await api<Venue>(srv.url, 'POST', '/api/cabinet/venues', venueInput, token);
    await api<Venue>(srv.url, 'POST', '/api/cabinet/venues', { ...venueInput, name: 'Черновик', published: false }, token);
    await api<Venue>(srv.url, 'POST', '/api/cabinet/venues', { ...venueInput, name: 'Поезд 024', category: 'train', lat: null, lon: null }, token);
    const now = Date.now();
    await api(srv.url, 'POST', `/api/cabinet/venues/${v1.id}/events`, { title: 'Прошло', description: '', startsAt: now - 7200e3, endsAt: now - 3600e3, interests: [] }, token);
    await api(srv.url, 'POST', `/api/cabinet/venues/${v1.id}/events`, { title: 'Идёт сейчас', description: '', startsAt: now - 600e3, endsAt: now + 3600e3, interests: ['chat'] }, token);

    const r = await api<{ venues: PublicVenue[] }>(srv.url, 'GET', '/api/venues?bbox=37.5,55.7,37.7,55.8');
    expect(r.status).toBe(200);
    expect(r.body.venues.map((v) => v.name)).toEqual(['Кофейня «Зерно»']);
    expect(r.body.venues[0]!.events.map((e) => e.title)).toEqual(['Идёт сейчас']);

    expect((await api(srv.url, 'GET', '/api/venues?bbox=0,0,90,90')).status).toBe(400);
    expect((await api(srv.url, 'GET', `/api/venues/${v1.id}`)).status).toBe(200);
  });

  it('stats are k-anonymous', async () => {
    const token = await owner();
    const { body: venue } = await api<Venue>(srv.url, 'POST', '/api/cabinet/venues', venueInput, token);
    await api(srv.url, 'POST', `/api/cabinet/venues/${venue.id}/networks`, { ssid: null, address: VENUE_IP }, token);
    const stats = () => api<VenueStats>(srv.url, 'GET', `/api/cabinet/venues/${venue.id}/stats`, undefined, token);

    const g = (interests: ('flirt' | 'chat' | 'play')[]) => {
      const c = new TestClient(srv.url, { ip: VENUE_IP, profile: baseProfile('g', { interests }) });
      clients.push(c);
      return c.connect();
    };
    await g(['flirt']);
    await g(['chat']);
    expect((await stats()).body).toMatchObject({ online: null, interests: null, minGroup: 3 });
    await g(['chat', 'play']);
    await g(['chat']);
    const s = (await stats()).body;
    expect(s.online).toBe(4);
    expect(s.interests).toEqual({ chat: 3 }); // flirt=1 и play=1 скрыты
  });

  it('whoami reports the requester network', async () => {
    const r = await api<{ addressLabel: string }>(srv.url, 'GET', '/api/whoami', undefined, undefined, '2001:db8:5:6::1');
    expect(r.body.addressLabel).toBe('2001:db8:5:6::/64');
  });
});
