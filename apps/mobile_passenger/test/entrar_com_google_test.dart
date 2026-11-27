// "Entrar com Google" (Evandro, 27/11/2026): o botao so aparece quando o
// servidor liga a opcao; quem entra pelo Google nao precisa criar senha.

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_passenger/core/api/api_client.dart';
import 'package:mobile_passenger/core/avisos.dart';
import 'package:mobile_passenger/core/entrada_google.dart';
import 'package:mobile_passenger/data/models/models.dart';
import 'package:mobile_passenger/screens/phone_screen.dart';
import 'package:mobile_passenger/screens/signup_screen.dart';
import 'package:mobile_passenger/state/app_state.dart';
import 'package:mobile_passenger/state/auth_state.dart';
import 'package:mobile_passenger/state/config_state.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _idDoServidor = '123456789012-teste.apps.googleusercontent.com';

final List<(String, Map<String, dynamic>)> pedidos = [];

http.Response _json(int status, Object corpo) => http.Response(
      jsonEncode(corpo),
      status,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );

MockClient _servidor({required Map<String, dynamic> respostaGoogle}) => MockClient((r) async {
      final corpo = r.body.isEmpty ? <String, dynamic>{} : jsonDecode(r.body) as Map<String, dynamic>;
      pedidos.add((r.url.path, corpo));
      if (r.url.path == '/api/auth/google') return _json(200, {'success': true, 'data': respostaGoogle});
      if (r.url.path == '/api/auth/otp/request') {
        return _json(200, {
          'success': true,
          'data': {'expiresIn': 300, 'enviadoPor': 'email'},
        });
      }
      return _json(200, {'success': true, 'data': <String, dynamic>{}});
    });

Future<AuthState> _abrir(
  WidgetTester tester,
  Widget tela, {
  String? google = _idDoServidor,
  Map<String, dynamic> respostaGoogle = const {},
  UserProfile? usuario,
  double altura = 900,
}) async {
  tester.view.physicalSize = Size(360, altura);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final api = ApiClient(client: _servidor(respostaGoogle: respostaGoogle));
  final auth = AuthState(client: api)..user = usuario;
  await tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<AppState>(create: (_) => AppState(client: api)..dataSource = DataSource.api),
        ChangeNotifierProvider<AuthState>.value(value: auth),
        ChangeNotifierProvider<ConfigState>(create: (_) => ConfigState(client: api)..loginGoogle = google),
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

Future<void> _tocarNoGoogle(WidgetTester tester) async {
  await tester.ensureVisible(find.text('Entrar com Google'));
  await tester.tap(find.text('Entrar com Google'));
  await tester.pumpAndSettle();
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    pedidos.clear();
  });
  tearDown(() => EntradaGoogle.deTeste = null);

  testWidgets('Sem a opcao ligada no servidor, o botao nao aparece', (tester) async {
    await _abrir(tester, const PhoneScreen(), google: null);
    expect(find.text('Continuar com e-mail'), findsOneWidget);
    expect(find.text('Entrar com Google'), findsNothing);
  });

  testWidgets('Entra com o comprovante do Google', (tester) async {
    String? idUsado;
    EntradaGoogle.deTeste = (id) async {
      idUsado = id;
      return 'comprovante-assinado';
    };
    final auth = await _abrir(tester, const PhoneScreen(), respostaGoogle: {
      'accessToken': 'acesso',
      'refreshToken': 'renovacao',
      'user': {'id': 'u1', 'name': 'Maria Souza', 'phone': '', 'email': 'maria@gmail.com', 'role': 'PASSENGER', 'entraComGoogle': true},
    });
    await _tocarNoGoogle(tester);

    expect(idUsado, _idDoServidor);
    final (_, corpo) = pedidos.firstWhere((p) => p.$1 == '/api/auth/google');
    expect(corpo['idToken'], 'comprovante-assinado');
    expect(corpo['role'], 'PASSENGER');
    expect(auth.user?.email, 'maria@gmail.com');
    expect(auth.user?.entraComGoogle, isTrue);
  });

  testWidgets('Endereco que o Google nao garante: segue pelo codigo no e-mail', (tester) async {
    EntradaGoogle.deTeste = (_) async => 'comprovante-assinado';
    final auth = await _abrir(tester, const PhoneScreen(), respostaGoogle: {
      'precisaCodigoEmail': true,
      'email': 'ana@empresa.com.br',
    });
    await _tocarNoGoogle(tester);

    expect(auth.user, isNull);
    final (_, corpo) = pedidos.firstWhere((p) => p.$1 == '/api/auth/otp/request');
    expect(corpo['email'], 'ana@empresa.com.br');
    expect(find.text('ana@empresa.com.br'), findsOneWidget);
  });

  testWidgets('Fechar a janela do Google nao manda nada ao servidor', (tester) async {
    EntradaGoogle.deTeste = (_) async => null;
    final auth = await _abrir(tester, const PhoneScreen());
    await _tocarNoGoogle(tester);

    expect(auth.user, isNull);
    expect(pedidos.where((p) => p.$1.startsWith('/api/auth/')), isEmpty);
    expect(find.textContaining('cancelada'), findsOneWidget);
  });

  testWidgets('Cadastro de quem entrou com Google nao pede senha', (tester) async {
    await _abrir(
      tester,
      const SignupScreen(),
      altura: 2400,
      usuario: const UserProfile(
        id: 'u1',
        name: 'Maria Souza',
        phone: '',
        email: 'maria@gmail.com',
        telefonePendente: true,
        entraComGoogle: true,
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Telefone (WhatsApp)'), findsOneWidget);
    expect(find.text('Crie uma senha'), findsNothing);
    expect(find.text('Confirme a senha'), findsNothing);
    expect(find.textContaining('não precisa criar senha'), findsOneWidget);
  });

  testWidgets('Cadastro pelo codigo continua pedindo a senha', (tester) async {
    await _abrir(
      tester,
      const SignupScreen(),
      altura: 2400,
      usuario: const UserProfile(id: 'u1', name: 'Passageiro', phone: '', email: 'maria@exemplo.com', telefonePendente: true),
    );
    await tester.pumpAndSettle();
    expect(find.text('Crie uma senha'), findsOneWidget);
    expect(find.text('Confirme a senha'), findsOneWidget);
  });
}
