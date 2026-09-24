import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge, Button, Card, Divider, Field, SectionTitle } from '../../src/components/ui';
import { MapCanvas, MapMarker } from '../../src/components/MapCanvas';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';
import { useAppStore } from '../../src/store/appStore';
import { useAuthStore } from '../../src/store/authStore';
import { useRideStore } from '../../src/store/rideStore';
import { demoSuggestions } from '../../src/mock/demoEngine';
import { formatDistance } from '../../src/lib/geo';

export default function HomeScreen() {
  const router = useRouter();
  const coords = useAppStore((state) => state.coords);
  const recentPlaces = useAppStore((state) => state.recentPlaces);
  const addRecentPlace = useAppStore((state) => state.addRecentPlace);
  const dataSource = useAppStore((state) => state.dataSource);
  const user = useAuthStore((state) => state.user);
  const nearbyDrivers = useRideStore((state) => state.nearbyDrivers);
  const estimate = useRideStore((state) => state.estimate);
  const estimating = useRideStore((state) => state.estimating);

  const [destination, setDestination] = useState('');
  const [suggestions, setSuggestions] = useState<ReturnType<typeof demoSuggestions>>([]);
  const [loadingEstimate, setLoadingEstimate] = useState(false);

  useEffect(() => {
    if (coords) setSuggestions(demoSuggestions(coords).slice(0, 6));
  }, [coords]);

  const center = coords ?? { latitude: -23.5613, longitude: -46.6565 };

  const markers: MapMarker[] = [
    { id: 'me', coords: center, kind: 'pickup', label: 'Voce' },
    ...nearbyDrivers.map((driver) => ({
      id: driver.id,
      coords: driver.position,
      kind: 'car' as const,
      label: driver.name,
    })),
  ];

  async function handleSearch() {
    const found = suggestions.find((item) => item.address === destination);
    if (!found || !coords) return;

    setLoadingEstimate(true);
    await addRecentPlace(found.address);
    await estimate(coords, found.coords);
    setLoadingEstimate(false);

    router.push({
      pathname: '/(app)/confirm',
      params: {
        address: found.address,
        latitude: String(found.coords.latitude),
        longitude: String(found.coords.longitude),
      },
    });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Ola, {user?.name?.split(' ')[0] ?? 'passageiro'}</Text>
            <Text style={styles.subGreeting}>Para onde voce vai hoje?</Text>
          </View>
          <Pressable onPress={() => router.push('/(app)/account')}>
            <Badge text={dataSource === 'api' ? 'ONLINE' : 'DEMO'} tone={dataSource === 'api' ? 'success' : 'info'} />
          </Pressable>
        </View>

        <MapCanvas center={center} markers={markers} height={260} />

        <Card style={styles.searchCard}>
          <Field
            label="Destino"
            value={destination}
            onChangeText={setDestination}
            placeholder="Digite o endereco de destino"
            autoCorrect={false}
          />

          {recentPlaces.length > 0 && !destination ? (
            <>
              <Text style={styles.blockLabel}>RECENTES</Text>
              {recentPlaces.slice(0, 3).map((place) => (
                <Pressable key={place} onPress={() => setDestination(place)} style={styles.suggestionRow}>
                  <Text style={styles.suggestionText} numberOfLines={1}>
                    {place}
                  </Text>
                </Pressable>
              ))}
              <Divider />
            </>
          ) : null}

          {destination.length >= 2 ? (
            <>
              <Text style={styles.blockLabel}>SUGESTOES</Text>
              {suggestions
                .filter((item) => item.address.toLowerCase().includes(destination.toLowerCase()))
                .slice(0, 5)
                .map((item) => (
                  <Pressable key={item.address} onPress={() => setDestination(item.address)} style={styles.suggestionRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.suggestionText} numberOfLines={1}>
                        {item.address}
                      </Text>
                      <Text style={styles.suggestionMeta}>{formatDistance(item.distanceKm * 1000)} de voce</Text>
                    </View>
                  </Pressable>
                ))}
            </>
          ) : null}

          <Button
            label={loadingEstimate ? 'Calculando...' : 'Buscar corrida'}
            onPress={handleSearch}
            loading={loadingEstimate || estimating}
            disabled={!destination}
            style={{ marginTop: spacing.md }}
          />
        </Card>

        <SectionTitle>Atalhos</SectionTitle>
        <View style={styles.shortcuts}>
          <Pressable style={styles.shortcut} onPress={() => router.push('/(app)/history')}>
            <Text style={styles.shortcutTitle}>Historico</Text>
            <Text style={styles.shortcutText}>Suas corridas</Text>
          </Pressable>
          <Pressable style={styles.shortcut} onPress={() => router.push('/(app)/wallet')}>
            <Text style={styles.shortcutTitle}>Pagamento</Text>
            <Text style={styles.shortcutText}>Formas e cupons</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  greeting: { ...typography.title, color: colors.text },
  subGreeting: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  searchCard: { marginTop: -spacing.sm },
  blockLabel: { ...typography.label, color: colors.textFaint, marginBottom: spacing.xs, marginTop: spacing.sm },
  suggestionRow: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  suggestionText: { ...typography.body, color: colors.text },
  suggestionMeta: { ...typography.caption, color: colors.textFaint, marginTop: 2 },
  shortcuts: { flexDirection: 'row', gap: spacing.md },
  shortcut: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  shortcutTitle: { ...typography.bodyStrong, color: colors.text },
  shortcutText: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
});
