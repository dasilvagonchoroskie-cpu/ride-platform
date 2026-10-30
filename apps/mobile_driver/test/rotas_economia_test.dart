// Etapa 4 (Evandro, 30/10/2026): a cota gratis de rotas da TomTom cobre
// poucas corridas por dia. O app do motorista pedia a rota ate o embarque de
// novo ao aceitar (ela tinha vindo com o chamado segundos antes) e a da
// viagem de novo ao iniciar (no embarque, e a mesma). Agora usa as que ja tem
// quando o carro esta em cima da linha; longe dela, pede como antes.

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_driver/core/api/api_client.dart';
import 'package:mobile_driver/core/utils/geo.dart';
import 'package:mobile_driver/data/models/driver_models.dart';
import 'package:mobile_driver/state/driver_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _carro = Coords(-18.0130, -49.3550);
const _embarque = Coords(-18.0125, -49.3547);
const _destino = Coords(-18.0050, -49.3610);

const _oferta = RideOffer(
  id: 'r1',
  code: 'AB12CD',
  passengerName: 'Maria',
  passengerRating: 4.8,
  pickupAddress: 'Rua Javari, 1234',
  pickupCoords: _embarque,
  dropoffAddress: 'Rodoviária',
  dropoffCoords: _destino,
  distanceToPickupMeters: 80,
  tripDistanceMeters: 1400,
  durationSeconds: 300,
  fareCents: 1500,
  earningCents: 1380,
  paymentMethod: 'Dinheiro',
);

/// Linha com [n] pontos entre [a] e [b] (como uma rota pelas ruas).
List<Coords> _linha(Coords a, Coords b, [int n = 12]) => [
      for (var i = 0; i <= n; i++)
        Coords(a.latitude + (b.latitude - a.latitude) * i / n, a.longitude + (b.longitude - a.longitude) * i / n),
    ];

class _Servidor {
  final rotas = <String>[];
  String status = 'DRIVER_ASSIGNED';

  MockClient cliente() => MockClient((r) async {
        Object? dados = <String, dynamic>{};
        final p = r.url.path;
        if (p == '/api/geo/rota') {
          rotas.add('${r.url.queryParameters['deLat']},${r.url.queryParameters['deLng']}');
          dados = {
            'porRua': true,
            'distanceMeters': 1450,
            'durationSeconds': 300,
            'pontos': [
              for (final c in _linha(_embarque, _destino)) [c.latitude, c.longitude],
            ],
          };
        } else if (p == '/api/driver/rides/r1/accept') {
          dados = {'pin': '4821'};
        } else if (p == '/api/driver/rides/r1/start') {
          status = 'IN_PROGRESS';
        } else if (p == '/api/driver/rides/r1/arrived') {
          status = 'DRIVER_WAITING';
        } else if (p == '/api/driver/rides/current') {
          dados = {
            'ride': {'id': 'r1', 'status': status},
          };
        }
        return http.Response(jsonEncode({'success': true, 'data': dados}), 200,
            headers: {'content-type': 'application/json; charset=utf-8'});
      });
}

Future<void> _esperar() => Future<void>.delayed(const Duration(milliseconds: 150));

DriverState _motorista(_Servidor s) => DriverState(client: ApiClient(client: s.cliente()))
  ..profile = const DriverProfile(id: 'd1', name: 'João', phone: '+5564992686632', approval: DriverApproval.approved, termsAccepted: true)
  ..position = _carro;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({'ride.accessToken': 'token-de-teste'}));

  test('Aceitar e iniciar no embarque: usa as rotas do chamado (nenhuma rota nova)', () async {
    final s = _Servidor();
    final d = _motorista(s)
      ..offer = _oferta
      ..rotaOfertaAteEmbarque = _linha(_carro, _embarque)
      ..rotaOfertaViagem = _linha(_embarque, _destino);
    await d.acceptOffer();
    await _esperar();
    expect(s.rotas, isEmpty, reason: 'a rota ate o embarque veio com o chamado');
    expect(d.routeToPickup.length, greaterThan(2));

    d.position = _embarque;
    await d.markArrived();
    await _esperar();
    await d.startRide();
    await _esperar();
    expect(s.rotas, isEmpty, reason: 'iniciou no embarque: a rota da viagem e a mesma do chamado');
    expect(d.tripRoute.length, greaterThan(2));
    await d.logout();
  });

  test('Iniciar longe do embarque: pede a rota de onde o carro esta (como antes)', () async {
    final s = _Servidor();
    final d = _motorista(s)
      ..offer = _oferta
      ..rotaOfertaAteEmbarque = _linha(_carro, _embarque)
      ..rotaOfertaViagem = _linha(_embarque, _destino);
    await d.acceptOffer();
    await _esperar();
    d.position = const Coords(-18.0300, -49.3300); // ~3 km dali
    await d.markArrived();
    await _esperar();
    await d.startRide();
    await _esperar();
    expect(s.rotas, ['-18.030000,-49.330000'], reason: 'fora da linha: refaz de onde esta');
    await d.logout();
  });

  test('Chamado sem as rotas (sem rede na hora): ao aceitar pede a rota como antes', () async {
    final s = _Servidor();
    final d = _motorista(s)..offer = _oferta;
    await d.acceptOffer();
    await _esperar();
    expect(s.rotas, isNotEmpty);
    await d.logout();
  });
}
