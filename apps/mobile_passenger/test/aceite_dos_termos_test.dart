// Novo aceite dos Termos (Evandro, 27/11/2026): quem aceitou uma versao antiga
// aceita de novo; ninguem aceita sem o texto completo na tela.

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_passenger/core/api/api_client.dart';
import 'package:mobile_passenger/data/models/models.dart';
import 'package:mobile_passenger/state/auth_state.dart';
import 'package:mobile_passenger/screens/terms_screen.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

final List<(String, Map<String, dynamic>)> pedidos = [];

http.Response _ok(Object dados) => http.Response(
      jsonEncode({'success': true, 'data': dados}),
      200,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );

bool _semInternet = false;

ApiClient _api() => ApiClient(
      client: MockClient((r) async {
        if (_semInternet) throw http.ClientException('sem internet');
        final corpo = r.body.isEmpty ? <String, dynamic>{} : jsonDecode(r.body) as Map<String, dynamic>;
        pedidos.add((r.url.path, corpo));
        if (r.url.path == '/api/legal/terms') return _ok({'version': '7.0.0', 'content': '# Termos completos'});
        if (r.url.path == '/api/legal/privacy') return _ok({'version': '7.0.0', 'content': '# Privacidade completa'});
        if (r.url.path == '/api/auth/me') return _ok({'termsAccepted': true, 'termosDesatualizados': true});
        return _ok(<String, dynamic>{});
      }),
    );

AuthState _estado(ApiClient api, {bool primeiraVez = false}) => AuthState(client: api)
  ..user = UserProfile(id: 'u1', name: 'Ana', phone: '+5564999990001', termsAccepted: !primeiraVez, termosDesatualizados: !primeiraVez);

UserProfile _perfil(AuthState s) => s.user!;

Future<void> _abrir(WidgetTester tester, AuthState estado, ApiClient api) async {
  tester.view.physicalSize = const Size(360, 740);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ChangeNotifierProvider<AuthState>.value(value: estado, child: MaterialApp(home: TermsScreen(cliente: api))),
  );
  await tester.pumpAndSettle();
}

Iterable<(String, Map<String, dynamic>)> get _aceites => pedidos.where((p) => p.$1 == '/api/auth/accept-terms');

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    pedidos.clear();
    _semInternet = false;
  });

  test('o aviso de texto novo vem do servidor e fica guardado no aparelho', () {
    final lido = UserProfile.fromJson({'id': 'u1', 'name': 'Ana', 'phone': '', 'termsAccepted': true, 'termosDesatualizados': true});
    expect(lido.termosDesatualizados, isTrue);
    expect(UserProfile.fromJson(lido.toJson()).termosDesatualizados, isTrue);
    // Cadastro guardado por uma versao antiga do app (sem o campo).
    expect(UserProfile.fromJson({'id': 'u1', 'name': 'Ana', 'phone': '', 'termsAccepted': true}).termosDesatualizados, isFalse);
  });

  testWidgets('so aceita depois de marcar, e registra a versao que estava na tela', (tester) async {
    final api = _api();
    final estado = _estado(api);
    await _abrir(tester, estado, api);

    expect(find.textContaining('Atualizamos os Termos'), findsOneWidget);
    await tester.tap(find.text('Aceito os Termos'));
    await tester.pumpAndSettle();
    expect(_aceites, isEmpty);

    await tester.tap(find.byKey(const ValueKey('aceite-termos')));
    await tester.pump();
    await tester.tap(find.text('Aceito os Termos'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));

    expect(_aceites.map((p) => p.$2['version']), ['7.0.0']);
    expect(_perfil(estado).termsAccepted, isTrue);
    expect(_perfil(estado).termosDesatualizados, isFalse);
  });

  testWidgets('no primeiro aceite nao fala em atualizacao', (tester) async {
    final api = _api();
    await _abrir(tester, _estado(api, primeiraVez: true), api);
    expect(find.textContaining('Atualizamos os Termos'), findsNothing);
  });

  testWidgets('sem internet nao deixa aceitar; voltando a internet, tenta de novo', (tester) async {
    _semInternet = true;
    final api = _api();
    final estado = _estado(api);
    await _abrir(tester, estado, api);

    expect(find.textContaining('Sem conexão'), findsOneWidget);
    expect(find.byKey(const ValueKey('aceite-termos')), findsNothing);
    await tester.tap(find.text('Aceito os Termos'));
    await tester.pumpAndSettle();
    expect(_perfil(estado).termosDesatualizados, isTrue);

    _semInternet = false;
    await tester.tap(find.text('Tentar de novo'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('aceite-termos')), findsOneWidget);
  });
}
