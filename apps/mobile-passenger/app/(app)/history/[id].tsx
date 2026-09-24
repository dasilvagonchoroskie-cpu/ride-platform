import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar, Badge, Button, Card, Divider, Stars } from '../../../src/components/ui';
import { MapCanvas } from '../../../src/components/MapCanvas';
import { colors, spacing, typography } from '../../../src/theme/tokens';
import { useRideStore } from '../../../src/store/rideStore';
import { formatDateTime, formatDistance, formatDuration, formatMoney } from '../../../src/lib/geo';

export default function HistoryDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const ride = useRideStore((state) => state.history.find((item) => item.id === params.id));

  if (!ride) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.meta}>Corrida nao encontrada.</Text>
          <Button label="Voltar" onPress={() => router.replace('/(app)/history')} />
        </View>
      </SafeAreaView>
    );
  }

  const center = {
    latitude: (ride.pickup.coords.latitude + ride.dropoff.coords.latitude) / 2,
    longitude: (ride.pickup.coords.longitude + ride.dropoff.coords.longitude) / 2,
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.replace('/(app)/history')}>
            <Text style={styles.back}>Historico</Text>
          </Pressable>
          <Badge text={ride.code} tone="info" />
        </View>

        <MapCanvas
          center={center}
          markers={[
            { id: 'pickup', coords: ride.pickup.coords, kind: 'pickup' },
            { id: 'dropoff', coords: ride.dropoff.coords, kind: 'dropoff' },
          ]}
          route={[ride.pickup.coords, ride.dropoff.coords]}
          height={210}
          zoom={0.09}
        />

        <Card>
          <Text style={styles.date}>{formatDateTime(ride.finishedAt ?? ride.createdAt)}</Text>
          <Divider />
          <View style={styles.row}>
            <Text style={styles.label}>Distancia</Text>
            <Text style={styles.value}>{formatDistance(ride.distanceMeters)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Duracao</Text>
            <Text style={styles.value}>{formatDuration(ride.durationSeconds)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Categoria</Text>
            <Text style={styles.value}>{ride.category.name}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Pagamento</Text>
            <Text style={styles.value}>{ride.paymentMethod}</Text>
          </View>
          <Divider />
          <View style={styles.row}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatMoney(ride.fareCents)}</Text>
          </View>
        </Card>

        {ride.driver ? (
          <Card>
            <View style={styles.driverRow}>
              <Avatar name={ride.driver.name} size={48} />
              <View style={{ flex: 1 }}>
                <Text style={styles.driverName}>{ride.driver.name}</Text>
                <Text style={styles.meta}>
                  {ride.driver.vehicle} • {ride.driver.plate}
                </Text>
              </View>
              {ride.rating ? <Stars value={ride.rating} /> : null}
            </View>
          </Card>
        ) : null}

        <Button label="Fazer nova corrida" onPress={() => router.replace('/(app)/home')} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { ...typography.bodyStrong, color: colors.primary },
  date: { ...typography.bodyStrong, color: colors.text },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  label: { ...typography.body, color: colors.textMuted },
  value: { ...typography.bodyStrong, color: colors.text },
  totalLabel: { ...typography.heading, color: colors.text },
  totalValue: { ...typography.heading, color: colors.primary },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  driverName: { ...typography.bodyStrong, color: colors.text },
  meta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
});
