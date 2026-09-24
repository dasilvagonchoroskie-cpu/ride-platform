import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge, Button, Card, Divider, SectionTitle } from '../../src/components/ui';
import { MapCanvas } from '../../src/components/MapCanvas';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';
import { useAppStore } from '../../src/store/appStore';
import { useRideStore } from '../../src/store/rideStore';
import { demoPaymentMethods, type DemoCategory } from '../../src/mock/demoEngine';
import { formatDistance, formatDuration, formatMoney } from '../../src/lib/geo';

export default function ConfirmScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ address: string; latitude: string; longitude: string }>();
  const coords = useAppStore((state) => state.coords);
  const categories = useRideStore((state) => state.categories);
  const requestRide = useRideStore((state) => state.requestRide);

  const destination = useMemo(
    () => ({ latitude: Number(params.latitude), longitude: Number(params.longitude) }),
    [params.latitude, params.longitude],
  );
  const origin = coords ?? { latitude: -23.5613, longitude: -46.6565 };

  const [selected, setSelected] = useState<DemoCategory | null>(categories[1] ?? categories[0] ?? null);
  const [payment, setPayment] = useState(demoPaymentMethods()[0]);
  const [submitting, setSubmitting] = useState(false);

  const distanceMeters = useMemo(() => {
    const estimate = categories[0];
    return estimate ? Math.round((estimate.priceCents / 180) * 1000) : 3200;
  }, [categories]);

  async function handleConfirm() {
    if (!selected) return;
    setSubmitting(true);
    await requestRide({
      origin,
      destination,
      pickupAddress: 'Localizacao atual',
      dropoffAddress: params.address ?? 'Destino',
      category: selected,
      paymentMethod: payment.label,
    });
    setSubmitting(false);
    router.replace('/(app)/searching');
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.back}>Voltar</Text>
          </Pressable>
          <Badge text="CONFIRMAR" tone="info" />
        </View>

        <MapCanvas
          center={{ latitude: (origin.latitude + destination.latitude) / 2, longitude: (origin.longitude + destination.longitude) / 2 }}
          markers={[
            { id: 'pickup', coords: origin, kind: 'pickup' },
            { id: 'dropoff', coords: destination, kind: 'dropoff' },
          ]}
          route={[origin, destination]}
          height={220}
          zoom={0.09}
        />

        <Card>
          <Text style={styles.addressLabel}>DESTINO</Text>
          <Text style={styles.address}>{params.address}</Text>
          <Divider />
          <View style={styles.metricsRow}>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{formatDistance(distanceMeters)}</Text>
              <Text style={styles.metricLabel}>Distancia</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{formatDuration(Math.round((distanceMeters / 1000 / 24) * 3600))}</Text>
              <Text style={styles.metricLabel}>Tempo</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{selected ? formatMoney(selected.priceCents) : '—'}</Text>
              <Text style={styles.metricLabel}>Estimativa</Text>
            </View>
          </View>
        </Card>

        <SectionTitle>Escolha a categoria</SectionTitle>
        {categories.map((category) => {
          const isSelected = selected?.id === category.id;
          return (
            <Pressable
              key={category.id}
              onPress={() => setSelected(category)}
              style={[styles.category, isSelected ? styles.categorySelected : null]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.categoryName}>{category.name}</Text>
                <Text style={styles.categoryMeta}>
                  {category.description} • {category.seats} lugar{category.seats > 1 ? 'es' : ''}
                </Text>
                <Text style={styles.categoryEta}>Chega em {category.etaMinutes} min</Text>
              </View>
              <Text style={styles.categoryPrice}>{formatMoney(category.priceCents)}</Text>
            </Pressable>
          );
        })}

        <SectionTitle>Forma de pagamento</SectionTitle>
        {demoPaymentMethods().map((method) => (
          <Pressable
            key={method.id}
            onPress={() => setPayment(method)}
            style={[styles.payment, payment.id === method.id ? styles.categorySelected : null]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.categoryName}>{method.label}</Text>
              <Text style={styles.categoryMeta}>{method.detail}</Text>
            </View>
            {payment.id === method.id ? <Text style={styles.check}>✓</Text> : null}
          </Pressable>
        ))}

        <Button
          label={selected ? `Confirmar ${formatMoney(selected.priceCents)}` : 'Confirmar'}
          onPress={handleConfirm}
          loading={submitting}
          disabled={!selected}
          style={{ marginTop: spacing.lg }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { ...typography.bodyStrong, color: colors.primary },
  addressLabel: { ...typography.label, color: colors.textFaint },
  address: { ...typography.bodyStrong, color: colors.text, marginTop: spacing.xs },
  metricsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  metric: { flex: 1, alignItems: 'center' },
  metricValue: { ...typography.bodyStrong, color: colors.text, fontSize: 17 },
  metricLabel: { ...typography.caption, color: colors.textFaint, marginTop: 2 },
  category: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  categorySelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  categoryName: { ...typography.bodyStrong, color: colors.text },
  categoryMeta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  categoryEta: { ...typography.caption, color: colors.primary, marginTop: 2 },
  categoryPrice: { ...typography.bodyStrong, color: colors.text, fontSize: 17 },
  payment: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  check: { color: colors.primary, fontSize: 18, fontWeight: '700' },
});
