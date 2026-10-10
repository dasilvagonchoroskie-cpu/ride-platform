import 'dart:io';

import 'package:flutter/services.dart';

import 'config/app_config.dart';

/// Ponte com o servico do Android que acompanha a corrida com o aplicativo
/// minimizado (CorridaService): avisa com som quando o motorista aceita,
/// chega, inicia a viagem, manda mensagem ou a corrida termina.
class VigiaCorrida {
  VigiaCorrida._();

  static const MethodChannel _canal = MethodChannel('fortaleza/corrida');

  static Future<void> iniciar(String rideId) async {
    if (!Platform.isAndroid || !AppConfig.hasApi || rideId.isEmpty) return;
    try {
      await _canal.invokeMethod<dynamic>('iniciar', {'api': AppConfig.apiUrl, 'rideId': rideId});
    } catch (_) {
      // Reforco: sem ele o aplicativo continua funcionando aberto.
    }
  }

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

  /// Motorista chegou com o aplicativo aberto: assobio como alarme + vibra.
  /// Mesma chave do vigia: toca uma vez so por corrida.
  static Future<void> assobio(String rideId) async {
    if (!Platform.isAndroid || rideId.isEmpty) return;
    try {
      await _canal.invokeMethod<dynamic>('assobio', {'chave': '$rideId:chegou'});
    } catch (_) {}
  }

  static Future<void> parar() async {
    if (!Platform.isAndroid) return;
    try {
      await _canal.invokeMethod<dynamic>('parar');
    } catch (_) {}
  }
}
