// Etapa 6 (Evandro, 29/10/2026): aparencia do app do passageiro pela Central.

import 'dart:convert';
import 'dart:typed_data';

import 'package:central_app/core/api/api_client.dart';
import 'package:central_app/widgets/aparencia_app.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

http.Response _ok(Object? dados) => http.Response(jsonEncode({'success': true, 'data': dados}), 200,
    headers: {'content-type': 'application/json; charset=utf-8'});

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('Editar nome, cor e faixa; trocar e tirar o logo', (tester) async {
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    var atual = <String, dynamic>{
      'nome': 'Fortaleza Mov',
      'cor': '#1E5BB8',
      'bannerAtivo': false,
      'bannerTexto': '',
      'logoId': null,
      'logoUrl': null,
      'definida': false,
    };
    final pedidos = <String, Map<String, dynamic>?>{};
    final servidor = MockClient((r) async {
      final corpo = r.body.isEmpty ? null : jsonDecode(r.body) as Map<String, dynamic>;
      pedidos['${r.method} ${r.url.path}'] = corpo;
      if (r.url.path.endsWith('/admin/aparencia') && r.method == 'PUT') {
        atual = {...atual, ...?corpo, 'definida': true};
      } else if (r.url.path.endsWith('/admin/aparencia/logo')) {
        atual = {...atual, 'logoId': r.method == 'POST' ? 'id' : null, 'logoUrl': r.method == 'POST' ? '/app/logo?v=abcd1234' : null};
      }
      return _ok(atual);
    });
    final png = Uint8List.fromList([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(
          child: AparenciaDoApp(
            api: ApiClient(client: servidor),
            escolherLogo: (_) async => (mime: 'image/png', bytes: png),
          ),
        ),
      ),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Aparência do app'), findsOneWidget);
    expect(find.text('Fortaleza Mov'), findsOneWidget);

    await tester.tap(find.text('Editar'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Fortaleza Mov'), 'Goiatuba Mov');
    await tester.tap(find.text('Verde'));
    await tester.pumpAndSettle();
    // A janela rola: no celular a chave da faixa fica mais para baixo.
    await tester.ensureVisible(find.byType(SwitchListTile));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();
    final campoDaFaixa = find.widgetWithText(TextField, 'Ex.: Feriado: corridas até as 2h da manhã');
    await tester.ensureVisible(campoDaFaixa);
    await tester.enterText(campoDaFaixa, 'Feriado: corridas até 2h');
    await tester.tap(find.text('Salvar'));
    await tester.pumpAndSettle();

    final put = pedidos['PUT /api/admin/aparencia'];
    expect(put, {'nome': 'Goiatuba Mov', 'cor': '#2E9E5B', 'bannerAtivo': true, 'bannerTexto': 'Feriado: corridas até 2h'});
    expect(find.text('Goiatuba Mov'), findsOneWidget);
    expect(find.text('Feriado: corridas até 2h'), findsOneWidget);
    final previa = tester.widget<Container>(find.byKey(const ValueKey('previa-marca')));
    expect((previa.decoration as BoxDecoration).color, const Color(0xFF2E9E5B));

    await tester.tap(find.text('Pôr logo'));
    await tester.pumpAndSettle();
    final post = pedidos['POST /api/admin/aparencia/logo'];
    expect(post?['mime'], 'image/png');
    expect(base64Decode(post!['dados'] as String), png);
    expect(find.text('Trocar logo'), findsOneWidget);

    await tester.tap(find.text('Tirar logo'));
    await tester.pumpAndSettle();
    expect(pedidos.containsKey('DELETE /api/admin/aparencia/logo'), isTrue);
    expect(find.text('Pôr logo'), findsOneWidget);
  });

  testWidgets('Operador (nao dono): o servidor recusa e a Central mostra o motivo', (tester) async {
    final servidor = MockClient((r) async {
      if (r.method == 'GET') {
        return _ok({'nome': 'Fortaleza Mov', 'cor': '#1E5BB8', 'bannerAtivo': false, 'bannerTexto': '', 'logoUrl': null});
      }
      return http.Response(jsonEncode({'success': false, 'error': {'code': 'FORBIDDEN', 'message': 'Só o dono da Central pode mudar isso.'}}), 403,
          headers: {'content-type': 'application/json; charset=utf-8'});
    });
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: SingleChildScrollView(child: AparenciaDoApp(api: ApiClient(client: servidor)))),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Editar'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Salvar'));
    await tester.pumpAndSettle();
    expect(find.text('Só o dono da Central pode mudar isso.'), findsOneWidget);
    expect(find.text('Fortaleza Mov'), findsOneWidget);
  });
}
