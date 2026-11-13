import 'dart:io';

import 'package:flutter/services.dart';

/// Alarme "o motorista chegou" (mesmo assobio do aplicativo do passageiro:
/// toca como alarme, mesmo no silencioso, e vibra). So com o aplicativo
/// aberto: o Comercio nao tem servico em segundo plano. Toca uma vez por
/// entrega; sem o recurso do aparelho (ou fora do Android) nao faz nada.
class Alarme {
  Alarme._();

  static const MethodChannel _canal = MethodChannel('fortaleza/comercio_alarme');

  /// Entregas que ja alarmaram nesta abertura do app.
  static final Set<String> _ja = {};

  /// Para os testes.
  static final List<String> tocados = [];

  static Future<void> motoristaChegou(String rideId) async {
    if (rideId.isEmpty || !_ja.add(rideId)) return;
    tocados.add(rideId);
    if (!Platform.isAndroid) return;
    try {
      await _canal.invokeMethod<dynamic>('assobio', {'chave': '$rideId:chegou'});
    } catch (_) {
      // Sem o recurso no aparelho: o aviso do sino continua valendo.
    }
  }

  static Future<void> parar() async {
    if (!Platform.isAndroid) return;
    try {
      await _canal.invokeMethod<dynamic>('parar');
    } catch (_) {}
  }
}
