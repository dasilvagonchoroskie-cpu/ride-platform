import 'dart:math';

import 'package:flutter/foundation.dart';

import 'app_storage.dart';

/// Quem e esta Central para o servidor (Requisicao 1, 11/11/2026): cada
/// instalacao (ou navegador) tem um codigo proprio, para a lista de
/// aparelhos separar um do outro e o dono poder desconectar um so.
class IdentidadeDoAparelho {
  const IdentidadeDoAparelho._();

  static const String chave = AppStorage.idDoAparelho;
  static Map<String, dynamic>? _dados;

  static Future<Map<String, dynamic>> dados() async {
    final pronto = _dados;
    if (pronto != null) return pronto;
    var id = await AppStorage.read(chave);
    if (id == null || id.length < 16) {
      id = sortear();
      await AppStorage.write(chave, id);
    }
    return _dados = <String, dynamic>{
      'deviceId': kIsWeb ? 'web-$id' : 'and-$id',
      'platform': kIsWeb ? 'WEB' : 'ANDROID',
      'model': kIsWeb ? 'Central no navegador' : 'Central (Android)',
    };
  }

  static String sortear() {
    final r = Random.secure();
    return List<String>.generate(16, (_) => r.nextInt(256).toRadixString(16).padLeft(2, '0')).join();
  }
}
