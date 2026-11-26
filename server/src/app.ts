import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import type { ApiError } from '@ryadom/shared';
import type { Config } from './config';
import { HttpError } from './errors';
import { Hub } from './presence/hub';
import { registerPresence } from './presence/ws';
import { registerRoutes } from './routes';
import { Store } from './store';

export interface App {
  app: FastifyInstance;
  hub: Hub;
  store: Store;
}

export async function buildApp(config: Config): Promise<App> {
  const store = new Store(config.dbPath);
  const app = Fastify({
    logger: config.logger ? { level: 'info' } : false,
    trustProxy: config.trustProxy,
    bodyLimit: 64 * 1024,
  });

  const hub = new Hub({
    zoneSecret: config.zoneSecret,
    mapReciprocal: config.mapReciprocal,
    minGroup: config.minGroup,
    reportThreshold: config.reportThreshold,
    banMs: config.banHours * 3600 * 1000,
    resolveVenue: (key, ssidHash) => store.resolveVenue(key, ssidHash, Date.now()),
    onReport: (r) => app.log.warn({ report: r }, r.banned ? 'user banned after reports' : 'user reported'),
  });

  // Токен передаётся заголовком, не cookie, поэтому открытый CORS не даёт CSRF.
  await app.register(cors, { origin: true, methods: ['GET', 'POST', 'PUT', 'DELETE'] });
  await app.register(websocket, { options: { maxPayload: 256 * 1024 } });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) {
      const body: ApiError = { error: err.code, message: err.message, issues: err.issues };
      return reply.code(err.status).send(body);
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) app.log.error(err);
    const body: ApiError = {
      error: status === 400 ? 'validation' : status === 404 ? 'not_found' : 'internal',
      message: status >= 500 ? 'Внутренняя ошибка сервера' : (err as Error).message,
    };
    return reply.code(status).send(body);
  });

  registerRoutes(app, store, hub);
  registerPresence(app, hub);

  if (config.staticDir) {
    await app.register(fastifyStatic, { root: config.staticDir, prefix: '/cabinet/' });
    app.get('/', (_req, reply) => reply.redirect('/cabinet/'));
  }

  app.addHook('onClose', async () => {
    hub.shutdown();
    store.close();
  });

  return { app, hub, store };
}
