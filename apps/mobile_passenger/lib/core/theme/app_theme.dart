import 'package:flutter/material.dart';

/// Paleta do app. Tema escuro com alto contraste.
class AppColors {
  const AppColors._();

  static const Color background = Color(0xFF0B0B0F);
  static const Color surface = Color(0xFF14141B);
  static const Color surfaceElevated = Color(0xFF1C1C26);
  static const Color border = Color(0xFF2A2A38);
  static const Color text = Color(0xFFF5F5F7);
  static const Color textMuted = Color(0xFF9A9AAE);
  static const Color textFaint = Color(0xFF63637A);

  static const Color primary = Color(0xFF00D775);
  static const Color primaryDark = Color(0xFF00A85B);
  static const Color primarySoft = Color(0x2400D775);

  static const Color danger = Color(0xFFFF4D5E);
  static const Color dangerSoft = Color(0x24FF4D5E);
  static const Color warning = Color(0xFFFFB020);
  static const Color info = Color(0xFF3B9DFF);
  static const Color infoSoft = Color(0x283B9DFF);

  static const Color mapBackground = Color(0xFF101018);
  static const Color mapRoad = Color(0xFF23232F);
  static const Color mapRoadLight = Color(0xFF2E2E3D);
}

/// Escala de espacamento (multiplos de 4).
class Spacing {
  const Spacing._();

  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 24;
  static const double xxl = 32;
  static const double xxxl = 48;
}

class Radii {
  const Radii._();

  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 24;
  static const double pill = 999;
}

class AppTheme {
  const AppTheme._();

  static ThemeData get dark {
    final base = ThemeData.dark(useMaterial3: true);

    return base.copyWith(
      scaffoldBackgroundColor: AppColors.background,
      colorScheme: base.colorScheme.copyWith(
        primary: AppColors.primary,
        secondary: AppColors.info,
        surface: AppColors.surface,
        error: AppColors.danger,
        onPrimary: AppColors.background,
        onSurface: AppColors.text,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.background,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          color: AppColors.text,
          fontSize: 19,
          fontWeight: FontWeight.w600,
        ),
      ),
      textTheme: base.textTheme.apply(
        bodyColor: AppColors.text,
        displayColor: AppColors.text,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surfaceElevated,
        hintStyle: const TextStyle(color: AppColors.textFaint),
        contentPadding: const EdgeInsets.symmetric(horizontal: Spacing.md, vertical: Spacing.md),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(Radii.md),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(Radii.md),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(Radii.md),
          borderSide: const BorderSide(color: AppColors.primary, width: 1.4),
        ),
      ),
      dividerColor: AppColors.border,
      progressIndicatorTheme: const ProgressIndicatorThemeData(color: AppColors.primary),
    );
  }
}
