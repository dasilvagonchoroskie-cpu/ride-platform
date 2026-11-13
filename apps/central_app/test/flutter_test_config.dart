import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

/// Vale para todos os testes desta pasta (Requisicao 1, 11/11/2026).
///
/// O cofre do celular (flutter_secure_storage) fala com o Android por um
/// canal. No teste nao ha Android: sem resposta, o pedido ficava esperando o
/// motor de verdade e o teste travava ("pumpAndSettle timed out"). Aqui o
/// canal responde na hora com um cofre em memoria, limpo a cada teste.
Future<void> testExecutable(FutureOr<void> Function() testMain) async {
  TestWidgetsFlutterBinding.ensureInitialized();
  const canal = MethodChannel('plugins.it_nomads.com/flutter_secure_storage');
  final cofre = <String, String>{};
  setUp(() {
    cofre.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(canal, (call) async {
      final a = (call.arguments as Map?)?.cast<String, dynamic>() ?? const {};
      final k = a['key'] as String?;
      switch (call.method) {
        case 'read':
          return cofre[k];
        case 'write':
          cofre[k!] = a['value'] as String;
          return null;
        case 'delete':
          cofre.remove(k);
          return null;
        case 'deleteAll':
          cofre.clear();
          return null;
        case 'containsKey':
          return cofre.containsKey(k);
        case 'readAll':
          return Map<String, String>.of(cofre);
      }
      return null;
    });
  });
  await testMain();
}
