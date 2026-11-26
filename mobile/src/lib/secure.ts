// Ключи устройства — в защищённом хранилище ОС (Keychain / Keystore).
import * as SecureStore from 'expo-secure-store';

export const secureGet = (key: string) => SecureStore.getItemAsync(key);
export const secureSet = (key: string, value: string) => SecureStore.setItemAsync(key, value);
export const secureDelete = (key: string) => SecureStore.deleteItemAsync(key);
