// Pedido do Evandro (29/10/2026): "o mapa deve aparecer primeiro, com a
// ultima localizacao conhecida; motoristas e marcadores entram depois".
// Antes, o app esperava o GPS (ate 15 s dentro de casa) na tela
// "Localizando voce" antes de mostrar o mapa.

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_passenger/core/api/api_client.dart';
import 'package:mobile_passenger/core/storage/app_storage.dart';
import 'package:mobile_passenger/state/app_state.dart';
import 'package:mobile_passenger/state/auth_state.dart';
import 'package:mobile_passenger/state/config_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

ApiClient _api([Map<String, dynamic> data = const {}]) => ApiClient(
      client: MockClient((r) async => http.Response(jsonEncode({'success': true, 'data': data}), 200)),
    );

/// Formato real de GET /app/config -> pracas.
const _config = {
  'cidades': ['Goiatuba - GO', 'Itumbiara - GO'],
  'pracas': [
    {'id': 'goiatuba', 'nome': 'Goiatuba', 'uf': 'GO', 'latitude': -18.0125, 'longitude': -49.3547},
    {'id': 'itumbiara', 'nome': 'Itumbiara', 'uf': 'GO', 'latitude': -18.4093, 'longitude': -49.2158},
  ],
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('abre na hora com a ultima posicao guardada, sem esperar o GPS', () async {
    SharedPreferences.setMockInitialValues({
      'ride.ultimaPosicao': jsonEncode({'lat': -18.0201, 'lng': -49.3602, 'em': '2026-10-29T10:00:00.000'}),
    });
    final app = AppState(client: _api());
    final relogio = Stopwatch()..start();
    await app.bootstrap();
    expect(relogio.elapsed, lessThan(const Duration(seconds: 3)));
    expect(app.bootstrapped, isTrue);
    expect(app.temPosicao, isTrue);
    expect(app.posicaoGuardada, isTrue);
    expect(app.localizacaoReal, isFalse, reason: 'o GPS ainda nao respondeu');
    expect(app.coords.latitude, -18.0201);
    expect(app.coords.longitude, -49.3602);
  });

  test('sem posicao guardada e sem GPS: ainda nao abre o mapa', () async {
    SharedPreferences.setMockInitialValues({});
    final app = AppState(client: _api());
    await app.bootstrap();
    expect(app.bootstrapped, isTrue);
    expect(app.temPosicao, isFalse);
  });

  test('primeira vez no celular: o mapa abre no centro da cidade do cadastro (vindo do servidor)', () async {
    SharedPreferences.setMockInitialValues({});
    final config = ConfigState(client: _api(_config));
    final app = AppState(client: _api());
    await app.bootstrap();
    await config.iniciar();
    final centro = config.centroDaCidade('Itumbiara - GO');
    expect(centro, isNotNull);
    expect(centro!.latitude, -18.4093);
    expect(config.centroDaCidade('Goiatúba - GO')!.latitude, -18.0125, reason: 'acento nao atrapalha');
    expect(config.centroDaCidade('Cidade que nao existe'), isNull);
    expect(config.centroDaCidade(null), isNull);

    app.usarCentroDaCidade(centro);
    expect(app.temPosicao, isTrue);
    expect(app.centroDaCidade, isTrue);
    expect(app.localizacaoReal, isFalse);
  });

  test('antes de pedir a corrida, espera o GPS no maximo o tempo dado', () async {
    SharedPreferences.setMockInitialValues({});
    final app = AppState(client: _api());
    final relogio = Stopwatch()..start();
    final ok = await app.esperarGps(const Duration(milliseconds: 700));
    expect(ok, isFalse);
    expect(relogio.elapsed, lessThan(const Duration(seconds: 2)));
  });

  test('a posicao guardada e da pessoa: some ao sair da conta', () async {
    SharedPreferences.setMockInitialValues({
      'ride.accessToken': 'token',
      'ride.ultimaPosicao': jsonEncode({'lat': -18.0201, 'lng': -49.3602, 'em': '2026-10-29T10:00:00.000'}),
    });
    final auth = AuthState(client: _api());
    AppState(client: _api());
    await auth.logout();
    expect(await AppStorage.read(AppStorage.ultimaPosicao), isNull);
  });
}
