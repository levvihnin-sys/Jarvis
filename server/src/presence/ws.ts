import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import {
  CLOSE_CODES,
  WS_PATH,
  clientMessageSchema,
  networkKeyFromIp,
  randomToken,
  verifyChallenge,
  verifyKeySig,
  type ClientMessage,
  type ServerMessage,
} from '@ryadom/shared';
import type { Client, Conn, Hub } from './hub';

const HELLO_TIMEOUT_MS = 10_000;
const HEARTBEAT_MS = 30_000;
const MAX_VIOLATIONS = 50;

/** Ведро токенов: capacity запросов «залпом», refillPerSec — устойчивая скорость. */
export class TokenBucket {
  private tokens: number;
  private last = Date.now();
  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
  ) {
    this.tokens = capacity;
  }
  take(cost = 1): boolean {
    const now = Date.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 1000) * this.refillPerSec);
    this.last = now;
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }
}

const COST: Partial<Record<ClientMessage['t'], number>> = {
  profile: 5,
  map_query: 4,
  visibility: 3,
  location: 2,
  report: 5,
};

type LiveSocket = WebSocket & { isAlive?: boolean };

export function registerPresence(app: FastifyInstance, hub: Hub): void {
  const heartbeat = setInterval(() => {
    for (const ws of app.websocketServer.clients as Set<LiveSocket>) {
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_MS);
  heartbeat.unref();
  app.addHook('onClose', async () => clearInterval(heartbeat));

  app.get(WS_PATH, { websocket: true }, (socket: LiveSocket, req) => {
    socket.isAlive = true;
    socket.on('pong', () => (socket.isAlive = true));

    const networkKey = networkKeyFromIp(req.ip) ?? `raw:${req.ip}`;
    const challenge = randomToken(24);
    const bucket = new TokenBucket(30, 3);
    let violations = 0;
    let client: Client | null = null;

    const conn: Conn = {
      send(msg: ServerMessage) {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
      },
      close(code, reason) {
        socket.close(code, reason);
      },
    };
    const fail = (m: Extract<ServerMessage, { t: 'error' }>) => conn.send(m);

    conn.send({ t: 'challenge', challenge, time: Date.now() });
    const helloTimer = setTimeout(() => {
      if (!client) socket.close(CLOSE_CODES.helloTimeout, 'hello timeout');
    }, HELLO_TIMEOUT_MS);

    socket.on('message', (data, isBinary) => {
      if (isBinary) return socket.close(CLOSE_CODES.abuse, 'binary not supported');
      let raw: unknown;
      try {
        raw = JSON.parse(data.toString());
      } catch {
        return fail({ t: 'error', code: 'bad_message', message: 'Некорректный JSON' });
      }
      const parsed = clientMessageSchema.safeParse(raw);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        return fail({
          t: 'error',
          code: 'bad_message',
          message: `Некорректное сообщение: ${issue?.path.join('.') ?? ''} ${issue?.message ?? ''}`.trim(),
        });
      }
      const msg = parsed.data;

      if (!client) {
        if (msg.t !== 'hello') return fail({ t: 'error', code: 'not_ready', message: 'Сначала hello' });
        if (!verifyChallenge(msg.id, challenge, msg.sig) || !verifyKeySig(msg.id, msg.boxPk, msg.keySig)) {
          fail({ t: 'error', code: 'bad_signature', message: 'Подпись не прошла проверку' });
          return socket.close(CLOSE_CODES.badHello, 'bad signature');
        }
        const res = hub.join(conn, msg, networkKey);
        if ('error' in res) {
          fail({ t: 'error', code: res.error, message: 'Доступ временно ограничен из-за жалоб' });
          return socket.close(CLOSE_CODES.banned, res.error);
        }
        client = res;
        clearTimeout(helloTimer);
        return;
      }

      if (msg.t === 'hello') return fail({ t: 'error', code: 'bad_message', message: 'Повторный hello' });
      if (!bucket.take(COST[msg.t] ?? 1)) {
        if (++violations > MAX_VIOLATIONS) return socket.close(CLOSE_CODES.abuse, 'rate limit');
        return fail({ t: 'error', code: 'rate_limited', message: 'Слишком часто, подождите немного' });
      }
      try {
        hub.handle(client, msg);
      } catch (e) {
        req.log.error(e, 'presence handler failed');
        fail({ t: 'error', code: 'internal', message: 'Внутренняя ошибка' });
      }
    });

    socket.on('close', () => {
      clearTimeout(helloTimer);
      if (client) hub.leave(client);
    });
    socket.on('error', (e) => req.log.warn(e, 'socket error'));
  });
}
