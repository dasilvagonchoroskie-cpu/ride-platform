// "Entrar com Google" (Evandro, 27/11/2026): o botao so aparece quando o
// servidor liga a opcao, e a conta aprovada abre direto, como pelo codigo.

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_driver/core/api/api_client.dart';
import 'package:mobile_driver/core/avisos.dart';
import 'package:mobile_driver/core/entrada_google.dart';
import 'package:mobile_driver/screens/email_screen.dart';
import 'package:mobile_driver/state/driver_state.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _idDoServidor = '123456789012-teste.apps.googleusercontent.com';

final List<(String, Map<String, dynamic>)> pedidos = [];

http.Response _ok(Object dados) => http.Response(
      jsonEncode({'success': true, 'data': dados}),
      200,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );

MockClient _servidor({required String? google, required Map<String, dynamic> respostaGoogle}) => MockClient((r) async {
      final corpo = r.body.isEmpty ? <String, dynamic>{} : jsonDecode(r.body) as Map<String, dynamic>;
      pedidos.add((r.url.path, corpo));
      switch (r.url.path) {
        case '/api/app/config':
          return _ok({
            'login': {'telefone': false, 'email': true, 'google': google},
          });
        case '/api/auth/google':
          return _ok(respostaGoogle);
        case '/api/auth/otp/request':
          return _ok({'expiresIn': 300, 'enviadoPor': 'email'});
        default:
          return _ok(<String, dynamic>{});
      }
    });

Future<DriverState> _abrir(WidgetTester tester, {String? google = _idDoServidor, Map<String, dynamic> respostaGoogle = const {}}) async {
  tester.view.physicalSize = const Size(1080, 2340);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final d = DriverState(client: ApiClient(client: _servidor(google: google, respostaGoogle: respostaGoogle)));
  await tester.pumpWidget(
    ChangeNotifierProvider<DriverState>.value(
      value: d,
      child: MaterialApp(scaffoldMessengerKey: avisos, home: const EmailScreen()),
    ),
  );
  await tester.pumpAndSettle();
  return d;
}

/// Fim do teste: tira a tela e para os relogios do estado.
Future<void> _fim(WidgetTester tester, DriverState d) async {
  await tester.pumpWidget(const SizedBox());
  d.dispose();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    pedidos.clear();
  });
  tearDown(() => EntradaGoogle.deTeste = null);

  testWidgets('Sem a opcao ligada no servidor, o botao nao aparece', (tester) async {
    final d = await _abrir(tester, google: null);
    expect(find.text('Receber código'), findsOneWidget);
    expect(find.text('Entrar com Google'), findsNothing);
    await _fim(tester, d);
  });

  testWidgets('Entra com o comprovante do Google como motorista', (tester) async {
    EntradaGoogle.deTeste = (_) async => 'comprovante-assinado';
    final d = await _abrir(tester, respostaGoogle: {
      'accessToken': 'acesso',
      'refreshToken': 'renova',
      'isNewUser': true,
      'user': {'id': 'u1', 'role': 'DRIVER', 'name': 'Joao Silva', 'phone': '', 'email': 'joao@gmail.com', 'termsAccepted': false, 'driverId': null},
    });
    await tester.tap(find.text('Entrar com Google'));
    await tester.pumpAndSettle();

    final (_, corpo) = pedidos.firstWhere((p) => p.$1 == '/api/auth/google');
    expect(corpo['idToken'], 'comprovante-assinado');
    expect(corpo['role'], 'DRIVER');
    expect(d.profile?.name, 'Joao Silva');
    expect(d.email, 'joao@gmail.com');
    await _fim(tester, d);
  });

  testWidgets('Endereco que o Google nao garante: segue pelo codigo no e-mail', (tester) async {
    EntradaGoogle.deTeste = (_) async => 'comprovante-assinado';
    final d = await _abrir(tester, respostaGoogle: {'precisaCodigoEmail': true, 'email': 'ana@empresa.com.br'});
    await tester.tap(find.text('Entrar com Google'));
    await tester.pumpAndSettle();

    expect(d.profile, isNull);
    final (_, corpo) = pedidos.firstWhere((p) => p.$1 == '/api/auth/otp/request');
    expect(corpo['email'], 'ana@empresa.com.br');
    expect(find.text('Digite o código'), findsOneWidget);
    await _fim(tester, d);
  });

  testWidgets('Fechar a janela do Google nao manda nada ao servidor', (tester) async {
    EntradaGoogle.deTeste = (_) async => null;
    final d = await _abrir(tester);
    await tester.tap(find.text('Entrar com Google'));
    await tester.pumpAndSettle();

    expect(d.profile, isNull);
    expect(pedidos.where((p) => p.$1.startsWith('/api/auth/')), isEmpty);
    await _fim(tester, d);
  });
}
