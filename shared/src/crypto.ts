// Сквозное шифрование и идентичность устройства.
//
// Каждое устройство локально генерирует две пары ключей:
//   • sign (Ed25519) — публичный ключ и есть id пользователя;
//   • box (X25519) — для шифрования личных сообщений (NaCl box).
// boxPk подписан ключом sign (keySig), поэтому сервер не может подменить ключ
// шифрования собеседника. Сервер видит только шифротекст.

import nacl from 'tweetnacl';
import { fromBase64, toBase64Url, toHex, utf8Decode, utf8Encode } from './encoding';

export interface Identity {
  /** Ed25519 публичный ключ, base64url — это id пользователя */
  id: string;
  signSk: string;
  boxPk: string;
  boxSk: string;
  /** подпись boxPk ключом sign */
  keySig: string;
}

/** Подменить источник случайности (React Native без crypto.getRandomValues). */
export function setRandomSource(fill: (n: number) => Uint8Array): void {
  nacl.setPRNG((x: Uint8Array, n: number) => {
    const bytes = fill(n);
    for (let i = 0; i < n; i++) x[i] = bytes[i]!;
  });
}

const KEY_CONTEXT = 'ryadom/boxkey/v1|';
const HELLO_CONTEXT = 'ryadom/hello/v1|';
const SSID_CONTEXT = 'ryadom/ssid/v1|';

export function generateIdentity(): Identity {
  const sign = nacl.sign.keyPair();
  const box = nacl.box.keyPair();
  const boxPk = toBase64Url(box.publicKey);
  const keySig = toBase64Url(nacl.sign.detached(utf8Encode(KEY_CONTEXT + boxPk), sign.secretKey));
  return {
    id: toBase64Url(sign.publicKey),
    signSk: toBase64Url(sign.secretKey),
    boxPk,
    boxSk: toBase64Url(box.secretKey),
    keySig,
  };
}

function bytes(b64: string, len: number): Uint8Array | null {
  const b = fromBase64(b64);
  return b && b.length === len ? b : null;
}

/** Проверка, что boxPk действительно принадлежит владельцу id. */
export function verifyKeySig(id: string, boxPk: string, keySig: string): boolean {
  const pk = bytes(id, 32);
  const sig = bytes(keySig, 64);
  if (!pk || !sig || !bytes(boxPk, 32)) return false;
  return nacl.sign.detached.verify(utf8Encode(KEY_CONTEXT + boxPk), sig, pk);
}

export function signChallenge(identity: Identity, challenge: string): string {
  const sk = bytes(identity.signSk, 64);
  if (!sk) throw new Error('Повреждённый ключ подписи');
  return toBase64Url(nacl.sign.detached(utf8Encode(HELLO_CONTEXT + challenge), sk));
}

export function verifyChallenge(id: string, challenge: string, sig: string): boolean {
  const pk = bytes(id, 32);
  const s = bytes(sig, 64);
  if (!pk || !s) return false;
  return nacl.sign.detached.verify(utf8Encode(HELLO_CONTEXT + challenge), s, pk);
}

export function randomToken(nBytes = 24): string {
  return toBase64Url(nacl.randomBytes(nBytes));
}

/** Содержимое личного сообщения до шифрования. */
export type DmPayload =
  | { kind: 'text'; text: string }
  | { kind: 'wave' };

export const DM_TEXT_MAX = 2000;

export function encryptDm(
  payload: DmPayload,
  theirBoxPk: string,
  identity: Identity,
): { nonce: string; box: string } {
  const pk = bytes(theirBoxPk, 32);
  const sk = bytes(identity.boxSk, 32);
  if (!pk || !sk) throw new Error('Некорректный ключ шифрования');
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const box = nacl.box(utf8Encode(JSON.stringify(payload)), nonce, pk, sk);
  return { nonce: toBase64Url(nonce), box: toBase64Url(box) };
}

export function decryptDm(
  box: string,
  nonce: string,
  theirBoxPk: string,
  identity: Identity,
): DmPayload | null {
  const pk = bytes(theirBoxPk, 32);
  const sk = bytes(identity.boxSk, 32);
  const n = bytes(nonce, nacl.box.nonceLength);
  const b = fromBase64(box);
  if (!pk || !sk || !n || !b) return null;
  const opened = nacl.box.open(b, n, pk, sk);
  if (!opened) return null;
  try {
    const p = JSON.parse(utf8Decode(opened)) as DmPayload;
    if (p && p.kind === 'text' && typeof p.text === 'string') return { kind: 'text', text: p.text.slice(0, DM_TEXT_MAX) };
    if (p && p.kind === 'wave') return { kind: 'wave' };
    return null;
  } catch {
    return null;
  }
}

/** Нормализует SSID, полученный от ОС. null — если SSID неизвестен. */
export function normalizeSsid(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  if (!s || s === '<unknown ssid>' || s === '0x' || s.toLowerCase() === 'unknown') return null;
  return s;
}

/** Хэш SSID: сервер не узнаёт название сети пользователя, но может сравнить его с сетью заведения. */
export function hashSsid(ssid: string): string {
  return toHex(nacl.hash(utf8Encode(SSID_CONTEXT + ssid)).subarray(0, 16));
}

/**
 * Код безопасности пары собеседников: совпадает у обоих, если сервер не подменил ключи.
 * Можно сверить при встрече.
 */
export function safetyCode(idA: string, idB: string): string {
  const [x, y] = [idA, idB].sort();
  const h = nacl.hash(utf8Encode(`ryadom/safety/v1|${x}|${y}`));
  const digits: string[] = [];
  for (let i = 0; i < 6; i++) {
    const n = ((h[i * 2]! << 8) | h[i * 2 + 1]!) % 10000;
    digits.push(n.toString().padStart(4, '0'));
  }
  return digits.join(' ');
}
