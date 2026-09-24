import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { colors, spacing, typography } from '../src/theme/tokens';
import { getCurrentCoords } from '../src/services/location';
import { useAppStore } from '../src/store/appStore';
import { useAuthStore } from '../src/store/authStore';
import { useRideStore } from '../src/store/rideStore';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const bootstrap = useAppStore((state) => state.bootstrap);
  const restoreAuth = useAuthStore((state) => state.restore);
  const restoreRide = useRideStore((state) => state.restoreActiveRide);

  useEffect(() => {
    (async () => {
      const { coords, granted } = await getCurrentCoords();
      await Promise.all([bootstrap(coords, granted), restoreAuth(), restoreRide()]);
      setReady(true);
    })();
  }, [bootstrap, restoreAuth, restoreRide]);

  if (!ready) {
    return (
      <View style={styles.splash}>
        <Text style={styles.brand}>Ride</Text>
        <Text style={styles.tagline}>Seu transporte sob demanda</Text>
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
              animation: 'slide_from_right',
            }}
          />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { ...typography.display, color: colors.primary, fontSize: 44 },
  tagline: { ...typography.body, color: colors.textMuted, marginTop: spacing.xs },
});
