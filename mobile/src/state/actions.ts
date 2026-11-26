// Логика приложения: загрузка локальных данных, подключение, сообщения, карта.
import { AppState as RNAppState, type AppStateStatus } from 'react-native';
import * as Location from 'expo-location';
import {
  PROTOCOL_VERSION,
  coarsenLocation,
  decryptDm,
  encryptDm,
  generateIdentity,
  hashSsid,
  randomToken,
  signChallenge,
  verifyKeySig,
  type BBox,
  type Hello,
  type Identity,
  type Peer,
  type Profile,
  type PublicVenuesResponse,
  type ServerMessage,
  type Visibility,
} from '@ryadom/shared';
import { apiUrl, defaultServerUrl, wsUrl } from '../lib/config';
import { PresenceClient } from '../lib/presence';
import { secureDelete, secureGet, secureSet } from '../lib/secure';
import { clearAll, loadJson, removeKey, saveJson, saveJsonDebounced } from '../lib/storage';
import { readNetwork, sameNetwork, subscribeNetwork, type NetworkState } from '../lib/wifi';
import {
  getState,
  initialState,
  resetState,
  setState,
  type BlockedEntry,
  type ChatMessage,
  type ChatMeta,
  type Settings,
} from './store';

const IDENTITY_KEY = 'ryadom.identity.v1';
const MESSAGES_PER_CHAT = 500;
const BACKGROUND_GRACE_MS = 60_000;
const LOCATION_REFRESH_MS = 5 * 60_000;

let client: PresenceClient | null = null;
let activeChat: string | null = null;
let unsubNet: (() => void) | null = null;
let appStateSub: { remove(): void } | null = null;
let backgroundTimer: ReturnType<typeof setTimeout> | null = null;
let locationTimer: ReturnType<typeof setInterval> | null = null;

// ── Загрузка ───────────────────────────────────────────────────────────────

export async function bootstrap(): Promise<void> {
  if (getState().ready) return;
  let identity: Identity | null = null;
  const rawId = await secureGet(IDENTITY_KEY);
  if (rawId) {
    try {
      identity = JSON.parse(rawId) as Identity;
    } catch {
      identity = null;
    }
  }
  if (!identity || !verifyKeySig(identity.id, identity.boxPk, identity.keySig)) {
    identity = generateIdentity();
    await secureSet(IDENTITY_KEY, JSON.stringify(identity));
  }

  const base = initialState(defaultServerUrl());
  const [profile, settings, blocked, chats] = await Promise.all([
    loadJson<Profile | null>('profile', null),
    loadJson<Settings>('settings', base.settings),
    loadJson<Record<string, BlockedEntry>>('blocked', {}),
    loadJson<Record<string, ChatMeta>>('chats', {}),
  ]);
  const messages: Record<string, ChatMessage[]> = {};
  await Promise.all(
    Object.keys(chats).map(async (id) => {
      messages[id] = await loadJson<ChatMessage[]>(`msgs:${id}`, []);
    }),
  );
  resetState({
    ...base,
    ready: true,
    identity,
    profile,
    settings: { ...base.settings, ...settings },
    blocked,
    chats,
    messages,
  });
  if (profile) void startPresence();
}

// ── Подключение ────────────────────────────────────────────────────────────

function buildHello(challenge: string): Hello | null {
  const s = getState();
  if (!s.identity || !s.profile) return null;
  return {
    t: 'hello',
    v: PROTOCOL_VERSION,
    id: s.identity.id,
    boxPk: s.identity.boxPk,
    keySig: s.identity.keySig,
    sig: signChallenge(s.identity, challenge),
    net: { type: s.net.type, ssidHash: s.net.ssid ? hashSsid(s.net.ssid) : null },
    profile: s.profile,
    visibility: s.settings.visibility,
    blocked: Object.keys(s.blocked),
    contacts: Object.values(s.chats)
      .filter((c) => c.contact)
      .map((c) => c.id),
    app: 'ryadom-mobile/0.1',
  };
}

function applyNetwork(n: NetworkState): boolean {
  const prev = getState().net;
  setState({ net: n });
  return !sameNetwork(prev, n);
}

export async function startPresence(): Promise<void> {
  applyNetwork(await readNetwork());
  if (!client) {
    client = new PresenceClient({
      url: () => wsUrl(getState().settings.serverUrl),
      buildHello,
      onMessage: handleServerMessage,
      onStatus: (status, message) => {
        setState((s) => ({
          conn: { status, message },
          ...(status === 'online' ? {} : { peers: {} }),
        }));
      },
    });
  }
  // Смена сети = смена публичного адреса → переподключаемся в новую зону.
  unsubNet ??= subscribeNetwork((n) => {
    if (applyNetwork(n)) {
      setState({ zone: null, peers: {} });
      client?.restart();
    }
  });
  // Пока приложение свёрнуто дольше минуты — нас не видно.
  appStateSub ??= RNAppState.addEventListener('change', (st: AppStateStatus) => {
    if (st === 'active') {
      if (backgroundTimer) clearTimeout(backgroundTimer);
      backgroundTimer = null;
      void readNetwork().then((n) => {
        applyNetwork(n);
        if (getState().conn.status !== 'banned') client?.start();
      });
    } else if (st === 'background') {
      backgroundTimer = setTimeout(() => client?.stop(), BACKGROUND_GRACE_MS);
    }
  });
  client.start();
  syncLocationUpdates();
}

export function reconnect(): void {
  void readNetwork().then((n) => {
    applyNetwork(n);
    client?.restart();
  });
}

function send(msg: Parameters<PresenceClient['send']>[0]): boolean {
  return client?.send(msg) ?? false;
}

function validPeer(p: Peer): boolean {
  return verifyKeySig(p.id, p.boxPk, p.keySig);
}

function handleServerMessage(m: ServerMessage): void {
  const s = getState();
  switch (m.t) {
    case 'welcome':
    case 'peers': {
      const peers: Record<string, Peer> = {};
      for (const p of m.peers) if (validPeer(p) && !s.blocked[p.id]) peers[p.id] = p;
      setState(m.t === 'welcome' ? { zone: m.zone, peers, lastError: undefined } : { peers });
      for (const p of Object.values(peers)) refreshChatMeta(p);
      return;
    }
    case 'zone':
      return setState({ zone: m.zone });
    case 'peer':
      if (!validPeer(m.peer) || s.blocked[m.peer.id]) return;
      setState((st) => ({ peers: { ...st.peers, [m.peer.id]: m.peer } }));
      refreshChatMeta(m.peer);
      return;
    case 'peer_left':
      setState((st) => {
        const { [m.id]: _gone, ...rest } = st.peers;
        return { peers: rest };
      });
      return;
    case 'map':
      return setState((st) => ({
        map: { ...st.map, people: m.people.filter((p) => !st.blocked[p.id]), error: undefined },
      }));
    case 'profile':
      if (m.peer && validPeer(m.peer)) {
        const peer = m.peer;
        setState((st) => ({ profiles: { ...st.profiles, [peer.id]: peer } }));
        refreshChatMeta(peer);
      }
      return;
    case 'dm':
      return receiveDm(m);
    case 'dm_status':
      return updateMessage(m.to, m.mid, { status: m.status });
    case 'error':
      if (m.code === 'map_requires_sharing') {
        setState((st) => ({ map: { ...st.map, people: [], error: m.message } }));
      } else if (m.code !== 'rate_limited') {
        setState({ lastError: m.message });
      }
      return;
    default:
      return;
  }
}

// ── Профиль и настройки ────────────────────────────────────────────────────

export async function saveProfile(profile: Profile): Promise<void> {
  const firstTime = !getState().profile;
  setState({ profile });
  await saveJson('profile', profile);
  if (firstTime) await startPresence();
  else send({ t: 'profile', profile });
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const prev = getState().settings;
  const settings = { ...prev, ...patch };
  setState({ settings });
  await saveJson('settings', settings);
  if (patch.serverUrl && patch.serverUrl !== prev.serverUrl) client?.restart();
}

export async function setVisibility(visibility: Visibility): Promise<void> {
  await saveSettings({ visibility });
  send({ t: 'visibility', visibility });
  if (visibility.mode !== 'map') setState((s) => ({ map: { ...s.map, people: [], myLocation: null } }));
  syncLocationUpdates();
}

// ── Карта ──────────────────────────────────────────────────────────────────

function syncLocationUpdates(): void {
  const sharing = getState().settings.visibility.mode === 'map';
  if (sharing && !locationTimer) {
    void shareLocation();
    locationTimer = setInterval(() => void shareLocation(), LOCATION_REFRESH_MS);
  } else if (!sharing && locationTimer) {
    clearInterval(locationTimer);
    locationTimer = null;
  }
}

/** Берёт текущую позицию, огрубляет на устройстве и отправляет только ячейку сетки. */
export async function shareLocation(): Promise<boolean> {
  const { visibility } = getState().settings;
  if (visibility.mode !== 'map') return false;
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') {
      setState((s) => ({ map: { ...s.map, error: 'Нет доступа к геолокации' } }));
      return false;
    }
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const coarse = coarsenLocation(pos.coords.latitude, pos.coords.longitude, visibility.precision);
    setState((s) => ({ map: { ...s.map, myLocation: coarse } }));
    return send({ t: 'location', ...coarse });
  } catch (e) {
    setState((s) => ({ map: { ...s.map, error: `Не удалось определить местоположение: ${String(e)}` } }));
    return false;
  }
}

export async function refreshMap(bbox: BBox): Promise<void> {
  const s = getState();
  if (s.settings.visibility.mode === 'map') send({ t: 'map_query', bbox });
  try {
    const res = await fetch(apiUrl(s.settings.serverUrl, `/api/venues?bbox=${bbox.map((x) => x.toFixed(5)).join(',')}`));
    if (res.ok) {
      const { venues } = (await res.json()) as PublicVenuesResponse;
      setState((st) => ({ map: { ...st.map, venues } }));
    }
  } catch {
    /* сервер недоступен — покажем то, что есть */
  }
}

// ── Люди ───────────────────────────────────────────────────────────────────

export function requestProfile(id: string): void {
  send({ t: 'get_profile', id });
}

export function findPeer(id: string): Peer | null {
  const s = getState();
  return s.profiles[id] ?? s.peers[id] ?? null;
}

export async function blockUser(id: string, nickname: string): Promise<void> {
  setState((s) => {
    const { [id]: _p, ...peers } = s.peers;
    return {
      blocked: { ...s.blocked, [id]: { nickname, at: Date.now() } },
      peers,
      map: { ...s.map, people: s.map.people.filter((p) => p.id !== id) },
    };
  });
  send({ t: 'block', id, on: true });
  await saveJson('blocked', getState().blocked);
}

export async function unblockUser(id: string): Promise<void> {
  setState((s) => {
    const { [id]: _b, ...blocked } = s.blocked;
    return { blocked };
  });
  send({ t: 'block', id, on: false });
  await saveJson('blocked', getState().blocked);
}

export async function reportUser(
  id: string,
  nickname: string,
  reason: 'spam' | 'harassment' | 'fake' | 'minor' | 'other',
  note?: string,
): Promise<void> {
  send({ t: 'report', id, reason, note });
  await blockUser(id, nickname);
}

// ── Чаты ───────────────────────────────────────────────────────────────────

function persistChats(): void {
  saveJsonDebounced('chats', () => getState().chats);
}

function persistMessages(id: string): void {
  saveJsonDebounced(`msgs:${id}`, () => getState().messages[id] ?? []);
}

function refreshChatMeta(p: Peer): void {
  const chat = getState().chats[p.id];
  if (!chat) return;
  if (
    chat.nickname === p.profile.nickname &&
    chat.avatar.emoji === p.profile.avatar.emoji &&
    chat.avatar.color === p.profile.avatar.color &&
    chat.boxPk === p.boxPk
  )
    return;
  setState((s) => ({
    chats: {
      ...s.chats,
      [p.id]: { ...chat, nickname: p.profile.nickname, avatar: p.profile.avatar, boxPk: p.boxPk, keySig: p.keySig },
    },
  }));
  persistChats();
}

function ensureChat(id: string, info: { nickname: string; avatar: ChatMeta['avatar']; boxPk: string; keySig: string }): ChatMeta {
  const existing = getState().chats[id];
  if (existing) return existing;
  const chat: ChatMeta = {
    id,
    ...info,
    lastText: '',
    lastAt: Date.now(),
    unread: 0,
    sent: false,
    received: false,
    contact: false,
  };
  setState((s) => ({ chats: { ...s.chats, [id]: chat }, messages: { ...s.messages, [id]: s.messages[id] ?? [] } }));
  return chat;
}

function pushMessage(id: string, msg: ChatMessage): void {
  setState((s) => {
    const chat = s.chats[id]!;
    const list = [...(s.messages[id] ?? []), msg].slice(-MESSAGES_PER_CHAT);
    const updated: ChatMeta = {
      ...chat,
      lastText: msg.kind === 'wave' ? (msg.mine ? 'Вы помахали 👋' : '👋 Вам помахали') : (msg.text ?? ''),
      lastAt: msg.at,
      unread: !msg.mine && activeChat !== id ? chat.unread + 1 : chat.unread,
      sent: chat.sent || msg.mine,
      received: chat.received || !msg.mine,
    };
    return { chats: { ...s.chats, [id]: updated }, messages: { ...s.messages, [id]: list } };
  });
  const chat = getState().chats[id]!;
  // Обе стороны написали друг другу — становимся контактами и сможем переписываться вне общей сети.
  if (chat.sent && chat.received && !chat.contact) {
    setState((s) => ({ chats: { ...s.chats, [id]: { ...chat, contact: true } } }));
    send({ t: 'contact', id, on: true });
  }
  persistChats();
  persistMessages(id);
}

function updateMessage(chatId: string, mid: string, patch: Partial<ChatMessage>): void {
  const list = getState().messages[chatId];
  if (!list?.some((m) => m.mid === mid)) return;
  setState((s) => ({
    messages: { ...s.messages, [chatId]: (s.messages[chatId] ?? []).map((m) => (m.mid === mid ? { ...m, ...patch } : m)) },
  }));
  persistMessages(chatId);
}

function receiveDm(m: Extract<ServerMessage, { t: 'dm' }>): void {
  const s = getState();
  if (!s.identity || s.blocked[m.from]) return;
  if (!verifyKeySig(m.from, m.boxPk, m.keySig)) return;
  const payload = decryptDm(m.box, m.nonce, m.boxPk, s.identity);
  if (!payload) return;
  const known = findPeer(m.from);
  const prev = s.chats[m.from];
  ensureChat(m.from, {
    nickname: known?.profile.nickname ?? prev?.nickname ?? 'Собеседник',
    avatar: known?.profile.avatar ?? prev?.avatar ?? { emoji: '💬', color: '#8E8E99' },
    boxPk: m.boxPk,
    keySig: m.keySig,
  });
  if (!known) requestProfile(m.from);
  pushMessage(m.from, {
    mid: m.mid,
    mine: false,
    kind: payload.kind,
    text: payload.kind === 'text' ? payload.text : undefined,
    at: m.ts,
  });
}

function sendPayload(peerId: string, payload: { kind: 'text'; text: string } | { kind: 'wave' }): boolean {
  const s = getState();
  if (!s.identity) return false;
  const peer = findPeer(peerId);
  const chatInfo = s.chats[peerId];
  const boxPk = peer?.boxPk ?? chatInfo?.boxPk;
  const keySig = peer?.keySig ?? chatInfo?.keySig;
  if (!boxPk || !keySig || !verifyKeySig(peerId, boxPk, keySig)) return false;
  ensureChat(peerId, {
    nickname: peer?.profile.nickname ?? chatInfo?.nickname ?? 'Собеседник',
    avatar: peer?.profile.avatar ?? chatInfo?.avatar ?? { emoji: '💬', color: '#8E8E99' },
    boxPk,
    keySig,
  });
  const mid = randomToken(9);
  const enc = encryptDm(payload, boxPk, s.identity);
  pushMessage(peerId, {
    mid,
    mine: true,
    kind: payload.kind,
    text: payload.kind === 'text' ? payload.text : undefined,
    at: Date.now(),
    status: 'sending',
  });
  if (!send({ t: 'dm', mid, to: peerId, ...enc })) updateMessage(peerId, mid, { status: 'offline' });
  return true;
}

export const sendText = (peerId: string, text: string) => sendPayload(peerId, { kind: 'text', text: text.trim() });
export const sendWave = (peerId: string) => sendPayload(peerId, { kind: 'wave' });

export function openChat(id: string | null): void {
  activeChat = id;
  if (!id) return;
  const chat = getState().chats[id];
  if (chat && chat.unread > 0) {
    setState((s) => ({ chats: { ...s.chats, [id]: { ...chat, unread: 0 } } }));
    persistChats();
  }
}

export async function deleteChat(id: string): Promise<void> {
  const chat = getState().chats[id];
  setState((s) => {
    const { [id]: _c, ...chats } = s.chats;
    const { [id]: _m, ...messages } = s.messages;
    return { chats, messages };
  });
  if (chat?.contact) send({ t: 'contact', id, on: false });
  await saveJson('chats', getState().chats);
  await removeKey(`msgs:${id}`);
}

// ── Конфиденциальность ─────────────────────────────────────────────────────

/** Новая пара ключей = новый «я» для сервера и собеседников. Переписка удаляется. */
export async function resetIdentity(): Promise<void> {
  const identity = generateIdentity();
  await secureSet(IDENTITY_KEY, JSON.stringify(identity));
  for (const id of Object.keys(getState().chats)) await removeKey(`msgs:${id}`);
  setState({ identity, chats: {}, messages: {}, profiles: {} });
  await saveJson('chats', {});
  client?.restart();
}

/** Полное удаление всех данных с устройства. */
export async function wipeEverything(): Promise<void> {
  client?.stop();
  client = null;
  unsubNet?.();
  unsubNet = null;
  appStateSub?.remove();
  appStateSub = null;
  if (locationTimer) clearInterval(locationTimer);
  locationTimer = null;
  await clearAll();
  await secureDelete(IDENTITY_KEY);
  resetState(initialState(defaultServerUrl()));
  await bootstrap();
}
