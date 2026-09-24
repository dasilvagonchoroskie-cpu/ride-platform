import type { ExpoConfig } from 'expo/config';

/**
 * Configuracao do app do passageiro.
 *
 * EXPO_PUBLIC_API_URL define o backend usado pelo APK. Para um APK de
 * demonstracao, aponte para uma URL publica (ngrok, Railway, Render...) ou
 * deixe vazio para o app iniciar em MODO DEMONSTRACAO (fluxo simulado local).
 */
const config: ExpoConfig = {
  name: 'Ride Passageiro',
  slug: 'ride-passenger',
  version: '0.1.0',
  orientation: 'portrait',
  scheme: 'ridepassenger',
  userInterfaceStyle: 'dark',
  newArchEnabled: false,
  icon: './assets/icon.png',
  splash: {
    image: './assets/splash.png',
    backgroundColor: '#0B0B0F',
    resizeMode: 'contain',
  },
  assetBundlePatterns: ['**/*'],
  android: {
    package: 'com.rideplatform.passenger',
    versionCode: 1,
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#0B0B0F' },
    permissions: [
      'ACCESS_COARSE_LOCATION',
      'ACCESS_FINE_LOCATION',
      'FOREGROUND_SERVICE',
      'INTERNET',
      'VIBRATE',
    ],
    config: {
      googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_KEY ?? '' },
    },
  },
  ios: {
    bundleIdentifier: 'com.rideplatform.passenger',
    supportsTablet: false,
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'Usamos sua localizacao para encontrar motoristas proximos e calcular a rota da sua corrida.',
      NSLocationAlwaysAndWhenInUseUsageDescription:
        'A localizacao em segundo plano mantem sua corrida atualizada para o motorista.',
    },
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission:
          'Permita o acesso a localizacao para encontrarmos motoristas proximos.',
      },
    ],
  ],
  experiments: { typedRoutes: false },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? '',
    demoMode: process.env.EXPO_PUBLIC_DEMO_MODE ?? 'auto',
  },
};

export default config;
