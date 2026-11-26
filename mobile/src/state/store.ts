// Глобальное состояние приложения (минимальный store на useSyncExternalStore).
import { useSyncExternalStore } from 'react';
import type {
  Avatar,
  DmStatus,
  Identity,
  LatLon,
  MapPerson,
  NetType,
  Peer,
  Profile,
  PublicVenue,
  Visibility,
  ZoneInfo,
} from '@ryadom/shared';
import type { ConnStatus } from '../lib/presence';

export interface Settings {
  serverUrl: string;
  visibility: Visibility;
  adultConfirmed: boolean;
}

export interface ChatMeta {
  id: string;
  nickname: string;
  avatar: Avatar;
  boxPk: string;
  keySig: string;
  lastText: string;
  lastAt: number;
  unread: number;
  /** я писал(а) в этот чат */
  sent: boolean;
  /** мне отвечали */
  received: boolean;
  /** взаимный контакт сообщён серверу — переписка продолжится и вне общей сети */
  contact: boolean;
}

export interface ChatMessage {
  mid: string;
  mine: boolean;
  kind: 'text' | 'wave';
  text?: string;
  at: number;
  status?: 'sending' | DmStatus;
}

export interface BlockedEntry {
  nickname: string;
  at: number;
}

export interface AppState {
  ready: boolean;
  identity: Identity | null;
  profile: Profile | null;
  settings: Settings;
  blocked: Record<string, BlockedEntry>;
  chats: Record<string, ChatMeta>;
  messages: Record<string, ChatMessage[]>;
  conn: { status: ConnStatus; message?: string };
  net: { type: NetType; ssid: string | null; connected: boolean };
  zone: ZoneInfo | null;
  peers: Record<string, Peer>;
  /** полные профили (с фото), полученные по запросу — только в памяти */
  profiles: Record<string, Peer>;
  map: {
    people: MapPerson[];
    venues: PublicVenue[];
    myLocation: LatLon | null;
    error?: string;
  };
  lastError?: string;
}

export const initialState = (serverUrl: string): AppState => ({
  ready: false,
  identity: null,
  profile: null,
  settings: { serverUrl, visibility: { mode: 'zone', precision: 'area' }, adultConfirmed: false },
  blocked: {},
  chats: {},
  messages: {},
  conn: { status: 'idle' },
  net: { type: 'unknown', ssid: null, connected: true },
  zone: null,
  peers: {},
  profiles: {},
  map: { people: [], venues: [], myLocation: null },
});

let state: AppState = initialState('');
const listeners = new Set<() => void>();

export const getState = (): AppState => state;

export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)): void {
  const next = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...next };
  for (const l of listeners) l();
}

export function resetState(s: AppState): void {
  state = s;
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Селектор должен возвращать стабильную ссылку (срез состояния), а не новый объект. */
export function useApp<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(state),
  );
}
