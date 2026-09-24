import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Field } from '../../src/components/ui';
import { colors, spacing, typography } from '../../src/theme/tokens';
import { useAppStore } from '../../src/store/appStore';
import { useAuthStore } from '../../src/store/authStore';
import { formatPhone } from '../../src/lib/format';

export default function PhoneScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const dataSource = useAppStore((state) => state.dataSource);
  const requestOtp = useAuthStore((state) => state.requestOtp);
  const demoLogin = useAuthStore((state) => state.demoLogin);

  const digits = phone.replace(/\D+/g, '');
  const isValid = digits.length >= 10 && digits.length <= 11;

  async function handleContinue() {
    if (!isValid) {
      setError('Informe um telefone com DDD.');
      return;
    }
    setError(null);
    setSending(true);

    const normalized = `+55${digits}`;

    try {
      if (dataSource === 'demo') {
        await demoLogin('Passageiro Demo', normalized);
        router.replace('/(app)/home');
        return;
      }

      const { debugCode } = await requestOtp(normalized);
      router.push({ pathname: '/(auth)/otp', params: { phone: normalized, debugCode: debugCode ?? '' } });
    } catch {
      setError('Nao foi possivel enviar o codigo. Verifique o numero e tente novamente.');
    } finally {
      setSending(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Qual o seu telefone?</Text>
          <Text style={styles.subtitle}>
            Enviaremos um codigo de verificacao. Seus dados ficam protegidos.
          </Text>

          <Field
            label="Telefone"
            value={phone}
            onChangeText={(value) => setPhone(formatPhone(value))}
            placeholder="(11) 91234-5678"
            keyboardType="phone-pad"
            maxLength={16}
            error={error}
          />

          <Button label="Continuar" onPress={handleContinue} loading={sending} disabled={!isValid} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, padding: spacing.xl, paddingTop: spacing.xxxl, gap: spacing.lg },
  title: { ...typography.title, color: colors.text },
  subtitle: { ...typography.body, color: colors.textMuted, marginTop: -spacing.sm },
});
