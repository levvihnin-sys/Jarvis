// Типизированный клиент REST API кабинета (контракт — docs/API.md и shared/src/api.ts).
import type {
  Account,
  ApiError,
  AuthResponse,
  Credentials,
  EventInput,
  NetworkInput,
  Venue,
  VenueEvent,
  VenueInput,
  VenueNetwork,
  VenueStats,
  WhoAmIResponse,
} from '@ryadom/shared';

const TOKEN_KEY = 'ryadom.cabinet.token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // приватный режим / запрещённое хранилище — живём без запоминания входа
  }
}

/** Ошибка запроса: HTTP-статус + тело ApiError от сервера. status 0 — нет связи. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly body: ApiError;

  constructor(status: number, body: ApiError) {
    super(body.message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.body = body;
  }

  /** Первая ошибка по каждому полю: { name: '...', lat: '...' } */
  get fields(): FieldErrors {
    const out: FieldErrors = {};
    for (const issue of this.body.issues ?? []) {
      const key = issue.path || '_';
      if (!(key in out)) out[key] = issue.message;
    }
    return out;
  }
}

export type FieldErrors = Record<string, string>;

let unauthorizedHandler: (() => void) | null = null;

/** Вызывается, когда сервер отверг токен (401) — приложение возвращает на экран входа. */
export function onUnauthorized(fn: (() => void) | null): void {
  unauthorizedHandler = fn;
}

const STATUS_MESSAGES: Record<number, string> = {
  400: 'Проверьте поля',
  401: 'Нужно войти заново',
  403: 'Нет доступа',
  404: 'Не найдено',
  409: 'Конфликт данных',
  429: 'Слишком много попыток. Подождите немного',
};

function isApiError(x: unknown): x is ApiError {
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof (x as ApiError).error === 'string' &&
    typeof (x as ApiError).message === 'string'
  );
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

/**
 * auth: true — токен из хранилища (401 → выход на экран входа),
 * строка — явный токен (без реакции на 401), false — без токена.
 */
async function request<T>(
  method: Method,
  path: string,
  body?: unknown,
  auth: boolean | string = true,
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = typeof auth === 'string' ? auth : auth ? getToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiRequestError(0, {
      error: 'network',
      message: 'Нет связи с сервером. Проверьте подключение и попробуйте ещё раз.',
    });
  }

  const text = res.status === 204 ? '' : await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const err: ApiError = isApiError(data)
      ? data
      : {
          error: `http_${res.status}`,
          message: STATUS_MESSAGES[res.status] ?? `Ошибка сервера (${res.status})`,
        };
    if (res.status === 401 && auth === true && token) {
      setToken(null);
      unauthorizedHandler?.();
    }
    throw new ApiRequestError(res.status, err);
  }
  return data as T;
}

const enc = encodeURIComponent;
const venuePath = (id: string) => `/api/cabinet/venues/${enc(id)}`;

export const api = {
  register: (c: Credentials) => request<AuthResponse>('POST', '/api/auth/register', c, false),
  login: (c: Credentials) => request<AuthResponse>('POST', '/api/auth/login', c, false),
  logout: (token: string) => request<void>('POST', '/api/auth/logout', undefined, token),
  me: () => request<{ account: Account }>('GET', '/api/auth/me').then((r) => r.account),
  whoami: () => request<WhoAmIResponse>('GET', '/api/whoami', undefined, false),

  venues: () => request<{ venues: Venue[] }>('GET', '/api/cabinet/venues').then((r) => r.venues),
  venue: (id: string) => request<Venue>('GET', venuePath(id)),
  createVenue: (v: VenueInput) => request<Venue>('POST', '/api/cabinet/venues', v),
  updateVenue: (id: string, v: VenueInput) => request<Venue>('PUT', venuePath(id), v),
  deleteVenue: (id: string) => request<void>('DELETE', venuePath(id)),

  networks: (id: string) =>
    request<{ networks: VenueNetwork[] }>('GET', `${venuePath(id)}/networks`).then((r) => r.networks),
  addNetwork: (id: string, n: NetworkInput) =>
    request<VenueNetwork>('POST', `${venuePath(id)}/networks`, n),
  deleteNetwork: (id: string, networkId: string) =>
    request<void>('DELETE', `${venuePath(id)}/networks/${enc(networkId)}`),

  events: (id: string) =>
    request<{ events: VenueEvent[] }>('GET', `${venuePath(id)}/events`).then((r) => r.events),
  createEvent: (id: string, e: EventInput) =>
    request<VenueEvent>('POST', `${venuePath(id)}/events`, e),
  updateEvent: (id: string, eventId: string, e: EventInput) =>
    request<VenueEvent>('PUT', `${venuePath(id)}/events/${enc(eventId)}`, e),
  deleteEvent: (id: string, eventId: string) =>
    request<void>('DELETE', `${venuePath(id)}/events/${enc(eventId)}`),

  stats: (id: string) => request<VenueStats>('GET', `${venuePath(id)}/stats`),
};

/** Текст ошибки для показа пользователю. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiRequestError) return e.message;
  if (e instanceof Error && e.message) return e.message;
  return 'Что-то пошло не так';
}

// ── Клиентская валидация zod-схемами из @ryadom/shared ─────────────────────
// Стандартные сообщения zod — на английском; переводим самые частые коды.

interface ZodLikeIssue {
  code: string;
  message: string;
  path: PropertyKey[];
  origin?: string;
  format?: string;
  minimum?: unknown;
  maximum?: unknown;
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function ruIssue(issue: ZodLikeIssue): string {
  if (/[а-яё]/i.test(issue.message)) return issue.message;
  const n = Number(issue.minimum ?? issue.maximum);
  switch (issue.code) {
    case 'too_small':
      if (issue.origin === 'string')
        return n <= 1 ? 'Заполните поле' : `Минимум ${n} ${plural(n, 'символ', 'символа', 'символов')}`;
      if (issue.origin === 'array') return `Выберите хотя бы ${n}`;
      return `Не меньше ${n}`;
    case 'too_big':
      if (issue.origin === 'string')
        return `Максимум ${n} ${plural(n, 'символ', 'символа', 'символов')}`;
      if (issue.origin === 'array') return `Не больше ${n}`;
      return `Не больше ${n}`;
    case 'invalid_format':
      return issue.format === 'email' ? 'Некорректный e-mail' : 'Некорректный формат';
    case 'invalid_type':
      return 'Заполните поле';
    default:
      return 'Некорректное значение';
  }
}

/** Ошибки валидации zod → { поле: сообщение } (по первой ошибке на поле). */
export function zodFieldErrors(issues: readonly ZodLikeIssue[]): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join('.') || '_';
    if (!(key in out)) out[key] = ruIssue(issue);
  }
  return out;
}
