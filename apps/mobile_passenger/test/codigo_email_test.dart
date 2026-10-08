// Evandro (08/10/2026): "receber o codigo por e-mail para todos os usuarios,
// nao so para mim — passageiro e motorista. Seguranca em primeiro lugar."
// Sem SMS, o telefone que ainda nao tem conta nao recebe codigo na tela: o
// app pede o e-mail, a conta nasce por ele e o cadastro ja vem com o
// telefone digitado.

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_passenger/core/api/api_client.dart';
import 'package:mobile_passenger/core/avisos.dart';
import 'package:mobile_passenger/data/models/models.dart';
import 'package:mobile_passenger/screens/phone_screen.dart';
import 'package:mobile_passenger/screens/signup_screen.dart';
import 'package:mobile_passenger/state/app_state.dart';
import 'package:mobile_passenger/state/auth_state.dart';
import 'package:mobile_passenger/state/config_state.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

final List<Map<String, dynamic>> pedidosDeCodigo = [];

http.Response _json(int status, Object corpo) => http.Response(
      jsonEncode(corpo),
      status,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );

/// Servidor com o e-mail ligado e sem codigo na tela (como o de verdade).
MockClient _servidor() => MockClient((r) async {
      if (r.url.path == '/api/auth/otp/request') {
        final corpo = jsonDecode(r.body) as Map<String, dynamic>;
        pedidosDeCodigo.add(corpo);
        if (corpo['phone'] != null) {
          return _json(404, {
            'success': false,
            'error': {
              'code': 'TELEFONE_SEM_CONTA',
              'message': 'Este telefone ainda nao tem conta. Para criar a sua, informe o seu e-mail.',
            },
          });
        }
        return _json(200, {
          'success': true,
          'data': {'expiresIn': 300, 'enviadoPor': 'email'},
        });
      }
      if (r.url.path == '/api/app/config') {
        return _json(200, {
          'success': true,
          'data': {
            'cidades': <String>[],
            'login': {'telefone': true, 'email': true, 'emailReal': true},
          },
        });
      }
      return _json(200, {'success': true, 'data': <String, dynamic>{}});
    });

Future<AuthState> _abrir(WidgetTester tester, Widget tela, {UserProfile? usuario, String? telefoneDigitado, double altura = 780}) async {
  tester.view.physicalSize = Size(360, altura);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final api = ApiClient(client: _servidor());
  final auth = AuthState(client: api);
  auth.user = usuario;
  auth.telefoneParaCadastro = telefoneDigitado;
  await tester.pumpWidget(
    MultiProvider(
      providers: [
        // Com servidor (nao o modo demonstracao).
        ChangeNotifierProvider<AppState>(create: (_) => AppState(client: api)..dataSource = DataSource.api),
        ChangeNotifierProvider<AuthState>.value(value: auth),
        ChangeNotifierProvider<ConfigState>(create: (_) => ConfigState(client: api)),
      ],
      child: MaterialApp(
        scaffoldMessengerKey: avisos,
        locale: const Locale('pt', 'BR'),
        supportedLocales: const [Locale('pt', 'BR')],
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        home: tela,
      ),
    ),
  );
  await tester.pump();
  return auth;
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    pedidosDeCodigo.clear();
  });

  testWidgets('Telefone sem conta: pede o e-mail e o codigo vai para ele (nada na tela)', (tester) async {
    final auth = await _abrir(tester, const PhoneScreen());
    await tester.enterText(find.byType(TextField).first, '64911112222');
    await tester.pump();
    await tester.tap(find.text('Continuar'));
    await tester.pumpAndSettle();

    expect(find.textContaining('(64) 91111-2222 ainda não tem conta'), findsOneWidget);
    expect(auth.telefoneParaCadastro, '+5564911112222');

    await tester.enterText(find.byType(TextField).first, 'maria@exemplo.com');
    await tester.pump();
    await tester.tap(find.text('Receber código'));
    await tester.pumpAndSettle();

    expect(pedidosDeCodigo.last['email'], 'maria@exemplo.com');
    expect(find.text('maria@exemplo.com'), findsOneWidget);
    expect(find.textContaining('caixa de Spam'), findsOneWidget);
    expect(find.textContaining('Nunca passe este código'), findsOneWidget);
    expect(find.textContaining('Ambiente de teste'), findsNothing);
  });

  testWidgets('Cadastro ja vem com o telefone digitado antes', (tester) async {
    await _abrir(
      tester,
      const SignupScreen(),
      usuario: const UserProfile(id: 'u1', name: 'Passageiro', phone: '', email: 'maria@exemplo.com', telefonePendente: true),
      telefoneDigitado: '+5564911112222',
      altura: 2400,
    );
    await tester.pumpAndSettle();
    expect(find.text('(64) 91111-2222'), findsOneWidget);
  });
}
