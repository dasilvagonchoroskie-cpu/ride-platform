// Central cadastra o motorista direto (Evandro, 08/10/2026): dados, CNH e
// carro, ja aprovado; o motorista so entra no app com telefone e codigo.

import 'dart:convert';

import 'package:central_app/core/api/api_client.dart';
import 'package:central_app/core/theme/central_theme.dart';
import 'package:central_app/data/painel.dart';
import 'package:central_app/painel/cadastrar_motorista.dart';
import 'package:central_app/painel/painel_state.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

final List<(String, Map<String, dynamic>?)> pedidos = [];

MockClient _servidor() => MockClient((r) async {
      pedidos.add(('${r.method} ${r.url.path}', r.body.isEmpty ? null : jsonDecode(r.body) as Map<String, dynamic>));
      final dados = r.url.path == '/api/admin/drivers'
          ? {'id': 'motorista-novo', 'status': 'APPROVED', 'contaExistente': false}
          : <String, dynamic>{};
      return http.Response(jsonEncode({'success': true, 'data': dados}), 200,
          headers: {'content-type': 'application/json; charset=utf-8'});
    });

Future<void> _abrir(WidgetTester tester) async {
  tester.view.physicalSize = const Size(1080, 2340);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    ChangeNotifierProvider<PainelState>.value(
      value: PainelState(PainelApi(ApiClient(client: _servidor()))),
      child: MaterialApp(
        theme: CentralTheme.dark,
        locale: const Locale('pt', 'BR'),
        supportedLocales: const [Locale('pt', 'BR')],
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
        home: const CadastrarMotoristaTela(),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _escrever(WidgetTester tester, String rotulo, String texto) async {
  final campo = find.widgetWithText(TextField, rotulo);
  await tester.ensureVisible(campo);
  await tester.pumpAndSettle();
  await tester.enterText(campo, texto);
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({'ride.accessToken': 'token-de-teste'});
    pedidos.clear();
  });

  test('Data DD/MM/AAAA vai para o servidor como AAAA-MM-DD', () {
    expect(dataParaServidor('18/06/2031'), '2031-06-18');
    expect(dataParaServidor('18062031'), '2031-06-18');
    expect(dataParaServidor('31/02/2030'), isNull);
    expect(dataParaServidor('1806'), isNull);
  });

  testWidgets('Cadastrar motorista: confere os campos, manda tudo e da o saldo inicial', (tester) async {
    await _abrir(tester);
    await tester.ensureVisible(find.text('Cadastrar motorista').last);
    await tester.tap(find.text('Cadastrar motorista').last);
    await tester.pumpAndSettle();
    expect(find.textContaining('nome completo'), findsOneWidget);
    expect(pedidos, isEmpty);

    await _escrever(tester, 'Nome completo', 'Evandro da Silva');
    await _escrever(tester, 'Telefone com DDD', '64992686632');
    expect(find.text('(64) 99268-6632'), findsWidgets);
    await _escrever(tester, 'CPF', '52998224725');
    await _escrever(tester, 'Data de nascimento', '10051990');
    await _escrever(tester, 'Número da CNH', '05494287230');
    await _escrever(tester, 'Validade da CNH', '18062031');
    await _escrever(tester, 'Marca', 'Chevrolet');
    await _escrever(tester, 'Modelo', 'Spin');
    await _escrever(tester, 'Ano', '2013');
    await _escrever(tester, 'Cor', 'Cinza');
    await _escrever(tester, 'Placa', 'fbp8h67');
    await _escrever(tester, 'Saldo inicial em R\$ (opcional)', '50,00');

    await tester.ensureVisible(find.text('Cadastrar motorista').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cadastrar motorista').last);
    await tester.pumpAndSettle();

    final (rota, corpo) = pedidos.firstWhere((p) => p.$1 == 'POST /api/admin/drivers');
    expect(rota, 'POST /api/admin/drivers');
    expect(corpo!['phone'], '+5564992686632');
    expect(corpo['cpf'], '52998224725');
    expect(corpo['birthDate'], '1990-05-10');
    expect(corpo['cnhExpiresAt'], '2031-06-18');
    expect(corpo['aprovar'], true);
    expect((corpo['vehicle'] as Map)['plate'], 'FBP8H67');
    final credito = pedidos.firstWhere((p) => p.$1 == 'POST /api/admin/drivers/motorista-novo/wallet/credit');
    expect(credito.$2!['amountCents'], 5000);
    expect(find.text('Motorista cadastrado'), findsOneWidget);
    expect(find.textContaining('(64) 99268-6632'), findsWidgets);
  });
}
