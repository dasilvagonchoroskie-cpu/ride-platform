import 'package:flutter/material.dart';

import 'config/app_config.dart';
import 'theme/app_theme.dart';

/// Marca do app (etapa 6, Evandro 29/10/2026): nome, cor, logo e a faixa de
/// aviso do Inicio.
///
/// - Padrao da montagem: --dart-define MARCA_NOME e MARCA_COR (app de outro
///   operador sai com o nome e a cor dele, ver scripts/novo-app.sh).
/// - A Central troca pelo servidor (Configuracoes > Aparencia do app), sem
///   gerar app novo: chega no /app/config ("aparencia").
class Marca {
  Marca._();

  static const String nomePadrao = String.fromEnvironment('MARCA_NOME', defaultValue: 'Fortaleza Move');
  static const String _corPadrao = String.fromEnvironment('MARCA_COR', defaultValue: '#1E5BB8');

  static Color get corPadrao => corDe(_corPadrao) ?? AppColors.brand;

  static String nome = nomePadrao;
  static Color cor = corPadrao;

  /// Endereco completo do logo da Central (null: logo do proprio app).
  static String? logoUrl;

  /// Texto da faixa de aviso no Inicio (null: sem faixa).
  static String? faixa;

  static Color? corDe(String? texto) {
    final m = RegExp(r'^#([0-9A-Fa-f]{6})$').firstMatch((texto ?? '').trim());
    if (m == null) return null;
    return Color(0xFF000000 | int.parse(m.group(1)!, radix: 16));
  }

  /// Le o bloco "aparencia" do /app/config. Devolve true se mudou algo.
  static bool aplicar(Object? a) {
    final antes = (nome, cor, logoUrl, faixa);
    if (a is Map) {
      if (a['definida'] == true) {
        final n = a['nome'];
        nome = n is String && n.trim().length >= 2 ? n.trim() : nomePadrao;
        cor = corDe(a['cor']?.toString()) ?? corPadrao;
      } else {
        nome = nomePadrao;
        cor = corPadrao;
      }
      final l = a['logoUrl'];
      logoUrl = l is String && l.startsWith('/') ? '${AppConfig.apiUrl}/api$l' : null;
      final b = a['banner'];
      final t = b is Map ? b['texto'] : null;
      faixa = t is String && t.trim().isNotEmpty ? t.trim() : null;
    }
    return antes != (nome, cor, logoUrl, faixa);
  }

  @visibleForTesting
  static void voltarAoPadrao() {
    nome = nomePadrao;
    cor = corPadrao;
    logoUrl = null;
    faixa = null;
  }
}
