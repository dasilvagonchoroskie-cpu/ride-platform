// Etapa 5 (30/10/2026): o motorista recebe o chamado marcado "ENTREGA",
// confirma a coleta e so confirma a entrega com o codigo de 4 numeros que
// quem recebe diz (o app do motorista nunca recebe o codigo).

import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_driver/core/api/api_client.dart';
import 'package:mobile_driver/core/utils/geo.dart';
import 'package:mobile_driver/data/models/driver_models.dart';
import 'package:mobile_driver/screens/offer_screen.dart';
import 'package:mobile_driver/screens/ride_screen.dart';
import 'package:mobile_driver/state/driver_state.dart';
import 'package:mobile_driver/widgets/ride_map.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _oferta = RideOffer(
  id: 'r1',
  code: 'ENT001',
  passengerName: 'Carlos Remetente',
  passengerRating: 4.9,
  pickupAddress: 'Rua Javari, 1234',
  pickupCoords: Coords(-18.0125, -49.3547),
  dropoffAddress: 'Rodoviária de Goiatuba',
  dropoffCoords: Coords(-18.0050, -49.3610),
  distanceToPickupMeters: 900,
  tripDistanceMeters: 1400,
  durationSeconds: 300,
  fareCents: 1200,
  earningCents: 1104,
  paymentMethod: 'Dinheiro',
  entrega: EntregaDoChamado(descricao: 'Envelope com documentos', destinatarioNome: 'Ana Souza', destinatarioTelefone: '5564999991234'),
);

class _Servidor {
  final finais = <Map<String, dynamic>>[];

  MockClient cliente() => MockClient((r) async {
        final p = r.url.path;
        if (p == '/api/driver/rides/r1/finish') {
          final corpo = jsonDecode(r.body) as Map<String, dynamic>;
          finais.add(corpo);
          if (corpo['codigoEntrega'] != '4821') {
            return http.Response(
              jsonEncode({'success': false, 'error': {'code': 'VALIDATION_ERROR', 'message': 'Código errado. Confira com quem recebe (restam 4 tentativa(s)).'}}),
              422,
              headers: {'content-type': 'application/json; charset=utf-8'},
            );
          }
          return http.Response(jsonEncode({'success': true, 'data': {'finalFareCents': 1200, 'commissionCents': 96}}), 200,
              headers: {'content-type': 'application/json; charset=utf-8'});
        }
        if (p == '/api/driver/rides/current') {
          return http.Response(jsonEncode({'success': true, 'data': {'ride': {'id': 'r1', 'status': 'IN_PROGRESS'}}}), 200,
              headers: {'content-type': 'application/json; charset=utf-8'});
        }
        return http.Response(jsonEncode({'success': true, 'data': <String, dynamic>{}}), 200,
            headers: {'content-type': 'application/json; charset=utf-8'});
      });
}

Future<DriverState> _abrir(WidgetTester tester, _Servidor s, Widget tela, {RidePhase? fase}) async {
  tester.view.physicalSize = const Size(1080, 2340);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final d = DriverState(client: ApiClient(client: s.cliente()))..position = const Coords(-18.0126, -49.3548);
  if (fase != null) {
    d.activeRide = DriverRide(offer: _oferta, phase: fase, pin: '1111', startedAt: '2026-10-30T13:00:00.000Z');
  } else {
    d.offer = _oferta;
    d.offerSecondsLeft = 20;
  }
  await tester.pumpWidget(
    ChangeNotifierProvider<DriverState>.value(
      value: d,
      child: MaterialApp(
        locale: const Locale('pt', 'BR'),
        supportedLocales: const [Locale('pt', 'BR')],
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
        home: tela,
      ),
    ),
  );
  for (var i = 0; i < 4; i++) {
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
    await tester.pump(const Duration(milliseconds: 100));
  }
  return d;
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({'ride.accessToken': 'token-de-teste'});
    mostrarRuasNoMapa = false;
  });

  testWidgets('Chamado marcado ENTREGA com o item; distancia ate a coleta', (tester) async {
    await _abrir(tester, _Servidor(), const OfferScreen());
    expect(find.text('ENTREGA · Envelope com documentos'), findsOneWidget);
    expect(find.textContaining('até a coleta'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('Na coleta: CONFIRMAR COLETA (sem o codigo do passageiro)', (tester) async {
    await _abrir(tester, _Servidor(), const RideScreen(), fase: RidePhase.waitingPassenger);
    expect(find.text('No local de coleta'), findsOneWidget);
    expect(find.text('CONFIRMAR COLETA'), findsOneWidget);
    expect(find.textContaining('Confira o código do passageiro'), findsNothing);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('Entrega: codigo errado mostra o motivo; certo encerra (o codigo vai ao servidor)', (tester) async {
    final s = _Servidor();
    final d = await _abrir(tester, s, const RideScreen(), fase: RidePhase.inProgress);
    expect(find.text('Levando a encomenda'), findsOneWidget);
    expect(find.text('CONFIRMAR ENTREGA'), findsOneWidget);
    expect(find.text('Quem recebe: Ana Souza'), findsOneWidget);

    // Abre a janela do codigo (o mesmo que deslizar CONFIRMAR ENTREGA).
    final contexto = tester.element(find.text('Levando a encomenda'));
    unawaited(pedirCodigoDaEntrega(contexto, d));
    await tester.pumpAndSettle();
    expect(find.text('Código da entrega'), findsOneWidget);

    await tester.enterText(find.byKey(const ValueKey('campo-codigo-entrega')), '1111');
    await tester.tap(find.text('Confirmar entrega'));
    for (var i = 0; i < 4; i++) {
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(find.textContaining('Código errado'), findsOneWidget);
    expect(d.activeRide?.phase, RidePhase.inProgress, reason: 'nao encerrou');

    await tester.enterText(find.byKey(const ValueKey('campo-codigo-entrega')), '4821');
    await tester.tap(find.text('Confirmar entrega'));
    for (var i = 0; i < 6; i++) {
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(s.finais.map((f) => f['codigoEntrega']), ['1111', '4821']);
    expect(d.activeRide?.phase, RidePhase.completed);
    expect(find.text('Código da entrega'), findsNothing, reason: 'janela fechou');
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 1));
  });
}
