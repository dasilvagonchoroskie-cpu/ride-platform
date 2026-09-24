import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/**
 * Tokens ficam no SecureStore (Keychain/Keystore); o resto no AsyncStorage.
 * Se o SecureStore nao estiver disponivel (web/dev), cai para o AsyncStorage.
 */

const secureKeys = new Set(['ride.accessToken', 'ride.refreshToken']);

export async function setItem(key: string, value: string): Promise<void> {
  if (secureKeys.has(key)) {
    try {
      await SecureStore.setItemAsync(key, value);
      return;
    } catch {
      // fallback abaixo
    }
  }
  await AsyncStorage.setItem(key, value);
}

export async function getItem(key: string): Promise<string | null> {
  if (secureKeys.has(key)) {
    try {
      const value = await SecureStore.getItemAsync(key);
      if (value !== null) return value;
    } catch {
      // fallback abaixo
    }
  }
  return AsyncStorage.getItem(key);
}

export async function removeItem(key: string): Promise<void> {
  if (secureKeys.has(key)) {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // ignora
    }
  }
  await AsyncStorage.removeItem(key);
}

export const STORAGE_KEYS = {
  accessToken: 'ride.accessToken',
  refreshToken: 'ride.refreshToken',
  user: 'ride.user',
  activeRide: 'ride.activeRide',
  demo: 'ride.demoMode',
  recentPlaces: 'ride.recentPlaces',
  deviceId: 'ride.deviceId',
} as const;
