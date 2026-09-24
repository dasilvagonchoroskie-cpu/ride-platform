import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { colors, radius, shadow, spacing, typography } from '../theme/tokens';

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        variantStyles[variant].container,
        pressed && !isDisabled ? styles.pressed : null,
        isDisabled ? styles.disabled : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.background : colors.text} />
      ) : (
        <Text style={[styles.buttonLabel, variantStyles[variant].label]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Field({
  label,
  hint,
  error,
  ...props
}: TextInputProps & { label?: string; hint?: string; error?: string | null }) {
  return (
    <View style={styles.fieldWrapper}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.textFaint}
        style={[styles.input, error ? styles.inputError : null]}
        {...props}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : hint ? <Text style={styles.hintText}>{hint}</Text> : null}
    </View>
  );
}

export function SectionTitle({ children, action }: { children: string; action?: React.ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {action}
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

export function Badge({ text, tone = 'neutral' }: { text: string; tone?: 'neutral' | 'success' | 'danger' | 'info' }) {
  const toneStyle = {
    neutral: { backgroundColor: colors.surfaceElevated, color: colors.textMuted },
    success: { backgroundColor: colors.primarySoft, color: colors.primary },
    danger: { backgroundColor: colors.dangerSoft, color: colors.danger },
    info: { backgroundColor: 'rgba(59,157,255,0.16)', color: colors.info },
  }[tone];

  return (
    <View style={[styles.badge, { backgroundColor: toneStyle.backgroundColor }]}>
      <Text style={[styles.badgeText, { color: toneStyle.color }]}>{text}</Text>
    </View>
  );
}

export function Avatar({ name, size = 48 }: { name: string; size?: number }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.36 }]}>{initials || '?'}</Text>
    </View>
  );
}

export function Stars({ value, size = 13 }: { value: number; size?: number }) {
  const rounded = Math.round(value);
  return (
    <Text style={{ color: colors.warning, fontSize: size }}>
      {'★'.repeat(rounded)}
      <Text style={{ color: colors.textFaint }}>{'★'.repeat(Math.max(0, 5 - rounded))}</Text>
    </Text>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDescription}>{description}</Text>
    </View>
  );
}

const variantStyles = {
  primary: {
    container: { backgroundColor: colors.primary },
    label: { color: colors.background },
  },
  secondary: {
    container: { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border },
    label: { color: colors.text },
  },
  ghost: {
    container: { backgroundColor: 'transparent' },
    label: { color: colors.textMuted },
  },
  danger: {
    container: { backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.danger },
    label: { color: colors.danger },
  },
} as const;

const styles = StyleSheet.create({
  button: {
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  buttonLabel: { ...typography.bodyStrong, fontSize: 16 },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.45 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  fieldWrapper: { marginBottom: spacing.md },
  fieldLabel: { ...typography.label, color: colors.textMuted, marginBottom: spacing.xs, textTransform: 'uppercase' },
  input: {
    height: 52,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 16,
  },
  inputError: { borderColor: colors.danger },
  errorText: { ...typography.caption, color: colors.danger, marginTop: spacing.xs },
  hintText: { ...typography.caption, color: colors.textFaint, marginTop: spacing.xs },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitle: { ...typography.heading, color: colors.text },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill },
  badgeText: { ...typography.label, fontSize: 10 },
  avatar: {
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.primary, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyTitle: { ...typography.heading, color: colors.text },
  emptyDescription: { ...typography.caption, color: colors.textMuted, textAlign: 'center', paddingHorizontal: spacing.xl },
});
