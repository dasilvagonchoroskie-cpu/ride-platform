import 'package:flutter/material.dart';

/// Identidade visual no padrao Uber.
///
/// - Primaria: preto puro (#000000)
/// - Secundaria: branco (#FFFFFF)
/// - Destaque: verde (#27A770) e azul (#286EF1)
/// - Tipografia: Inter (sem serifa), com fallback para Roboto
class AppColors {
  const AppColors._();

  // ---- Base escura ----
  static const Color background = Color(0xFF000000);
  static const Color surface = Color(0xFF141414);
  static const Color surfaceElevated = Color(0xFF1C1C1C);
  static const Color border = Color(0xFF2A2A2A);

  static const Color text = Color(0xFFFFFFFF);
  static const Color textMuted = Color(0xFF9A9A9A);
  static const Color textFaint = Color(0xFF6B6B6B);

  // ---- Destaques ----
  static const Color primary = Color(0xFF27A770);
  static const Color primaryDark = Color(0xFF1E8558);
  static const Color primarySoft = Color(0x2427A770);

  static const Color accent = Color(0xFF286EF1);
  static const Color accentSoft = Color(0x28286EF1);

  static const Color danger = Color(0xFFE11900);
  static const Color dangerSoft = Color(0x24E11900);
  static const Color warning = Color(0xFFFFC043);

  static const Color info = Color(0xFF286EF1);
  static const Color infoSoft = Color(0x28286EF1);

  // ---- Superficie clara (bottom sheet branco) ----
  static const Color sheet = Color(0xFFFFFFFF);
  static const Color sheetText = Color(0xFF000000);
  static const Color sheetMuted = Color(0xFF6B6B6B);
  static const Color sheetFaint = Color(0xFFAFAFAF);
  static const Color sheetBorder = Color(0xFFE2E2E2);
  static const Color sheetField = Color(0xFFF3F3F3);

  // ---- Mapa (estilo Aubergine) ----
  static const Color mapBackground = Color(0xFF0B0B0F);
  static const Color mapRoad = Color(0xFF23232F);
  static const Color mapRoadLight = Color(0xFF2E2E3D);
}

/// Espacamento em multiplos de 4.
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

/// Raios. O card flutuante de destino usa 16, conforme a especificacao.
class Radii {
  const Radii._();

  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double sheet = 16;
  static const double xl = 24;
  static const double pill = 999;
}

/// Tipografia sem serifa. Todos os estilos usam a familia Inter.
class AppText {
  const AppText._();

  static const String family = 'Inter';

  static const TextStyle display = TextStyle(
    fontFamily: family,
    fontSize: 30,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.8,
  );

  static const TextStyle title = TextStyle(
    fontFamily: family,
    fontSize: 23,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.4,
  );

  static const TextStyle heading = TextStyle(
    fontFamily: family,
    fontSize: 18,
    fontWeight: FontWeight.w600,
  );

  static const TextStyle body = TextStyle(
    fontFamily: family,
    fontSize: 15,
    fontWeight: FontWeight.w400,
  );

  static const TextStyle bodyStrong = TextStyle(
    fontFamily: family,
    fontSize: 15,
    fontWeight: FontWeight.w600,
  );

  static const TextStyle price = TextStyle(
    fontFamily: family,
    fontSize: 17,
    fontWeight: FontWeight.w700,
  );

  static const TextStyle caption = TextStyle(
    fontFamily: family,
    fontSize: 13,
    fontWeight: FontWeight.w400,
  );

  static const TextStyle label = TextStyle(
    fontFamily: family,
    fontSize: 12,
    fontWeight: FontWeight.w600,
    letterSpacing: 0.6,
  );

  static const TextStyle button = TextStyle(
    fontFamily: family,
    fontSize: 16,
    fontWeight: FontWeight.w700,
  );
}

class AppTheme {
  const AppTheme._();

  static ThemeData get dark {
    final base = ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      fontFamily: AppText.family,
    );

    return base.copyWith(
      scaffoldBackgroundColor: AppColors.background,
      colorScheme: base.colorScheme.copyWith(
        primary: AppColors.primary,
        secondary: AppColors.accent,
        surface: AppColors.surface,
        error: AppColors.danger,
        onPrimary: AppColors.text,
        onSurface: AppColors.text,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.background,
        elevation: 0,
        centerTitle: false,
        iconTheme: IconThemeData(color: AppColors.text),
        titleTextStyle: TextStyle(
          fontFamily: AppText.family,
          color: AppColors.text,
          fontSize: 18,
          fontWeight: FontWeight.w600,
        ),
      ),
      textTheme: base.textTheme.apply(
        bodyColor: AppColors.text,
        displayColor: AppColors.text,
      ),
      dividerColor: AppColors.border,
      progressIndicatorTheme: const ProgressIndicatorThemeData(color: AppColors.primary),
    );
  }
}

/// Estilos reutilizados nas superficies claras (bottom sheets brancos).
class SheetText {
  const SheetText._();

  static const TextStyle title = TextStyle(
    fontFamily: AppText.family,
    fontSize: 23,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.4,
    color: AppColors.sheetText,
  );

  static const TextStyle heading = TextStyle(
    fontFamily: AppText.family,
    fontSize: 17,
    fontWeight: FontWeight.w600,
    color: AppColors.sheetText,
  );

  static const TextStyle body = TextStyle(
    fontFamily: AppText.family,
    fontSize: 15,
    color: AppColors.sheetText,
  );

  static const TextStyle muted = TextStyle(
    fontFamily: AppText.family,
    fontSize: 13,
    color: AppColors.sheetMuted,
  );

  static const TextStyle price = TextStyle(
    fontFamily: AppText.family,
    fontSize: 17,
    fontWeight: FontWeight.w700,
    color: AppColors.sheetText,
  );

  static const TextStyle label = TextStyle(
    fontFamily: AppText.family,
    fontSize: 12,
    fontWeight: FontWeight.w600,
    letterSpacing: 0.6,
    color: AppColors.sheetMuted,
  );
}
