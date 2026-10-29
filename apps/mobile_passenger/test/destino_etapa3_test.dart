// Etapa 3 (Evandro, 29/10/2026): corrida sem destino (taximetro, valor
// ESTIMADO), parada extra, destinos recentes no servidor com lixeira que
// apaga no servidor e so depois muda a tela.

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_passenger/core/api/api_client.dart';
import 'package:mobile_passenger/core/utils/geo.dart';
import 'package:mobile_passenger/data/models/models.dart';
import 'package:mobile_passenger/data/repositories/ride_repository.dart';
import 'package:mobile_passenger/screens/confirm_screen.dart';
import 'package:mobile_passenger/screens/destino_sheet.dart';
import 'package:mobile_passenger/state/app_state.dart';
import 'package:mobile_passenger/state/ride_state.dart';
import 'package:mobile_passenger/widgets/ride_map.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _goiatuba = Coords(-18.0125, -49.3547);

Map<String, dynamic> _orcamento({bool semDestino = false, int paradas = 0}) => {
      'flag': 'DIURNA',
      'estimatedFareCents': semDestino ? 1000 : 1800 + paradas * 400,
      'discountCents': 0,
      'totalToPayCents': semDestino ? 1000 : 1800 + paradas * 400,
      'category': 'CARRO',
      'moto': false,
      'baseFareCents': 1000,
      'distanceCents': semDestino ? 0 : 800,
      'distanceMeters': semDestino ? 0 : 2400 + paradas * 900,
      'durationSeconds': semDestino ? 0 : 420,
      'chargedDistanceMeters': semDestino ? 0 : 900,
      'minFareApplied': false,
      'cobranca': 'TAXIMETRO',
      'semDestino': semDestino,
      'paradas': paradas,
      'opcoes': const [],
    };

http.Response _ok(Object? dados) => http.Response(jsonEncode({'success': true, 'data': dados}), 200,
    headers: {'content-type': 'application/json; charset=utf-8'});

Future<void> _assentar(WidgetTester tester) async {
  for (var i = 0; i < 5; i++) {
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Widget _app(AppState app, RideState corridas, Widget tela) => MultiProvider(
      providers: [
        ChangeNotifierProvider<AppState>.value(value: app),
        ChangeNotifierProvider<RideState>.value(value: corridas),
      ],
      child: MaterialApp(
        locale: const Locale('pt', 'BR'),
        supportedLocales: const [Locale('pt', 'BR')],
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        home: tela,
      ),
    );

void main() {
  setUp(() {
    mostrarRuasNoMapa = false;
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('Sem destino: preco ESTIMADO na confirmacao e o pedido vai sem destino', (tester) async {
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final pedidos = <String, Map<String, dynamic>>{};
    final servidor = MockClient((r) async {
      final corpo = r.body.isEmpty ? <String, dynamic>{} : jsonDecode(r.body) as Map<String, dynamic>;
      if (r.url.path.endsWith('/rides/estimate')) {
        pedidos['preco'] = corpo;
        return _ok(_orcamento(semDestino: corpo['semDestino'] == true));
      }
      if (r.method == 'POST' && r.url.path.endsWith('/rides')) {
        pedidos['corrida'] = corpo;
        return _ok({
          'ride': {
            'id': '11111111-1111-1111-1111-111111111111',
            'code': 'AB12CD',
            'status': 'SEARCHING',
            'pickupAddress': 'Praça da Matriz',
            'pickupLat': -18.0125,
            'pickupLng': -49.3547,
            'dropoffAddress': 'Sem destino definido (pelo taxímetro)',
            'dropoffLat': -18.0125,
            'dropoffLng': -49.3547,
            'dropoffPlaceId': 'SEM_DESTINO',
            'semDestino': true,
            'paradas': const [],
            'estimatedFareCents': 1000,
            'fareFlag': 'DIURNA',
            'paymentMethodType': 'CASH',
            'pin': '1234',
          },
        });
      }
      return _ok(const {});
    });
    final app = AppState(client: ApiClient(client: servidor))..coords = _goiatuba;
    final corridas = RideState(repository: RideRepository(client: ApiClient(client: servidor), demo: false));
    corridas.novaViagem(semDestino: true);
    await tester.runAsync(() => corridas.estimate(_goiatuba, _goiatuba, dropoffAddress: DestinoSheet.semDestino.address));
    expect(pedidos['preco']?['semDestino'], isTrue);
    expect(pedidos['preco']?.containsKey('dropoff'), isFalse);
    expect(corridas.quote?.semDestino, isTrue);

    // A confirmacao abre por cima do Inicio (no fim ela volta para ele).
    await tester.pumpWidget(_app(
      app,
      corridas,
      Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: TextButton(
              onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(
                builder: (_) => ConfirmScreen(destination: _goiatuba, address: DestinoSheet.semDestino.address, semDestino: true),
              )),
              child: const Text('inicio'),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('inicio'));
    await _assentar(tester);

    expect(find.textContaining('ESTIMADO'), findsAtLeastNWidgets(1));
    expect(find.text('Sem destino: você diz ao motorista no caminho'), findsOneWidget);
    expect(find.text('Adicionar parada'), findsOneWidget);

    await tester.tap(find.text('Confirmar corrida'));
    await _assentar(tester);
    expect(pedidos['corrida']?['semDestino'], isTrue);
    expect(pedidos['corrida']?.containsKey('dropoff'), isFalse);
    expect(corridas.activeRide?.semDestino, isTrue);
    // Depois do pedido, a proxima viagem comeca limpa.
    expect(corridas.semDestino, isFalse);

    await tester.pumpWidget(const SizedBox());
    corridas.dispose();
    app.dispose();
  });

  test('Parada extra: entra no pedido de preco e sai quando tira', () async {
    final corpos = <Map<String, dynamic>>[];
    final servidor = MockClient((r) async {
      if (r.url.path.endsWith('/rides/estimate')) {
        final corpo = jsonDecode(r.body) as Map<String, dynamic>;
        corpos.add(corpo);
        return _ok(_orcamento(paradas: (corpo['paradas'] as List?)?.length ?? 0));
      }
      return _ok(const {});
    });
    final corridas = RideState(repository: RideRepository(client: ApiClient(client: servidor), demo: false));
    corridas.novaViagem();
    await corridas.estimate(_goiatuba, const Coords(-18.0050, -49.3610), dropoffAddress: 'Rodoviária');
    await corridas.adicionarParada(const PlaceSuggestion(address: 'Farmácia', coords: Coords(-18.0180, -49.3500), distanceKm: 0));
    expect((corpos.last['paradas'] as List).length, 1);
    expect(corridas.quote?.paradas, 1);
    await corridas.tirarParada(0);
    expect(corpos.last.containsKey('paradas'), isFalse);
    expect(corridas.paradas, isEmpty);
    corridas.dispose();
  });

  test('Lixeira do destino: apaga no servidor e SO depois muda a lista; sem rede, nao muda', () async {
    var falhar = false;
    final servidor = MockClient((r) async {
      if (falhar) return http.Response('erro', 500);
      if (r.method == 'GET' && r.url.path.endsWith('/rides/destinos')) {
        return _ok([
          {'chave': 'a|1|1', 'address': 'Rodoviária', 'latitude': -18.005, 'longitude': -49.361, 'vezes': 2},
          {'chave': 'b|2|2', 'address': 'Hospital', 'latitude': -18.01, 'longitude': -49.35, 'vezes': 1},
        ]);
      }
      if (r.method == 'DELETE' && r.url.path.contains('/rides/destinos/')) {
        return _ok([
          {'chave': 'b|2|2', 'address': 'Hospital', 'latitude': -18.01, 'longitude': -49.35, 'vezes': 1},
        ]);
      }
      if (r.url.path.endsWith('/users/me/addresses')) return _ok(const []);
      return _ok(const {});
    });
    final corridas = RideState(repository: RideRepository(client: ApiClient(client: servidor), demo: false));
    await corridas.carregarEnderecos();
    expect(corridas.recentes.map((d) => d.lugar.address), ['Rodoviária', 'Hospital']);
    expect(corridas.recentesDoServidor, isTrue);

    falhar = true;
    expect(await corridas.esconderDestino('a|1|1'), isFalse);
    expect(corridas.recentes.length, 2, reason: 'sem resposta do servidor a lista nao muda');

    falhar = false;
    expect(await corridas.esconderDestino('a|1|1'), isTrue);
    expect(corridas.recentes.map((d) => d.lugar.address), ['Hospital']);
    corridas.dispose();
  });

  test('Corrida do servidor: paradas e sem destino', () {
    final r = Ride.fromServer({
      'id': 'x',
      'code': 'C1',
      'status': 'IN_PROGRESS',
      'pickupAddress': 'A',
      'pickupLat': -18.0,
      'pickupLng': -49.3,
      'dropoffAddress': 'Sem destino definido (pelo taxímetro)',
      'dropoffLat': -18.0,
      'dropoffLng': -49.3,
      'dropoffPlaceId': 'SEM_DESTINO',
      'paradas': [
        {'sequence': 1, 'address': 'Farmácia', 'latitude': -18.01, 'longitude': -49.31},
      ],
    });
    expect(r.semDestino, isTrue);
    expect(r.paradas.single.address, 'Farmácia');
    final volta = Ride.fromJson(r.toJson());
    expect(volta.semDestino, isTrue);
    expect(volta.paradas.single.coords.latitude, -18.01);
  });

  testWidgets('Busca do destino: atalhos "Escolher no mapa" e "Ir sem destino"', (tester) async {
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final servidor = MockClient((r) async => _ok(const []));
    final app = AppState(client: ApiClient(client: servidor))..coords = _goiatuba;
    final corridas = RideState(repository: RideRepository(client: ApiClient(client: servidor), demo: false));
    PlaceSuggestion? escolhido;
    await tester.pumpWidget(_app(
      app,
      corridas,
      Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: TextButton(
              onPressed: () async => escolhido = await DestinoSheet.abrir(context),
              child: const Text('abrir'),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('abrir'));
    await _assentar(tester);
    expect(find.text('Escolher no mapa'), findsOneWidget);
    expect(find.text('Ir sem destino'), findsOneWidget);
    await tester.tap(find.text('Ir sem destino'));
    await _assentar(tester);
    expect(DestinoSheet.ehSemDestino(escolhido), isTrue);

    await tester.pumpWidget(const SizedBox());
    corridas.dispose();
    app.dispose();
  });
}
