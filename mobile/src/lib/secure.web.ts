// В браузере защищённого хранилища нет — используем localStorage (только для разработки и демо).
function ls(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
export async function secureGet(key: string): Promise<string | null> {
  try {
    return ls()?.getItem(`secure:${key}`) ?? null;
  } catch {
    return null;
  }
}
export async function secureSet(key: string, value: string): Promise<void> {
  try {
    ls()?.setItem(`secure:${key}`, value);
  } catch {
    /* приватный режим браузера */
  }
}
export async function secureDelete(key: string): Promise<void> {
  try {
    ls()?.removeItem(`secure:${key}`);
  } catch {
    /* ignore */
  }
}
