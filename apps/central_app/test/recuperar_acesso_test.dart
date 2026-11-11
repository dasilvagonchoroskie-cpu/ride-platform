// R3 (Requisicao de continuidade, 11/11/2026): "Recuperar acesso" na Central.
// Confere o que a tela manda ao servidor (sem documento, so as conferencias)
// e as duas respostas: liberado e recusado por faltar conferencia.

import 'dart:convert';

import 'package:central_app/core/api/api_client.dart';
import 'package:central_app/core/theme/central_theme.dart';
import 'package:central_app/data/painel.dart';
import 'package:central_app/painel/desconectar.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const _id = '44444444-4444-4444-8444-444444444444';

void main() {
  late List<Map<String, dynamic>> pedidos;
  late bool liberar;

  MockClient servidor() => MockClient((http.Request r) async {
        if (r.url.path == '/api/admin/usuarios/$_id/recuperar-acesso' && r.method == 'POST') {
          final corpo = jsonDecode(r.body) as Map<String, dynamic>;
          pedidos.add(corpo);
          final c = corpo['conferencias'] as Map<String, dynamic>;
          final faltam = [
            if (c['fotoConfere'] != true) 'foto do documento',
            if (c['nomeConfere'] != true) 'nome',
            if (c['cpfConfere'] != true) 'CPF',
            if (c.containsKey('cnhConfere') && c['cnhConfere'] != true) 'CNH',
          ];
          final dados = liberar && faltam.isEmpty ? {'liberada': true, 'sessoesEncerradas': 2} : {'liberada': false, 'faltaram': faltam};
          return http.Response(jsonEncode({'success': true, 'data': dados}), 200, headers: {'content-type': 'application/json; charset=utf-8'});
        }
        return http.Response(jsonEncode({'success': false, 'error': {'code': 'NOT_FOUND', 'message': 'sem rota'}}), 404,
            headers: {'content-type': 'application/json; charset=utf-8'});
      });

  Future<void> abrir(WidgetTester tester, {required bool motorista}) async {
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final api = PainelApi(ApiClient(client: servidor()));
    await tester.pumpWidget(MaterialApp(
      theme: CentralTheme.light,
      locale: const Locale('pt', 'BR'),
      supportedLocales: const [Locale('pt', 'BR')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      home: Scaffold(body: BotaoDesconectar(api: api, id: _id, nome: 'Joao Batista', motorista: motorista)),
    ));
    await tester.tap(find.byKey(const ValueKey('recuperar-acesso')));
    await tester.pumpAndSettle();
  }

  Future<void> preencher(WidgetTester tester) async {
    await tester.enterText(find.byKey(const ValueKey('recuperar-motivo')), 'Perdeu o celular e a senha do e-mail');
    await tester.enterText(find.byKey(const ValueKey('recuperar-email')), 'Joao.Novo@Gmail.com');
    await tester.enterText(find.byKey(const ValueKey('recuperar-telefone')), '(64) 99999-1234');
    await tester.pumpAndSettle();
  }

  Future<void> marcar(WidgetTester tester, String texto) async {
    await tester.ensureVisible(find.text(texto));
    await tester.pumpAndSettle();
    await tester.tap(find.text(texto));
    await tester.pumpAndSettle();
  }

  Future<void> liberarAcesso(WidgetTester tester) async {
    await tester.ensureVisible(find.byKey(const ValueKey('recuperar-liberar')));
    await tester.tap(find.byKey(const ValueKey('recuperar-liberar')));
    await tester.pumpAndSettle();
    // Confirmacao (acao forte): "Liberar".
    await tester.tap(find.widgetWithText(FilledButton, 'Liberar').last);
    await tester.pumpAndSettle();
  }

  setUp(() {
    pedidos = [];
    liberar = true;
  });

  testWidgets('motorista: tudo conferido libera e manda so as conferencias (sem documento)', (tester) async {
    await abrir(tester, motorista: true);
    expect(find.text('O número da CNH é o mesmo do cadastro'), findsOneWidget);
    for (final t in [
      'O rosto é o mesmo da foto do documento',
      'O nome é o mesmo do cadastro',
      'O CPF é o mesmo do cadastro',
      'O número da CNH é o mesmo do cadastro',
    ]) {
      await marcar(tester, t);
    }
    await preencher(tester);
    await liberarAcesso(tester);

    expect(pedidos, hasLength(1));
    final p = pedidos.single;
    expect(p['novoEmail'], 'joao.novo@gmail.com');
    expect(p['novoTelefone'], '+5564999991234');
    expect(p['documento'], 'CNH');
    expect(p['conferencias'], {'fotoConfere': true, 'nomeConfere': true, 'cpfConfere': true, 'cnhConfere': true});
    // Nenhum dado do documento vai para o servidor.
    expect(p.keys.toSet(), {'motivo', 'documento', 'conferencias', 'novoEmail', 'novoTelefone'});
    expect(find.textContaining('Acesso liberado'), findsOneWidget);
  });

  testWidgets('faltou conferir: nao libera e mostra o que faltou', (tester) async {
    await abrir(tester, motorista: true);
    await marcar(tester, 'O rosto é o mesmo da foto do documento');
    await preencher(tester);
    await liberarAcesso(tester);
    expect(find.textContaining('Não liberado'), findsOneWidget);
    expect(find.textContaining('CNH'), findsWidgets);
  });

  testWidgets('sem e-mail novo ou motivo curto: nem chama o servidor', (tester) async {
    await abrir(tester, motorista: false);
    expect(find.text('O número da CNH é o mesmo do cadastro'), findsNothing);
    await tester.enterText(find.byKey(const ValueKey('recuperar-motivo')), 'curto');
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const ValueKey('recuperar-liberar')));
    await tester.tap(find.byKey(const ValueKey('recuperar-liberar')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Escreva o motivo'), findsOneWidget);
    await tester.enterText(find.byKey(const ValueKey('recuperar-motivo')), 'Perdeu o celular e o e-mail');
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const ValueKey('recuperar-liberar')));
    await tester.tap(find.byKey(const ValueKey('recuperar-liberar')));
    await tester.pumpAndSettle();
    expect(find.textContaining('e-mail novo'), findsWidgets);
    expect(pedidos, isEmpty);
  });
}
