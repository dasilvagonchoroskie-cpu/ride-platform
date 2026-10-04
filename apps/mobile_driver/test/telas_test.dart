// Abre as telas do motorista num celular de 360 x 780 com respostas no MESMO
// formato do servidor real e confere que nada quebra nem estoura a tela.

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_driver/core/api/api_client.dart';
import 'package:mobile_driver/core/pix.dart';
import 'package:mobile_driver/core/utils/geo.dart';
import 'package:mobile_driver/data/models/driver_models.dart';
import 'package:mobile_driver/screens/perfil_screen.dart';
import 'package:mobile_driver/screens/ride_screen.dart';
import 'package:mobile_driver/screens/rides_history_screen.dart';
import 'package:mobile_driver/screens/sos_screen.dart';
import 'package:mobile_driver/state/driver_state.dart';
import 'package:mobile_driver/widgets/ride_map.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

Object? _resposta(String metodo, String caminho) {
  if (caminho == '/api/driver/rides/history') {
    return {
      'total': 1,
      'page': 1,
      'pageSize': 100,
      'items': [
        {
          'id': 'r1',
          'code': 'AB12CD',
          'status': 'COMPLETED',
          'pickupAddress': 'Rua Javari, 1234 - Setor Central, Goiatuba - GO',
          'dropoffAddress': 'Rodoviária de Goiatuba - Avenida Brasil',
          'finalFareCents': 1850,
          'estimatedFareCents': 1850,
          'commissionCents': 148,
          'finishedAt': '2026-10-03T13:20:00.000Z',
          'requestedAt': '2026-10-03T13:00:00.000Z',
        },
      ],
      'summary': {'rides': 1, 'totalCents': 1850, 'commissionCents': 148, 'netCents': 1702},
      'performance': {'offers': 4, 'accepted': 3, 'acceptanceRate': 75, 'cancellations': 1, 'ratingAvg': 4.9},
    };
  }
  if (caminho == '/api/drivers/me') {
    return {'id': 'd1', 'status': 'REJECTED', 'rejectionReason': 'Foto da CNH ilegível'};
  }
  if (caminho == '/api/documents/me') {
    return {
      'documents': [
        {'id': 'x1', 'type': 'CNH_FRONT', 'status': 'REJECTED', 'rejectionReason': 'Foto tremida', 'fileUrl': '/arquivos/abc', 'uploadedAt': '2026-10-03T10:00:00.000Z'},
        {'id': 'x2', 'type': 'CRLV', 'status': 'APPROVED', 'rejectionReason': null, 'fileUrl': '/arquivos/def', 'uploadedAt': '2026-10-02T10:00:00.000Z'},
      ],
      'progress': {},
    };
  }
  return null;
}

MockClient _servidor() => MockClient((http.Request r) async {
      final dados = _resposta(r.method, r.url.path);
      return http.Response(
        jsonEncode(dados == null
            ? {'success': false, 'error': {'code': 'NOT_FOUND', 'message': 'sem resposta de teste'}}
            : {'success': true, 'data': dados}),
        dados == null ? 404 : 200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });

const _oferta = RideOffer(
  id: 'r1',
  code: 'AB12CD',
  passengerName: 'Maria Aparecida dos Santos Oliveira',
  passengerRating: 4.8,
  pickupAddress: 'Rua Javari, 1234 - Setor Central, Goiatuba - GO',
  pickupCoords: Coords(-18.0125, -49.3547),
  dropoffAddress: 'Rodoviária de Goiatuba - Avenida Brasil, 500',
  dropoffCoords: Coords(-18.02, -49.36),
  distanceToPickupMeters: 1200,
  tripDistanceMeters: 4300,
  durationSeconds: 600,
  fareCents: 1850,
  earningCents: 1702,
  paymentMethod: 'Dinheiro',
);

Future<DriverState> _abrir(WidgetTester tester, Widget tela, {RidePhase? fase, Map<String, dynamic>? resumo}) async {
  tester.view.physicalSize = const Size(1080, 2340);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final d = DriverState(client: ApiClient(client: _servidor()));
  if (fase != null) {
    d.activeRide = DriverRide(offer: _oferta, phase: fase, pin: '4821', startedAt: '2026-10-03T13:00:00.000Z');
    d.telefonePassageiro = '+5564999990000';
    d.resumoFinal = resumo;
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

  testWidgets('Corrida etapa 1: a caminho, navegar, ligar e Cheguei ao local', (tester) async {
    await _abrir(tester, const RideScreen(), fase: RidePhase.toPickup);
    expect(find.text('Etapa 1 de 3 · A caminho'), findsOneWidget);
    expect(find.text('A caminho do passageiro'), findsOneWidget);
    expect(find.text('Google Maps'), findsOneWidget);
    expect(find.text('Waze'), findsOneWidget);
    expect(find.byTooltip('Ligar'), findsOneWidget);
    expect(find.text('Cheguei ao local'), findsOneWidget);
    expect(find.text('SOS'), findsOneWidget);
  });

  testWidgets('Corrida etapa 1b: esperando com cronometro e deslizar INICIAR VIAGEM', (tester) async {
    final d = await _abrir(tester, const RideScreen(), fase: RidePhase.waitingPassenger);
    d.chegouEm = DateTime.now().subtract(const Duration(minutes: 2, seconds: 5));
    await tester.pump(const Duration(seconds: 1));
    expect(find.textContaining('02:0'), findsOneWidget);
    expect(find.text('INICIAR VIAGEM'), findsOneWidget);
    expect(find.textContaining('4821'), findsOneWidget);
  });

  testWidgets('Corrida etapa 2: viagem com FINALIZAR VIAGEM', (tester) async {
    await _abrir(tester, const RideScreen(), fase: RidePhase.inProgress);
    expect(find.text('Etapa 2 de 3 · Em viagem'), findsOneWidget);
    expect(find.text('FINALIZAR VIAGEM'), findsOneWidget);
  });

  testWidgets('Corrida etapa 3: resumo financeiro, nota e Concluir', (tester) async {
    await _abrir(tester, const RideScreen(), fase: RidePhase.completed, resumo: {
      'finalFareCents': 1850,
      'discountCents': 300,
      'toCollectCents': 1550,
      'commissionCents': 148,
      'driverEarningCents': 1702,
    });
    expect(find.textContaining('Cobrar do passageiro'), findsOneWidget);
    expect(find.textContaining('15,50'), findsOneWidget);
    expect(find.textContaining('Taxa da Central (8%)'), findsOneWidget);
    expect(find.text('Seu ganho líquido'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Concluir'), 200, scrollable: find.byType(Scrollable).last);
    expect(find.byTooltip('5 estrelas'), findsOneWidget);
  });

  testWidgets('Historico: filtros, totais, desempenho e taxa por corrida', (tester) async {
    await _abrir(tester, const RidesHistoryScreen());
    expect(find.text('Hoje'), findsOneWidget);
    expect(find.text('Este mês'), findsOneWidget);
    expect(find.text('75%'), findsOneWidget);
    expect(find.textContaining('17,02'), findsWidgets);
    expect(find.textContaining('Taxa descontada: R\$'), findsOneWidget);
  });

  testWidgets('Perfil e documentos: situacao, motivo, documentos e senha', (tester) async {
    await _abrir(tester, const PerfilScreen());
    expect(find.text('Rejeitado'), findsWidgets);
    expect(find.textContaining('Foto da CNH ilegível'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Antecedentes criminais'), 200, scrollable: find.byType(Scrollable).first);
    expect(find.text('CRLV do veículo'), findsOneWidget);
    expect(find.textContaining('Foto tremida'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Alterar senha'), 200, scrollable: find.byType(Scrollable).first);
    expect(find.text('Sair'), findsOneWidget);
  });

  testWidgets('SOS: botao de panico e 190/192', (tester) async {
    await _abrir(tester, const SosScreen());
    expect(find.text('PÂNICO'), findsOneWidget);
    expect(find.text('190 Polícia'), findsOneWidget);
  });

  test('PIX Copia e Cola no padrao do Banco Central', () {
    final p = pixCopiaECola(chave: 'pix@fortalezamov.com.br', nome: 'Évandro Gonçalves', cidade: 'Goiatuba');
    expect(p.startsWith('000201'), isTrue);
    expect(p.contains('br.gov.bcb.pix'), isTrue);
    expect(p.contains('5917EVANDRO GONCALVES'), isTrue);
    expect(p.contains('6008GOIATUBA'), isTrue);
    expect(RegExp(r'6304[0-9A-F]{4}$').hasMatch(p), isTrue);
  });
}
