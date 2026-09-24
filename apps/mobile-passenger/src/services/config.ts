import Constants from 'expo-constants';

interface ExtraConfig {
  apiUrl?: string;
  demoMode?: string;
}

const extra = (Constants.expoConfig?.extra ?? {}) as ExtraConfig;

/**
 * URL do backend. Vazio => o app inicia em MODO DEMONSTRACAO
 * (fluxo completo simulado localmente, sem rede).
 */
export const API_URL = (extra.apiUrl ?? process.env.EXPO_PUBLIC_API_URL ?? '').trim();

export type DemoModeSetting = 'auto' | 'true' | 'false';

export const DEMO_MODE_SETTING: DemoModeSetting = (() => {
  const raw = (extra.demoMode ?? process.env.EXPO_PUBLIC_DEMO_MODE ?? 'auto').toLowerCase();
  return raw === 'true' || raw === 'false' ? (raw as DemoModeSetting) : 'auto';
})();

export const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';
