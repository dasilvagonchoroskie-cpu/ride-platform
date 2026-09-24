import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar, Badge, Button, Card, Divider, Stars } from '../../../src/components/ui';
import { MapCanvas } from '../../../src/components/MapCanvas';
import { colors, radius, spacing, typography } from '../../../src/theme/tokens';
import { useAppStore } from '../../../src/store/appStore';
import { useRideStore } from '../../../src/store/rideStore';
import { buildRoute } from '../../../src/lib/geo';
import { formatDistance, formatDuration, formatMoney } from '../../../src/lib/geo';

export default function RideScreen() {
  const router = useRouter();
  const activeRide = useRideStore((state) => state.activeRide);
  const advanceRide = useRideStore((state) => state.advanceRide);
  const coords = useAppStore((state) => state.coords);
  const [tripRoute, setTripRoute] = useState<ReturnType<typeof buildRoute>>([]);

  useEffect(() => {
    if (activeRide?.status === 'IN_PROGRESS') {
      setTripRoute(buildRoute(activeRide.pickup.coords, activeRide.dropoff.coords, 40));
    }
  }, [activeRide?.status, activeRide?.pickup.coords, activeRide?.dropoff.coords]);

  if (!activeRide) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.hint}>Nenhuma corrida ativa.</Text>
          <Button label="Voltar ao inicio" onPress={() => router.replace('/(app)/home')} />
        </View>
      </SafeAreaView>
    );
  }

  const isFinished = activeRide.status === 'COMPLETED';
  const center = coords ?? activeRide.pickup.coords;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.replace('/(app)/home')}>
            <Text style={styles.back}>Inicio</Text>
          </Pressable>
          <Badge
            text={isFinished ? 'FINALIZADA' : activeRide.status === 'IN_PROGRESS' ? 'EM ANDAMENTO' : 'A CAMINHO'}
            tone={isFinished ? 'success' : 'info'}
          />
        </View>

        <MapCanvas
          center={center}
          markers={[
            { id: 'pickup', coords: activeRide.pickup.coords, kind: 'pickup' },
            { id: 'dropoff', coords: activeRide.dropoff.coords, kind: 'dropoff' },
            ...(activeRide.driver ? [{ id: 'driver', coords: activeRide.driver.position, kind: 'car' as const }] : []),
          ]}
          route={tripRoute.length > 1 ? tripRoute : [activeRide.pickup.coords, activeRide.dropoff.coords]}
          height={250}
          zoom={0.07}
        />

        {activeRide.driver ? (
          <Card>
            <View style={styles.driverRow}>
              <Avatar name={activeRide.driver.name} size={54} />
              <View style={{ flex: 1 }}>
                <Text style={styles.driverName}>{activeRide.driver.name}</Text>
                <View style={styles.ratingRow}>
                  <Stars value={activeRide.driver.rating} />
                  <Text style={styles.driverMeta}>{activeRide.driver.rating.toFixed(2)}</Text>
                </View>
                <Text style={styles.driverMeta}>
                  {activeRide.driver.vehicle} • {activeRide.driver.color}
                </Text>
              </View>
              <View style={styles.plateBox}>
                <Text style={styles.plateText}>{activeRide.driver.plate}</Text>
              </View>
            </View>

            <Divider />

            <View style={styles.pinRow}>
              <View>
                <Text style={styles.pinLabel}>PIN DE EMBARQUE</Text>
                <Text style={styles.pin}>{activeRide.pin}</Text>
              </View>
              <Text style={styles.totalRides}>{activeRide.driver.totalRides} corridas</Text>
            </View>
          </Card>
        ) : null}

        <Card>
          <Text style={styles.sectionLabel}>ROTA</Text>
          <View style={styles.routeRow}>
            <View style={[styles.dot, { backgroundColor: colors.primary }]} />
            <Text style={styles.routeText} numberOfLines={2}>{activeRide.pickup.address}</Text>
          </View>
          <View style={styles.routeConnector} />
          <View style={styles.routeRow}>
            <View style={[styles.dot, { backgroundColor: colors.danger }]} />
            <Text style={styles.routeText} numberOfLines={2}>{activeRide.dropoff.address}</Text>
          </View>

          <Divider />

          <View style={styles.metricsRow}>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{formatDistance(activeRide.distanceMeters)}</Text>
              <Text style={styles.metricLabel}>Distancia</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{formatDuration(activeRide.durationSeconds)}</Text>
              <Text style={styles.metricLabel}>Duracao</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{formatMoney(activeRide.fareCents)}</Text>
              <Text style={styles.metricLabel}>{activeRide.paymentMethod}</Text>
            </View>
          </View>
        </Card>

        {isFinished ? (
          <Button label="Avaliar e finalizar" onPress={() => router.replace('/(app)/ride/complete')} />
        ) : (
          <Button label="Simular avanco da viagem" variant="secondary" onPress={advanceRide} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xl },
  hint: { ...typography.body, color: colors.textMuted },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { ...typography.bodyStrong, color: colors.primary },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  driverName: { ...typography.bodyStrong, color: colors.text, fontSize: 16 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  driverMeta: { ...typography.caption, color: colors.textMuted },
  plateBox: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  plateText: { ...typography.bodyStrong, color: colors.text, letterSpacing: 1 },
  pinRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  pinLabel: { ...typography.label, color: colors.textFaint },
  pin: { ...typography.title, color: colors.primary, letterSpacing: 6 },
  totalRides: { ...typography.caption, color: colors.textFaint },
  sectionLabel: { ...typography.label, color: colors.textFaint, marginBottom: spacing.md },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dot: { width: 10, height: 10, borderRadius: 5 },
  routeConnector: { width: 1, height: 18, backgroundColor: colors.border, marginLeft: 4.5, marginVertical: 2 },
  routeText: { ...typography.body, color: colors.text, flex: 1 },
  metricsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  metric: { flex: 1, alignItems: 'center' },
  metricValue: { ...typography.bodyStrong, color: colors.text, fontSize: 16 },
  metricLabel: { ...typography.caption, color: colors.textFaint, marginTop: 2, textAlign: 'center' },
});
