import 'dart:io';

import 'package:flutter/services.dart';

/// Ponte com o Android para as autorizacoes e a posicao do aparelho.
class PermissoesNativas {
  PermissoesNativas._();

  static const MethodChannel _canal = MethodChannel('fortaleza/permissoes');

  static Future<Map<String, bool>> estado() async {
    if (!Platform.isAndroid) return const {'localizacao': true, 'gps': true, 'notificacao': true};
    try {
      final r = await _canal.invokeMethod<Map<dynamic, dynamic>>('estado');
      return (r ?? const {}).map((k, v) => MapEntry(k.toString(), v == true));
    } catch (_) {
      return const {};
    }
  }

  static Future<void> pedir(String qual) async {
    if (!Platform.isAndroid) return;
    try {
      await _canal.invokeMethod<dynamic>('pedir', {'qual': qual});
    } catch (_) {}
  }

  /// Ultima posicao conhecida do aparelho: {'latitude':..., 'longitude':...}.
  static Future<Map<String, double>?> posicao() async {
    if (!Platform.isAndroid) return null;
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
}
