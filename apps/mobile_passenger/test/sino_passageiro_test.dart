// Evandro, 30/10/2026: o ponto vermelho do sino do passageiro era calculado
// no celular ("aviso mais novo que o ultimo aberto"): bastava a Central
// apagar o aviso mais novo para o ponto voltar sozinho. Agora o servidor conta
// as nao lidas da conta; abrir a lista marca como lidas; apagar com desfazer.

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_passenger/core/api/api_client.dart';
import 'package:mobile_passenger/screens/avisos_screen.dart';
import 'package:mobile_passenger/state/config_state.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _Servidor {
  _Servidor({this.antigo = false});

  /// Montagem antiga do servidor: sem a caixa de notificacoes.
  final bool antigo;

  final itens = <Map<String, dynamic>>[
    {'id': 'n1', 'titulo': 'Promoção de sábado', 'texto': '10% em todas as corridas.', 'tipo': 'aviso-central', 'criadaEm': '2026-10-30T12:00:00.000Z', 'lida': false},
    {'id': 'n2', 'titulo': 'Chuva forte', 'texto': 'Peça com antecedência.', 'tipo': 'aviso-central', 'criadaEm': '2026-10-29T12:00:00.000Z', 'lida': true},
  ];

  /// Avisos publicados (o /app/config, como antes).
  var avisos = <Map<String, dynamic>>[
    {'id': 'av2', 'titulo': 'Promoção de sábado', 'texto': '10% em todas as corridas.', 'criadoEm': '2026-10-30T12:00:00.000Z'},
    {'id': 'av1', 'titulo': 'Chuva forte', 'texto': 'Peça com antecedência.', 'criadoEm': '2026-10-29T12:00:00.000Z'},
  ];
  final pedidos = <String>[];

  int get naoLidas => itens.where((i) => i['lida'] != true).length;

  MockClient cliente() => MockClient((r) async {
        final p = r.url.path;
        if (p.startsWith('/api/notificacoes')) pedidos.add('${r.method} $p ${r.body}');
        Object? dados;
        if (p == '/api/app/config') {
          dados = {'cidades': <String>[], 'avisos': avisos};
        } else if (antigo && p.startsWith('/api/notificacoes')) {
          dados = null;
        } else if (r.method == 'GET' && p == '/api/notificacoes') {
          dados = {'itens': itens, 'naoLidas': naoLidas};
        } else if (p == '/api/notificacoes/nao-lidas') {
          dados = {'naoLidas': naoLidas};
        } else if (p == '/api/notificacoes/lidas') {
          for (final i in itens) {
            i['lida'] = true;
          }
          dados = {'naoLidas': 0};
        } else if (p == '/api/notificacoes/apagar') {
          final ids = ((jsonDecode(r.body) as Map)['ids'] as List).cast<String>();
          itens.removeWhere((i) => ids.contains(i['id']));
          dados = {'apagadas': ids.length, 'naoLidas': naoLidas};
        }
        return http.Response(
          jsonEncode(dados == null
              ? {'success': false, 'error': {'code': 'NOT_FOUND', 'message': 'Cannot GET $p'}}
              : {'success': true, 'data': dados}),
          dados == null ? 404 : 200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      });
}

Future<void> _pump(WidgetTester tester, [int vezes = 5]) async {
  for (var i = 0; i < vezes; i++) {
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Future<ConfigState> _abrir(WidgetTester tester, _Servidor s) async {
  tester.view.physicalSize = const Size(1080, 2340);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final config = ConfigState(client: ApiClient(client: s.cliente()));
  await tester.pumpWidget(
    ChangeNotifierProvider<ConfigState>.value(
      value: config,
      child: const MaterialApp(
        locale: Locale('pt', 'BR'),
        supportedLocales: [Locale('pt', 'BR')],
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
        home: AvisosScreen(esperaDesfazer: Duration(seconds: 2)),
      ),
    ),
  );
  await _pump(tester, 8);
  return config;
}

Future<void> _fim(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox());
  await tester.pump(const Duration(seconds: 5));
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({'ride.accessToken': 'token-de-teste'}));

  test('Ponto do sino: conta do servidor; abriu, some; a Central apagar o aviso nao faz voltar', () async {
    final s = _Servidor();
    final config = ConfigState(client: ApiClient(client: s.cliente()));
    await config.carregar();
    await config.conferirNaoLidas();
    expect(config.temAvisoNovo, isTrue, reason: '1 nao lida no servidor');
    await config.carregarNotificacoes();
    await config.marcarNotificacoesLidas();
    expect(config.temAvisoNovo, isFalse);
    expect(s.pedidos, contains('POST /api/notificacoes/lidas {}'));

    // Antes: a Central apagou o aviso mais novo e o ponto voltava sozinho.
    s.avisos = [s.avisos.last];
    s.itens.removeAt(0);
    await config.carregar();
    await config.conferirNaoLidas();
    expect(config.temAvisoNovo, isFalse, reason: 'o ponto nao volta sozinho');

    // So aviso novo acende.
    s.itens.insert(0, {'id': 'n3', 'titulo': 'Novo', 'texto': 'x', 'tipo': 'aviso-central', 'criadaEm': '2026-10-30T13:00:00.000Z', 'lida': false});
    await config.conferirNaoLidas();
    expect(config.temAvisoNovo, isTrue);
  });

  testWidgets('Lista: abre marcando como lidas; apagar uma com DESFAZER; apagar sem desfazer', (tester) async {
    final s = _Servidor();
    final config = await _abrir(tester, s);
    expect(find.text('Notificações'), findsOneWidget);
    expect(find.text('Promoção de sábado'), findsOneWidget);
    expect(config.naoLidas, 0);
    expect(s.naoLidas, 0, reason: 'abrir marcou como lidas no servidor');

    await tester.drag(find.text('Promoção de sábado'), const Offset(-500, 0));
    await tester.pumpAndSettle(const Duration(milliseconds: 100));
    expect(find.text('Promoção de sábado'), findsNothing);
    await tester.tap(find.text('DESFAZER'));
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('Promoção de sábado'), findsOneWidget);
    await tester.pump(const Duration(seconds: 3));
    await _pump(tester);
    expect(s.pedidos.where((p) => p.startsWith('POST /api/notificacoes/apagar')), isEmpty);

    await tester.tap(find.byTooltip('Apagar').first);
    await tester.pump(const Duration(seconds: 3));
    await _pump(tester);
    expect(s.pedidos.last, 'POST /api/notificacoes/apagar {"ids":["n1"]}');
    expect(s.itens.map((i) => i['id']), ['n2']);
    expect(tester.takeException(), isNull);
    await _fim(tester);
  });

  testWidgets('Apagar todas e Marcar todas como lidas', (tester) async {
    final s = _Servidor();
    final config = await _abrir(tester, s);
    s.itens.insert(0, {'id': 'n9', 'titulo': 'Chegou agora', 'texto': 'x', 'tipo': 'aviso-central', 'criadaEm': '2026-10-30T13:00:00.000Z', 'lida': false});
    await tester.runAsync(config.carregarNotificacoes);
    await tester.pump();
    expect(config.naoLidas, 1);
    await tester.tap(find.text('Marcar todas como lidas'));
    await _pump(tester);
    expect(config.naoLidas, 0);

    await tester.tap(find.text('Apagar todas'));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('3 notificações apagadas.'), findsOneWidget);
    await tester.pump(const Duration(seconds: 3));
    await _pump(tester);
    expect(s.pedidos.last, 'POST /api/notificacoes/apagar {"ids":["n9","n1","n2"]}');
    expect(find.text('Nenhuma notificação'), findsOneWidget);
    await _fim(tester);
  });

  testWidgets('Servidor antigo (sem a caixa): mostra os avisos como antes', (tester) async {
    final s = _Servidor(antigo: true);
    final config = await _abrir(tester, s);
    expect(config.caixaAntiga, isTrue);
    expect(find.text('Avisos'), findsOneWidget);
    expect(find.text('Chuva forte'), findsOneWidget);
    expect(config.temAvisoNovo, isFalse, reason: 'abriu: visto');
    await _fim(tester);
  });
}
