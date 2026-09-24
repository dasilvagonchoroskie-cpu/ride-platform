import 'package:flutter/material.dart';

import '../core/theme/app_theme.dart';

/// Variantes de botao.
///
/// `primary`  -> preto com texto branco em negrito (superficies CLARAS)
/// `inverted` -> branco com texto preto em negrito (superficies ESCURAS) — padrao
/// `accent`   -> verde #27A770 (confirmacoes e status)
enum AppButtonVariant { primary, inverted, secondary, accent, ghost, danger }

/// Botao de acao principal no da plataforma: **largura total** (block button),
/// altura confortavel e texto em negrito.
class AppButton extends StatelessWidget {
  const AppButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.variant = AppButtonVariant.inverted,
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
      AppButtonVariant.primary => (AppColors.sheetText, AppColors.sheet, BorderSide.none),
      AppButtonVariant.inverted ||
      AppButtonVariant.secondary =>
        (AppColors.sheet, AppColors.sheetText, BorderSide.none),
      AppButtonVariant.accent => (AppColors.primary, AppColors.sheet, BorderSide.none),
      AppButtonVariant.ghost => (Colors.transparent, AppColors.textMuted, BorderSide.none),
      AppButtonVariant.danger => (
          AppColors.dangerSoft,
          AppColors.danger,
          const BorderSide(color: AppColors.danger),
        ),
    };

    final child = loading
        ? SizedBox(
            height: 20,
            width: 20,
            child: CircularProgressIndicator(
              strokeWidth: 2.2,
              color: foreground,
            ),
          )
        : Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (icon != null) ...[
                Icon(icon, size: 20, color: foreground),
                const SizedBox(width: Spacing.sm),
              ],
              Text(
                label,
                style: AppText.button.copyWith(color: foreground),
              ),
            ],
          );

    return Padding(
      padding: margin ?? EdgeInsets.zero,
      child: SizedBox(
        height: 56,
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
            padding: const EdgeInsets.symmetric(horizontal: Spacing.lg),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.sm)),
          ),
          child: child,
        ),
      ),
    );
  }
}

/// Card escuro (superficies do app).
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

/// Superficie clara (bottom sheet branco) — cantos de 16, conforme a especificacao.
class SheetSurface extends StatelessWidget {
  const SheetSurface({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(Spacing.lg),
    this.roundedTop = true,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final bool roundedTop;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: padding,
      decoration: BoxDecoration(
        color: AppColors.sheet,
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(roundedTop ? Radii.sheet : 0),
        ),
        boxShadow: const [
          BoxShadow(color: Color(0x59000000), blurRadius: 24, offset: Offset(0, -6)),
        ],
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
    this.prefixIcon,
    this.autofocus = false,
    this.onLight = false,
  });

  final String? label;
  final String? hint;
  final String? error;
  final TextEditingController? controller;
  final TextInputType? keyboardType;
  final ValueChanged<String>? onChanged;
  final TextCapitalization? autoCapitalize;
  final int? maxLength;
  final IconData? prefixIcon;
  final bool autofocus;
  final bool onLight;

  @override
  Widget build(BuildContext context) {
    final labelColor = onLight ? AppColors.sheetMuted : AppColors.textMuted;
    final textColor = onLight ? AppColors.sheetText : AppColors.text;
    final fill = onLight ? AppColors.sheetField : AppColors.surfaceElevated;
    final borderColor = onLight ? AppColors.sheetBorder : AppColors.border;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (label != null) ...[
          Text(label!.toUpperCase(), style: AppText.label.copyWith(color: labelColor)),
          const SizedBox(height: Spacing.xs),
        ],
        TextField(
          controller: controller,
          keyboardType: keyboardType,
          onChanged: onChanged,
          maxLength: maxLength,
          autofocus: autofocus,
          textCapitalization: autoCapitalize ?? TextCapitalization.none,
          style: AppText.body.copyWith(color: textColor, fontSize: 16),
          decoration: InputDecoration(
            hintText: hint,
            counterText: '',
            errorText: error,
            filled: true,
            fillColor: fill,
            prefixIcon: prefixIcon == null ? null : Icon(prefixIcon, color: labelColor, size: 20),
            hintStyle: AppText.body.copyWith(color: labelColor),
            contentPadding: const EdgeInsets.symmetric(horizontal: Spacing.md, vertical: Spacing.md),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(Radii.sm),
              borderSide: BorderSide(color: borderColor),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(Radii.sm),
              borderSide: BorderSide(color: borderColor),
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
      AppBadgeTone.success => (AppColors.primarySoft, AppColors.primary),
      AppBadgeTone.danger => (AppColors.dangerSoft, AppColors.danger),
      AppBadgeTone.info => (AppColors.accentSoft, AppColors.accent),
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
        color: AppColors.surfaceElevated,
        border: Border.all(color: AppColors.border),
        shape: BoxShape.circle,
      ),
      child: Text(
        initials.isEmpty ? '?' : initials,
        style: AppText.heading.copyWith(
          color: AppColors.text,
          fontSize: size * 0.34,
          fontWeight: FontWeight.w700,
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
    return Text(
      '★' * value.round(),
      style: TextStyle(color: AppColors.warning, fontSize: size),
    );
  }
}

class SectionTitle extends StatelessWidget {
  const SectionTitle({super.key, required this.text, this.onLight = false});

  final String text;
  final bool onLight;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: Spacing.md),
      child: Text(
        text,
        style: AppText.heading.copyWith(color: onLight ? AppColors.sheetText : AppColors.text),
      ),
    );
  }
}

class AppDivider extends StatelessWidget {
  const AppDivider({super.key, this.onLight = false});

  final bool onLight;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: Spacing.md),
        child: Divider(
          height: 1,
          color: onLight ? AppColors.sheetBorder : AppColors.border,
        ),
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
          Text(title, style: AppText.heading.copyWith(color: AppColors.text)),
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

class MetricTile extends StatelessWidget {
  const MetricTile({super.key, required this.value, required this.label, this.onLight = false});

  final String value;
  final String label;
  final bool onLight;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(
            value,
            style: AppText.price.copyWith(color: onLight ? AppColors.sheetText : AppColors.text),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            textAlign: TextAlign.center,
            style: AppText.caption.copyWith(color: onLight ? AppColors.sheetMuted : AppColors.textFaint),
          ),
        ],
      ),
    );
  }
}

/// Icone do veiculo por categoria (imagem do carro a esquerda do item).
class VehicleIcon extends StatelessWidget {
  const VehicleIcon({super.key, required this.slug, this.size = 44, this.onLight = true});

  final String slug;
  final double size;
  final bool onLight;

  IconData get _icon => switch (slug) {
        'moto' => Icons.two_wheeler,
        'van' => Icons.airport_shuttle,
        'black' => Icons.directions_car_filled,
        'comfort' => Icons.directions_car_filled,
        _ => Icons.directions_car_filled,
      };

  @override
  Widget build(BuildContext context) {
    // Preto para todas as categorias; o Black recebe um anel de destaque.
    final color = onLight ? AppColors.sheetText : AppColors.text;
    final isBlack = slug == 'black';

    return SizedBox(
      width: size,
      height: size,
      child: Center(
        child: isBlack
            ? Container(
                padding: const EdgeInsets.all(3),
                decoration: BoxDecoration(
                  border: Border.all(color: color, width: 1.6),
                  borderRadius: BorderRadius.circular(Radii.sm),
                ),
                child: Icon(_icon, size: size * 0.55, color: color),
              )
            : Icon(_icon, size: size * 0.72, color: color),
      ),
    );
  }
}
