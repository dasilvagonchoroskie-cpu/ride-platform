// Evandro (30/10/2026): "o carro nao acompanha o sentido da rua, ta sempre
// andando de lado", "tem que mudar de cor conforme a disponibilidade" e
// "melhorar a precisao do GPS".

import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_passenger/core/api/api_client.dart';
import 'package:mobile_passenger/data/models/models.dart';
import 'package:mobile_passenger/data/repositories/ride_repository.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mobile_passenger/core/utils/filtro_gps.dart';
import 'package:mobile_passenger/core/utils/geo.dart';
import 'package:mobile_passenger/widgets/ride_map.dart';

const _inicio = Coords(-18.0125, -49.3547);

/// Ponto a [metros] de [de], na direcao [graus] (0 = norte).
Coords _andar(Coords de, double metros, double graus) {
  final r = graus * math.pi / 180;
  return Coords(
    de.latitude + metros * math.cos(r) / 111320,
    de.longitude + metros * math.sin(r) / (111320 * math.cos(de.latitude * math.pi / 180)),
  );
}

double _metros(Coords a, Coords b) => distanceKm(a, b) * 1000;

/// Angulo (graus, 0 a 360) em que o carro esta desenhado.
double _anguloDoCarro(WidgetTester tester, String id) {
  final t = tester.widget<Transform>(find.byKey(ValueKey('rumo-$id')));
  final m = t.transform;
  final graus = math.atan2(m.entry(1, 0), m.entry(0, 0)) * 180 / math.pi;
  return (graus + 360) % 360;
}

Finder _figura(String arquivo) => find.byWidgetPredicate(
      (w) => w is Image && w.image is AssetImage && (w.image as AssetImage).assetName == arquivo,
    );

Future<void> _mapa(WidgetTester tester, MapMarker carro) async {
  await tester.pumpWidget(MaterialApp(
    home: Scaffold(
      body: RideMap(center: _inicio, span: 0.01, rounded: false, markers: [carro]),
    ),
  ));
}

void main() {
  setUp(() => mostrarRuasNoMapa = false);

  group('Filtro do GPS', () {
    final t0 = DateTime(2026, 10, 30, 15);

    test('rumo entre dois pontos: norte 0, leste 90, sul 180, oeste 270', () {
      expect(rumoEntre(_inicio, _andar(_inicio, 100, 0)), closeTo(0, 0.5));
      expect(rumoEntre(_inicio, _andar(_inicio, 100, 90)), closeTo(90, 0.5));
      expect(rumoEntre(_inicio, _andar(_inicio, 100, 180)), closeTo(180, 0.5));
      expect(rumoEntre(_inicio, _andar(_inicio, 100, 270)), closeTo(270, 0.5));
    });

    test('parado: a tremida do GPS nao mexe o carro', () {
      final f = FiltroGps();
      f.adicionar(_inicio, precisao: 8, velocidade: 0, em: t0);
      final sorte = math.Random(1);
      var mudou = 0;
      for (var i = 1; i <= 20; i++) {
        final p = _andar(_inicio, sorte.nextDouble() * 6, sorte.nextDouble() * 360);
        if (f.adicionar(p, precisao: 8, velocidade: 0, em: t0.add(Duration(seconds: i)))) mudou++;
      }
      expect(mudou, 0);
      expect(_metros(f.posicao!, _inicio), lessThan(0.01));
      expect(f.rumo, isNull);
    });

    test('andando para o leste: acompanha a rua e o rumo fica 90 (com e sem o rumo do GPS)', () {
      for (final comGps in [true, false]) {
        final f = FiltroGps();
        var real = _inicio;
        f.adicionar(real, precisao: 5, em: t0);
        for (var i = 1; i <= 30; i++) {
          real = _andar(real, 10, 90);
          f.adicionar(real,
              precisao: 5,
              rumoDoGps: comGps ? 90.0 : null,
              velocidade: comGps ? 10.0 : null,
              em: t0.add(Duration(seconds: i)));
        }
        expect(_metros(f.posicao!, real), lessThan(5), reason: 'comGps=$comGps');
        expect(f.rumo, closeTo(90, 3), reason: 'comGps=$comGps');
      }
    });

    test('parou depois de andar: o carro continua apontando para onde ia', () {
      final f = FiltroGps();
      var real = _inicio;
      f.adicionar(real, precisao: 5, em: t0);
      for (var i = 1; i <= 10; i++) {
        real = _andar(real, 10, 180);
        f.adicionar(real, precisao: 5, em: t0.add(Duration(seconds: i)));
      }
      for (var i = 11; i <= 20; i++) {
        f.adicionar(_andar(real, 1, i * 37.0), precisao: 5, velocidade: 0, em: t0.add(Duration(seconds: i)));
      }
      expect(f.rumo, closeTo(180, 3));
    });

    test('leitura ruim e descartada; sem nenhuma boa por 15 s, a de ate 80 m entra', () {
      final f = FiltroGps();
      f.adicionar(_inicio, precisao: 8, em: t0);
      final longe = _andar(_inicio, 50, 0);
      expect(f.adicionar(longe, precisao: 70, em: t0.add(const Duration(seconds: 2))), isFalse);
      expect(f.adicionar(longe, precisao: 70, em: t0.add(const Duration(seconds: 20))), isTrue);
      expect(f.adicionar(longe, precisao: 150, em: t0.add(const Duration(seconds: 40))), isFalse);
    });

    test('salto impossivel e descartado; se o GPS insistir 3 vezes, vale', () {
      final f = FiltroGps();
      f.adicionar(_inicio, precisao: 5, em: t0);
      final longe = _andar(_inicio, 2000, 45);
      expect(f.adicionar(longe, precisao: 5, em: t0.add(const Duration(seconds: 1))), isFalse);
      expect(f.adicionar(longe, precisao: 5, em: t0.add(const Duration(seconds: 2))), isFalse);
      expect(_metros(f.posicao!, _inicio), lessThan(0.01));
      expect(f.adicionar(longe, precisao: 5, em: t0.add(const Duration(seconds: 3))), isTrue);
      expect(_metros(f.posicao!, longe), lessThan(1));
    });
  });

  group('Carro no mapa', () {
    testWidgets('cor pela situacao: livre verde, em corrida laranja, offline cinza; moto tambem', (tester) async {
      await _mapa(tester, const MapMarker(id: 'me', coords: _inicio, kind: MarkerKind.car));
      expect(_figura('assets/markers/carro_livre.png'), findsOneWidget);
      await _mapa(tester, const MapMarker(id: 'me', coords: _inicio, kind: MarkerKind.car, situacao: SituacaoVeiculo.ocupado));
      expect(_figura('assets/markers/carro_ocupado.png'), findsOneWidget);
      await _mapa(tester, const MapMarker(id: 'me', coords: _inicio, kind: MarkerKind.car, situacao: SituacaoVeiculo.offline));
      expect(_figura('assets/markers/carro_offline.png'), findsOneWidget);
      await _mapa(tester, const MapMarker(id: 'me', coords: _inicio, kind: MarkerKind.moto, situacao: SituacaoVeiculo.ocupado));
      expect(_figura('assets/markers/moto_ocupado.png'), findsOneWidget);
      expect(_figura('assets/markers/car_black.png'), findsNothing);
    });

    testWidgets('o carro gira para o lado em que anda (rumo do GPS)', (tester) async {
      await _mapa(tester, const MapMarker(id: 'me', coords: _inicio, kind: MarkerKind.car, rumo: 90));
      expect(_anguloDoCarro(tester, 'me'), closeTo(90, 0.5));
      await _mapa(tester, MapMarker(id: 'me', coords: _andar(_inicio, 20, 180), kind: MarkerKind.car, rumo: 180));
      await tester.pumpAndSettle();
      expect(_anguloDoCarro(tester, 'me'), closeTo(180, 0.5));
    });

    testWidgets('sem rumo do GPS: gira pela direcao do caminho', (tester) async {
      await _mapa(tester, const MapMarker(id: 'me', coords: _inicio, kind: MarkerKind.car));
      await _mapa(tester, MapMarker(id: 'me', coords: _andar(_inicio, 30, 270), kind: MarkerKind.car));
      await tester.pumpAndSettle();
      expect(_anguloDoCarro(tester, 'me'), closeTo(270, 1));
    });

    testWidgets('de 350 para 10 graus gira pelo lado curto (passa pelo norte, nao pelo sul)', (tester) async {
      await _mapa(tester, const MapMarker(id: 'me', coords: _inicio, kind: MarkerKind.car, rumo: 350));
      await _mapa(tester, const MapMarker(id: 'me', coords: _inicio, kind: MarkerKind.car, rumo: 10));
      await tester.pump(const Duration(milliseconds: 300));
      final meio = _anguloDoCarro(tester, 'me');
      expect(meio >= 340 || meio <= 20, isTrue, reason: 'no meio do giro: $meio');
      await tester.pumpAndSettle();
      expect(_anguloDoCarro(tester, 'me'), closeTo(10, 0.5));
    });
  });

  group('Carros que vem do servidor', () {
    setUp(() => SharedPreferences.setMockInitialValues({'ride.accessToken': 'token-de-teste'}));

    test('carros por perto trazem o rumo (o mapa gira cada um no sentido da rua)', () async {
      final cliente = MockClient((r) async => http.Response(
            jsonEncode({
              'success': true,
              'data': [
                {'id': 'carro-abc123def456', 'latitude': -18.013, 'longitude': -49.355, 'rumo': 90, 'situacao': 'LIVRE', 'moto': false},
                {'id': 'carro-0123456789ab', 'latitude': -18.014, 'longitude': -49.356, 'moto': true},
              ],
            }),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          ));
      final repo = RideRepository(client: ApiClient(client: cliente), demo: false);
      final carros = await repo.nearbyDrivers(_inicio);
      expect(carros, hasLength(2));
      expect(carros.first.id, 'carro-abc123def456');
      expect(carros.first.rumo, 90);
      expect(carros.last.rumo, isNull);
      expect(carros.last.moto, isTrue);
    });

    test('carro da corrida traz o rumo do GPS do motorista', () {
      final ride = Ride.fromServer({
        'id': 'r1',
        'status': 'DRIVER_ARRIVING',
        'pickupLat': '-18.0125',
        'pickupLng': '-49.3547',
        'dropoffLat': '-18.0050',
        'dropoffLng': '-49.3610',
        'driver': {
          'id': 'd1',
          'user': {'name': 'Joao'},
        },
        'driverPosition': {'latitude': -18.013, 'longitude': -49.355, 'heading': 180},
      });
      expect(ride.driver?.rumo, 180);
      expect(ride.driver?.posicaoReal, isTrue);
    });
  });
}
