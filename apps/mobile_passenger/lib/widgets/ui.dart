import 'package:flutter/material.dart';

import '../core/theme/app_theme.dart';

class AppButton extends StatelessWidget {
  const AppButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.variant = AppButtonVariant.primary,
    this.loading = false,
    this.enabled = true,
    this.margin,
  });

  final String label;
  final VoidCallback onPressed;
  final AppButtonVariant variant;
  final bool loading;
  final bool enabled;
  final EdgeInsetsGeometry? margin;

  @override
  Widget build(BuildContext context) {
    final isDisabled = !enabled || loading;

    final (Color background, Color foreground, BorderSide side) = switch (variant) {
      AppButtonVariant.primary => (AppColors.primary, AppColors.background, BorderSide.none),
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
            disabledBackgroundColor: background.withOpacity(0.45),
            disabledForegroundColor: foreground.withOpacity(0.6),
            side: side,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.md)),
          ),
          child: loading
              ? SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: variant == AppButtonVariant.primary
                        ? AppColors.background
                        : AppColors.primary,
                  ),
                )
              : Text(
                  label,
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                ),
        ),
      ),
    );
  }
}

enum AppButtonVariant { primary, secondary, ghost, danger }

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

class AppField extends StatelessWidget {
  const AppField({
    super.key,
    this.label,
    this.hint,
    this.error,
    this.controller,
    this.keyboardType,
    this.onChanged,
    this.autoCapitalize,
    this.maxLength,
  });

  final String? label;
  final String? hint;
  final String? error;
  final TextEditingController? controller;
  final TextInputType? keyboardType;
  final ValueChanged<String>? onChanged;
  final TextCapitalization? autoCapitalize;
  final int? maxLength;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (label != null) ...[
          Text(
            label!.toUpperCase(),
            style: const TextStyle(
              color: AppColors.textMuted,
              fontSize: 12,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.6,
            ),
          ),
          const SizedBox(height: Spacing.xs),
        ],
        TextField(
          controller: controller,
          keyboardType: keyboardType,
          onChanged: onChanged,
          maxLength: maxLength,
          textCapitalization: autoCapitalize ?? TextCapitalization.none,
          style: const TextStyle(color: AppColors.text, fontSize: 16),
          decoration: InputDecoration(
            hintText: hint,
            counterText: '',
            errorText: error,
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
      AppBadgeTone.success => (AppColors.primarySoft, AppColors.primary),
      AppBadgeTone.danger => (AppColors.dangerSoft, AppColors.danger),
      AppBadgeTone.info => (AppColors.infoSoft, AppColors.info),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: Spacing.sm, vertical: 3),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(Radii.pill),
      ),
      child: Text(
        text,
        style: TextStyle(color: foreground, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 0.6),
      ),
    );
  }
}

enum AppBadgeTone { neutral, success, danger, info }

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
        style: TextStyle(
          color: AppColors.primary,
          fontWeight: FontWeight.w700,
          fontSize: size * 0.36,
        ),
      ),
    );
  }
}

class AppStars extends StatelessWidget {
  const AppStars({super.key, required this.value, this.size = 13});

  final double value;
  final double size;

  @override
  Widget build(BuildContext context) {
    final rounded = value.round();
    return Text(
      '★' * rounded,
      style: TextStyle(color: AppColors.warning, fontSize: size),
    );
  }
}

class SectionTitle extends StatelessWidget {
  const SectionTitle({super.key, required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: Spacing.md),
      child: Text(
        text,
        style: const TextStyle(color: AppColors.text, fontSize: 19, fontWeight: FontWeight.w600),
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
  const EmptyState({super.key, required this.title, required this.description});

  final String title;
  final String description;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: Spacing.xxl),
      child: Column(
        children: [
          Text(title, style: const TextStyle(color: AppColors.text, fontSize: 19, fontWeight: FontWeight.w600)),
          const SizedBox(height: Spacing.sm),
          Text(
            description,
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
          ),
        ],
      ),
    );
  }
}

class MetricTile extends StatelessWidget {
  const MetricTile({super.key, required this.value, required this.label});

  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(
            value,
            style: const TextStyle(color: AppColors.text, fontSize: 17, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppColors.textFaint, fontSize: 13),
          ),
        ],
      ),
    );
  }
}
