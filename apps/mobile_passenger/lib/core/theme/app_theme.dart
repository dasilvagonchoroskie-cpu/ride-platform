import 'package:flutter/material.dart';

/// Identidade visual premium (Evandro, 11/11/2026): azul-marinho e dourado,
/// as cores dos icones da marca. Fundo marinho profundo, cartoes em marinho
/// mais claro, texto claro e o dourado nas acoes e destaques.
class AppColors {
  const AppColors._();

  // ---- Base marinho ----
  static const Color background = Color(0xFF07122B);
  static const Color surface = Color(0xFF0F1E42);
  static const Color surfaceElevated = Color(0xFF162A55);
  static const Color border = Color(0xFF25396A);

  static const Color text = Color(0xFFF3F5FA);
  static const Color textMuted = Color(0xFFA7B2CB);
  static const Color textFaint = Color(0xFF6E7C9C);

  // ---- Marca: dourado das asas (acoes) sobre o marinho ----
  static const Color brand = Color(0xFFE9B53D);
  static const Color brandDark = Color(0xFFC8922A);
  static const Color brandSoft = Color(0x26E9B53D);
  static const Color gold = brand;

  /// Texto e icone por cima do dourado.
  static const Color onBrand = Color(0xFF07122B);

  /// Marinho da marca (fundos de destaque, faixas).
  static const Color navy = Color(0xFF0B1A3A);

  // ---- Estados ----
  /// Verde: conectado, credito, valor positivo.
  static const Color primary = Color(0xFF34C17A);
  static const Color primaryDark = Color(0xFF26995E);
  static const Color primarySoft = Color(0x2634C17A);

  static const Color accent = brand;
  static const Color accentSoft = brandSoft;

  static const Color success = Color(0xFF34C17A);
  static const Color danger = Color(0xFFF0545A);
  static const Color dangerSoft = Color(0x26F0545A);
  static const Color warning = Color(0xFFFF9A3D);
  static const Color warningSoft = Color(0x26FF9A3D);

  static const Color info = Color(0xFF6EA2FF);
  static const Color infoSoft = Color(0x266EA2FF);

  // ---- Paineis de baixo (sobre o mapa) ----
  static const Color sheet = Color(0xFF0F1E42);
  static const Color sheetText = text;
  static const Color sheetMuted = textMuted;
  static const Color sheetFaint = textFaint;
  static const Color sheetBorder = border;
  static const Color sheetField = Color(0xFF162A55);

  // ---- Formularios (entrada, cidade, cadastro) ----
  static const Color campoBorda = Color(0xFF2E4579);
  static const Color desativado = Color(0xFF2A3A60);
  static const Color desativadoTexto = Color(0xFF7D89A6);

  /// Faixa que separa os blocos da tela Conta.
  static const Color faixa = Color(0xFF0A1734);

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

  static ThemeData get light => comCor(AppColors.brand);

  /// Tema com a cor da marca escolhida na Central (etapa 6).
  static ThemeData comCor(Color marca) {
    final base = ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      fontFamily: AppText.family,
    );
    // Texto por cima da cor da marca: marinho no dourado (e em cor clara),
    // branco em cor escura (se a Central escolher um azul, por exemplo).
    final sobreMarca = ThemeData.estimateBrightnessForColor(marca) == Brightness.light ? AppColors.onBrand : Colors.white;

    return base.copyWith(
      scaffoldBackgroundColor: AppColors.background,
      // Esquema inteiro tirado do azul da marca: sem isso, os botoes
      // "tonais", as abas selecionadas e os cartoes vinham no lilas padrao
      // do Flutter (as fotos das telas pegaram em 10/10/2026).
      colorScheme: ColorScheme.fromSeed(
        seedColor: marca,
        brightness: Brightness.dark,
      ).copyWith(
        primary: marca,
        secondary: AppColors.gold,
        surface: AppColors.surface,
        error: AppColors.danger,
        onPrimary: sobreMarca,
        onSurface: AppColors.text,
        onSecondary: AppColors.onBrand,
        secondaryContainer: AppColors.surfaceElevated,
        onSecondaryContainer: AppColors.text,
        surfaceContainerHighest: AppColors.surfaceElevated,
        outline: AppColors.border,
      ),
      cardTheme: const CardThemeData(color: AppColors.surface, surfaceTintColor: Colors.transparent, elevation: 0),
      dialogTheme: const DialogThemeData(backgroundColor: AppColors.surface, surfaceTintColor: Colors.transparent),
      bottomSheetTheme: const BottomSheetThemeData(backgroundColor: AppColors.sheet, surfaceTintColor: Colors.transparent),
      listTileTheme: const ListTileThemeData(iconColor: AppColors.textMuted, textColor: AppColors.text),
      inputDecorationTheme: const InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surfaceElevated,
        hintStyle: TextStyle(color: AppColors.textFaint),
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.background,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        shadowColor: Color(0x66000000),
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
      progressIndicatorTheme: ProgressIndicatorThemeData(color: marca),
      snackBarTheme: const SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: AppColors.surfaceElevated,
        contentTextStyle: TextStyle(fontFamily: AppText.family, color: AppColors.text),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? Colors.white : AppColors.textMuted,
        ),
        trackColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? AppColors.primary : AppColors.surfaceElevated,
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
