import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Field } from '../../src/components/ui';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';
import { useAuthStore } from '../../src/store/authStore';

export default function OtpScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ phone: string; debugCode?: string }>();
  const phone = params.phone ?? '';
  const [code, setCode] = useState(params.debugCode ?? '');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const verifyOtp = useAuthStore((state) => state.verifyOtp);

  async function handleVerify() {
    if (code.length !== 6) {
      setError('O codigo tem 6 digitos.');
      return;
    }
    setError(null);
    setLoading(true);

    try {
      await verifyOtp(phone, code);
      router.replace('/(app)/home');
    } catch {
      setError('Codigo incorreto ou expirado.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.title}>Digite o codigo</Text>
        <Text style={styles.subtitle}>Enviamos um SMS para {phone}</Text>

        {params.debugCode ? (
          <View style={styles.devBox}>
            <Text style={styles.devText}>Ambiente de teste: codigo {params.debugCode}</Text>
          </View>
        ) : null}

        <Field
          label="Codigo"
          value={code}
          onChangeText={(value) => setCode(value.replace(/\D+/g, '').slice(0, 6))}
          placeholder="000000"
          keyboardType="number-pad"
          maxLength={6}
          error={error}
        />

        <Button label="Verificar" onPress={handleVerify} loading={loading} disabled={code.length !== 6} />
        <Button label="Voltar" variant="ghost" onPress={() => router.back()} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, padding: spacing.xl, paddingTop: spacing.xxxl, gap: spacing.lg },
  title: { ...typography.title, color: colors.text },
  subtitle: { ...typography.body, color: colors.textMuted, marginTop: -spacing.sm },
  devBox: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.primaryDark,
  },
  devText: { ...typography.caption, color: colors.primary },
});
