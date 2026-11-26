// Протокол WebSocket между приложением и сервером присутствия.
//
// 1. Сервер → { t:'challenge' }
// 2. Клиент → { t:'hello', ... } с подписью challenge ключом устройства
// 3. Сервер → { t:'welcome', zone, peers }
// Дальше — обновления профиля/видимости, личные сообщения (зашифрованы на клиенте),
// запросы карты. Сервер ничего из этого не сохраняет на диск.

import { z } from 'zod';
import type { PublicVenue } from './api';
import type { InterestId } from './interests';
import type { BBox, Precision } from './geo';
import {
  keySchema,
  netInfoSchema,
  profileSchema,
  reportReasonSchema,
  sigSchema,
  visibilitySchema,
  type Avatar,
  type Profile,
} from './schemas';

export const PROTOCOL_VERSION = 1;
export const WS_PATH = '/ws';
export const MAX_LIST = 1000;

const b64url = (max: number) => z.string().max(max).regex(/^[A-Za-z0-9_-]+$/);

// ── Клиент → сервер ─────────────────────────────────────────────────────────

export const helloSchema = z.object({
  t: z.literal('hello'),
  v: z.literal(PROTOCOL_VERSION),
  id: keySchema,
  boxPk: keySchema,
  keySig: sigSchema,
  sig: sigSchema,
  net: netInfoSchema,
  profile: profileSchema,
  visibility: visibilitySchema,
  /** id заблокированных пользователей (список хранится на устройстве) */
  blocked: z.array(keySchema).max(MAX_LIST),
  /** id собеседников, с которыми была взаимная переписка (хранится на устройстве) */
  contacts: z.array(keySchema).max(MAX_LIST),
  app: z.string().max(40).optional(),
});
export type Hello = z.infer<typeof helloSchema>;

export const clientMessageSchema = z.discriminatedUnion('t', [
  helloSchema,
  z.object({ t: z.literal('profile'), profile: profileSchema }),
  z.object({ t: z.literal('visibility'), visibility: visibilitySchema }),
  z.object({
    t: z.literal('location'),
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
  }),
  z.object({
    t: z.literal('map_query'),
    bbox: z.tuple([
      z.number().min(-180).max(180),
      z.number().min(-90).max(90),
      z.number().min(-180).max(180),
      z.number().min(-90).max(90),
    ]),
  }),
  z.object({ t: z.literal('get_profile'), id: keySchema }),
  z.object({
    t: z.literal('dm'),
    /** id сообщения, сгенерированный клиентом */
    mid: z.string().min(1).max(64),
    to: keySchema,
    nonce: b64url(32),
    box: b64url(12_000),
  }),
  z.object({ t: z.literal('contact'), id: keySchema, on: z.boolean() }),
  z.object({ t: z.literal('block'), id: keySchema, on: z.boolean() }),
  z.object({
    t: z.literal('report'),
    id: keySchema,
    reason: reportReasonSchema,
    note: z.string().max(300).optional(),
  }),
  z.object({ t: z.literal('ping') }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

// ── Сервер → клиент ─────────────────────────────────────────────────────────

/** Насколько уверенно определена «одна сеть» */
export type ZoneConfidence = 'wifi' | 'network';

export interface Peer {
  id: string;
  boxPk: string;
  keySig: string;
  /** В списках фото не передаётся (экономия трафика) — его отдаёт get_profile */
  profile: Profile;
  hasPhoto: boolean;
  /** wifi — совпали адрес и SSID; network — только адрес сети */
  conf: ZoneConfidence;
  since: number;
}

export interface ZoneInfo {
  id: string;
  conf: ZoneConfidence;
  /** Тип подключения, который сообщил клиент */
  netType: z.infer<typeof netInfoSchema>['type'];
  venue: PublicVenue | null;
}

export interface MapPerson {
  id: string;
  nickname: string;
  avatar: Avatar;
  interests: InterestId[];
  status?: string;
  lat: number;
  lon: number;
  precision: Precision;
  /** Заведение, в сети которого человек сейчас находится */
  venueName?: string;
}

export type DmStatus = 'delivered' | 'offline' | 'forbidden';

export type ErrorCode =
  | 'bad_message'
  | 'bad_signature'
  | 'not_ready'
  | 'rate_limited'
  | 'banned'
  | 'replaced'
  | 'map_requires_sharing'
  | 'not_visible'
  | 'internal';

export type ServerMessage =
  | { t: 'challenge'; challenge: string; time: number }
  | {
      t: 'welcome';
      you: string;
      zone: ZoneInfo;
      peers: Peer[];
      features: { mapReciprocal: boolean; minGroup: number };
    }
  | { t: 'zone'; zone: ZoneInfo }
  | { t: 'peers'; peers: Peer[] }
  | { t: 'peer'; peer: Peer }
  | { t: 'peer_left'; id: string }
  | { t: 'map'; bbox: BBox; people: MapPerson[]; truncated: boolean }
  | { t: 'profile'; id: string; peer: Peer | null }
  | {
      t: 'dm';
      mid: string;
      from: string;
      boxPk: string;
      keySig: string;
      nonce: string;
      box: string;
      ts: number;
    }
  | { t: 'dm_status'; mid: string; to: string; status: DmStatus }
  | { t: 'error'; code: ErrorCode; message: string }
  | { t: 'pong'; time: number };

/** Коды закрытия WebSocket */
export const CLOSE_CODES = {
  replaced: 4001,
  badHello: 4002,
  helloTimeout: 4003,
  banned: 4004,
  abuse: 4005,
} as const;
