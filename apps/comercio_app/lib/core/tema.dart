import 'package:flutter/material.dart';

/// Identidade do Comercio: a mesma familia marinho + dourado dos outros
/// aplicativos, com o verde-agua como cor propria do app (acoes de loja,
/// destaques de entrega) para ninguem confundir com o app do passageiro.
class Cores {
  const Cores._();

  static const Color fundo = Color(0xFF07122B);
  static const Color cartao = Color(0xFF0F1E42);
  static const Color cartaoAlto = Color(0xFF162A55);
  static const Color borda = Color(0xFF25396A);
  static const Color texto = Color(0xFFF3F5FA);
  static const Color textoSuave = Color(0xFFA7B2CB);
  static const Color textoFraco = Color(0xFF6E7C9C);

  /// Dourado da marca (botoes principais).
  static const Color ouro = Color(0xFFE9B53D);
  static const Color sobreOuro = Color(0xFF07122B);

  /// Cor propria do Comercio.
  static const Color loja = Color(0xFF2FC4B2);
  static const Color lojaSuave = Color(0xFF123A44);

  static const Color ok = Color(0xFF34C17A);
  static const Color perigo = Color(0xFFF0545A);
  static const Color perigoSuave = Color(0xFF3A1D2C);
  static const Color aviso = Color(0xFFFF9A3D);
  static const Color avisoSuave = Color(0xFF382B24);
}

class Tema {
  const Tema._();

  static ThemeData get escuro {
    const esquema = ColorScheme.dark(
      primary: Cores.ouro,
      onPrimary: Cores.sobreOuro,
      secondary: Cores.loja,
      onSecondary: Cores.sobreOuro,
      surface: Cores.cartao,
      onSurface: Cores.texto,
      error: Cores.perigo,
    );
    OutlineInputBorder borda(Color c) => OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: c));
    return ThemeData(
      useMaterial3: true,
      fontFamily: 'Inter',
      colorScheme: esquema,
      scaffoldBackgroundColor: Cores.fundo,
      appBarTheme: const AppBarTheme(
        backgroundColor: Cores.fundo,
        foregroundColor: Cores.texto,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
      ),
      cardTheme: CardThemeData(
        color: Cores.cartao,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: const BorderSide(color: Cores.borda)),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Cores.cartaoAlto,
        border: borda(Cores.borda),
        enabledBorder: borda(Cores.borda),
        focusedBorder: borda(Cores.ouro),
        errorBorder: borda(Cores.perigo),
        focusedErrorBorder: borda(Cores.perigo),
        labelStyle: const TextStyle(color: Cores.textoSuave),
        hintStyle: const TextStyle(color: Cores.textoFraco),
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: Cores.ouro,
          foregroundColor: Cores.sobreOuro,
          minimumSize: const Size.fromHeight(52),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: Cores.texto,
          side: const BorderSide(color: Cores.borda),
          minimumSize: const Size.fromHeight(48),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
      ),
      textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(foregroundColor: Cores.ouro)),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: Cores.cartao,
        indicatorColor: Cores.lojaSuave,
        labelTextStyle: WidgetStateProperty.all(const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
      ),
      dividerTheme: const DividerThemeData(color: Cores.borda, space: 1),
      snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
      progressIndicatorTheme: const ProgressIndicatorThemeData(color: Cores.ouro),
    );
  }
}
