import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  credentialsSchema,
  describeNetworkKey,
  eventInputSchema,
  hashSsid,
  isBBoxValid,
  networkInputSchema,
  networkKeyFromIp,
  networkKeyFromUserInput,
  venueInputSchema,
  type AuthResponse,
  type BBox,
  type PublicVenuesResponse,
  type WhoAmIResponse,
} from '@ryadom/shared';
import { AttemptLimiter, SESSION_TTL_MS, bearer, hashPassword, hashToken, newToken, requireAccount, verifyPassword } from './auth';
import { HttpError, notFound, parseBody } from './errors';
import type { Hub } from './presence/hub';
import type { Store } from './store';

type IdParams = { id: string };

export function registerRoutes(app: FastifyInstance, store: Store, hub: Hub): void {
  const loginByIp = new AttemptLimiter(30, 15 * 60 * 1000);
  const loginByEmail = new AttemptLimiter(10, 15 * 60 * 1000);

  const issueSession = (accountId: string): string => {
    const token = newToken();
    store.createSession(hashToken(token), accountId, Date.now() + SESSION_TTL_MS);
    return token;
  };

  // ── Авторизация ──────────────────────────────────────────────────────────

  app.post('/api/auth/register', async (req, reply) => {
    loginByIp.check(`reg:${req.ip}`);
    const { email, password } = parseBody(credentialsSchema, req.body);
    const account = store.createAccount(email.toLowerCase(), await hashPassword(password));
    if (account === 'exists') throw new HttpError(409, 'conflict', 'Этот e-mail уже зарегистрирован');
    const body: AuthResponse = { token: issueSession(account.id), account };
    return reply.code(201).send(body);
  });

  app.post('/api/auth/login', async (req) => {
    const { email, password } = parseBody(credentialsSchema, req.body);
    loginByIp.check(`ip:${req.ip}`);
    loginByEmail.check(`email:${email.toLowerCase()}`);
    const acc = store.findAccountByEmail(email.toLowerCase());
    if (!acc || !(await verifyPassword(password, acc.passwordHash))) {
      throw new HttpError(401, 'unauthorized', 'Неверный e-mail или пароль');
    }
    const body: AuthResponse = { token: issueSession(acc.id), account: { id: acc.id, email: acc.email } };
    return body;
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const token = bearer(req);
    if (token) store.deleteSession(hashToken(token));
    return reply.code(204).send();
  });

  app.get('/api/auth/me', async (req) => ({ account: requireAccount(store, req) }));

  // ── Кабинет ──────────────────────────────────────────────────────────────

  const ownVenue = (req: FastifyRequest<{ Params: IdParams }>) => {
    const account = requireAccount(store, req);
    const venue = store.ownedVenue(account.id, req.params.id);
    if (!venue) throw notFound();
    return venue;
  };

  app.get('/api/cabinet/venues', async (req) => ({ venues: store.listVenues(requireAccount(store, req).id) }));

  app.post('/api/cabinet/venues', async (req, reply) => {
    const account = requireAccount(store, req);
    const venue = store.createVenue(account.id, parseBody(venueInputSchema, req.body));
    return reply.code(201).send(venue);
  });

  app.get<{ Params: IdParams }>('/api/cabinet/venues/:id', async (req) => ownVenue(req));

  app.put<{ Params: IdParams }>('/api/cabinet/venues/:id', async (req) => {
    const venue = ownVenue(req);
    const input = parseBody(venueInputSchema, req.body);
    store.updateVenue(venue.id, input);
    hub.refreshVenues();
    return { ...venue, ...input };
  });

  app.delete<{ Params: IdParams }>('/api/cabinet/venues/:id', async (req, reply) => {
    store.deleteVenue(ownVenue(req).id);
    hub.refreshVenues();
    return reply.code(204).send();
  });

  app.get<{ Params: IdParams }>('/api/cabinet/venues/:id/networks', async (req) => ({
    networks: store.listNetworks(ownVenue(req).id),
  }));

  app.post<{ Params: IdParams }>('/api/cabinet/venues/:id/networks', async (req, reply) => {
    const venue = ownVenue(req);
    const input = parseBody(networkInputSchema, req.body);
    const key = input.address ? networkKeyFromUserInput(input.address) : networkKeyFromIp(req.ip);
    if (!key) {
      throw new HttpError(400, 'validation', 'Не удалось распознать адрес сети', [
        { path: 'address', message: 'Укажите IPv4-адрес, IPv6-префикс /64 или частную подсеть /24' },
      ]);
    }
    const net = store.createNetwork(venue.id, input.ssid, input.ssid ? hashSsid(input.ssid) : null, key);
    if (net === 'conflict') {
      throw new HttpError(409, 'conflict', 'Эта сеть (адрес + SSID) уже привязана к заведению');
    }
    hub.refreshVenues();
    return reply.code(201).send(net);
  });

  app.delete<{ Params: IdParams & { networkId: string } }>(
    '/api/cabinet/venues/:id/networks/:networkId',
    async (req, reply) => {
      if (!store.deleteNetwork(ownVenue(req).id, req.params.networkId)) throw notFound();
      hub.refreshVenues();
      return reply.code(204).send();
    },
  );

  app.get<{ Params: IdParams }>('/api/cabinet/venues/:id/events', async (req) => ({
    events: store.listEvents(ownVenue(req).id),
  }));

  app.post<{ Params: IdParams }>('/api/cabinet/venues/:id/events', async (req, reply) => {
    const ev = store.createEvent(ownVenue(req).id, parseBody(eventInputSchema, req.body));
    hub.refreshVenues();
    return reply.code(201).send(ev);
  });

  app.put<{ Params: IdParams & { eventId: string } }>('/api/cabinet/venues/:id/events/:eventId', async (req) => {
    const ev = store.updateEvent(ownVenue(req).id, req.params.eventId, parseBody(eventInputSchema, req.body));
    if (!ev) throw notFound();
    hub.refreshVenues();
    return ev;
  });

  app.delete<{ Params: IdParams & { eventId: string } }>(
    '/api/cabinet/venues/:id/events/:eventId',
    async (req, reply) => {
      if (!store.deleteEvent(ownVenue(req).id, req.params.eventId)) throw notFound();
      hub.refreshVenues();
      return reply.code(204).send();
    },
  );

  app.get<{ Params: IdParams }>('/api/cabinet/venues/:id/stats', async (req) => hub.venueStats(ownVenue(req).id));

  // ── Публичные ────────────────────────────────────────────────────────────

  app.get('/api/whoami', async (req): Promise<WhoAmIResponse> => {
    const key = networkKeyFromIp(req.ip);
    return { networkKey: key, addressLabel: key ? describeNetworkKey(key) : null };
  });

  app.get<{ Querystring: { bbox?: string } }>('/api/venues', async (req): Promise<PublicVenuesResponse> => {
    const parts = (req.query.bbox ?? '').split(',').map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n)) || !isBBoxValid(parts as BBox)) {
      throw new HttpError(400, 'validation', 'Параметр bbox: minLon,minLat,maxLon,maxLat (не больше 2°×4°)');
    }
    return { venues: store.publicVenuesInBBox(parts as BBox, Date.now()) };
  });

  app.get<{ Params: IdParams }>('/api/venues/:id', async (req) => {
    const v = store.publicVenue(req.params.id, Date.now());
    if (!v) throw notFound();
    return v;
  });

  app.get('/api/health', async () => ({ ok: true, online: hub.size }));
}
