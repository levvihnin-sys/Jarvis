// Форматирование для интерфейса: даты, <input type="datetime-local">, категории.
import { VENUE_CATEGORIES } from '@ryadom/shared';

export function categoryOf(id: string): { id: string; label: string; emoji: string } {
  return VENUE_CATEGORIES.find((c) => c.id === id) ?? { id, label: id, emoji: '📍' };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** epoch ms → "YYYY-MM-DDTHH:mm" в местном времени (значение для datetime-local). */
export function toLocalInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "YYYY-MM-DDTHH:mm" (местное время) → epoch ms; null для пустой/некорректной строки. */
export function fromLocalInput(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const ms = new Date(y, mo - 1, d, h, mi).getTime();
  return Number.isFinite(ms) ? ms : null;
}

const dayFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const dayYearFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const timeSecFmt = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function day(ms: number): string {
  const sameYear = new Date(ms).getFullYear() === new Date().getFullYear();
  return (sameYear ? dayFmt : dayYearFmt).format(ms);
}

export function formatDate(ms: number): string {
  return day(ms);
}

export function formatDateTime(ms: number): string {
  return `${day(ms)}, ${timeFmt.format(ms)}`;
}

export function formatTime(ms: number, seconds = false): string {
  return (seconds ? timeSecFmt : timeFmt).format(ms);
}

/** «28 ноября, 19:00 – 23:00» или «28 ноября, 19:00 – 30 ноября, 02:00» */
export function formatRange(start: number, end: number): string {
  const sameDay = new Date(start).toDateString() === new Date(end).toDateString();
  return sameDay
    ? `${day(start)}, ${timeFmt.format(start)} – ${timeFmt.format(end)}`
    : `${formatDateTime(start)} – ${formatDateTime(end)}`;
}
