import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar, Badge, Button, Card, Divider, Field, SectionTitle } from '../../src/components/ui';
import { colors, spacing, typography } from '../../src/theme/tokens';
import { useAppStore } from '../../src/store/appStore';
import { useAuthStore } from '../../src/store/authStore';
import { APP_VERSION } from '../../src/services/config';
import { formatCoords } from '../../src/services/location';

export default function AccountScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const updateProfile = useAuthStore((state) => state.updateProfile);
  const logout = useAuthStore((state) => state.logout);
  const dataSource = useAppStore((state) => state.dataSource);
  const coords = useAppStore((state) => state.coords);
  const locationGranted = useAppStore((state) => state.locationGranted);
  const recentPlaces = useAppStore((state) => state.recentPlaces);

  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [saved, setSaved] = useState(false);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Conta</Text>
          <Badge text={dataSource === 'api' ? 'SERVIDOR' : 'DEMO'} tone={dataSource === 'api' ? 'success' : 'info'} />
        </View>

        <Card>
          <View style={styles.profileRow}>
            <Avatar name={user?.name ?? 'Passageiro'} size={60} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{user?.name ?? 'Passageiro'}</Text>
              <Text style={styles.meta}>{user?.phone ?? '—'}</Text>
            </View>
          </View>
        </Card>

        <SectionTitle>Dados pessoais</SectionTitle>
        <Card>
          <Field label="Nome" value={name} onChangeText={setName} placeholder="Seu nome completo" />
          <Field
            label="E-mail"
            value={email}
            onChangeText={setEmail}
            placeholder="voce@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Button
            label={saved ? 'Salvo' : 'Salvar alteracoes'}
            variant="secondary"
            onPress={async () => {
              await updateProfile(name, email || undefined);
              setSaved(true);
              setTimeout(() => setSaved(false), 2000);
            }}
          />
        </Card>

        <SectionTitle>Enderecos recentes</SectionTitle>
        <Card>
          {recentPlaces.length === 0 ? (
            <Text style={styles.meta}>Nenhum endereco salvo ainda.</Text>
          ) : (
            recentPlaces.map((place, index) => (
              <View key={place}>
                {index > 0 ? <Divider /> : null}
                <Text style={styles.address} numberOfLines={2}>{place}</Text>
              </View>
            ))
          )}
        </Card>

        <SectionTitle>Diagnostico</SectionTitle>
        <Card>
          <View style={styles.diagRow}>
            <Text style={styles.meta}>Versao do app</Text>
            <Text style={styles.diagValue}>{APP_VERSION}</Text>
          </View>
          <Divider />
          <View style={styles.diagRow}>
            <Text style={styles.meta}>Fonte de dados</Text>
            <Text style={styles.diagValue}>{dataSource === 'api' ? 'API' : 'Demonstracao local'}</Text>
          </View>
          <Divider />
          <View style={styles.diagRow}>
            <Text style={styles.meta}>Permissao de localizacao</Text>
            <Text style={styles.diagValue}>{locationGranted ? 'Concedida' : 'Negada (usando padrao)'}</Text>
          </View>
          <Divider />
          <View style={styles.diagRow}>
            <Text style={styles.meta}>Posicao atual</Text>
            <Text style={styles.diagValue}>{coords ? formatCoords(coords) : '—'}</Text>
          </View>
        </Card>

        <Button label="Sair da conta" variant="danger" onPress={async () => { await logout(); router.replace('/(auth)/welcome'); }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...typography.title, color: colors.text },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  name: { ...typography.heading, color: colors.text },
  meta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  address: { ...typography.body, color: colors.text, paddingVertical: spacing.xs },
  diagRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  diagValue: { ...typography.caption, color: colors.text, maxWidth: '55%', textAlign: 'right' },
});
