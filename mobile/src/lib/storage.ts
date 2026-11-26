// Локальное хранилище профиля, настроек и переписки. На сервер это не уходит.
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'ryadom:';

export async function loadJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function saveJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (e) {
    console.warn('storage write failed', key, e);
  }
}

export async function removeKey(key: string): Promise<void> {
  await AsyncStorage.removeItem(PREFIX + key).catch(() => undefined);
}

export async function clearAll(): Promise<void> {
  const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
  await AsyncStorage.multiRemove(keys);
}

/** Склеивает частые записи в одну (например, при потоке сообщений). */
const timers = new Map<string, ReturnType<typeof setTimeout>>();
export function saveJsonDebounced(key: string, getValue: () => unknown, ms = 400): void {
  const t = timers.get(key);
  if (t) clearTimeout(t);
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      void saveJson(key, getValue());
    }, ms),
  );
}
