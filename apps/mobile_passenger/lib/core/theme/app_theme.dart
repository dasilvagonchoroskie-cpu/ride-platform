import 'package:flutter/material.dart';

/// Identidade visual no proprio da plataforma.
///
/// - Primaria: preto puro (#000000)
/// - Secundaria: branco (#FFFFFF)
/// - Destaque: verde (#27A770) e azul (#286EF1)
/// - Tipografia: Inter (sem serifa), com fallback para Roboto
class AppColors {
  const AppColors._();

  // ---- Base clara (padrao dos aplicativos de motorista) ----
  // Fundo cinza bem claro, cartoes brancos, texto quase preto: legivel no
  // sol do meio-dia, que e onde o motorista trabalha.
  static const Color background = Color(0xFFEEF0F3);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color surfaceElevated = Color(0xFFF4F5F7);
  static const Color border = Color(0xFFE3E6EA);

  static const Color text = Color(0xFF14181F);
  static const Color textMuted = Color(0xFF667085);
  static const Color textFaint = Color(0xFF98A2B3);

  // ---- Marca Fortaleza Mov: azul do icone + dourado das asas ----
  static const Color brand = Color(0xFF1E5BB8);
  static const Color brandDark = Color(0xFF143E80);
  static const Color brandSoft = Color(0x1A1E5BB8);
  static const Color gold = Color(0xFFF2B81B);

  // ---- Estados ----
  /// Verde: conectado, credito, valor positivo.
  static const Color primary = Color(0xFF2E9E5B);
  static const Color primaryDark = Color(0xFF237A46);
  static const Color primarySoft = Color(0x1F2E9E5B);

  static const Color accent = brand;
  static const Color accentSoft = brandSoft;

  static const Color danger = Color(0xFFD93A3A);
  static const Color dangerSoft = Color(0x1AD93A3A);
  static const Color warning = Color(0xFFE8710A);
  static const Color warningSoft = Color(0x1AE8710A);

  static const Color info = brand;
  static const Color infoSoft = brandSoft;

  // ---- Superficie clara (bottom sheet branco) ----
  static const Color sheet = Color(0xFFFFFFFF);
  static const Color sheetText = Color(0xFF14181F);
  static const Color sheetMuted = Color(0xFF667085);
  static const Color sheetFaint = Color(0xFFA9B1BE);
  static const Color sheetBorder = Color(0xFFE3E6EA);
  static const Color sheetField = Color(0xFFF4F5F7);

  // ---- Mapa ----
  static const Color mapBackground = Color(0xFFE9E7E2);
  static const Color mapRoad = Color(0xFFFFFFFF);
  static const Color mapRoadLight = Color(0xFFF7F6F3);
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

  static ThemeData get light {
    final base = ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      fontFamily: AppText.family,
    );

    return base.copyWith(
      scaffoldBackgroundColor: AppColors.background,
      colorScheme: base.colorScheme.copyWith(
        primary: AppColors.brand,
        secondary: AppColors.gold,
        surface: AppColors.surface,
        error: AppColors.danger,
        onPrimary: Colors.white,
        onSurface: AppColors.text,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 1,
        scrolledUnderElevation: 1,
        shadowColor: Color(0x33000000),
        centerTitle: true,
        iconTheme: IconThemeData(color: AppColors.text),
        titleTextStyle: TextStyle(
          fontFamily: AppText.family,
          color: AppColors.text,
          fontSize: 19,
          fontWeight: FontWeight.w500,
        ),
      ),
      textTheme: base.textTheme.apply(
        bodyColor: AppColors.text,
        displayColor: AppColors.text,
      ),
      dividerColor: AppColors.border,
      progressIndicatorTheme: const ProgressIndicatorThemeData(color: AppColors.brand),
      snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? Colors.white : const Color(0xFFBFC5CE),
        ),
        trackColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? AppColors.primary : const Color(0xFFE6E8EC),
        ),
      ),
    );
  }

  /// Nome antigo, mantido para nao quebrar quem ainda chama `dark`.
  static ThemeData get dark => light;
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
