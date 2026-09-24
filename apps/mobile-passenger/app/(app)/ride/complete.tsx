import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar, Badge, Button, Card, Divider } from '../../../src/components/ui';
import { colors, radius, spacing, typography } from '../../../src/theme/tokens';
import { useRideStore } from '../../../src/store/rideStore';
import { formatDateTime, formatDistance, formatMoney } from '../../../src/lib/geo';

const TAGS = ['Motorista educado', 'Carro limpo', 'Direcao segura', 'Chegou rapido', 'Otimo trajeto'];

export default function RideCompleteScreen() {
  const router = useRouter();
  const activeRide = useRideStore((state) => state.activeRide);
  const history = useRideStore((state) => state.history);
  const completeRide = useRideStore((state) => state.completeRide);

  const ride = activeRide ?? history[0] ?? null;
  const [score, setScore] = useState(5);
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  if (!ride) {
    router.replace('/(app)/home');
    return null;
  }

  async function handleSubmit() {
    setSaving(true);
    await completeRide(score);
    setSaving(false);
    router.replace('/(app)/history');
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Badge text="CORRIDA FINALIZADA" tone="success" />
          <Text style={styles.title}>Voce chegou ao destino</Text>
          <Text style={styles.subtitle}>{formatDateTime(ride.finishedAt ?? ride.createdAt)}</Text>
        </View>

        <Card>
          <Text style={styles.sectionLabel}>RECIBO</Text>
          <View style={styles.receiptRow}>
            <Text style={styles.receiptLabel}>Valor total</Text>
            <Text style={styles.receiptValue}>{formatMoney(ride.fareCents)}</Text>
          </View>
          <View style={styles.receiptRow}>
            <Text style={styles.receiptLabel}>Distancia</Text>
            <Text style={styles.receiptValue}>{formatDistance(ride.distanceMeters)}</Text>
          </View>
          <View style={styles.receiptRow}>
            <Text style={styles.receiptLabel}>Pagamento</Text>
            <Text style={styles.receiptValue}>{ride.paymentMethod}</Text>
          </View>
          <View style={styles.receiptRow}>
            <Text style={styles.receiptLabel}>Categoria</Text>
            <Text style={styles.receiptValue}>{ride.category.name}</Text>
          </View>
          <Divider />
          <Text style={styles.sectionLabel}>DESTINO</Text>
          <Text style={styles.address}>{ride.dropoff.address}</Text>
        </Card>

        {ride.driver ? (
          <Card>
            <View style={styles.driverRow}>
              <Avatar name={ride.driver.name} size={48} />
              <View style={{ flex: 1 }}>
                <Text style={styles.driverName}>{ride.driver.name}</Text>
                <Text style={styles.driverMeta}>
                  {ride.driver.vehicle} • {ride.driver.plate}
                </Text>
              </View>
            </View>
            <Divider />
            <Text style={styles.sectionLabel}>COMO FOI A CORRIDA?</Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((value) => (
                <Pressable key={value} onPress={() => setScore(value)}>
                  <Text style={[styles.star, value <= score ? styles.starOn : null]}>★</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.tagsRow}>
              {TAGS.map((tag) => {
                const active = tags.includes(tag);
                return (
                  <Pressable
                    key={tag}
                    onPress={() => setTags(active ? tags.filter((item) => item !== tag) : [...tags, tag])}
                    style={[styles.tag, active ? styles.tagActive : null]}
                  >
                    <Text style={[styles.tagText, active ? styles.tagTextActive : null]}>{tag}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>
        ) : null}

        <Button label="Enviar avaliacao" onPress={handleSubmit} loading={saving} />
        <Button label="Ver historico" variant="ghost" onPress={() => router.replace('/(app)/history')} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  hero: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  title: { ...typography.title, color: colors.text, textAlign: 'center' },
  subtitle: { ...typography.caption, color: colors.textMuted },
  sectionLabel: { ...typography.label, color: colors.textFaint, marginBottom: spacing.sm },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  receiptLabel: { ...typography.body, color: colors.textMuted },
  receiptValue: { ...typography.bodyStrong, color: colors.text },
  address: { ...typography.body, color: colors.text },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  driverName: { ...typography.bodyStrong, color: colors.text },
  driverMeta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  starsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  star: { fontSize: 34, color: colors.border },
  starOn: { color: colors.warning },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tag: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  tagActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  tagText: { ...typography.caption, color: colors.textMuted },
  tagTextActive: { color: colors.primary },
});
