// Etapa 4 (Evandro, 30/10/2026): na viagem o app do passageiro pedia a rota
// embarque -> destino de novo, mas ela ja tinha vindo no orcamento (do proprio
// passageiro). Agora, com o carro em cima desse caminho, usa ele; longe dele
// (comecou em outro lugar), pede como antes.

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_passenger/core/api/api_client.dart';
import 'package:mobile_passenger/core/utils/geo.dart';
import 'package:mobile_passenger/data/repositories/ride_repository.dart';
import 'package:mobile_passenger/state/ride_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _embarque = Coords(-18.0125, -49.3547);
const _destino = Coords(-18.0050, -49.3610);
const _carroLonge = Coords(-18.0160, -49.3500);

List<List<double>> _linha(Coords a, Coords b, [int n = 12]) => [
      for (var i = 0; i <= n; i++)
        [a.latitude + (b.latitude - a.latitude) * i / n, a.longitude + (b.longitude - a.longitude) * i / n],
    ];

class _Servidor {
  final rotas = <String>[];
  String status = 'SEARCHING';
  Coords? carro;

  Map<String, dynamic> _corrida() => {
        'id': '11111111-1111-1111-1111-111111111111',
        'code': 'AB12CD',
        'status': status,
        'pickupAddress': 'Rua Javari, 1234',
        'pickupLat': '${_embarque.latitude}',
        'pickupLng': '${_embarque.longitude}',
        'dropoffAddress': 'Rodoviária',
        'dropoffLat': '${_destino.latitude}',
        'dropoffLng': '${_destino.longitude}',
        'estimatedFareCents': 1500,
        'paymentMethodType': 'CASH',
        'pin': '4821',
        if (carro != null) 'driverPosition': {'latitude': carro!.latitude, 'longitude': carro!.longitude, 'updatedAt': '2026-10-30T12:00:00.000Z'},
        if (carro != null)
          'driver': {
            'id': '22222222-2222-2222-2222-222222222222',
            'ratingAvg': '5.00',
            'totalRides': 10,
            'user': {'name': 'José', 'phone': '+5564999990000'},
          },
        if (carro != null) 'vehicle': {'brand': 'Chevrolet', 'model': 'Prisma', 'color': 'Branco', 'plate': 'OBL3A45'},
      };

  MockClient cliente() => MockClient((r) async {
        final p = r.url.path;
        Object? dados = <String, dynamic>{};
        if (p == '/api/geo/rota') {
          rotas.add('${r.url.queryParameters['deLat']},${r.url.queryParameters['deLng']}');
          dados = {'porRua': true, 'distanceMeters': 900, 'durationSeconds': 200, 'pontos': _linha(_carroLonge, _embarque)};
        } else if (p == '/api/rides/estimate') {
          dados = {
            'flag': 'DIURNA',
            'estimatedFareCents': 1500,
            'discountCents': 0,
            'totalToPayCents': 1500,
            'category': 'CARRO',
            'distanceMeters': 1400,
            'durationSeconds': 300,
            'cobranca': 'TAXIMETRO',
            'cotacao': 'assinada',
            'pontos': _linha(_embarque, _destino),
          };
        } else if (p == '/api/rides') {
          dados = {'ride': _corrida()};
        } else if (p.startsWith('/api/rides/1111')) {
          dados = {'ride': _corrida()};
        }
        return http.Response(jsonEncode({'success': true, 'data': dados}), 200,
            headers: {'content-type': 'application/json; charset=utf-8'});
      });
}

Future<void> _esperar() => Future<void>.delayed(const Duration(milliseconds: 200));

Future<RideState> _pedir(_Servidor s) async {
  final r = RideState(repository: RideRepository(client: ApiClient(client: s.cliente()), demo: false));
  await r.estimate(_embarque, _destino, dropoffAddress: 'Rodoviária');
  expect(r.rotaPrevia.length, greaterThan(2), reason: 'o caminho veio no orcamento');
  await r.requestRide(
    origin: _embarque,
    destination: _destino,
    pickupAddress: 'Rua Javari, 1234',
    dropoffAddress: 'Rodoviária',
    paymentMethod: 'Dinheiro',
  );
  await _esperar();
  return r;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({'ride.accessToken': 'token-de-teste'}));

  test('Viagem comecando no embarque: usa o caminho do orcamento (sem rota nova)', () async {
    final s = _Servidor();
    final r = await _pedir(s);
    // Motorista vindo: 1 rota (carro -> embarque), como antes.
    s
      ..status = 'DRIVER_ASSIGNED'
      ..carro = _carroLonge;
    await r.atualizarCorrida();
    await _esperar();
    expect(s.rotas, hasLength(1));
    // Em viagem, o carro no embarque: nenhuma rota nova.
    s
      ..status = 'IN_PROGRESS'
      ..carro = _embarque;
    await r.atualizarCorrida();
    await _esperar();
    expect(s.rotas, hasLength(1), reason: 'a rota da viagem e o caminho do orcamento');
    expect(r.tripRoute.length, greaterThan(2));
    expect(distanceKm(r.tripRoute.last, _destino), lessThan(0.05));
    await r.limpar();
  });

  test('Viagem comecando longe do embarque: pede a rota de onde o carro esta', () async {
    final s = _Servidor();
    final r = await _pedir(s);
    s
      ..status = 'IN_PROGRESS'
      ..carro = const Coords(-18.0300, -49.3300);
    await r.atualizarCorrida();
    await _esperar();
    expect(s.rotas, ['-18.030000,-49.330000']);
    await r.limpar();
  });
}
