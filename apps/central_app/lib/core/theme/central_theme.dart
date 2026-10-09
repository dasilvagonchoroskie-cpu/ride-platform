import 'package:flutter/material.dart';

/// Identidade visual da Central — a MESMA dos aplicativos do passageiro e do
/// motorista (Evandro, 09/10/2026: "deixar bonita que nem os aplicativos"):
/// fundo cinza bem claro, cartoes brancos com sombra leve, azul do icone da
/// Fortaleza Mov nas acoes e o dourado das asas nos detalhes.
///
/// Os nomes das cores continuam os mesmos de antes (as telas nao mudam de
/// codigo); so os valores trocaram do tema escuro para o claro.
class AppColors {
  const AppColors._();

  // ---- Base clara ----
  static const Color background = Color(0xFFEEF0F3);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color surfaceElevated = Color(0xFFF4F5F7);
  static const Color border = Color(0xFFE3E6EA);

  static const Color text = Color(0xFF14181F);
  static const Color textMuted = Color(0xFF667085);
  static const Color textFaint = Color(0xFF98A2B3);

  /// Texto e icone por cima das cores fortes (botao azul, faixa vermelha).
  static const Color onPrimary = Color(0xFFFFFFFF);

  // ---- Marca Fortaleza Mov: azul do icone + dourado das asas ----
  static const Color brand = Color(0xFF1E5BB8);
  static const Color brandDark = Color(0xFF143E80);
  static const Color brandSoft = Color(0x1A1E5BB8);
  static const Color gold = Color(0xFFF2B81B);
  static const Color goldSoft = Color(0x26F2B81B);

  /// Acao principal, aprovacoes e metricas financeiras (azul da marca).
  static const Color primary = brand;
  static const Color primaryDark = brandDark;
  static const Color primarySoft = brandSoft;

  /// Alias usado pelo mapa (rota ate o embarque).
  static const Color accent = brand;

  /// Verde: confirmacoes de sucesso (aprovado, pago, online).
  static const Color success = Color(0xFF1E9E5A);
  static const Color successSoft = Color(0x1F1E9E5A);

  static const Color danger = Color(0xFFD93A3A);
  static const Color dangerSoft = Color(0x1AD93A3A);
  static const Color warning = Color(0xFFE8710A);
  static const Color warningSoft = Color(0x1AE8710A);

  // ---- Mapa ----
  static const Color mapBackground = Color(0xFFE9E7E2);
  static const Color mapRoad = Color(0xFFFFFFFF);
  static const Color mapRoadLight = Color(0xFFF7F6F3);

  /// Sombra dos cartoes (igual nos aplicativos).
  static const List<BoxShadow> sombra = [
    BoxShadow(color: Color(0x0F000000), blurRadius: 6, offset: Offset(0, 1)),
    BoxShadow(color: Color(0x08000000), blurRadius: 16, offset: Offset(0, 4)),
  ];

  /// Sombra das pecas que ficam por cima do mapa.
  static const List<BoxShadow> sombraFlutuante = [
    BoxShadow(color: Color(0x24000000), blurRadius: 12, offset: Offset(0, 3)),
  ];

  /// Faixa azul da marca (topo do menu, cartao de destaque).
  static const LinearGradient degradeMarca = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF2A6BCB), brand, brandDark],
  );
}

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

  static const TextStyle metric = TextStyle(
    fontFamily: family,
    fontSize: 26,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.6,
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

class CentralTheme {
  const CentralTheme._();

  static ThemeData get light {
    final esquema = ColorScheme.fromSeed(
      seedColor: AppColors.brand,
      brightness: Brightness.light,
    ).copyWith(
      primary: AppColors.brand,
      onPrimary: AppColors.onPrimary,
      primaryContainer: const Color(0xFFDCE7F8),
      onPrimaryContainer: AppColors.brandDark,
      secondary: AppColors.gold,
      onSecondary: AppColors.text,
      secondaryContainer: const Color(0xFFDCE7F8),
      onSecondaryContainer: AppColors.brandDark,
      surface: AppColors.surface,
      onSurface: AppColors.text,
      onSurfaceVariant: AppColors.textMuted,
      surfaceContainerLowest: AppColors.surface,
      surfaceContainerLow: AppColors.surface,
      surfaceContainer: AppColors.surface,
      surfaceContainerHigh: AppColors.surface,
      surfaceContainerHighest: AppColors.surfaceElevated,
      surfaceTint: Colors.transparent,
      outline: const Color(0xFFC9CED6),
      outlineVariant: AppColors.border,
      error: AppColors.danger,
      onError: AppColors.onPrimary,
      inverseSurface: AppColors.text,
      onInverseSurface: AppColors.onPrimary,
    );

    final base = ThemeData(
      useMaterial3: true,
      colorScheme: esquema,
      fontFamily: AppText.family,
    );

    final borda = OutlineInputBorder(
      borderRadius: BorderRadius.circular(Radii.sm),
      borderSide: const BorderSide(color: Color(0xFFC9CED6)),
    );
    const formaBotao = RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(Radii.sm)));

    return base.copyWith(
      scaffoldBackgroundColor: AppColors.background,
      canvasColor: AppColors.surface,
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.surface,
        foregroundColor: AppColors.text,
        surfaceTintColor: Colors.transparent,
        elevation: 1,
        scrolledUnderElevation: 1,
        shadowColor: Color(0x33000000),
        centerTitle: false,
        iconTheme: IconThemeData(color: AppColors.text),
        actionsIconTheme: IconThemeData(color: AppColors.text),
        titleTextStyle: TextStyle(
          fontFamily: AppText.family,
          color: AppColors.text,
          fontSize: 19,
          fontWeight: FontWeight.w600,
          letterSpacing: -0.2,
        ),
      ),
      drawerTheme: const DrawerThemeData(
        backgroundColor: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        width: 300,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.horizontal(right: Radius.circular(Radii.lg)),
        ),
      ),
      textTheme: base.textTheme.apply(
        bodyColor: AppColors.text,
        displayColor: AppColors.text,
        fontFamily: AppText.family,
      ),
      dividerColor: AppColors.border,
      dividerTheme: const DividerThemeData(color: AppColors.border, thickness: 1, space: 1),
      iconTheme: const IconThemeData(color: AppColors.text),
      progressIndicatorTheme: const ProgressIndicatorThemeData(color: AppColors.brand),
      cardTheme: CardThemeData(
        color: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 1,
        shadowColor: const Color(0x22000000),
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.md)),
      ),
      listTileTheme: const ListTileThemeData(
        iconColor: AppColors.textMuted,
        textColor: AppColors.text,
        selectedColor: AppColors.brand,
        selectedTileColor: AppColors.brandSoft,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(Radii.sm))),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.lg)),
        iconColor: AppColors.brand,
        titleTextStyle: AppText.heading.copyWith(color: AppColors.text, fontSize: 19),
        contentTextStyle: AppText.body.copyWith(color: AppColors.textMuted, height: 1.4),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: AppColors.surface,
        modalBackgroundColor: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        showDragHandle: true,
        dragHandleColor: Color(0xFFD0D5DD),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(Radii.lg))),
      ),
      popupMenuTheme: PopupMenuThemeData(
        color: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 4,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.md)),
        textStyle: AppText.body.copyWith(color: AppColors.text),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: AppColors.text,
        contentTextStyle: AppText.body.copyWith(color: AppColors.onPrimary),
        actionTextColor: AppColors.gold,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.sm)),
      ),
      inputDecorationTheme: InputDecorationThemeData(
        filled: true,
        fillColor: AppColors.surface,
        labelStyle: AppText.body.copyWith(color: AppColors.textMuted),
        floatingLabelStyle: AppText.body.copyWith(color: AppColors.brand, fontWeight: FontWeight.w600),
        hintStyle: AppText.body.copyWith(color: AppColors.textFaint),
        helperStyle: AppText.caption.copyWith(color: AppColors.textFaint),
        prefixIconColor: AppColors.textMuted,
        suffixIconColor: AppColors.textMuted,
        contentPadding: const EdgeInsets.symmetric(horizontal: Spacing.md, vertical: 14),
        border: borda,
        enabledBorder: borda,
        disabledBorder: borda.copyWith(borderSide: const BorderSide(color: AppColors.border)),
        focusedBorder: borda.copyWith(borderSide: const BorderSide(color: AppColors.brand, width: 1.6)),
        errorBorder: borda.copyWith(borderSide: const BorderSide(color: AppColors.danger)),
        focusedErrorBorder: borda.copyWith(borderSide: const BorderSide(color: AppColors.danger, width: 1.6)),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.brand,
          foregroundColor: AppColors.onPrimary,
          disabledBackgroundColor: const Color(0xFFC7C9CC),
          disabledForegroundColor: const Color(0xFF7D838C),
          minimumSize: const Size(64, 46),
          padding: const EdgeInsets.symmetric(horizontal: Spacing.lg),
          textStyle: AppText.bodyStrong,
          shape: formaBotao,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.brand,
          side: const BorderSide(color: Color(0xFFC9CED6)),
          minimumSize: const Size(64, 46),
          padding: const EdgeInsets.symmetric(horizontal: Spacing.lg),
          textStyle: AppText.bodyStrong,
          shape: formaBotao,
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: AppColors.brand,
          textStyle: AppText.bodyStrong,
          shape: formaBotao,
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(foregroundColor: AppColors.text),
      ),
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: AppColors.brand,
        foregroundColor: AppColors.onPrimary,
        elevation: 3,
      ),
      segmentedButtonTheme: SegmentedButtonThemeData(
        style: ButtonStyle(
          backgroundColor: WidgetStateProperty.resolveWith(
            (s) => s.contains(WidgetState.selected) ? AppColors.brand : AppColors.surface,
          ),
          foregroundColor: WidgetStateProperty.resolveWith(
            (s) => s.contains(WidgetState.selected) ? AppColors.onPrimary : AppColors.text,
          ),
          iconColor: WidgetStateProperty.resolveWith(
            (s) => s.contains(WidgetState.selected) ? AppColors.onPrimary : AppColors.textMuted,
          ),
          side: const WidgetStatePropertyAll(BorderSide(color: Color(0xFFC9CED6))),
          textStyle: WidgetStatePropertyAll(AppText.caption.copyWith(fontWeight: FontWeight.w600)),
        ),
      ),
      tabBarTheme: TabBarThemeData(
        labelColor: AppColors.brand,
        unselectedLabelColor: AppColors.textMuted,
        indicatorColor: AppColors.brand,
        indicatorSize: TabBarIndicatorSize.tab,
        dividerColor: AppColors.border,
        labelStyle: AppText.bodyStrong.copyWith(fontSize: 14),
        unselectedLabelStyle: AppText.body.copyWith(fontSize: 14),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: AppColors.surface,
        selectedColor: AppColors.brandSoft,
        checkmarkColor: AppColors.brand,
        side: const BorderSide(color: AppColors.border),
        labelStyle: AppText.caption.copyWith(color: AppColors.text, fontWeight: FontWeight.w600),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.pill)),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? Colors.white : const Color(0xFFBFC5CE),
        ),
        trackColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? AppColors.success : const Color(0xFFE6E8EC),
        ),
        trackOutlineColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? AppColors.success : const Color(0xFFD0D5DD),
        ),
      ),
      checkboxTheme: CheckboxThemeData(
        fillColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? AppColors.brand : Colors.transparent,
        ),
        checkColor: const WidgetStatePropertyAll(AppColors.onPrimary),
        side: const BorderSide(color: Color(0xFFA9B1BE), width: 1.6),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
      ),
      radioTheme: RadioThemeData(
        fillColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? AppColors.brand : const Color(0xFFA9B1BE),
        ),
      ),
      badgeTheme: const BadgeThemeData(backgroundColor: AppColors.danger, textColor: AppColors.onPrimary),
      tooltipTheme: TooltipThemeData(
        decoration: BoxDecoration(color: AppColors.text, borderRadius: BorderRadius.circular(Radii.sm)),
        textStyle: AppText.caption.copyWith(color: AppColors.onPrimary),
      ),
      dropdownMenuTheme: DropdownMenuThemeData(
        menuStyle: const MenuStyle(
          backgroundColor: WidgetStatePropertyAll(AppColors.surface),
          surfaceTintColor: WidgetStatePropertyAll(Colors.transparent),
        ),
        textStyle: AppText.body.copyWith(color: AppColors.text),
      ),
      navigationRailTheme: const NavigationRailThemeData(
        backgroundColor: AppColors.surface,
        indicatorColor: AppColors.brandSoft,
      ),
    );
  }

  /// Nome antigo (a Central era escura), mantido para quem ainda chama `dark`.
  static ThemeData get dark => light;
}
