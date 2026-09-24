import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge, Button, Card, Divider } from '../../src/components/ui';
import { MapCanvas } from '../../src/components/MapCanvas';
import { colors, spacing, typography } from '../../src/theme/tokens';
import { useAppStore } from '../../src/store/appStore';
import { useRideStore } from '../../src/store/rideStore';
import { formatMoney } from '../../src/lib/geo';

const PHASE_STEPS = [
  { status: 'SEARCHING', label: 'Procurando motoristas proximos', hint: 'Ampliando o raio de busca...' },
  { status: 'DRIVER_ASSIGNED', label: 'Motorista encontrado', hint: 'Confirmando a corrida...' },
  { status: 'DRIVER_ARRIVING', label: 'Motorista a caminho', hint: 'Ele esta indo ate voce.' },
];

export default function SearchingScreen() {
  const router = useRouter();
  const coords = useAppStore((state) => state.coords);
  const activeRide = useRideStore((state) => state.activeRide);
  const driverRoute = useRideStore((state) => state.driverRoute);
  const advanceRide = useRideStore((state) => state.advanceRide);
  const cancelRide = useRideStore((state) => state.cancelRide);

  const [progress, setProgress] = useState(0);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  // Simula o avanco da maquina de estados da corrida.
  useEffect(() => {
    if (!activeRide) {
      router.replace('/(app)/home');
      return;
    }

    const timers = [
      setTimeout(() => advanceRide(), 2600),
      setTimeout(() => advanceRide(), 5200),
      setTimeout(() => router.replace(`/(app)/ride/${activeRide.id}`), 7200),
    ];

    return () => timers.forEach(clearTimeout);
  }, [activeRide, advanceRide, router]);

  useEffect(() => {
    const interval = setInterval(() => setProgress((value) => Math.min(2, value + 1)), 2600);
    return () => clearInterval(interval);
  }, []);

  if (!activeRide) return null;

  const step = PHASE_STEPS[Math.min(progress, PHASE_STEPS.length - 1)];
  const center = coords ?? activeRide.pickup.coords;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <Badge text="CORRIDA ATIVA" tone="success" />
          <Pressable onPress={async () => { await cancelRide(); router.replace('/(app)/home'); }}>
            <Text style={styles.cancel}>Cancelar</Text>
          </Pressable>
        </View>

        <View style={styles.mapWrapper}>
          <MapCanvas
            center={center}
            markers={[
              { id: 'pickup', coords: activeRide.pickup.coords, kind: 'pickup' },
              { id: 'dropoff', coords: activeRide.dropoff.coords, kind: 'dropoff' },
              ...(activeRide.driver ? [{ id: 'driver', coords: activeRide.driver.position, kind: 'car' as const }] : []),
            ]}
            driverRoute={driverRoute}
            route={[activeRide.pickup.coords, activeRide.dropoff.coords]}
            height={260}
            zoom={0.06}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.pulse,
              {
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.5] }) }],
              },
            ]}
          />
        </View>

        <Card>
          <Text style={styles.stepLabel}>{step.label}</Text>
          <Text style={styles.stepHint}>{step.hint}</Text>

          <View style={styles.steps}>
            {PHASE_STEPS.map((item, index) => (
              <View key={item.status} style={[styles.stepDot, index <= progress ? styles.stepDotActive : null]} />
            ))}
          </View>

          <Divider />

          <Text style={styles.addressLabel}>DESTINO</Text>
          <Text style={styles.address} numberOfLines={2}>{activeRide.dropoff.address}</Text>

          <View style={styles.fareRow}>
            <Text style={styles.fareLabel}>Valor estimado</Text>
            <Text style={styles.fareValue}>{formatMoney(activeRide.fareCents)}</Text>
          </View>
        </Card>

        {activeRide.driver ? (
          <Card>
            <Text style={styles.stepLabel}>{activeRide.driver.name}</Text>
            <Text style={styles.stepHint}>
              {activeRide.driver.vehicle} • {activeRide.driver.color} • {activeRide.driver.plate}
            </Text>
            <Divider />
            <Text style={styles.pinLabel}>PIN DE EMBARQUE</Text>
            <Text style={styles.pin}>{activeRide.pin}</Text>
          </Card>
        ) : null}

        <Button label="Ver detalhes da viagem" variant="secondary" onPress={() => router.replace(`/(app)/ride/${activeRide.id}`)} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, padding: spacing.lg, gap: spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cancel: { ...typography.bodyStrong, color: colors.danger },
  mapWrapper: { position: 'relative' },
  pulse: {
    position: 'absolute',
    alignSelf: 'center',
    top: '38%',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.primary,
  },
  stepLabel: { ...typography.heading, color: colors.text },
  stepHint: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
  steps: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  stepDot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border },
  stepDotActive: { backgroundColor: colors.primary },
  addressLabel: { ...typography.label, color: colors.textFaint },
  address: { ...typography.body, color: colors.text, marginTop: spacing.xs },
  fareRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md },
  fareLabel: { ...typography.body, color: colors.textMuted },
  fareValue: { ...typography.bodyStrong, color: colors.primary, fontSize: 17 },
  pinLabel: { ...typography.label, color: colors.textFaint },
  pin: { ...typography.title, color: colors.primary, letterSpacing: 6 },
});
