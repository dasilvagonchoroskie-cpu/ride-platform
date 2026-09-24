import React, { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge, Button, Card, EmptyState } from '../../src/components/ui';
import { colors, spacing, typography } from '../../src/theme/tokens';
import { useAppStore } from '../../src/store/appStore';
import { useRideStore } from '../../src/store/rideStore';
import { formatDateTime, formatDistance, formatMoney } from '../../src/lib/geo';

export default function HistoryScreen() {
  const router = useRouter();
  const coords = useAppStore((state) => state.coords);
  const history = useRideStore((state) => state.history);
  const loadHistory = useRideStore((state) => state.loadHistory);

  useEffect(() => {
    if (coords && history.length === 0) void loadHistory(coords);
  }, [coords, history.length, loadHistory]);

  const completed = history.filter((ride) => ride.status === 'COMPLETED');
  const totalSpent = completed.reduce((sum, ride) => sum + ride.fareCents, 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.replace('/(app)/home')}>
            <Text style={styles.back}>Inicio</Text>
          </Pressable>
          <Badge text={`${completed.length} CORRIDAS`} tone="info" />
        </View>

        <Text style={styles.title}>Suas corridas</Text>

        <Card>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{completed.length}</Text>
              <Text style={styles.summaryLabel}>Concluidas</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{formatMoney(totalSpent)}</Text>
              <Text style={styles.summaryLabel}>Total gasto</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>
                {completed.length > 0 ? formatMoney(Math.round(totalSpent / completed.length)) : '—'}
              </Text>
              <Text style={styles.summaryLabel}>Media</Text>
            </View>
          </View>
        </Card>

        {history.length === 0 ? (
          <EmptyState title="Nenhuma corrida ainda" description="Suas corridas aparecem aqui depois da primeira viagem." />
        ) : (
          history.map((ride) => (
            <Pressable key={ride.id} onPress={() => router.push({ pathname: '/(app)/history/[id]', params: { id: ride.id } })}>
              <Card style={styles.rideCard}>
                <View style={styles.rideHeader}>
                  <Text style={styles.rideCode}>{ride.code}</Text>
                  <Badge
                    text={ride.status === 'COMPLETED' ? 'CONCLUIDA' : 'CANCELADA'}
                    tone={ride.status === 'COMPLETED' ? 'success' : 'danger'}
                  />
                </View>
                <Text style={styles.rideDate}>{formatDateTime(ride.finishedAt ?? ride.createdAt)}</Text>
                <Text style={styles.rideAddress} numberOfLines={1}>{ride.dropoff.address}</Text>
                <View style={styles.rideFooter}>
                  <Text style={styles.rideMeta}>
                    {ride.category.name} • {formatDistance(ride.distanceMeters)}
                  </Text>
                  <Text style={styles.ridePrice}>{formatMoney(ride.fareCents)}</Text>
                </View>
              </Card>
            </Pressable>
          ))
        )}

        <Button label="Nova corrida" onPress={() => router.replace('/(app)/home')} style={{ marginTop: spacing.md }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { ...typography.bodyStrong, color: colors.primary },
  title: { ...typography.title, color: colors.text },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { ...typography.bodyStrong, color: colors.text, fontSize: 17 },
  summaryLabel: { ...typography.caption, color: colors.textFaint, marginTop: 2 },
  rideCard: { padding: spacing.lg },
  rideHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rideCode: { ...typography.bodyStrong, color: colors.primary, letterSpacing: 1 },
  rideDate: { ...typography.caption, color: colors.textFaint, marginTop: spacing.xs },
  rideAddress: { ...typography.body, color: colors.text, marginTop: spacing.sm },
  rideFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
  rideMeta: { ...typography.caption, color: colors.textMuted },
  ridePrice: { ...typography.bodyStrong, color: colors.text },
});
