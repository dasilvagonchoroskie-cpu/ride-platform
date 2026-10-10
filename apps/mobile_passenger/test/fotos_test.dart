// Fotos de cada tela do passageiro (Evandro, 10/10/2026: "deixar tudo 100%
// ajustado"). Roda so no workflow "Fotos dos apps" (--dart-define=FOTOS=true):
// celular de 360 x 780 com barra de status e barra de botoes do Android por
// cima, fontes de verdade e respostas no MESMO formato do servidor. As fotos
// vao para o ramo fotos-mobile_passenger e sao conferidas uma a uma.

import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_passenger/core/api/api_client.dart';
import 'package:mobile_passenger/core/avisos.dart';
import 'package:mobile_passenger/core/theme/app_theme.dart';
import 'package:mobile_passenger/core/utils/geo.dart';
import 'package:mobile_passenger/data/models/models.dart';
import 'package:mobile_passenger/data/repositories/ride_repository.dart';
import 'package:mobile_passenger/screens/agendadas_screen.dart';
import 'package:mobile_passenger/screens/avisos_screen.dart';
import 'package:mobile_passenger/screens/change_password_screen.dart';
import 'package:mobile_passenger/screens/city_screen.dart';
import 'package:mobile_passenger/screens/complete_screen.dart';
import 'package:mobile_passenger/screens/confirm_screen.dart';
import 'package:mobile_passenger/screens/contatos_emergencia_screen.dart';
import 'package:mobile_passenger/screens/cupons_screen.dart';
import 'package:mobile_passenger/screens/email_login_screen.dart';
import 'package:mobile_passenger/screens/help_screen.dart';
import 'package:mobile_passenger/screens/history_detail_screen.dart';
import 'package:mobile_passenger/screens/home_shell.dart';
import 'package:mobile_passenger/screens/motoristas_salvos_screen.dart';
import 'package:mobile_passenger/screens/my_data_screen.dart';
import 'package:mobile_passenger/screens/phone_screen.dart';
import 'package:mobile_passenger/screens/reset_password_screen.dart';
import 'package:mobile_passenger/screens/ride_screen.dart';
import 'package:mobile_passenger/screens/searching_screen.dart';
import 'package:mobile_passenger/screens/signup_screen.dart';
import 'package:mobile_passenger/screens/sos_screen.dart';
import 'package:mobile_passenger/screens/terms_screen.dart';
import 'package:mobile_passenger/screens/wallet_screen.dart';
import 'package:mobile_passenger/screens/welcome_screen.dart';
import 'package:mobile_passenger/state/app_state.dart';
import 'package:mobile_passenger/state/auth_state.dart';
import 'package:mobile_passenger/state/config_state.dart';
import 'package:mobile_passenger/state/ride_state.dart';
import 'package:mobile_passenger/widgets/ride_map.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _fotos = bool.fromEnvironment('FOTOS');

const _goiatuba = Coords(-18.0125, -49.3547);
const _destino = Coords(-18.0050, -49.3610);

/// Caminhos que o app pediu e que o servidor de teste nao conhecia.
final Set<String> _semResposta = {};

Map<String, dynamic> _corridaJson(String status, {String? categoria}) => {
      'id': '11111111-1111-1111-1111-111111111111',
      'code': 'AB12CD',
      'status': status,
      'category': categoria ?? 'CARRO',
      'pickupAddress': 'Rua Javari, 1234 - Setor Central, Goiatuba',
      'pickupLat': '-18.0125',
      'pickupLng': '-49.3547',
      'dropoffAddress': 'Rodoviária de Goiatuba - Avenida Brasil, 500',
      'dropoffLat': '-18.0050',
      'dropoffLng': '-49.3610',
      'estimatedFareCents': 1850,
      'finalFareCents': status == 'COMPLETED' ? 1920 : null,
      'discountCents': status == 'COMPLETED' ? 300 : 0,
      'distanceMeters': 4300,
      'durationSeconds': 660,
      'fareFlag': 'DIURNA',
      'paymentMethodType': 'CASH',
      'pin': '4821',
      'mensagensNaoLidas': 1,
      'favorito': false,
      'bloqueado': false,
      'requestedAt': '2026-10-10T13:00:00.000Z',
      'finishedAt': status == 'COMPLETED' ? '2026-10-10T13:14:00.000Z' : null,
      if (status != 'REQUESTED' && status != 'SEARCHING')
        'driverPosition': {'latitude': -18.0080, 'longitude': -49.3500, 'updatedAt': '2026-10-10T13:02:00.000Z'},
      if (status != 'REQUESTED' && status != 'SEARCHING')
        'driver': {
          'id': '22222222-2222-2222-2222-222222222222',
          'ratingAvg': '4.95',
          'totalRides': 1280,
          'fotoCarroUrl': null,
          'user': {'name': 'José Carlos Santos', 'phone': '+5564999990000', 'avatarUrl': null},
        },
      if (status != 'REQUESTED' && status != 'SEARCHING')
        'vehicle': {'brand': 'Chevrolet', 'model': 'Onix Plus', 'color': 'Prata', 'plate': 'ABC1D23', 'category': categoria ?? 'CARRO'},
    };

Map<String, dynamic> _orcamento(String categoria) {
  final moto = categoria == 'MOTO';
  return {
    'flag': 'DIURNA',
    'estimatedFareCents': moto ? 1200 : 1850,
    'discountCents': 0,
    'totalToPayCents': moto ? 1200 : 1850,
    'category': categoria,
    'moto': moto,
    'baseFareCents': moto ? 700 : 1000,
    'distanceCents': moto ? 500 : 850,
    'distanceMeters': 4300,
    'durationSeconds': 660,
    'chargedDistanceMeters': 2800,
    'minFareApplied': false,
    'cobranca': 'TAXIMETRO',
    'opcoes': [
      {'category': 'CARRO', 'nome': 'Carro', 'moto': false, 'estimatedFareCents': 1850, 'totalToPayCents': 1850},
      {'category': 'MOTO', 'nome': 'Moto', 'moto': true, 'estimatedFareCents': 1200, 'totalToPayCents': 1200},
    ],
  };
}

Object? _resposta(String metodo, String caminho, Map<String, dynamic>? corpo) {
  switch (caminho) {
    case '/api/app/config':
      return {
        'login': {'telefone': true, 'email': true, 'senha': true},
        'cidades': ['Goiatuba - GO', 'Bom Jesus de Goiás - GO'],
        'whatsapp': '+5564999991234',
        'avisos': [
          {'id': 'a1', 'titulo': 'Bem-vindo à Fortaleza Mov', 'texto': 'Corridas com motoristas da cidade, preço justo e segurança.', 'criadoEm': '2026-10-09T12:00:00.000Z'},
        ],
        'pracas': [],
      };
    case '/api/rides/estimate':
      return _orcamento((corpo?['category'] as String?) ?? 'CARRO');
    case '/api/rides/current':
      return {'ride': null};
    case '/api/rides/history':
      return {
        'items': [
          _corridaJson('COMPLETED'),
          {..._corridaJson('CANCELLED_BY_PASSENGER'), 'id': 'r2', 'code': 'XY98ZT', 'requestedAt': '2026-10-08T21:10:00.000Z'},
        ],
      };
    case '/api/rides/scheduled':
      return {
        'items': [
          {..._corridaJson('SCHEDULED'), 'id': 'r3', 'code': 'AG55QW', 'scheduledFor': '2026-10-11T09:30:00.000Z', 'driver': null, 'vehicle': null, 'driverPosition': null},
        ],
      };
    case '/api/rides/nearby-drivers':
      return [
        {'id': 'c1', 'latitude': -18.0105, 'longitude': -49.3530, 'moto': false},
        {'id': 'c2', 'latitude': -18.0150, 'longitude': -49.3575, 'moto': true},
      ];
    case '/api/rides/coupons':
      return [
        {'code': 'PRIMEIRACORRIDA', 'description': 'Desconto na primeira corrida', 'discountType': 'FIXED', 'discountValue': 300, 'maxDiscountCents': null, 'minFareCents': 1000, 'expiresAt': '2026-12-31T23:59:00.000Z'},
        {'code': 'GOIATUBA10', 'description': '10% em qualquer corrida', 'discountType': 'PERCENT', 'discountValue': 10, 'maxDiscountCents': 500, 'minFareCents': null, 'expiresAt': null},
      ];
    case '/api/rides/favoritos':
      return {
        'items': [
          {'driverId': 'd2', 'name': 'Maria Souza', 'rating': '4.90', 'totalRides': 120, 'vehicle': 'Fiat Argo', 'color': 'Prata', 'plate': 'ABC1D23', 'online': true},
        ],
      };
    case '/api/rides/bloqueados':
      return {
        'items': [
          {'driverId': 'd3', 'name': 'Carlos Lima', 'vehicle': 'VW Gol', 'plate': 'XYZ9K88'},
        ],
      };
    case '/api/users/me/contatos-emergencia':
      return {
        'items': [
          {'nome': 'Ana (irmã)', 'telefone': '+5564999887766'},
        ],
      };
    case '/api/geo/rota':
      return {
        'porRua': true,
        'pontos': [
          [-18.0125, -49.3547],
          [-18.0110, -49.3560],
          [-18.0090, -49.3575],
          [-18.0070, -49.3595],
          [-18.0050, -49.3610],
        ],
      };
    case '/api/legal/terms':
    case '/api/legal/privacy':
      return {
        'version': '2026-10-01',
        'title': caminho.endsWith('terms') ? 'Termos de Uso' : 'Política de Privacidade',
        'content': 'Ao usar a Fortaleza Mov você concorda com estas regras.\n\n1. A corrida é paga direto ao motorista.\n2. Seus dados são usados só para a corrida e a sua segurança.',
      };
  }
  if (caminho.endsWith('/messages')) return {'podeEscrever': true, 'items': <Object>[]};
  _semResposta.add('$metodo $caminho');
  return <String, dynamic>{};
}

MockClient _servidor() => MockClient((http.Request r) async {
      final corpo = r.body.isEmpty ? null : jsonDecode(r.body) as Map<String, dynamic>?;
      return http.Response(
        jsonEncode({'success': true, 'data': _resposta(r.method, r.url.path, corpo)}),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });

const _usuario = UserProfile(
  id: 'u1',
  name: 'Evandro Gonçalves',
  phone: '+5564999990001',
  email: 'evandro@exemplo.com.br',
  termsAccepted: true,
  cadastroCompleto: true,
  cpf: '123.456.789-09',
  genero: 'MASCULINO',
  cidade: 'Goiatuba - GO',
  temSenha: true,
  endereco: 'Rua Javari, 1234 - Setor Central',
);

Future<void> _fontes() async {
  final inter = FontLoader('Inter');
  for (final peso in ['Regular', 'Medium', 'SemiBold', 'Bold']) {
    inter.addFont(rootBundle.load('assets/fonts/Inter-$peso.ttf'));
  }
  await inter.load();
  final icones = FontLoader('MaterialIcons')..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'));
  await icones.load();
}

final _raiz = GlobalKey();

/// Barra de status e barra de botoes do Android por cima do app, como no
/// celular (o app desenha por baixo delas: Android 15).
Widget _celular(Widget app) => RepaintBoundary(
      key: _raiz,
      child: Directionality(
        textDirection: TextDirection.ltr,
        child: Stack(
          children: [
            Positioned.fill(child: app),
            const Positioned(
              left: 0,
              right: 0,
              top: 0,
              height: 24,
              child: ColoredBox(
                color: Color(0x33000000),
                child: Padding(
                  padding: EdgeInsets.symmetric(horizontal: 12),
                  child: Row(
                    children: [
                      Text('12:30', style: TextStyle(fontFamily: 'Inter', fontSize: 12, color: Colors.white, fontWeight: FontWeight.w600)),
                      Spacer(),
                      Icon(Icons.signal_cellular_alt, size: 14, color: Colors.white),
                      SizedBox(width: 4),
                      Icon(Icons.battery_full, size: 14, color: Colors.white),
                    ],
                  ),
                ),
              ),
            ),
            const Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              height: 48,
              child: ColoredBox(
                color: Color(0xEE000000),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    Icon(Icons.menu, size: 20, color: Colors.white70),
                    Icon(Icons.crop_square, size: 20, color: Colors.white70),
                    Icon(Icons.arrow_back_ios_new, size: 18, color: Colors.white70),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );

class _Estados {
  _Estados() {
    final api = ApiClient(client: _servidor());
    app = AppState(client: api)
      ..coords = _goiatuba
      ..localizacaoReal = true
      ..bootstrapped = true;
    auth = AuthState(client: api)
      ..user = _usuario
      ..accessToken = 'token-de-teste'
      ..ready = true;
    corridas = RideState(repository: RideRepository(client: api, demo: false));
    config = ConfigState(client: api);
  }

  late final AppState app;
  late final AuthState auth;
  late final RideState corridas;
  late final ConfigState config;
}

Future<_Estados> _abrir(WidgetTester tester, Widget tela, {FutureOr<void> Function(_Estados e)? antes, bool logado = true}) async {
  await tester.runAsync(_fontes);
  debugDisableShadows = false;
  tester.view.physicalSize = const Size(1080, 2340);
  tester.view.devicePixelRatio = 3;
  tester.view.padding = const FakeViewPadding(top: 72, bottom: 144);
  tester.view.viewPadding = const FakeViewPadding(top: 72, bottom: 144);
  addTearDown(tester.view.reset);
  final e = _Estados();
  if (!logado) e.auth.user = null;
  await tester.runAsync(() async {
    await e.config.iniciar();
    await antes?.call(e);
  });
  await tester.pumpWidget(
    _celular(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<AppState>.value(value: e.app),
          ChangeNotifierProvider<AuthState>.value(value: e.auth),
          ChangeNotifierProvider<RideState>.value(value: e.corridas),
          ChangeNotifierProvider<ConfigState>.value(value: e.config),
        ],
        child: MaterialApp(
          locale: const Locale('pt', 'BR'),
          supportedLocales: const [Locale('pt', 'BR')],
          localizationsDelegates: GlobalMaterialLocalizations.delegates,
          // Igual ao app.dart: margem de baixo para a barra de botoes.
          builder: (context, child) => ColoredBox(
            color: Colors.white,
            child: SafeArea(top: false, left: false, right: false, child: child ?? const SizedBox.shrink()),
          ),
          scaffoldMessengerKey: avisos,
          debugShowCheckedModeBanner: false,
          theme: AppTheme.light,
          home: tela,
        ),
      ),
    ),
  );
  await _carregar(tester);
  return e;
}

Future<void> _carregar(WidgetTester tester) async {
  for (var i = 0; i < 6; i++) {
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 30)));
    await tester.pump(const Duration(milliseconds: 150));
  }
}

/// Carrega as imagens da tela (logo, marcadores do mapa) antes da foto.
Future<void> _imagens(WidgetTester tester) async {
  final vistas = <ImageProvider>{};
  for (final el in find.byType(Image).evaluate().toList()) {
    final img = el.widget as Image;
    if (!vistas.add(img.image)) continue;
    await tester.runAsync(() => precacheImage(img.image, el, onError: (erro, pilha) {}));
  }
  await tester.pump(const Duration(milliseconds: 100));
}

Future<void> _foto(WidgetTester tester, String nome) async {
  await _carregar(tester);
  await _imagens(tester);
  await tester.pump(const Duration(milliseconds: 400));
  await expectLater(find.byKey(_raiz), matchesGoldenFile('fotos/$nome.png'));
}

Future<void> _fim(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox());
  await tester.pump(const Duration(seconds: 1));
  debugDisableShadows = true;
}

Ride _corrida(String status, {String? categoria, Map<String, dynamic> extra = const {}}) =>
    Ride.fromServer({..._corridaJson(status, categoria: categoria), ...extra});

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({'ride.accessToken': 'token-de-teste'});
    mostrarRuasNoMapa = false;
  });

  tearDownAll(() {
    if (_semResposta.isNotEmpty) {
      // ignore: avoid_print
      print('SEM RESPOSTA DE TESTE: ${_semResposta.join(', ')}');
    }
  });

  testWidgets('01 entrada', skip: !_fotos, (tester) async {
    await _abrir(tester, const WelcomeScreen(), logado: false);
    await _foto(tester, '01-entrada');
    await _fim(tester);
  });

  testWidgets('02 telefone', skip: !_fotos, (tester) async {
    await _abrir(tester, const PhoneScreen(), logado: false);
    await _foto(tester, '02-telefone');
    await _fim(tester);
  });

  testWidgets('03 entrar com e-mail', skip: !_fotos, (tester) async {
    await _abrir(tester, const EmailLoginScreen(), logado: false);
    await _foto(tester, '03-email');
    await _fim(tester);
  });

  testWidgets('04 esqueci a senha', skip: !_fotos, (tester) async {
    await _abrir(tester, const ResetPasswordScreen(email: 'evandro@exemplo.com.br'), logado: false);
    await _foto(tester, '04-esqueci-senha');
    await _fim(tester);
  });

  testWidgets('05 cidade e cadastro', skip: !_fotos, (tester) async {
    await _abrir(tester, const CityScreen());
    await _foto(tester, '05-cidade');
    await _fim(tester);
    await _abrir(tester, const SignupScreen(), antes: (e) {
      e.auth.user = const UserProfile(id: 'u1', name: '', phone: '+5564999990001', termsAccepted: false);
    });
    await _foto(tester, '06-cadastro');
    await _fim(tester);
  });

  testWidgets('07 termos', skip: !_fotos, (tester) async {
    await _abrir(tester, const TermsScreen());
    await _foto(tester, '07-termos');
    await _fim(tester);
  });

  testWidgets('08 inicio, destino, atividade e conta', skip: !_fotos, (tester) async {
    await _abrir(tester, const HomeShell());
    await _foto(tester, '08-inicio');
    await tester.tap(find.text('Buscar destino'));
    await _carregar(tester);
    await _foto(tester, '09-buscar-destino');
    await _fim(tester);

    await _abrir(tester, const HomeShell());
    await tester.tap(find.text('Atividade'));
    await _carregar(tester);
    await _foto(tester, '10-atividade');
    await tester.tap(find.text('Conta'));
    await _carregar(tester);
    await _foto(tester, '11-conta');
    await tester.drag(find.byType(Scrollable).last, const Offset(0, -700));
    await _carregar(tester);
    await _foto(tester, '12-conta-fim');
    await _fim(tester);
  });

  testWidgets('13 confirmar viagem com Carro e Moto', skip: !_fotos, (tester) async {
    // O preco e pedido na tela Inicio, antes de abrir a confirmacao.
    await _abrir(
      tester,
      const ConfirmScreen(destination: _destino, address: 'Rodoviária de Goiatuba - Avenida Brasil, 500'),
      antes: (e) => e.corridas.estimate(_goiatuba, _destino, dropoffAddress: 'Rodoviária de Goiatuba - Avenida Brasil, 500'),
    );
    await _foto(tester, '13-confirmar');
    if (find.text('Moto').evaluate().isNotEmpty) {
      await tester.tap(find.text('Moto'));
      await _carregar(tester);
      await _foto(tester, '14-confirmar-moto');
    }
    await _fim(tester);
  });

  testWidgets('15 procurando, a caminho, chegou, em viagem e fim', skip: !_fotos, (tester) async {
    await _abrir(tester, const SearchingScreen(), antes: (e) => e.corridas.activeRide = _corrida('SEARCHING'));
    await _foto(tester, '15-procurando');
    await _fim(tester);

    await _abrir(tester, const SearchingScreen(), antes: (e) => e.corridas.activeRide = _corrida('DRIVER_ARRIVING'));
    await _foto(tester, '16-motorista-a-caminho');
    await tester.drag(find.byType(Scrollable).last, const Offset(0, -600));
    await _carregar(tester);
    await _foto(tester, '17-motorista-a-caminho-fim');
    await _fim(tester);

    await _abrir(tester, const SearchingScreen(), antes: (e) => e.corridas.activeRide = _corrida('DRIVER_WAITING'));
    await _foto(tester, '18-motorista-chegou');
    await _fim(tester);

    await _abrir(tester, const SearchingScreen(),
        antes: (e) => e.corridas.activeRide = _corrida('DRIVER_ARRIVING', categoria: 'MOTO'));
    await _foto(tester, '19-moto-a-caminho');
    await _fim(tester);

    await _abrir(tester, const RideScreen(), antes: (e) {
      e.corridas.activeRide = _corrida('IN_PROGRESS', extra: {
        'cobranca': 'TAXIMETRO',
        'taximetro': {'valorCents': 1370, 'distanceMeters': 2100, 'durationSeconds': 300, 'waitingSeconds': 0},
      });
    });
    await _foto(tester, '20-em-viagem');
    await tester.drag(find.byType(Scrollable).last, const Offset(0, -600));
    await _carregar(tester);
    await _foto(tester, '21-em-viagem-fim');
    await _fim(tester);

    await _abrir(tester, const CompleteScreen(), antes: (e) => e.corridas.activeRide = _corrida('COMPLETED'));
    await _foto(tester, '22-corrida-concluida');
    await _fim(tester);
  });

  testWidgets('23 recibo', skip: !_fotos, (tester) async {
    await _abrir(tester, HistoryDetailScreen(ride: _corrida('COMPLETED')));
    await _foto(tester, '23-recibo');
    await tester.drag(find.byType(Scrollable).first, const Offset(0, -700));
    await _carregar(tester);
    await _foto(tester, '24-recibo-fim');
    await _fim(tester);
  });

  testWidgets('25 meus dados e trocar telefone', skip: !_fotos, (tester) async {
    await _abrir(tester, const MyDataScreen());
    await _foto(tester, '25-meus-dados');
    final trocar = find.textContaining('Trocar');
    if (trocar.evaluate().isNotEmpty) {
      await tester.ensureVisible(trocar.first);
      await tester.tap(trocar.first);
      await _carregar(tester);
      await _foto(tester, '26-trocar-telefone');
    }
    await _fim(tester);
  });

  testWidgets('27 telas da conta', skip: !_fotos, (tester) async {
    final telas = <String, Widget>{
      '27-pagamento': const WalletScreen(),
      '28-cupons': const CuponsScreen(),
      '29-ajuda': const HelpScreen(),
      '30-sos': const SosScreen(),
      '31-contatos-emergencia': const ContatosEmergenciaScreen(),
      '32-agendadas': const AgendadasScreen(),
      '33-avisos': const AvisosScreen(),
      '34-motoristas-salvos': const MotoristasSalvosScreen(),
      '35-alterar-senha': const ChangePasswordScreen(),
    };
    for (final t in telas.entries) {
      await _abrir(tester, t.value);
      await _foto(tester, t.key);
      await _fim(tester);
    }
  });
}
