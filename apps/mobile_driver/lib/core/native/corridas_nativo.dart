import 'dart:io';

import 'package:flutter/services.dart';

/// Ponte com o servico nativo de corridas do Android.
///
/// O servico vigia chamados com o aplicativo fechado, toca o alarme e abre
/// a tela de chamada por cima de qualquer coisa. Aqui ficam so as chamadas;
/// a logica mora no Android (CorridasService), onde ela sobrevive com a
/// tela apagada.
class CorridasNativo {
  CorridasNativo._();

  static const MethodChannel _canal = MethodChannel('fortaleza/corridas');

  /// Sem estas, o alarme pode falhar. O motorista so fica disponivel com
  /// todas liberadas.
  static const List<String> essenciais = ['localizacao', 'notificacao', 'sobrepor', 'bateria'];

  static Future<void> iniciar(String api, String token) =>
      _chamar('iniciar', {'api': api, 'token': token});

  static Future<void> parar() => _chamar('parar');

  static Future<void> pararAlarme() => _chamar('pararAlarme');

  static Future<void> pedir(String qual) => _chamar('pedir', {'qual': qual});

  /// O que ja esta liberado. Fora do Android (onde nao ha o servico),
  /// considera tudo liberado para nao travar o aplicativo.
  static Future<Map<String, bool>> permissoes() async {
    if (!Platform.isAndroid) {
      return {for (final k in [...essenciais, 'telaCheia']) k: true};
    }
    try {
      final r = await _canal.invokeMethod<Map<dynamic, dynamic>>('permissoes');
      return (r ?? const {}).map((k, v) => MapEntry(k.toString(), v == true));
    } catch (_) {
      return const {};
    }
  }

  static bool essenciaisOk(Map<String, bool> p) => essenciais.every((k) => p[k] == true);

  static Future<void> _chamar(String metodo, [Map<String, dynamic>? args]) async {
    if (!Platform.isAndroid) return;
    try {
      await _canal.invokeMethod<dynamic>(metodo, args);
    } catch (_) {
      // O servico e reforco: uma falha aqui nao pode derrubar a tela.
    }
  }
}
