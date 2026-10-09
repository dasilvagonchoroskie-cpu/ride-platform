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
  static const List<String> essenciais = ['localizacao', 'gps', 'notificacao', 'sobrepor', 'bateria', 'telaCheia'];

  /// Recados do Android: chamado novo (o vigia achou antes do app) e corrida
  /// aceita na tela de chamado nativa (o app traz a corrida do servidor).
  static void ouvir({required void Function() chamadoNovo, required void Function() corridaAceita}) {
    if (!Platform.isAndroid) return;
    _canal.setMethodCallHandler((call) async {
      switch (call.method) {
        case 'chamadoNovo':
          chamadoNovo();
        case 'corridaAceita':
          corridaAceita();
      }
      return null;
    });
  }

  /// Em 5 s abre a tela de chamado de teste (da tempo de bloquear o celular).
  static Future<void> testarChamado() => _chamar('testarChamado');

  /// Endereco de push (Firebase) deste celular. null enquanto o Firebase
  /// nao estiver configurado no aplicativo.
  static Future<String?> tokenPush() async {
    if (!Platform.isAndroid) return null;
    try {
      return await _canal.invokeMethod<String>('tokenPush').timeout(const Duration(seconds: 15));
    } catch (_) {
      return null;
    }
  }

  static Future<void> iniciar(String api, String token) =>
      _chamar('iniciar', {'api': api, 'token': token});

  static Future<void> parar() => _chamar('parar');

  static Future<void> pararAlarme() => _chamar('pararAlarme');

  /// Chamado aparecendo com o aplicativo aberto: toca o alarme (o Android
  /// nao repete se o vigia ja tocou o mesmo chamado).
  static Future<void> tocarChamado(String rideId, String expiresAt, String embarque, String destino) => _chamar(
        'tocarChamado',
        {'rideId': rideId, 'expiresAt': expiresAt, 'embarque': embarque, 'destino': destino},
      );

  /// Toca o alarme por 5 s no volume maximo, para o motorista conferir o som.
  static Future<void> testarAlarme() => _chamar('testarAlarme');

  static Future<void> pedir(String qual) => _chamar('pedir', {'qual': qual});

  /// O que ja esta liberado. Fora do Android (onde nao ha o servico),
  /// considera tudo liberado para nao travar o aplicativo.
  static Future<Map<String, bool>> permissoes() async {
    if (!Platform.isAndroid) {
      return {for (final k in essenciais) k: true};
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
