// Evandro (08/10/2026): "quando ele aceita a corrida... aparecer o valor, a
// contagem do valor na corrida" e "a rota tem que ir pela estrada certa, nao
// aquele risco verde que parece rota de aviao".

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_driver/core/api/api_client.dart';
import 'package:mobile_driver/core/taximetro.dart';
import 'package:mobile_driver/core/utils/geo.dart';
import 'package:mobile_driver/data/models/driver_models.dart';
import 'package:mobile_driver/screens/ride_screen.dart';
import 'package:mobile_driver/state/driver_state.dart';
import 'package:mobile_driver/widgets/ride_map.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _tabela = TarifaDaCorrida(
  baseCents: 1000,
  porKmCents: 250,
  porMinutoCents: 0,
  esperaPorMinutoCents: 50,
  metrosInclusos: 1500,
  esperaInclusaSegundos: 180,
  minimoCents: 1000,
  multiplicador: 1,
);

const _oferta = RideOffer(
  id: 'r1',
  code: 'AB12CD',
  passengerName: 'Maria',
  passengerRating: 4.8,
  pickupAddress: 'Praça da Matriz, Goiatuba',
  pickupCoords: Coords(-18.0125, -49.3547),
  dropoffAddress: 'Rodoviária de Goiatuba',
  dropoffCoords: Coords(-18.005, -49.361),
  distanceToPickupMeters: 800,
  tripDistanceMeters: 1500,
  durationSeconds: 300,
  fareCents: 1000,
  earningCents: 920,
  paymentMethod: 'Dinheiro',
);

void main() {
  group('Conta do taximetro (igual a do servidor)', () {
    test('dentro do incluso: so a bandeirada', () {
      expect(_tabela.valorCents(metros: 1200, segundosViagem: 300, segundosEspera: 60), 1000);
    });

    test('km alem do incluso e espera alem da inclusa', () {
      // 3 km: 1,5 km cobrado x R$ 2,50 = 375; espera 5 min: 2 min x R$ 0,50 = 100.
      expect(_tabela.valorCents(metros: 3000, segundosViagem: 600, segundosEspera: 300), 1475);
    });

    test('multiplicador dinamico vale sobre o total', () {
      const t = TarifaDaCorrida(
        baseCents: 1000,
        porKmCents: 250,
        porMinutoCents: 10,
        esperaPorMinutoCents: 0,
        metrosInclusos: 0,
        esperaInclusaSegundos: 0,
        minimoCents: 0,
        multiplicador: 1.5,
      );
      // 1000 + 2 km x 250 + 10 min x 10 = 1600; x 1,5 = 2400.
      expect(t.valorCents(metros: 2000, segundosViagem: 600, segundosEspera: 0), 2400);
    });
  });

  group('Medicao pelo GPS', () {
    final t0 = DateTime(2026, 10, 8, 20);

    test('soma o trajeto e ignora tremida parado', () {
      final m = Taximetro();
      m.adicionar(const Coords(-18.0125, -49.3547), precisao: 10, em: t0);
      m.adicionar(const Coords(-18.01252, -49.35471), precisao: 10, em: t0.add(const Duration(seconds: 5)));
      expect(m.metros, 0);
      m.adicionar(const Coords(-18.0115, -49.3547), precisao: 10, em: t0.add(const Duration(seconds: 20)));
      expect(m.metros, closeTo(111, 3));
    });

    test('ignora leitura imprecisa e salto impossivel', () {
      final m = Taximetro();
      m.adicionar(const Coords(-18.0125, -49.3547), precisao: 10, em: t0);
      m.adicionar(const Coords(-18.0025, -49.3547), precisao: 80, em: t0.add(const Duration(seconds: 5)));
      expect(m.metros, 0);
      // 1,1 km em 3 s (mais de 1300 km/h): salto do GPS.
      m.adicionar(const Coords(-18.0025, -49.3547), precisao: 10, em: t0.add(const Duration(seconds: 8)));
      expect(m.metros, 0);
    });

    test('guarda e recupera (aplicativo fechado no meio da viagem)', () {
      final m = Taximetro(metros: 2350, ultimo: const Coords(-18.01, -49.35), ultimoEm: t0);
      final de = Taximetro.deJson(jsonDecode(jsonEncode(m.toJson())) as Map<String, dynamic>);
      expect(de.metros, 2350);
      expect(de.ultimo!.latitude, -18.01);
    });
  });

  group('Rota pelas ruas', () {
    test('le os pontos que o servidor manda', () {
      final r = pontosDaRota({
        'pontos': [
          [-18.0125, -49.3547],
          [-18.01, -49.356],
          [-18.005, -49.361],
        ],
        'porRua': true,
      });
      expect(r.length, 3);
      expect(r.last.longitude, -49.361);
    });

    test('o traco some atras do carro', () {
      const rota = [Coords(-18.0, -49.0), Coords(-18.0, -49.01), Coords(-18.0, -49.02)];
      final resto = restanteDaRota(const Coords(-18.0001, -49.015), rota);
      expect(resto.length, 2);
      expect(resto.last.longitude, -49.02);
      // Longe da rota (saiu do caminho): mantem a rota inteira para redesenhar.
      expect(restanteDaRota(const Coords(-18.05, -49.015), rota).length, 3);
    });
  });

  testWidgets('Em viagem: o valor do taximetro aparece no canto da tela', (tester) async {
    SharedPreferences.setMockInitialValues({'ride.accessToken': 'token-de-teste'});
    mostrarRuasNoMapa = false;
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final api = ApiClient(
      client: MockClient((r) async => http.Response(
            jsonEncode({'success': false, 'error': {'code': 'NOT_FOUND', 'message': 'x'}}),
            404,
            headers: {'content-type': 'application/json; charset=utf-8'},
          )),
    );
    final d = DriverState(client: api)
      ..activeRide = const DriverRide(offer: _oferta, phase: RidePhase.inProgress, pin: '1234', startedAt: '2026-10-08T20:00:00.000Z')
      ..tarifa = _tabela
      ..taximetro = Taximetro(metros: 3000)
      ..viagemIniciouEm = DateTime.now().subtract(const Duration(minutes: 7));
    await tester.pumpWidget(
      ChangeNotifierProvider<DriverState>.value(
        value: d,
        child: MaterialApp(
          locale: const Locale('pt', 'BR'),
          supportedLocales: const [Locale('pt', 'BR')],
          localizationsDelegates: GlobalMaterialLocalizations.delegates,
          home: const RideScreen(),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.text('Taxímetro'), findsOneWidget);
    expect(find.textContaining('13,75'), findsOneWidget);
    expect(find.textContaining('3,0 km'), findsOneWidget);
    expect(find.textContaining('07:0'), findsOneWidget);
  });

  testWidgets('A caminho do passageiro: mostra o valor estimado', (tester) async {
    SharedPreferences.setMockInitialValues({'ride.accessToken': 'token-de-teste'});
    mostrarRuasNoMapa = false;
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final d = DriverState(client: ApiClient(client: MockClient((r) async => http.Response('{}', 404))))
      ..activeRide = const DriverRide(offer: _oferta, phase: RidePhase.toPickup, pin: '1234', startedAt: '2026-10-08T20:00:00.000Z');
    await tester.pumpWidget(
      ChangeNotifierProvider<DriverState>.value(
        value: d,
        child: MaterialApp(
          locale: const Locale('pt', 'BR'),
          supportedLocales: const [Locale('pt', 'BR')],
          localizationsDelegates: GlobalMaterialLocalizations.delegates,
          home: const RideScreen(),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.text('Valor estimado'), findsOneWidget);
    expect(find.textContaining('10,00'), findsOneWidget);
  });
}
