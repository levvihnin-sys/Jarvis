import { z } from 'zod';
import { INTEREST_IDS } from './interests';

// ── Базовые типы ────────────────────────────────────────────────────────────

/** 32 байта в base64url без паддинга */
export const keySchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Некорректный ключ');
/** 64 байта в base64url без паддинга */
export const sigSchema = z.string().regex(/^[A-Za-z0-9_-]{86}$/, 'Некорректная подпись');
export const ssidHashSchema = z.string().regex(/^[0-9a-f]{32}$/);
export const interestSchema = z.enum(INTEREST_IDS);

export const GENDERS = [
  { id: 'f', label: 'Женщина' },
  { id: 'm', label: 'Мужчина' },
  { id: 'x', label: 'Другое' },
] as const;
export const genderSchema = z.enum(['f', 'm', 'x']);
export type Gender = z.infer<typeof genderSchema>;

export const avatarSchema = z.object({
  emoji: z.string().min(1).max(16),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
export type Avatar = z.infer<typeof avatarSchema>;

export const PHOTO_MAX_CHARS = 120_000;

// ── Публичный профиль ───────────────────────────────────────────────────────
// Хранится только на устройстве. Сервер держит копию в памяти, пока устройство
// подключено, и пересылает её людям в той же сети. На диск сервер её не пишет.

export const profileSchema = z.object({
  nickname: z.string().trim().min(1).max(32),
  age: z.number().int().min(18).max(99).optional(),
  gender: genderSchema.optional(),
  bio: z.string().max(300).optional(),
  status: z.string().max(80).optional(),
  avatar: avatarSchema,
  photo: z
    .string()
    .max(PHOTO_MAX_CHARS)
    .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/)
    .optional(),
  interests: z.array(interestSchema).min(1).max(5),
  tags: z.array(z.string().trim().min(1).max(24)).max(3),
});
export type Profile = z.infer<typeof profileSchema>;

// ── Видимость ───────────────────────────────────────────────────────────────

export const VISIBILITY_MODES = [
  {
    id: 'zone',
    label: 'Только в этой сети',
    hint: 'Меня видят только люди, подключённые к той же Wi‑Fi сети.',
  },
  {
    id: 'map',
    label: 'Сеть + карта',
    hint: 'Дополнительно показываюсь на карте с огрублённым местоположением. Вижу на карте таких же людей.',
  },
  {
    id: 'hidden',
    label: 'Невидимка',
    hint: 'Меня никто не видит. Я тоже не вижу людей, но вижу заведение и его события.',
  },
] as const;

export const visibilitySchema = z.object({
  mode: z.enum(['zone', 'map', 'hidden']),
  precision: z.enum(['area', 'block']),
});
export type Visibility = z.infer<typeof visibilitySchema>;

export const netTypeSchema = z.enum(['wifi', 'ethernet', 'cellular', 'unknown']);
export type NetType = z.infer<typeof netTypeSchema>;

export const netInfoSchema = z.object({
  type: netTypeSchema,
  /** hashSsid(SSID) или null, если ОС не отдала SSID (веб, нет разрешения) */
  ssidHash: ssidHashSchema.nullable(),
});
export type NetInfo = z.infer<typeof netInfoSchema>;

export const REPORT_REASONS = [
  { id: 'spam', label: 'Спам или реклама' },
  { id: 'harassment', label: 'Оскорбления, домогательства' },
  { id: 'fake', label: 'Фейковый профиль' },
  { id: 'minor', label: 'Похоже, младше 18' },
  { id: 'other', label: 'Другое' },
] as const;
export const reportReasonSchema = z.enum(['spam', 'harassment', 'fake', 'minor', 'other']);
