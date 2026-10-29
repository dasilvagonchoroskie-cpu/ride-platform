// Pedido do Evandro (29/10/2026): o mapa aparece primeiro, na ultima posicao
// conhecida deste celular; o GPS acerta depois. Antes, o app ficava na tela
// "Localizando voce" ate o GPS responder (ate 15 s dentro de casa).

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_driver/core/api/api_client.dart';
import 'package:mobile_driver/core/storage/app_storage.dart';
import 'package:mobile_driver/state/driver_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

DriverState _motorista() => DriverState(
      client: ApiClient(
        client: MockClient((r) async => http.Response(jsonEncode({'success': true, 'data': <String, dynamic>{}}), 200)),
      ),
    );

void main() {
  testWidgets('abre com a ultima posicao guardada, sem esperar o GPS', (tester) async {
    SharedPreferences.setMockInitialValues({
      'ride.ultimaPosicao': jsonEncode({'lat': -18.0201, 'lng': -49.3602, 'em': '2026-10-29T10:00:00.000'}),
    });
    final d = _motorista();
    await tester.runAsync(d.restore);
    expect(d.ready, isTrue);
    expect(d.temPosicao, isTrue);
    expect(d.posicaoGuardada, isTrue);
    expect(d.posicaoReal, isFalse, reason: 'o GPS ainda nao respondeu: nada vai ao servidor nem ao taximetro');
    expect(d.position.latitude, -18.0201);
    expect(d.position.longitude, -49.3602);
  });

  testWidgets('sem posicao guardada: espera o GPS (tela Localizando)', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final d = _motorista();
    await tester.runAsync(d.restore);
    expect(d.ready, isTrue);
    expect(d.temPosicao, isFalse);
  });

  testWidgets('a posicao guardada some ao sair da conta', (tester) async {
    SharedPreferences.setMockInitialValues({
      'ride.ultimaPosicao': jsonEncode({'lat': -18.0201, 'lng': -49.3602, 'em': '2026-10-29T10:00:00.000'}),
    });
    await tester.runAsync(AppStorage.clearDriverSession);
    expect(await tester.runAsync(() => AppStorage.read(AppStorage.ultimaPosicao)), isNull);
  });
}
