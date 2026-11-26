// Цели знакомства. Список расширяемый: клиент показывает только известные ему id,
// сервер принимает только перечисленные здесь.

export const INTERESTS = [
  { id: 'flirt', label: 'Флирт', emoji: '💘' },
  { id: 'chat', label: 'Общение', emoji: '💬' },
  { id: 'eat', label: 'Перекусить', emoji: '🍕' },
  { id: 'coffee', label: 'Кофе', emoji: '☕' },
  { id: 'play', label: 'Поиграть', emoji: '🎲' },
  { id: 'sport', label: 'Спорт', emoji: '🏋️' },
  { id: 'walk', label: 'Прогуляться', emoji: '🚶' },
  { id: 'networking', label: 'Нетворкинг', emoji: '💼' },
  { id: 'language', label: 'Языковой обмен', emoji: '🗣️' },
  { id: 'travel', label: 'Попутчики', emoji: '🧳' },
] as const;

export type InterestId = (typeof INTERESTS)[number]['id'];

export const INTEREST_IDS = INTERESTS.map((i) => i.id) as [InterestId, ...InterestId[]];

const byId = new Map<string, (typeof INTERESTS)[number]>(INTERESTS.map((i) => [i.id, i]));

export function interestLabel(id: string): string {
  const i = byId.get(id);
  return i ? `${i.emoji} ${i.label}` : id;
}

export function isInterestId(id: string): id is InterestId {
  return byId.has(id);
}
