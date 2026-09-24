import 'package:flutter/material.dart';

import '../core/theme/central_theme.dart';

/// Variantes de botao. `approve` usa o azul royal (aprovacoes);
/// `danger` fica para rejeicoes.
enum AppButtonVariant { primary, secondary, approve, success, ghost, danger }

class AppButton extends StatelessWidget {
  const AppButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.variant = AppButtonVariant.primary,
    this.loading = false,
    this.enabled = true,
    this.margin,
    this.icon,
  });

  final String label;
  final VoidCallback onPressed;
  final AppButtonVariant variant;
  final bool loading;
  final bool enabled;
  final EdgeInsetsGeometry? margin;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final isDisabled = !enabled || loading;

    final (Color background, Color foreground, BorderSide side) = switch (variant) {
      AppButtonVariant.primary ||
      AppButtonVariant.approve =>
        (AppColors.primary, AppColors.text, BorderSide.none),
      AppButtonVariant.success => (AppColors.success, AppColors.text, BorderSide.none),
      AppButtonVariant.secondary => (
          AppColors.surfaceElevated,
          AppColors.text,
          const BorderSide(color: AppColors.border),
        ),
      AppButtonVariant.ghost => (Colors.transparent, AppColors.textMuted, BorderSide.none),
      AppButtonVariant.danger => (
          AppColors.dangerSoft,
          AppColors.danger,
          const BorderSide(color: AppColors.danger),
        ),
    };

    return Padding(
      padding: margin ?? EdgeInsets.zero,
      child: SizedBox(
        height: 52,
        width: double.infinity,
        child: FilledButton(
          onPressed: isDisabled ? null : onPressed,
          style: FilledButton.styleFrom(
            backgroundColor: background,
            foregroundColor: foreground,
            disabledBackgroundColor: background.withValues(alpha: 0.42),
            disabledForegroundColor: foreground.withValues(alpha: 0.6),
            side: side,
            elevation: 0,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.sm)),
          ),
          child: loading
              ? SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(strokeWidth: 2.2, color: foreground),
                )
              : Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    if (icon != null) ...[
                      Icon(icon, size: 20, color: foreground),
                      const SizedBox(width: Spacing.sm),
                    ],
                    Text(label, style: AppText.button.copyWith(color: foreground)),
                  ],
                ),
        ),
      ),
    );
  }
}

class AppCard extends StatelessWidget {
  const AppCard({super.key, required this.child, this.padding});

  final Widget child;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: padding ?? const EdgeInsets.all(Spacing.lg),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(Radii.lg),
      ),
      child: child,
    );
  }
}

/// Cartao de metrica. `highlight` aplica o azul royal (financeiro).
class MetricCard extends StatelessWidget {
  const MetricCard({
    super.key,
    required this.label,
    required this.value,
    this.helper,
    this.icon,
    this.highlight = false,
  });

  final String label;
  final String value;
  final String? helper;
  final IconData? icon;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(Spacing.lg),
      decoration: BoxDecoration(
        color: highlight ? AppColors.primarySoft : AppColors.surface,
        border: Border.all(color: highlight ? AppColors.primary : AppColors.border),
        borderRadius: BorderRadius.circular(Radii.lg),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (icon != null) ...[
                Icon(
                  icon,
                  size: 16,
                  color: highlight ? AppColors.primary : AppColors.textMuted,
                ),
                const SizedBox(width: Spacing.sm),
              ],
              Expanded(
                child: Text(
                  label.toUpperCase(),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.label.copyWith(
                    color: highlight ? AppColors.primary : AppColors.textFaint,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: Spacing.sm),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              value,
              style: AppText.metric.copyWith(
                color: highlight ? AppColors.primary : AppColors.text,
              ),
            ),
          ),
          if (helper != null) ...[
            const SizedBox(height: Spacing.xs),
            Text(helper!, style: AppText.caption.copyWith(color: AppColors.textMuted)),
          ],
        ],
      ),
    );
  }
}

class AppField extends StatelessWidget {
  const AppField({
    super.key,
    this.label,
    this.hint,
    this.error,
    this.controller,
    this.keyboardType,
    this.onChanged,
    this.maxLength,
    this.prefixIcon,
    this.helper,
    this.enabled = true,
  });

  final String? label;
  final String? hint;
  final String? error;
  final TextEditingController? controller;
  final TextInputType? keyboardType;
  final ValueChanged<String>? onChanged;
  final int? maxLength;
  final IconData? prefixIcon;
  final String? helper;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (label != null) ...[
          Text(label!.toUpperCase(), style: AppText.label.copyWith(color: AppColors.textMuted)),
          const SizedBox(height: Spacing.xs),
        ],
        TextField(
          controller: controller,
          keyboardType: keyboardType,
          onChanged: onChanged,
          maxLength: maxLength,
          enabled: enabled,
          style: AppText.body.copyWith(fontSize: 16),
          decoration: InputDecoration(
            hintText: hint,
            counterText: '',
            errorText: error,
            helperText: helper,
            helperStyle: AppText.caption.copyWith(color: AppColors.textFaint),
            filled: true,
            fillColor: AppColors.surfaceElevated,
            prefixIcon: prefixIcon == null ? null : Icon(prefixIcon, color: AppColors.textMuted, size: 20),
            hintStyle: AppText.body.copyWith(color: AppColors.textFaint),
            contentPadding: const EdgeInsets.symmetric(horizontal: Spacing.md, vertical: Spacing.md),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(Radii.sm),
              borderSide: const BorderSide(color: AppColors.border),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(Radii.sm),
              borderSide: const BorderSide(color: AppColors.border),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(Radii.sm),
              borderSide: const BorderSide(color: AppColors.primary, width: 1.6),
            ),
          ),
        ),
      ],
    );
  }
}

class AppBadge extends StatelessWidget {
  const AppBadge({super.key, required this.text, this.tone = AppBadgeTone.neutral});

  final String text;
  final AppBadgeTone tone;

  @override
  Widget build(BuildContext context) {
    final (Color background, Color foreground) = switch (tone) {
      AppBadgeTone.neutral => (AppColors.surfaceElevated, AppColors.textMuted),
      AppBadgeTone.info => (AppColors.primarySoft, AppColors.primary),
      AppBadgeTone.success => (AppColors.successSoft, AppColors.success),
      AppBadgeTone.danger => (AppColors.dangerSoft, AppColors.danger),
      AppBadgeTone.warning => (AppColors.warningSoft, AppColors.warning),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: Spacing.sm, vertical: 4),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(Radii.pill),
      ),
      child: Text(
        text,
        style: AppText.label.copyWith(color: foreground, fontSize: 10, fontWeight: FontWeight.w700),
      ),
    );
  }
}

enum AppBadgeTone { neutral, info, success, danger, warning }

class AppAvatar extends StatelessWidget {
  const AppAvatar({super.key, required this.initials, this.size = 48});

  final String initials;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: size,
      width: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: AppColors.primarySoft,
        border: Border.all(color: AppColors.primaryDark),
        shape: BoxShape.circle,
      ),
      child: Text(
        initials.isEmpty ? '?' : initials,
        style: AppText.heading.copyWith(
          color: AppColors.primary,
          fontSize: size * 0.34,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class SectionTitle extends StatelessWidget {
  const SectionTitle({super.key, required this.text, this.action});

  final String text;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: Spacing.md),
      child: Row(
        children: [
          Expanded(child: Text(text, style: AppText.heading)),
          if (action != null) action!,
        ],
      ),
    );
  }
}

class AppDivider extends StatelessWidget {
  const AppDivider({super.key});

  @override
  Widget build(BuildContext context) => const Padding(
        padding: EdgeInsets.symmetric(vertical: Spacing.md),
        child: Divider(height: 1, color: AppColors.border),
      );
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.title, required this.description, this.icon});

  final String title;
  final String description;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: Spacing.xxl),
      child: Column(
        children: [
          if (icon != null) ...[
            Icon(icon, size: 44, color: AppColors.textFaint),
            const SizedBox(height: Spacing.md),
          ],
          Text(title, style: AppText.heading),
          const SizedBox(height: Spacing.sm),
          Text(
            description,
            textAlign: TextAlign.center,
            style: AppText.caption.copyWith(color: AppColors.textMuted),
          ),
        ],
      ),
    );
  }
}

/// Barra simples de faturamento por hora (painel financeiro).
class HourlyBarChart extends StatelessWidget {
  const HourlyBarChart({super.key, required this.values, this.height = 90});

  final List<int> values;
  final double height;

  @override
  Widget build(BuildContext context) {
    if (values.isEmpty) return const SizedBox.shrink();

    final max = values.reduce((a, b) => a > b ? a : b);

    return SizedBox(
      height: height,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          for (var i = 0; i < values.length; i++)
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 2),
                child: Container(
                  height: max == 0 ? 4 : (values[i] / max) * height,
                  decoration: BoxDecoration(
                    color: i == values.length - 1
                        ? AppColors.primary
                        : AppColors.primary.withValues(alpha: 0.42),
                    borderRadius: BorderRadius.circular(3),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
