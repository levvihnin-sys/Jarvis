// REST API кабинета заведения и публичных данных карты.
import { z } from 'zod';
import type { InterestId } from './interests';
import { interestSchema } from './schemas';

export const VENUE_CATEGORIES = [
  { id: 'restaurant', label: 'Ресторан', emoji: '🍽️' },
  { id: 'cafe', label: 'Кафе', emoji: '☕' },
  { id: 'bar', label: 'Бар', emoji: '🍸' },
  { id: 'club', label: 'Клуб', emoji: '🎉' },
  { id: 'gym', label: 'Спортзал', emoji: '🏋️' },
  { id: 'train', label: 'Поезд', emoji: '🚆' },
  { id: 'coworking', label: 'Коворкинг', emoji: '💻' },
  { id: 'hotel', label: 'Отель', emoji: '🏨' },
  { id: 'airport', label: 'Аэропорт', emoji: '✈️' },
  { id: 'campus', label: 'Кампус', emoji: '🎓' },
  { id: 'other', label: 'Другое', emoji: '📍' },
] as const;
export type VenueCategory = (typeof VENUE_CATEGORIES)[number]['id'];
export const venueCategorySchema = z.enum(
  VENUE_CATEGORIES.map((c) => c.id) as [VenueCategory, ...VenueCategory[]],
);

export function venueCategoryLabel(id: string): string {
  const c = VENUE_CATEGORIES.find((x) => x.id === id);
  return c ? `${c.emoji} ${c.label}` : id;
}

// ── Авторизация владельца заведения ─────────────────────────────────────────

export const credentialsSchema = z.object({
  email: z.email().max(200),
  password: z.string().min(8, 'Пароль — минимум 8 символов').max(128),
});
export type Credentials = z.infer<typeof credentialsSchema>;

export interface Account {
  id: string;
  email: string;
}

export interface AuthResponse {
  token: string;
  account: Account;
}

// ── Заведение ───────────────────────────────────────────────────────────────

export const venueInputSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    category: venueCategorySchema,
    description: z.string().max(1000),
    address: z.string().max(200),
    lat: z.number().min(-90).max(90).nullable(),
    lon: z.number().min(-180).max(180).nullable(),
    published: z.boolean(),
  })
  .refine((v) => (v.lat === null) === (v.lon === null), {
    message: 'Укажите обе координаты или ни одной',
    path: ['lat'],
  });
export type VenueInput = z.infer<typeof venueInputSchema>;

export interface Venue extends VenueInput {
  id: string;
  createdAt: number;
}

// ── Wi‑Fi сети заведения ────────────────────────────────────────────────────
// Сеть заведения = публичный адрес (или префикс), через который выходит его Wi‑Fi,
// плюс (необязательно) SSID. Владелец добавляет сеть, находясь в ней: сервер
// подставит адрес автоматически.

export const networkInputSchema = z.object({
  ssid: z.string().trim().min(1).max(32).nullable(),
  /** IP или префикс сети. null — взять адрес, с которого пришёл запрос. */
  address: z.string().trim().max(64).nullable(),
});
export type NetworkInput = z.infer<typeof networkInputSchema>;

export interface VenueNetwork {
  id: string;
  venueId: string;
  ssid: string | null;
  /** Ключ сети (см. networkKeyFromIp) */
  networkKey: string;
  /** Человекочитаемый адрес/префикс */
  addressLabel: string;
  createdAt: number;
}

export interface WhoAmIResponse {
  networkKey: string | null;
  addressLabel: string | null;
}

// ── События ─────────────────────────────────────────────────────────────────

export const EVENT_MAX_DURATION_MS = 14 * 24 * 3600 * 1000;

export const eventInputSchema = z
  .object({
    title: z.string().trim().min(2).max(100),
    description: z.string().max(1000),
    startsAt: z.number().int().positive(),
    endsAt: z.number().int().positive(),
    interests: z.array(interestSchema).max(5),
  })
  .refine((e) => e.endsAt > e.startsAt, { message: 'Окончание позже начала', path: ['endsAt'] })
  .refine((e) => e.endsAt - e.startsAt <= EVENT_MAX_DURATION_MS, {
    message: 'Событие не длиннее 14 дней',
    path: ['endsAt'],
  });
export type EventInput = z.infer<typeof eventInputSchema>;

export interface VenueEvent extends EventInput {
  id: string;
  venueId: string;
}

/** Заведение, как его видят пользователи (в зоне и на карте). */
export interface PublicVenue {
  id: string;
  name: string;
  category: VenueCategory;
  description: string;
  address: string;
  lat: number | null;
  lon: number | null;
  /** Текущие и ближайшие события (до 7 дней вперёд) */
  events: VenueEvent[];
}

export interface PublicVenuesResponse {
  venues: PublicVenue[];
}

/**
 * Живая статистика для кабинета. Числа показываются только если в сети
 * не меньше minGroup человек — чтобы нельзя было вычислить конкретного гостя.
 */
export interface VenueStats {
  online: number | null;
  interests: Partial<Record<InterestId, number>> | null;
  minGroup: number;
  updatedAt: number;
}

export interface ApiError {
  error: string;
  message: string;
  issues?: { path: string; message: string }[];
}
