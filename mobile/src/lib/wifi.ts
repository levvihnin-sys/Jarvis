// Определение текущей сети.
// SSID система отдаёт только при выданном доступе к геолокации (iOS: ещё и entitlement
// «Access Wi‑Fi Information» — он прописан в app.json). Наружу уходит только хэш SSID.
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { normalizeSsid, type NetType } from '@ryadom/shared';
import { Platform } from 'react-native';

if (Platform.OS === 'ios') NetInfo.configure({ shouldFetchWiFiSSID: true });

export interface NetworkState {
  type: NetType;
  ssid: string | null;
  connected: boolean;
}

function toState(s: NetInfoState): NetworkState {
  const type: NetType =
    s.type === 'wifi' ? 'wifi' : s.type === 'ethernet' ? 'ethernet' : s.type === 'cellular' ? 'cellular' : 'unknown';
  const ssid = s.type === 'wifi' ? normalizeSsid((s.details as { ssid?: string | null } | null)?.ssid) : null;
  return { type, ssid, connected: s.isConnected !== false };
}

export async function readNetwork(): Promise<NetworkState> {
  return toState(await NetInfo.fetch());
}

export function subscribeNetwork(cb: (s: NetworkState) => void): () => void {
  return NetInfo.addEventListener((s) => cb(toState(s)));
}

export const sameNetwork = (a: NetworkState, b: NetworkState) =>
  a.type === b.type && a.ssid === b.ssid && a.connected === b.connected;
