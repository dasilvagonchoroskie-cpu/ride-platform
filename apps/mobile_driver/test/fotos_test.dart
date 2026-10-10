// Fotos de cada tela do motorista (Evandro, 10/10/2026: "deixar tudo 100%
// ajustado"). Roda so no workflow "Fotos dos apps" (--dart-define=FOTOS=true):
// celular de 360 x 780 com barra de status e barra de botoes do Android por
// cima, fontes de verdade e respostas no MESMO formato do servidor. As fotos
// vao para o ramo fotos-mobile_driver e sao conferidas uma a uma.

import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_driver/core/api/api_client.dart';
import 'package:mobile_driver/core/avisos.dart';
import 'package:mobile_driver/core/theme/app_theme.dart';
import 'package:mobile_driver/core/utils/geo.dart';
import 'package:mobile_driver/data/models/driver_models.dart';
import 'package:mobile_driver/screens/activity_screen.dart';
import 'package:mobile_driver/screens/corrida_manual_screen.dart';
import 'package:mobile_driver/screens/email_screen.dart';
import 'package:mobile_driver/screens/home_screen.dart';
import 'package:mobile_driver/screens/menu_screen.dart';
import 'package:mobile_driver/screens/meus_dados_screen.dart';
import 'package:mobile_driver/screens/offer_screen.dart';
import 'package:mobile_driver/screens/onboarding_screen.dart';
import 'package:mobile_driver/screens/pending_screen.dart';
import 'package:mobile_driver/screens/perfil_screen.dart';
import 'package:mobile_driver/screens/phone_screen.dart';
import 'package:mobile_driver/screens/ride_screen.dart';
import 'package:mobile_driver/screens/rides_history_screen.dart';
import 'package:mobile_driver/screens/sos_screen.dart';
import 'package:mobile_driver/screens/terms_screen.dart';
import 'package:mobile_driver/screens/vehicles_screen.dart';
import 'package:mobile_driver/screens/wallet_screen.dart';
import 'package:mobile_driver/screens/welcome_screen.dart';
import 'package:mobile_driver/state/driver_state.dart';
import 'package:mobile_driver/widgets/ride_map.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _fotos = bool.fromEnvironment('FOTOS');

/// Caminhos que o app pediu e que o servidor de teste nao conhecia.
final Set<String> _semResposta = {};

/// Meus dados com um pedido de mudanca esperando a Central.
bool _comPedido = false;

Object? _resposta(String metodo, String caminho) {
  switch (caminho) {
    case '/api/app/config':
      return {
        'login': {'telefone': true, 'email': true, 'senha': true},
        'cidades': ['Goiatuba - GO'],
        'whatsapp': '+5564999991234',
        'avisos': [],
        'pracas': [
          {'id': 'p1', 'nome': 'Goiatuba', 'uf': 'GO', 'latitude': -18.0125, 'longitude': -49.3547, 'whatsapp': null},
        ],
      };
    case '/api/drivers/me':
      return {
        'id': 'd1',
        'status': 'APPROVED',
        'cpf': '12345678909',
        'cnhNumber': '01234567890',
        'cnhCategory': 'AB',
        'cnhExpiresAt': '2029-05-10T00:00:00.000Z',
        'ratingAvg': '4.95',
        'totalRides': 312,
        'acceptanceRate': '92',
        'isOnline': true,
        'user': {'name': 'Evandro Gonçalves', 'phone': '+5564999990001', 'email': 'evandro@exemplo.com.br', 'avatarUrl': null},
      };
    case '/api/vehicles/me':
      return [
        {'id': 'v1', 'plate': 'ABC1D23', 'brand': 'Chevrolet', 'model': 'Onix Plus', 'year': 2022, 'color': 'Prata', 'category': 'CARRO', 'isActive': true, 'situacao': 'EM_USO', 'fotoUrl': null, 'crlvUrl': null, 'motivo': null},
      ];
    case '/api/documents/me':
      return {
        'documents': [
          {'id': 'x1', 'type': 'CNH_FRONT', 'status': 'APPROVED', 'rejectionReason': null, 'fileUrl': null, 'uploadedAt': '2026-10-01T10:00:00.000Z'},
          {'id': 'x2', 'type': 'CRLV', 'status': 'APPROVED', 'rejectionReason': null, 'fileUrl': null, 'uploadedAt': '2026-10-01T10:00:00.000Z'},
        ],
        'progress': {},
      };
    case '/api/driver/activity':
      return {
        'period': 'day',
        'offset': 0,
        'from': '2026-10-10T03:00:00.000Z',
        'to': '2026-10-11T03:00:00.000Z',
        'earningCents': 8740,
        'fareCents': 9500,
        'commissionCents': 760,
        'rides': 6,
        'onlineSeconds': 5 * 3600 + 20 * 60,
        'workedSeconds': 2 * 3600 + 5 * 60,
        'acceptanceRate': 92,
        'buckets': [
          {'date': '2026-10-10', 'earningCents': 8740, 'rides': 6},
        ],
        'items': [
          {
            'id': 'r1',
            'code': 'AB12CD',
            'finishedAt': '2026-10-10T15:20:00.000Z',
            'pickupAddress': 'Rua Javari, 1234 - Setor Central',
            'dropoffAddress': 'Rodoviária de Goiatuba - Avenida Brasil',
            'fareCents': 1850,
            'commissionCents': 148,
            'earningCents': 1702,
            'distanceMeters': 4300,
            'durationSeconds': 660,
          },
          {
            'id': 'r2',
            'code': 'QW34ER',
            'finishedAt': '2026-10-10T13:05:00.000Z',
            'pickupAddress': 'Supermercado Bretas - Av. Goiás',
            'dropoffAddress': 'Hospital Municipal de Goiatuba',
            'fareCents': 1200,
            'commissionCents': 96,
            'earningCents': 1104,
            'distanceMeters': 2100,
            'durationSeconds': 420,
          },
        ],
      };
    case '/api/driver/wallet':
      return {
        'balanceCents': 4250,
        'minimumCents': 1000,
        'blocking': false,
        'blockEnabled': true,
        'status': 'ok',
        'central': {'whatsapp': '+5564999991234', 'pixKey': 'pix@fortalezamov.com.br', 'pixHolder': 'Fortaleza Mov'},
        'transactions': [
          {'id': 't1', 'type': 'COMMISSION', 'kind': 'DEBIT', 'amountCents': -148, 'balanceAfterCents': 4250, 'description': 'Taxa da corrida', 'rideCode': 'AB12CD', 'createdAt': '2026-10-10T15:20:00.000Z'},
          {'id': 't2', 'type': 'ADJUSTMENT', 'kind': 'CREDIT', 'amountCents': 5000, 'balanceAfterCents': 4398, 'description': 'Recarga por PIX', 'rideCode': null, 'createdAt': '2026-10-09T10:00:00.000Z'},
        ],
      };
    case '/api/driver/wallet/resumo':
      return {'balanceCents': 4250, 'minimumCents': 1000, 'blockEnabled': true, 'blocking': false, 'last': null};
    case '/api/driver/central':
      return {'whatsapp': '+5564999991234', 'pixKey': 'pix@fortalezamov.com.br', 'pixHolder': 'Fortaleza Mov'};
    case '/api/driver/meus-dados':
      return {
        'dados': {
          'name': 'Evandro Gonçalves',
          'phone': '+5564999990001',
          'email': 'evandro@exemplo.com.br',
          'endereco': 'Rua Javari, 1234 - Setor Central',
          'pixKey': 'evandro@exemplo.com.br',
          'cnhNumber': '01234567890',
          'cnhCategory': 'AB',
          'cnhExpiresAt': '2029-05-10',
        },
        'pendente': _comPedido
            ? {
                'pedidaEm': '2026-10-10T14:00:00.000Z',
                'mudancas': [
                  {'campo': 'phone', 'rotulo': 'Telefone', 'de': '+5564999990001', 'para': '+5564999990002'},
                  {'campo': 'endereco', 'rotulo': 'Endereço', 'de': 'Rua Javari, 1234 - Setor Central', 'para': 'Rua Nova, 10 - Centro'},
                ],
              }
            : null,
        'ultimaRecusa': null,
      };
    case '/api/driver/rides/history':
      return {
        'total': 2,
        'page': 1,
        'pageSize': 30,
        'items': [
          {
            'id': 'r1',
            'code': 'AB12CD',
            'status': 'COMPLETED',
            'pickupAddress': 'Rua Javari, 1234 - Setor Central, Goiatuba - GO',
            'dropoffAddress': 'Rodoviária de Goiatuba - Avenida Brasil',
            'finalFareCents': 1850,
            'estimatedFareCents': 1850,
            'commissionCents': 148,
            'driverEarningCents': 1702,
            'finishedAt': '2026-10-10T15:20:00.000Z',
            'requestedAt': '2026-10-10T15:00:00.000Z',
          },
          {
            'id': 'r2',
            'code': 'ZX90PL',
            'status': 'CANCELLED_BY_PASSENGER',
            'pickupAddress': 'Praça da Matriz, Goiatuba - GO',
            'dropoffAddress': 'Bairro Santa Maria',
            'finalFareCents': null,
            'estimatedFareCents': 1100,
            'commissionCents': 0,
            'driverEarningCents': 0,
            'finishedAt': null,
            'requestedAt': '2026-10-10T12:00:00.000Z',
          },
        ],
        'summary': {'rides': 1, 'totalCents': 1850, 'commissionCents': 148, 'netCents': 1702},
        'performance': {'offers': 8, 'accepted': 7, 'acceptanceRate': 88, 'cancellations': 1, 'ratingAvg': 4.95},
      };
    case '/api/geo/rota':
      return {
        'porRua': true,
        'pontos': [
          [-18.0080, -49.3500],
          [-18.0100, -49.3520],
          [-18.0125, -49.3547],
          [-18.0150, -49.3570],
          [-18.0180, -49.3590],
          [-18.0200, -49.3600],
        ],
      };
    case '/api/legal/terms':
    case '/api/legal/privacy':
      return {
        'version': '2026-10-01',
        'title': caminho.endsWith('terms') ? 'Termos de Uso' : 'Política de Privacidade',
        'content': 'Ao dirigir pela Fortaleza Mov você concorda com estas regras.\n\n1. A taxa da Central é descontada da carteira.\n2. Seus documentos são usados só para conferir o cadastro.',
      };
  }
  if (caminho.endsWith('/messages')) return {'podeEscrever': true, 'items': <Object>[]};
  _semResposta.add('$metodo $caminho');
  return null;
}

MockClient _servidor() => MockClient((http.Request r) async {
      final dados = _resposta(r.method, r.url.path);
      return http.Response(
        jsonEncode(dados == null
            ? {'success': false, 'error': {'code': 'NOT_FOUND', 'message': 'sem resposta de teste'}}
            : {'success': true, 'data': dados}),
        dados == null ? 404 : 200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });

const _oferta = RideOffer(
  id: 'r1',
  code: 'AB12CD',
  passengerName: 'Maria Aparecida dos Santos',
  passengerRating: 4.8,
  pickupAddress: 'Rua Javari, 1234 - Setor Central, Goiatuba - GO',
  pickupCoords: Coords(-18.0125, -49.3547),
  dropoffAddress: 'Rodoviária de Goiatuba - Avenida Brasil, 500',
  dropoffCoords: Coords(-18.0200, -49.3600),
  distanceToPickupMeters: 1200,
  tripDistanceMeters: 4300,
  durationSeconds: 660,
  fareCents: 1850,
  earningCents: 1702,
  paymentMethod: 'Dinheiro',
);

const _perfil = DriverProfile(
  id: 'd1',
  name: 'Evandro Gonçalves',
  phone: '+5564999990001',
  cpf: '12345678909',
  cnhNumber: '01234567890',
  cnhCategory: 'AB',
  cnhExpiresAt: '2029-05-10',
  approval: DriverApproval.approved,
  isOnline: true,
  rating: 4.95,
  totalRides: 312,
  acceptanceRate: 92,
  termsAccepted: true,
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

Future<DriverState> _abrir(
  WidgetTester tester,
  Widget tela, {
  DriverProfile? perfil = _perfil,
  RidePhase? fase,
  Map<String, dynamic>? resumo,
  FutureOr<void> Function(DriverState d)? antes,
}) async {
  await tester.runAsync(_fontes);
  debugDisableShadows = false;
  tester.view.physicalSize = const Size(1080, 2340);
  tester.view.devicePixelRatio = 3;
  tester.view.padding = const FakeViewPadding(top: 72, bottom: 144);
  tester.view.viewPadding = const FakeViewPadding(top: 72, bottom: 144);
  addTearDown(tester.view.reset);
  final d = DriverState(client: ApiClient(client: _servidor()))
    ..profile = perfil
    ..ready = true
    ..position = const Coords(-18.0080, -49.3500)
    ..posicaoReal = true
    ..permissoesOk = true
    ..vehicle = const VehicleInfo(brand: 'Chevrolet', model: 'Onix Plus', year: 2022, color: 'Prata', plate: 'ABC1D23');
  if (fase != null) {
    d.activeRide = DriverRide(offer: _oferta, phase: fase, pin: '4821', startedAt: '2026-10-10T15:00:00.000Z');
    d.telefonePassageiro = '+5564999990000';
    d.resumoFinal = resumo;
  }
  await tester.runAsync(() async => antes?.call(d));
  await tester.pumpWidget(
    _celular(
      ChangeNotifierProvider<DriverState>.value(
        value: d,
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
  return d;
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

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({'ride.accessToken': 'token-de-teste'});
    mostrarRuasNoMapa = false;
    _comPedido = false;
  });

  tearDownAll(() {
    if (_semResposta.isNotEmpty) {
      // ignore: avoid_print
      print('SEM RESPOSTA DE TESTE: ${_semResposta.join(', ')}');
    }
  });

  testWidgets('01 entrada, telefone e e-mail', skip: !_fotos, (tester) async {
    await _abrir(tester, const WelcomeScreen(), perfil: null);
    await _foto(tester, '01-entrada');
    await _fim(tester);
    await _abrir(tester, const PhoneScreen(), perfil: null);
    await _foto(tester, '02-telefone');
    await _fim(tester);
    await _abrir(tester, const EmailScreen(), perfil: null);
    await _foto(tester, '03-email');
    await _fim(tester);
  });

  testWidgets('04 termos, cadastro e em analise', skip: !_fotos, (tester) async {
    const novo = DriverProfile(id: 'd1', name: 'Evandro Gonçalves', phone: '+5564999990001');
    await _abrir(tester, const TermsScreen(), perfil: novo);
    await _foto(tester, '04-termos');
    await _fim(tester);
    await _abrir(tester, const OnboardingScreen(), perfil: novo.copyWith(termsAccepted: true));
    await _foto(tester, '05-cadastro');
    await _fim(tester);
    await _abrir(tester, const PendingScreen(),
        perfil: _perfil.copyWith(approval: DriverApproval.pending, isOnline: false));
    await _foto(tester, '06-em-analise');
    await _fim(tester);
  });

  testWidgets('07 inicio desconectado e conectado', skip: !_fotos, (tester) async {
    await _abrir(tester, const HomeScreen(), perfil: _perfil.copyWith(isOnline: false));
    await _foto(tester, '07-inicio-desconectado');
    await _fim(tester);
    await _abrir(tester, const HomeScreen());
    await _foto(tester, '08-inicio-conectado');
    await _fim(tester);
  });

  testWidgets('09 chamado', skip: !_fotos, (tester) async {
    await _abrir(tester, const OfferScreen(), antes: (d) {
      d.offer = _oferta;
      d.offerSecondsLeft = 14;
    });
    await _foto(tester, '09-chamado');
    await _fim(tester);
  });

  testWidgets('10 corrida: a caminho, esperando, viagem e fim', skip: !_fotos, (tester) async {
    await _abrir(tester, const RideScreen(), fase: RidePhase.toPickup);
    await _foto(tester, '10-corrida-a-caminho');
    await _fim(tester);

    await _abrir(tester, const RideScreen(), fase: RidePhase.waitingPassenger,
        antes: (d) => d.chegouEm = DateTime.now().subtract(const Duration(minutes: 2, seconds: 5)));
    await _foto(tester, '11-corrida-esperando');
    await _fim(tester);

    await _abrir(tester, const RideScreen(), fase: RidePhase.inProgress,
        antes: (d) => d.viagemIniciouEm = DateTime.now().subtract(const Duration(minutes: 4)));
    await _foto(tester, '12-corrida-em-viagem');
    await _fim(tester);

    await _abrir(tester, const RideScreen(), fase: RidePhase.completed, resumo: {
      'finalFareCents': 1850,
      'discountCents': 300,
      'toCollectCents': 1550,
      'commissionCents': 148,
      'driverEarningCents': 1702,
    });
    await _foto(tester, '13-corrida-fim');
    await tester.drag(find.byType(Scrollable).last, const Offset(0, -700));
    await _carregar(tester);
    await _foto(tester, '14-corrida-fim-avaliar');
    await _fim(tester);

    await _abrir(tester, const RideScreen(), fase: RidePhase.toPickup,
        antes: (d) => d.vehicle = const VehicleInfo(brand: 'Honda', model: 'CG 160', year: 2023, color: 'Vermelha', plate: 'MOT0A12', category: 'MOTO'));
    await _foto(tester, '15-moto-a-caminho');
    await _fim(tester);
  });

  testWidgets('16 menu, atividades, carteira e historico', skip: !_fotos, (tester) async {
    final telas = <String, Widget>{
      '16-menu': const MenuScreen(),
      '17-atividades': const ActivityScreen(),
      '18-carteira': const WalletScreen(),
      '19-historico': const RidesHistoryScreen(),
      '20-corrida-manual': const CorridaManualScreen(),
      '21-perfil': const PerfilScreen(),
      '22-veiculos': const VehiclesScreen(),
      '23-sos': const SosScreen(),
    };
    for (final t in telas.entries) {
      await _abrir(tester, t.value);
      await _foto(tester, t.key);
      await _fim(tester);
    }
  });

  testWidgets('24 meus dados', skip: !_fotos, (tester) async {
    await _abrir(tester, const MeusDadosScreen());
    await _foto(tester, '24-meus-dados');
    await tester.drag(find.byType(Scrollable).first, const Offset(0, -900));
    await _carregar(tester);
    await _foto(tester, '25-meus-dados-fim');
    await _fim(tester);
    _comPedido = true;
    await _abrir(tester, const MeusDadosScreen());
    await _foto(tester, '26-meus-dados-pedido');
    await _fim(tester);
  });
}
