import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** Адрес сервера по умолчанию: app.json → extra.serverUrl, в вебе можно передать ?server=... */
export function defaultServerUrl(): string {
  if (Platform.OS === 'web') {
    try {
      const q = new URLSearchParams(globalThis.location?.search ?? '').get('server');
      if (q) return q;
    } catch {
      /* ignore */
    }
  }
  const extra = Constants.expoConfig?.extra as { serverUrl?: string } | undefined;
  return extra?.serverUrl ?? 'http://localhost:8080';
}

export function wsUrl(serverUrl: string): string {
  return serverUrl.replace(/^http/, 'ws').replace(/\/+$/, '') + '/ws';
}

export function apiUrl(serverUrl: string, path: string): string {
  return serverUrl.replace(/\/+$/, '') + path;
}
