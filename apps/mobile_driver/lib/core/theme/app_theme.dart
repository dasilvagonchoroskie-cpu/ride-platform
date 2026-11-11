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
  // Dourado transparente sobre marinho vira cinza (cores opostas): o fundo
  // suave da marca e um marinho mais claro, e o dourado fica no icone/borda.
  static const Color brandSoft = Color(0xFF1C2E5C);
  static const Color gold = brand;

  /// Texto e icone por cima do dourado.
  static const Color onBrand = Color(0xFF07122B);

  /// Marinho da marca (fundos de destaque, faixas).
  static const Color navy = Color(0xFF0B1A3A);

  // ---- Estados ----
  /// Verde: conectado, credito, valor positivo.
  static const Color primary = Color(0xFF34C17A);
  static const Color primaryDark = Color(0xFF26995E);
  static const Color primarySoft = Color(0xFF12383A);

  static const Color accent = brand;
  static const Color accentSoft = brandSoft;

  static const Color success = Color(0xFF34C17A);
  static const Color danger = Color(0xFFF0545A);
  static const Color dangerSoft = Color(0xFF3A1D2C);
  static const Color warning = Color(0xFFFF9A3D);
  static const Color warningSoft = Color(0xFF382B24);

  static const Color info = Color(0xFF6EA2FF);
  static const Color infoSoft = Color(0xFF1A3366);

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
  /// Contorno fino dos cartoes (vidro sobre o marinho).
  static const Color hairline = Color(0x1AFFFFFF);

  /// Degrade do dourado nos botoes principais.
  static const LinearGradient degradeOuro = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFF6CF6A), Color(0xFFE9B53D), Color(0xFFD39A28)],
  );

  /// Fundo de destaque (entrada, cabecalhos): marinho com brilho.
  static const LinearGradient degradeMarinho = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [Color(0xFF13285A), Color(0xFF0A1838), Color(0xFF060F24)],
  );

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
  static const double sheet = 28;
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
      brightness: Brightness.dark,
      fontFamily: AppText.family,
    );

    return base.copyWith(
      scaffoldBackgroundColor: AppColors.background,
      // Esquema inteiro tirado do azul da marca: sem isso, os botoes
      // "tonais", as abas selecionadas e os cartoes vinham no lilas padrao
      // do Flutter (as fotos das telas pegaram em 10/10/2026).
      colorScheme: ColorScheme.fromSeed(
        seedColor: AppColors.brand,
        brightness: Brightness.dark,
      ).copyWith(
        primary: AppColors.brand,
        secondary: AppColors.gold,
        surface: AppColors.surface,
        error: AppColors.danger,
        onPrimary: AppColors.onBrand,
        onSurface: AppColors.text,
        onSecondary: AppColors.onBrand,
        secondaryContainer: AppColors.surfaceElevated,
        onSecondaryContainer: AppColors.text,
        surfaceContainerHighest: AppColors.surfaceElevated,
        outline: AppColors.border,
      ),
      cardTheme: CardThemeData(
        color: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(Radii.lg),
          side: const BorderSide(color: AppColors.hairline),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(Radii.xl),
          side: const BorderSide(color: AppColors.hairline),
        ),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: AppColors.sheet,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(Radii.sheet))),
      ),
      listTileTheme: const ListTileThemeData(iconColor: AppColors.textMuted, textColor: AppColors.text),
      // Campos premium (11/11/2026): cantos de 14, contorno fino e dourado
      // ao focar. Quem passa o proprio `border` (ex.: InputBorder.none dentro
      // de um cartao) continua mandando no seu campo.
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surfaceElevated,
        hintStyle: const TextStyle(color: AppColors.textFaint),
        labelStyle: const TextStyle(color: AppColors.textMuted),
        floatingLabelStyle: const TextStyle(color: AppColors.brand, fontWeight: FontWeight.w600),
        prefixIconColor: AppColors.textMuted,
        suffixIconColor: AppColors.textMuted,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        border: WidgetStateInputBorder.resolveWith((estado) {
          final cor = estado.contains(WidgetState.error)
              ? AppColors.danger
              : estado.contains(WidgetState.focused)
                  ? AppColors.brand
                  : AppColors.hairline;
          return OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: BorderSide(color: cor, width: estado.contains(WidgetState.focused) ? 1.4 : 1),
          );
        }),
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
          fontWeight: FontWeight.w600,
          letterSpacing: -0.2,
        ),
      ),
      textTheme: base.textTheme.apply(
        bodyColor: AppColors.text,
        displayColor: AppColors.text,
      ),
      dividerColor: AppColors.border,
      progressIndicatorTheme: const ProgressIndicatorThemeData(color: AppColors.brand),
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
      // Botoes do Material com a mesma cara dos botoes da casa: 16 de canto,
      // 54 de altura e letra forte (antes vinham em pilula, sem peso).
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.brand,
          foregroundColor: AppColors.onBrand,
          disabledBackgroundColor: AppColors.desativado,
          disabledForegroundColor: AppColors.desativadoTexto,
          elevation: 0,
          shadowColor: Colors.transparent,
          minimumSize: const Size(64, 54),
          padding: const EdgeInsets.symmetric(horizontal: 20),
          textStyle: AppText.button,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.lg)),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.brand,
          foregroundColor: AppColors.onBrand,
          disabledBackgroundColor: AppColors.desativado,
          disabledForegroundColor: AppColors.desativadoTexto,
          minimumSize: const Size(64, 50),
          textStyle: AppText.button,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.lg)),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.text,
          minimumSize: const Size(64, 50),
          padding: const EdgeInsets.symmetric(horizontal: 12),
          side: const BorderSide(color: AppColors.border),
          textStyle: AppText.bodyStrong,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.lg)),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: AppColors.brand,
          textStyle: AppText.bodyStrong,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.md)),
        ),
      ),
      tabBarTheme: TabBarThemeData(
        labelColor: AppColors.text,
        unselectedLabelColor: AppColors.textMuted,
        indicatorColor: AppColors.brand,
        indicatorSize: TabBarIndicatorSize.label,
        dividerColor: AppColors.hairline,
        labelStyle: AppText.bodyStrong,
        unselectedLabelStyle: AppText.body,
      ),
      dividerTheme: const DividerThemeData(color: AppColors.hairline, thickness: 1, space: 1),
      chipTheme: ChipThemeData(
        backgroundColor: AppColors.surfaceElevated,
        selectedColor: AppColors.brandSoft,
        side: const BorderSide(color: AppColors.hairline),
        labelStyle: AppText.caption.copyWith(color: AppColors.text, fontWeight: FontWeight.w600),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.pill)),
      ),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: AppColors.brand,
        foregroundColor: AppColors.onBrand,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.lg)),
      ),
      checkboxTheme: CheckboxThemeData(
        fillColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? AppColors.brand : Colors.transparent),
        checkColor: const WidgetStatePropertyAll(AppColors.onBrand),
        side: const BorderSide(color: AppColors.textMuted, width: 1.5),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(5)),
      ),
      radioTheme: RadioThemeData(
        fillColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? AppColors.brand : AppColors.textMuted),
      ),
      expansionTileTheme: const ExpansionTileThemeData(
        iconColor: AppColors.gold,
        collapsedIconColor: AppColors.textMuted,
        shape: Border(),
        collapsedShape: Border(),
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
