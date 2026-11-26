import WebSocket from 'ws';
import {
  generateIdentity,
  hashSsid,
  signChallenge,
  type Hello,
  type Identity,
  type NetType,
  type Profile,
  type ServerMessage,
  type Visibility,
} from '@ryadom/shared';
import { buildApp, type App } from '../src/app';
import { loadConfig } from '../src/config';

export async function startServer(overrides: Record<string, string> = {}): Promise<App & { url: string }> {
  const config = loadConfig({
    DB_PATH: ':memory:',
    TRUST_PROXY: 'true',
    LOG: 'false',
    STATIC_DIR: '/nonexistent',
    ...overrides,
  });
  const built = await buildApp(config);
  const address = await built.app.listen({ port: 0, host: '127.0.0.1' });
  return { ...built, url: address };
}

export const baseProfile = (nickname: string, extra: Partial<Profile> = {}): Profile => ({
  nickname,
  avatar: { emoji: '🙂', color: '#3366ff' },
  interests: ['chat'],
  tags: [],
  ...extra,
});

export interface ClientOptions {
  ip: string;
  ssid?: string | null;
  netType?: NetType;
  profile?: Profile;
  visibility?: Visibility;
  blocked?: string[];
  contacts?: string[];
  identity?: Identity;
  /** испортить подпись */
  badSig?: boolean;
}

/** Тестовый клиент: подключается, проходит рукопожатие, копит входящие сообщения. */
export class TestClient {
  readonly identity: Identity;
  readonly messages: ServerMessage[] = [];
  private waiters: { pred: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }[] = [];
  ws!: WebSocket;
  closeCode: number | null = null;

  constructor(
    private readonly url: string,
    private readonly opts: ClientOptions,
  ) {
    this.identity = opts.identity ?? generateIdentity();
  }

  get id(): string {
    return this.identity.id;
  }

  async connect(): Promise<Extract<ServerMessage, { t: 'welcome' }>> {
    this.ws = new WebSocket(`${this.url.replace('http', 'ws')}/ws`, {
      headers: { 'x-forwarded-for': this.opts.ip },
    });
    this.ws.on('message', (data) => {
      const msg = JSON.parse(data.toString()) as ServerMessage;
      this.messages.push(msg);
      for (const w of [...this.waiters]) {
        if (w.pred(msg)) {
          this.waiters.splice(this.waiters.indexOf(w), 1);
          w.resolve(msg);
        }
      }
    });
    this.ws.on('close', (code) => (this.closeCode = code));
    const challenge = (await this.next('challenge')) as Extract<ServerMessage, { t: 'challenge' }>;
    const ssid = this.opts.ssid === undefined ? 'Cafe' : this.opts.ssid;
    const hello: Hello = {
      t: 'hello',
      v: 1,
      id: this.identity.id,
      boxPk: this.identity.boxPk,
      keySig: this.identity.keySig,
      sig: this.opts.badSig ? signChallenge(this.identity, 'wrong') : signChallenge(this.identity, challenge.challenge),
      net: { type: this.opts.netType ?? 'wifi', ssidHash: ssid ? hashSsid(ssid) : null },
      profile: this.opts.profile ?? baseProfile('user'),
      visibility: this.opts.visibility ?? { mode: 'zone', precision: 'area' },
      blocked: this.opts.blocked ?? [],
      contacts: this.opts.contacts ?? [],
    };
    this.send(hello);
    return (await this.next('welcome')) as Extract<ServerMessage, { t: 'welcome' }>;
  }

  send(msg: unknown): void {
    this.ws.send(JSON.stringify(msg));
  }

  /** Ждёт сообщение, пришедшее ПОСЛЕ вызова (или уже лежащее в очереди, если fromStart). */
  next<T extends ServerMessage['t']>(
    t: T,
    pred: (m: Extract<ServerMessage, { t: T }>) => boolean = () => true,
    timeoutMs = 2000,
  ): Promise<Extract<ServerMessage, { t: T }>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${t}`)), timeoutMs);
      this.waiters.push({
        pred: (m) => m.t === t && pred(m as Extract<ServerMessage, { t: T }>),
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m as Extract<ServerMessage, { t: T }>);
        },
      });
    });
  }

  /** Убедиться, что сообщение такого типа НЕ приходит в течение ms. */
  async expectNo(t: ServerMessage['t'], ms = 150): Promise<void> {
    const before = this.messages.length;
    await new Promise((r) => setTimeout(r, ms));
    const got = this.messages.slice(before).filter((m) => m.t === t);
    if (got.length) throw new Error(`unexpected ${t}: ${JSON.stringify(got[0])}`);
  }

  waitClose(timeoutMs = 2000): Promise<number> {
    if (this.closeCode !== null) return Promise.resolve(this.closeCode);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout waiting for close')), timeoutMs);
      this.ws.once('close', (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });
  }

  close(): void {
    this.ws.close();
  }
}

export async function api<T = unknown>(
  url: string,
  method: string,
  path: string,
  body?: unknown,
  token?: string,
  ip = '198.51.100.1',
): Promise<{ status: number; body: T }> {
  const res = await fetch(url + path, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      'x-forwarded-for': ip,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}
