import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Button, Card } from '../../src/components/ui';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';
import { useAppStore } from '../../src/store/appStore';
import { useAuthStore } from '../../src/store/authStore';

const HIGHLIGHTS = [
  { title: 'Motorista em minutos', text: 'Pareamento automatico com o motorista mais proximo.' },
  { title: 'Preco transparente', text: 'Veja o valor estimado antes de confirmar a corrida.' },
  { title: 'Viagem acompanhada', text: 'Acompanhe a rota em tempo real do inicio ao fim.' },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const dataSource = useAppStore((state) => state.dataSource);
  const demoLogin = useAuthStore((state) => state.demoLogin);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={[colors.primarySoft, 'transparent']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.hero}
        >
          <Text style={styles.brand}>Ride</Text>
          <Text style={styles.tagline}>Seu transporte sob demanda</Text>
        </LinearGradient>

        <View style={styles.cards}>
          {HIGHLIGHTS.map((item) => (
            <Card key={item.title} style={styles.card}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardText}>{item.text}</Text>
            </Card>
          ))}
        </View>

        <View style={styles.footer}>
          <Button label="Continuar com telefone" onPress={() => router.push('/(auth)/phone')} />

          {dataSource === 'demo' ? (
            <>
              <Text style={styles.demoNotice}>
                Modo demonstracao ativo: o fluxo completo roda no aparelho, sem servidor.
              </Text>
              <Button
                label="Entrar em modo demonstracao"
                variant="secondary"
                onPress={async () => {
                  await demoLogin('Passageiro Demo', '+5511999990000');
                  router.replace('/(app)/home');
                }}
              />
            </>
          ) : (
            <Text style={styles.demoNotice}>
              Conectado ao servidor. O codigo de verificacao chega por SMS.
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
  hero: { alignItems: 'center', paddingTop: spacing.xxxl, paddingBottom: spacing.xxl, borderRadius: radius.xl },
  brand: { ...typography.display, color: colors.primary, fontSize: 46 },
  tagline: { ...typography.body, color: colors.textMuted, marginTop: spacing.xs },
  cards: { gap: spacing.md, marginTop: spacing.lg },
  card: { padding: spacing.lg },
  cardTitle: { ...typography.bodyStrong, color: colors.text },
  cardText: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
  footer: { marginTop: 'auto', paddingTop: spacing.xl, gap: spacing.md },
  demoNotice: { ...typography.caption, color: colors.textFaint, textAlign: 'center' },
});
