// Codigo de embarque: o servidor diz se a cidade pede; o motorista digita o
// que o passageiro falou. Confere o que da certo e o que da errado.

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_driver/core/api/api_client.dart';
import 'package:mobile_driver/core/utils/geo.dart';
import 'package:mobile_driver/data/models/driver_models.dart';
import 'package:mobile_driver/screens/ride_screen.dart';
import 'package:mobile_driver/state/driver_state.dart';
import 'package:mobile_driver/widgets/ride_map.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _oferta = RideOffer(
  id: 'r1',
  code: 'AB12CD',
  passengerName: 'Maria',
  passengerRating: 4.8,
  pickupAddress: 'Praça Central, Goiatuba',
  pickupCoords: Coords(-18.0125, -49.3547),
  dropoffAddress: 'Rodoviária',
  dropoffCoords: Coords(-18.02, -49.36),
  distanceToPickupMeters: 100,
  tripDistanceMeters: 900,
  durationSeconds: 200,
  fareCents: 1500,
  earningCents: 1200,
  paymentMethod: 'Dinheiro',
);

/// Servidor de mentira: a cidade pede o codigo e o certo e 4821.
class _Servidor {
  bool pede = true;
  bool semRede = false;
  String status = 'DRIVER_WAITING';
  final enviados = <Map<String, dynamic>>[];

  MockClient cliente() => MockClient((r) async {
        http.Response responder(int http_, Map<String, dynamic> corpo) =>
            http.Response(jsonEncode(corpo), http_, headers: {'content-type': 'application/json; charset=utf-8'});
        if (r.url.path == '/api/driver/rides/r1/start') {
          if (semRede) throw http.ClientException('sem rede');
          final corpo = jsonDecode(r.body) as Map<String, dynamic>;
          enviados.add(corpo);
          final codigo = corpo['codigoEmbarque'] as String?;
          if (pede && codigo == null) {
            return responder(422, {'success': false, 'error': {'code': 'BOARDING_CODE_REQUIRED', 'message': 'Peça o código.'}});
          }
          if (pede && codigo != '4821') {
            return responder(422, {'success': false, 'error': {'code': 'BOARDING_CODE_INVALID', 'message': 'Código errado.'}});
          }
          status = 'IN_PROGRESS';
          return responder(200, {'success': true, 'data': {}});
        }
        if (r.url.path == '/api/driver/rides/current') {
          return responder(200, {'success': true, 'data': {'ride': {'id': 'r1', 'status': status}}});
        }
        return responder(200, {'success': true, 'data': {}});
      });
}

DriverState _motorista(_Servidor s) => DriverState(client: ApiClient(client: s.cliente()))
  ..activeRide = const DriverRide(offer: _oferta, phase: RidePhase.waitingPassenger, startedAt: '2026-11-27T13:00:00.000Z');

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() {
    SharedPreferences.setMockInitialValues({'ride.accessToken': 'token-de-teste'});
    mostrarRuasNoMapa = false;
  });

  test('cidade que pede: sem código não inicia; errado não inicia; certo inicia', () async {
    final s = _Servidor();
    final d = _motorista(s);
    expect(await d.startRide(), InicioDaViagem.pedeCodigo);
    expect(d.activeRide!.phase, RidePhase.waitingPassenger);
    expect(await d.startRide(codigo: '0000'), InicioDaViagem.codigoRecusado);
    expect(d.erroDoEmbarque, 'Código errado.');
    expect(d.activeRide!.phase, RidePhase.waitingPassenger);
    expect(await d.startRide(codigo: '4821'), InicioDaViagem.iniciou);
    expect(d.activeRide!.phase, RidePhase.inProgress);
    expect(s.enviados.first.containsKey('codigoEmbarque'), isFalse);
    // Toque repetido depois de iniciada: não manda de novo.
    final quantos = s.enviados.length;
    expect(await d.startRide(codigo: '4821'), InicioDaViagem.falhou);
    expect(s.enviados.length, quantos);
    await d.logout();
  });

  test('cidade que não pede: inicia direto', () async {
    final s = _Servidor()..pede = false;
    final d = _motorista(s);
    expect(await d.startRide(), InicioDaViagem.iniciou);
    expect(d.activeRide!.phase, RidePhase.inProgress);
    await d.logout();
  });

  test('sem internet: avisa e não muda de etapa', () async {
    final s = _Servidor()..semRede = true;
    final d = _motorista(s);
    expect(await d.startRide(codigo: '4821'), InicioDaViagem.falhou);
    expect(d.erroDoEmbarque, contains('Sem conexão'));
    expect(d.activeRide!.phase, RidePhase.waitingPassenger);
    expect(d.enviandoEtapa, isFalse);
    await d.logout();
  });

  testWidgets('janela do código: valida os 4 números, mostra o erro e fecha ao iniciar', (tester) async {
    tester.view.physicalSize = const Size(960, 1920);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final s = _Servidor();
    final d = _motorista(s);
    await tester.pumpWidget(
      ChangeNotifierProvider<DriverState>.value(
        value: d,
        child: MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: TextButton(onPressed: () => pedirCodigoDeEmbarque(context, d), child: const Text('abrir')),
            ),
          ),
          builder: (context, child) =>
              MediaQuery(data: MediaQuery.of(context).copyWith(textScaler: const TextScaler.linear(1.3)), child: child!),
        ),
      ),
    );
    await tester.tap(find.text('abrir'));
    await tester.pumpAndSettle();
    final campo = find.byKey(const ValueKey('campo-codigo-embarque'));

    Future<void> confirmar(String codigo) async {
      await tester.enterText(campo, codigo);
      await tester.tap(find.text('Iniciar viagem'));
      for (var i = 0; i < 6; i++) {
        await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 30)));
        await tester.pump(const Duration(milliseconds: 100));
      }
    }

    await confirmar('12');
    expect(find.text('Digite os 4 números.'), findsOneWidget);
    expect(s.enviados, isEmpty);

    await confirmar('0000');
    expect(find.text('Código errado.'), findsOneWidget);
    expect(campo, findsOneWidget);

    await confirmar('4821');
    await tester.pump(const Duration(seconds: 1));
    expect(campo, findsNothing);
    expect(d.activeRide!.phase, RidePhase.inProgress);
    await tester.runAsync(d.logout);
  });
}
