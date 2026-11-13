import 'dart:io';

import 'package:flutter/foundation.dart' show kIsWeb;

import 'package:flutter/services.dart';

/// Ponte com o Android para as autorizacoes e a posicao do aparelho.
class PermissoesNativas {
  PermissoesNativas._();

  static const MethodChannel _canal = MethodChannel('fortaleza/permissoes');

  static Future<Map<String, bool>> estado() async {
    if ((kIsWeb || !Platform.isAndroid)) return const {'localizacao': true, 'gps': true, 'notificacao': true, 'bateria': true};
    try {
      final r = await _canal.invokeMethod<Map<dynamic, dynamic>>('estado');
      return (r ?? const {}).map((k, v) => MapEntry(k.toString(), v == true));
    } catch (_) {
      return const {};
    }
  }

  static Future<void> pedir(String qual) async {
    if ((kIsWeb || !Platform.isAndroid)) return;
    try {
      await _canal.invokeMethod<dynamic>('pedir', {'qual': qual});
    } catch (_) {}
  }

  /// Marca, modelo, sistema (HyperOS, One UI...) e os ajustes do fabricante.
  static Future<Map<String, dynamic>> aparelho() async {
    if ((kIsWeb || !Platform.isAndroid)) return const {};
    try {
      final r = await _canal.invokeMethod<Map<dynamic, dynamic>>('aparelho');
      return (r ?? const {}).map((k, v) => MapEntry(k.toString(), v));
    } catch (_) {
      return const {};
    }
  }

  static Future<void> abrirAjuste(String chave) async {
    if ((kIsWeb || !Platform.isAndroid)) return;
    try {
      await _canal.invokeMethod<dynamic>('abrirAjuste', {'chave': chave});
    } catch (_) {}
  }

  static Future<void> confirmarAjuste(String chave, bool sim) async {
    if ((kIsWeb || !Platform.isAndroid)) return;
    try {
      await _canal.invokeMethod<dynamic>('confirmarAjuste', {'chave': chave, 'sim': sim});
    } catch (_) {}
  }

  /// Ultima posicao conhecida do aparelho: {'latitude':..., 'longitude':...}.
  static Future<Map<String, double>?> posicao() async {
    if ((kIsWeb || !Platform.isAndroid)) return null;
    try {
      final r = await _canal.invokeMethod<Map<dynamic, dynamic>>('posicao');
      if (r == null) return null;
      return {
        'latitude': (r['latitude'] as num).toDouble(),
        'longitude': (r['longitude'] as num).toDouble(),
      };
    } catch (_) {
      return null;
    }
  }

  /// Abre um link (WhatsApp, pagina) no aplicativo do celular.
  static Future<bool> abrirLink(String url) async {
    if ((kIsWeb || !Platform.isAndroid)) return false;
    try {
      return await _canal.invokeMethod<bool>('abrirLink', {'url': url}) ?? false;
    } catch (_) {
      return false;
    }
  }
}
