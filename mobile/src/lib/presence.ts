// WebSocket-клиент сервера присутствия с переподключением.
import { CLOSE_CODES, type ClientMessage, type Hello, type ServerMessage } from '@ryadom/shared';

export type ConnStatus = 'idle' | 'connecting' | 'online' | 'offline' | 'banned';

export interface PresenceHandlers {
  url(): string;
  /** null — подключаться пока нельзя (нет профиля) */
  buildHello(challenge: string): Hello | null;
  onMessage(msg: ServerMessage): void;
  onStatus(status: ConnStatus, message?: string): void;
}

const PING_MS = 25_000;

export class PresenceClient {
  private ws: WebSocket | null = null;
  private retry = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private ready = false;

  constructor(private readonly h: PresenceHandlers) {}

  get online(): boolean {
    return this.ready;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.open();
  }

  stop(): void {
    this.running = false;
    this.cleanup();
    const ws = this.ws;
    this.ws = null;
    this.ready = false;
    ws?.close(1000, 'client stop');
    this.h.onStatus('idle');
  }

  restart(): void {
    this.stop();
    this.retry = 0;
    this.start();
  }

  send(msg: ClientMessage): boolean {
    if (!this.ws || !this.ready || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  private cleanup(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.reconnectTimer = null;
    this.pingTimer = null;
  }

  private open(): void {
    this.cleanup();
    this.h.onStatus('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.h.url());
    } catch (e) {
      this.h.onStatus('offline', `Неверный адрес сервера: ${String(e)}`);
      return this.scheduleReconnect();
    }
    this.ws = ws;

    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(ev.data)) as ServerMessage;
      } catch {
        return;
      }
      if (msg.t === 'challenge') {
        const hello = this.h.buildHello(msg.challenge);
        if (!hello) return ws.close(1000, 'no profile');
        ws.send(JSON.stringify(hello));
        return;
      }
      if (msg.t === 'welcome') {
        this.ready = true;
        this.retry = 0;
        this.h.onStatus('online');
        this.pingTimer = setInterval(() => this.send({ t: 'ping' }), PING_MS);
      }
      this.h.onMessage(msg);
    };

    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.ready = false;
      this.cleanup();
      if (ev.code === CLOSE_CODES.banned) {
        this.running = false;
        return this.h.onStatus('banned', 'Из-за жалоб доступ временно ограничен.');
      }
      if (ev.code === CLOSE_CODES.replaced) {
        this.running = false;
        return this.h.onStatus('offline', 'Приложение открыто на другом устройстве с этим профилем.');
      }
      if (!this.running) return;
      this.h.onStatus('offline', 'Нет связи с сервером, переподключаемся…');
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      /* закрытие обработает onclose */
    };
  }

  private scheduleReconnect(): void {
    if (!this.running) return;
    const delay = Math.min(30_000, 1000 * 2 ** this.retry) * (0.7 + Math.random() * 0.6);
    this.retry = Math.min(this.retry + 1, 6);
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }
}
