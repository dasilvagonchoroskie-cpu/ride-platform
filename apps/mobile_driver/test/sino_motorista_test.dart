// Evandro, 30/10/2026: o sino do motorista acendia sozinho (o ponto vinha
// de avisos calculados no celular, como saldo baixo) e o aviso de saldo nao
// fechava. Agora:
// - ponto vermelho = nao lidas contadas pelo SERVIDOR; abrir a lista marca
//   como lidas e o ponto some (e nao volta sozinho);
// - apagar uma (deslizar ou lixeira) com DESFAZER; "Apagar todas" e
//   "Marcar todas como lidas";
// - aviso "Saldo se esgotando" com X: fechado, so volta se o saldo piorar
//   ou depois de 24 h; durante a corrida, so um icone pequeno.

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_driver/core/api/api_client.dart';
import 'package:mobile_driver/core/utils/geo.dart';
import 'package:mobile_driver/data/models/driver_models.dart';
import 'package:mobile_driver/screens/avisos_screen.dart';
import 'package:mobile_driver/screens/home_screen.dart';
import 'package:mobile_driver/screens/ride_screen.dart';
import 'package:mobile_driver/state/driver_state.dart';
import 'package:mobile_driver/widgets/painel_ui.dart';
import 'package:mobile_driver/widgets/ride_map.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// "Servidor" com a caixa do motorista.
class _Caixa {
  final itens = <Map<String, dynamic>>[
    {'id': 'n1', 'titulo': 'Recarga confirmada', 'texto': '+R\$ 20,00 na sua carteira.', 'tipo': 'carteira', 'abrir': 'carteira', 'criadaEm': '2026-10-30T12:00:00.000Z', 'lida': false},
    {'id': 'n2', 'titulo': 'Carro ABC1D23 aprovado', 'texto': 'Onix Plus liberado pela Central.', 'tipo': 'carro', 'abrir': 'carros', 'criadaEm': '2026-10-30T11:00:00.000Z', 'lida': false},
    {'id': 'n3', 'titulo': 'Saque pago', 'texto': 'A Central fez o PIX de R\$ 50,00.', 'tipo': 'saque', 'abrir': 'saques', 'criadaEm': '2026-10-29T10:00:00.000Z', 'lida': true},
  ];
  final pedidos = <String>[];

  /// Saldo e situacao que a carteira devolve.
  int saldo = 1800;
  String status = 'low';

  int get naoLidas => itens.where((i) => i['lida'] != true).length;

  Object? responder(http.Request r) {
    final p = r.url.path;
    if (p.startsWith('/api/notificacoes')) pedidos.add('${r.method} $p ${r.body}');
    if (r.method == 'GET' && p == '/api/notificacoes') return {'itens': itens, 'naoLidas': naoLidas};
    if (p == '/api/notificacoes/nao-lidas') return {'naoLidas': naoLidas};
    if (p == '/api/notificacoes/lidas') {
      for (final i in itens) {
        i['lida'] = true;
      }
      return {'naoLidas': 0};
    }
    if (p == '/api/notificacoes/apagar') {
      final ids = ((jsonDecode(r.body) as Map)['ids'] as List).cast<String>();
      final antes = itens.length;
      itens.removeWhere((i) => ids.contains(i['id']));
      return {'apagadas': antes - itens.length, 'naoLidas': naoLidas};
    }
    if (p == '/api/driver/wallet') {
      return {
        'balanceCents': saldo,
        'minimumCents': 1000,
        'warningCents': 3000,
        'blocking': false,
        'blockEnabled': true,
        'status': status,
        'central': {'whatsapp': '5564999991234', 'pixKey': 'pix@exemplo.com', 'pixHolder': 'Fortaleza Move'},
        'transactions': <dynamic>[],
      };
    }
    if (p == '/api/driver/wallet/resumo') {
      return {'balanceCents': saldo, 'minimumCents': 1000, 'blockEnabled': true, 'blocking': false, 'status': status, 'last': null};
    }
    if (p == '/api/driver/activity') return {'period': 'day', 'rides': 0, 'grossCents': 0, 'netCents': 0};
    return null;
  }

  MockClient cliente() => MockClient((r) async {
        final dados = responder(r);
        return http.Response(
          jsonEncode(dados == null
              ? {'success': false, 'error': {'code': 'NOT_FOUND', 'message': 'sem resposta de teste'}}
              : {'success': true, 'data': dados}),
          dados == null ? 404 : 200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      });
}

const _perfil = DriverProfile(
  id: 'd1',
  name: 'João Batista',
  phone: '+5564992686632',
  termsAccepted: true,
  approval: DriverApproval.approved,
  isOnline: false,
);

Future<void> _pump(WidgetTester tester, [int vezes = 5]) async {
  for (var i = 0; i < vezes; i++) {
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Future<DriverState> _abrir(WidgetTester tester, _Caixa caixa, Widget tela, {void Function(DriverState d)? antes}) async {
  tester.view.physicalSize = const Size(1080, 2340);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final d = DriverState(client: ApiClient(client: caixa.cliente()))
    ..profile = _perfil
    ..ready = true
    ..position = const Coords(-18.0080, -49.3500)
    ..permissoesOk = true;
  antes?.call(d);
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
  await _pump(tester);
  return d;
}

Future<void> _fim(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox());
  await tester.pump(const Duration(seconds: 5));
}

bool _pontoDoSino(WidgetTester tester) => tester
    .widget<BotaoRedondo>(find.byWidgetPredicate((w) => w is BotaoRedondo && w.icone == Icons.notifications))
    .marcado;

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({'ride.accessToken': 'token-de-teste'});
    mostrarRuasNoMapa = false;
  });

  testWidgets('Sino: abrir a lista marca como lidas; o ponto some e nao volta sozinho', (tester) async {
    final caixa = _Caixa();
    final d = await _abrir(tester, caixa, const HomeScreen());
    await tester.runAsync(d.conferirNaoLidas);
    await tester.pump();
    expect(d.naoLidas, 2);
    expect(_pontoDoSino(tester), isTrue, reason: '2 nao lidas no servidor');

    await tester.tap(find.byWidgetPredicate((w) => w is BotaoRedondo && w.icone == Icons.notifications));
    await _pump(tester, 8);
    expect(find.text('Notificações'), findsOneWidget);
    expect(find.text('Recarga confirmada'), findsOneWidget);
    expect(find.text('Carro ABC1D23 aprovado'), findsOneWidget);
    expect(caixa.pedidos, contains('POST /api/notificacoes/lidas {}'), reason: 'abriu a lista: marca todas como lidas');
    expect(d.naoLidas, 0);

    await tester.pageBack();
    await _pump(tester, 8);
    expect(_pontoDoSino(tester), isFalse, reason: 'o ponto some ao abrir');

    // O app pergunta de novo (relogio de 1 minuto): continua apagado.
    await tester.runAsync(d.conferirNaoLidas);
    await tester.pump();
    expect(_pontoDoSino(tester), isFalse, reason: 'o ponto nao volta sozinho');

    // Saldo baixo continua aparecendo na lista ("Agora"), mas sem acender o ponto.
    expect(d.carteira?.isLow, isTrue);
    expect(_pontoDoSino(tester), isFalse);

    // So uma notificacao nova acende de novo.
    caixa.itens.insert(0, {'id': 'n9', 'titulo': 'Documento aprovado', 'texto': 'ok', 'tipo': 'documento', 'criadaEm': '2026-10-30T13:00:00.000Z', 'lida': false});
    await tester.runAsync(d.conferirNaoLidas);
    await tester.pump();
    expect(_pontoDoSino(tester), isTrue);
    await _fim(tester);
  });

  testWidgets('Apagar uma: deslizar some, DESFAZER traz de volta, sem desfazer apaga no servidor', (tester) async {
    final caixa = _Caixa();
    final d = await _abrir(tester, caixa, const AvisosScreen(esperaDesfazer: Duration(seconds: 2)));
    await _pump(tester);
    expect(find.text('Recarga confirmada'), findsOneWidget);

    // Deslizar e desfazer.
    await tester.drag(find.text('Recarga confirmada'), const Offset(-500, 0));
    await tester.pumpAndSettle(const Duration(milliseconds: 100));
    expect(find.text('Recarga confirmada'), findsNothing);
    expect(find.text('Notificação apagada.'), findsOneWidget);
    await tester.tap(find.text('DESFAZER'));
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('Recarga confirmada'), findsOneWidget, reason: 'desfazer traz de volta');
    await tester.pump(const Duration(seconds: 3));
    await _pump(tester);
    expect(caixa.pedidos.where((p) => p.startsWith('POST /api/notificacoes/apagar')), isEmpty, reason: 'desfeito: nada apagado no servidor');

    // Lixeira e deixa passar o tempo: apaga no servidor.
    await tester.tap(find.byTooltip('Apagar').first);
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Recarga confirmada'), findsNothing);
    await tester.pump(const Duration(seconds: 3));
    await _pump(tester);
    expect(caixa.pedidos.last, 'POST /api/notificacoes/apagar {"ids":["n1"]}');
    expect(caixa.itens.map((i) => i['id']), ['n2', 'n3']);
    expect(d.notificacoes!.map((n) => n.id), ['n2', 'n3']);
    await _fim(tester);
  });

  testWidgets('Apagar todas (com desfazer) e Marcar todas como lidas', (tester) async {
    final caixa = _Caixa();
    // Abre com uma nova chegando depois da abertura: "Marcar todas" tambem vale para ela.
    final d = await _abrir(tester, caixa, const AvisosScreen(esperaDesfazer: Duration(seconds: 2)));
    await _pump(tester);
    caixa.itens.insert(0, {'id': 'n9', 'titulo': 'Chegou agora', 'texto': 'x', 'tipo': 'conta', 'criadaEm': '2026-10-30T13:00:00.000Z', 'lida': false});
    await tester.runAsync(d.carregarNotificacoes);
    await tester.pump();
    expect(d.naoLidas, 1);
    await tester.tap(find.text('Marcar todas como lidas'));
    await _pump(tester);
    expect(d.naoLidas, 0);
    expect(caixa.naoLidas, 0);

    await tester.tap(find.text('Apagar todas'));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('4 notificações apagadas.'), findsOneWidget);
    expect(find.text('Chegou agora'), findsNothing);
    await tester.tap(find.text('DESFAZER'));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Chegou agora'), findsOneWidget);

    await tester.tap(find.text('Apagar todas'));
    await tester.pump(const Duration(seconds: 3));
    await _pump(tester);
    expect(caixa.pedidos.last, 'POST /api/notificacoes/apagar {"ids":["n9","n1","n2","n3"]}');
    expect(caixa.itens, isEmpty);
    expect(find.text('Tudo certo por aqui'), findsOneWidget);
    await _fim(tester);
  });

  testWidgets('Aviso de saldo: fecha no X; so volta se piorar ou no dia seguinte', (tester) async {
    final caixa = _Caixa()
      ..saldo = 1800
      ..status = 'low';
    var agora = DateTime(2026, 10, 30, 8);
    final d = await _abrir(tester, caixa, const HomeScreen(), antes: (d) => d.relogio = () => agora);
    await tester.runAsync(d.carregarCarteira);
    await tester.pump();
    expect(find.textContaining('Saldo se esgotando (R\$'), findsOneWidget);

    await tester.tap(find.byTooltip('Fechar aviso'));
    await _pump(tester);
    expect(find.textContaining('Saldo se esgotando'), findsNothing, reason: 'fechou');

    // Corrida feita, saldo caiu um pouco (continua "se esgotando"): nao volta.
    caixa.saldo = 1600;
    await tester.runAsync(d.carregarCarteira);
    agora = agora.add(const Duration(hours: 6));
    await tester.pump();
    expect(find.textContaining('Saldo se esgotando'), findsNothing, reason: 'mesmo nivel, mesmo dia');

    // Piorou: ficou sem saldo -> volta na hora.
    caixa
      ..saldo = 900
      ..status = 'insufficient';
    await tester.runAsync(d.carregarCarteira);
    await tester.pump();
    expect(find.textContaining('Saldo insuficiente'), findsOneWidget, reason: 'piorou: volta');
    await tester.tap(find.byTooltip('Fechar aviso'));
    await _pump(tester);
    expect(find.textContaining('Saldo insuficiente'), findsNothing);

    // Fechado fica guardado no celular (vale ao reabrir o app).
    final guardado = await tester.runAsync(() async => (await SharedPreferences.getInstance()).getString('ride.avisoSaldoFechado'));
    expect(guardado, contains('"nivel":2'));

    // No dia seguinte (24 h depois de fechar): volta uma vez.
    agora = agora.add(const Duration(hours: 24));
    await tester.runAsync(d.carregarCarteira);
    await tester.pump();
    expect(find.textContaining('Saldo insuficiente'), findsOneWidget, reason: '24 h depois: volta');

    // Recarregou (ok): some; a proxima queda mostra de novo.
    caixa
      ..saldo = 5000
      ..status = 'ok';
    await tester.runAsync(d.carregarCarteira);
    await tester.pump();
    expect(find.textContaining('Saldo se esgotando'), findsNothing);
    expect(find.textContaining('Saldo insuficiente'), findsNothing);
    caixa
      ..saldo = 2500
      ..status = 'low';
    await tester.runAsync(d.carregarCarteira);
    await tester.pump();
    expect(find.textContaining('Saldo se esgotando'), findsOneWidget);
    await _fim(tester);
  });

  testWidgets('Durante a corrida: so um icone pequeno de saldo, sem faixa', (tester) async {
    final caixa = _Caixa();
    final d = await _abrir(tester, caixa, const RideScreen(), antes: (d) {
      d.activeRide = DriverRide(
        offer: const RideOffer(
          id: 'r1',
          code: 'AB12CD',
          passengerName: 'Maria',
          passengerRating: 4.8,
          pickupAddress: 'Rua Javari, 1234',
          pickupCoords: Coords(-18.0125, -49.3547),
          dropoffAddress: 'Rodoviária',
          dropoffCoords: Coords(-18.02, -49.36),
          distanceToPickupMeters: 1200,
          tripDistanceMeters: 4300,
          durationSeconds: 600,
          fareCents: 1850,
          earningCents: 1702,
          paymentMethod: 'Dinheiro',
        ),
        phase: RidePhase.inProgress,
        pin: '4821',
        startedAt: '2026-10-30T13:00:00.000Z',
      );
    });
    await tester.runAsync(d.carregarCarteira);
    await tester.pump();
    expect(d.saldoEmAlerta, isTrue);
    final icone = find.byKey(const ValueKey('icone-saldo-corrida'));
    expect(icone, findsOneWidget);
    expect(tester.getSize(icone).width, lessThanOrEqualTo(40), reason: 'icone pequeno');
    expect(find.textContaining('Saldo se esgotando ('), findsNothing, reason: 'sem faixa na corrida');
    // O icone fica no alto, a direita (nao cobre o painel de botoes embaixo).
    expect(tester.getCenter(icone).dy, lessThan(300));
    expect(tester.takeException(), isNull);
    await _fim(tester);
  });
}
