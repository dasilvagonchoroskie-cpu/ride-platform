import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge, Button, Card, Divider, Field, SectionTitle } from '../../src/components/ui';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';
import { demoPaymentMethods } from '../../src/mock/demoEngine';

const COUPONS = [
  { code: 'PRIMEIRACORRIDA', description: 'R$ 10 de desconto na primeira corrida', expires: 'Vence em 30 dias' },
  { code: 'VOLTEI20', description: '20% de desconto ate R$ 15', expires: 'Vence em 7 dias' },
];

export default function WalletScreen() {
  const router = useRouter();
  const [selected, setSelected] = useState('pm1');
  const [coupon, setCoupon] = useState('');
  const [couponMessage, setCouponMessage] = useState<string | null>(null);

  function applyCoupon() {
    const found = COUPONS.find((item) => item.code === coupon.trim().toUpperCase());
    setCouponMessage(found ? `Cupom ${found.code} aplicado.` : 'Cupom invalido ou expirado.');
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.replace('/(app)/home')}>
            <Text style={styles.back}>Inicio</Text>
          </Pressable>
          <Badge text="PAGAMENTO" tone="info" />
        </View>

        <Text style={styles.title}>Formas de pagamento</Text>

        {demoPaymentMethods().map((method) => (
          <Pressable
            key={method.id}
            onPress={() => setSelected(method.id)}
            style={[styles.method, selected === method.id ? styles.methodSelected : null]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.methodLabel}>{method.label}</Text>
              <Text style={styles.methodDetail}>{method.detail}</Text>
            </View>
            {selected === method.id ? <Text style={styles.check}>✓</Text> : null}
          </Pressable>
        ))}

        <SectionTitle>Cupons</SectionTitle>
        <Card>
          <Field
            label="Codigo do cupom"
            value={coupon}
            onChangeText={setCoupon}
            placeholder="PRIMEIRACORRIDA"
            autoCapitalize="characters"
            error={couponMessage && couponMessage.includes('invalido') ? couponMessage : null}
            hint={couponMessage && !couponMessage.includes('invalido') ? couponMessage : undefined}
          />
          <Button label="Aplicar cupom" variant="secondary" onPress={applyCoupon} disabled={!coupon} />
          <Divider />
          {COUPONS.map((item) => (
            <View key={item.code} style={styles.couponRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.couponCode}>{item.code}</Text>
                <Text style={styles.methodDetail}>{item.description}</Text>
              </View>
              <Text style={styles.couponExpires}>{item.expires}</Text>
            </View>
          ))}
        </Card>

        <Button label="Voltar ao inicio" onPress={() => router.replace('/(app)/home')} />
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
  method: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  methodSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  methodLabel: { ...typography.bodyStrong, color: colors.text },
  methodDetail: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  check: { color: colors.primary, fontSize: 18, fontWeight: '700' },
  couponRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.md },
  couponCode: { ...typography.bodyStrong, color: colors.primary, letterSpacing: 1 },
  couponExpires: { ...typography.caption, color: colors.textFaint },
});
