// Telas do passageiro feitas em 08/10/2026, num celular de 360 x 780 e com
// respostas no MESMO formato do servidor real: agendar corrida (calendario
// ao lado de "Buscar destino" e Conta > Corridas agendadas), SOS, contatos
// de emergencia e foto de perfil na Conta.

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_passenger/core/api/api_client.dart';
import 'package:mobile_passenger/core/avisos.dart';
import 'package:mobile_passenger/data/models/models.dart';
import 'package:mobile_passenger/data/repositories/ride_repository.dart';
import 'package:mobile_passenger/screens/account_screen.dart';
import 'package:mobile_passenger/screens/agendadas_screen.dart';
import 'package:mobile_passenger/screens/contatos_emergencia_screen.dart';
import 'package:mobile_passenger/screens/home_screen.dart';
import 'package:mobile_passenger/screens/searching_screen.dart';
import 'package:mobile_passenger/screens/sos_screen.dart';
import 'package:mobile_passenger/state/app_state.dart';
import 'package:mobile_passenger/state/auth_state.dart';
import 'package:mobile_passenger/state/config_state.dart';
import 'package:mobile_passenger/state/ride_state.dart';
import 'package:mobile_passenger/widgets/ride_map.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Pedidos que o app fez ao "servidor": "METODO /caminho corpo".
final List<String> pedidos = [];

/// Contatos guardados no "servidor" de teste.
List<Map<String, dynamic>> contatosNoServidor = [];

final agendada = <String, dynamic>{
  'id': '33333333-3333-3333-3333-333333333333',
  'code': 'AG12CD',
  'status': 'SCHEDULED',
  'scheduledFor': DateTime.now().add(const Duration(days: 2)).toUtc().toIso8601String(),
  'pickupAddress': 'Rua Javari, 1234 - Setor Central, Goiatuba',
  'pickupLat': '-18.0125',
  'pickupLng': '-49.3547',
  'dropoffAddress': 'Rodoviária de Goiatuba',
  'dropoffLat': '-18.0050',
  'dropoffLng': '-49.3610',
  'estimatedFareCents': 2350,
  'paymentMethodType': 'PIX',
};

Object? _resposta(String metodo, String caminho, Map<String, dynamic>? corpo) {
  if (caminho == '/api/safety/sos') return {'id': '44444444-4444-4444-4444-444444444444', 'resolved': false};
  if (caminho == '/api/users/me/contatos-emergencia') {
    if (metodo == 'PUT') {
      contatosNoServidor = [
        for (final c in (corpo?['contatos'] as List? ?? const []))
          {'nome': (c as Map)['nome'], 'telefone': '+55${c['telefone']}'},
      ];
    }
    return {'items': contatosNoServidor};
  }
  if (caminho == '/api/rides/scheduled') return {'items': [agendada]};
  if (caminho.endsWith('/cancel')) return {'status': 'CANCELLED_BY_PASSENGER', 'cancellationFeeCents': 0};
  return <String, dynamic>{};
}

MockClient _servidor() => MockClient((http.Request r) async {
      pedidos.add('${r.method} ${r.url.path} ${r.body}');
      final corpo = r.body.isEmpty ? null : jsonDecode(r.body) as Map<String, dynamic>?;
      return http.Response(
        jsonEncode({'success': true, 'data': _resposta(r.method, r.url.path, corpo)}),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });

Ride _aCaminho() => Ride.fromServer({
      'id': '11111111-1111-1111-1111-111111111111',
      'code': 'AB12CD',
      'status': 'DRIVER_ARRIVING',
      'pickupAddress': 'Rua Javari, 1234 - Setor Central, Goiatuba',
      'pickupLat': '-18.0125',
      'pickupLng': '-49.3547',
      'dropoffAddress': 'Rodoviária de Goiatuba',
      'dropoffLat': '-18.0050',
      'dropoffLng': '-49.3610',
      'estimatedFareCents': 1850,
      'paymentMethodType': 'CASH',
      'pin': '4821',
      'driverPosition': {'latitude': -18.0040, 'longitude': -49.3500, 'updatedAt': '2026-10-08T12:00:00.000Z'},
      'driver': {
        'id': '22222222-2222-2222-2222-222222222222',
        'ratingAvg': '5.00',
        'totalRides': 120,
        'user': {'name': 'José Santos', 'phone': '+5564999990000', 'avatarUrl': null},
      },
      'vehicle': {'brand': 'Chevrolet', 'model': 'Prisma', 'color': 'Branco', 'plate': 'OBL3A45'},
    });

/// Abre a tela com os mesmos "estados" do aplicativo de verdade.
Future<(RideState, AuthState)> _abrir(WidgetTester tester, Widget tela, {Ride? corrida, UserProfile? usuario}) async {
  tester.view.physicalSize = const Size(360, 780);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final api = ApiClient(client: _servidor());
  final ride = RideState(repository: RideRepository(client: api));
  ride.activeRide = corrida;
  final auth = AuthState(client: api);
  auth.user = usuario;
  await tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<AppState>(create: (_) => AppState(client: api)),
        ChangeNotifierProvider<AuthState>.value(value: auth),
        ChangeNotifierProvider<RideState>.value(value: ride),
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
  await tester.pump(const Duration(milliseconds: 300));
  return (ride, auth);
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({'ride.accessToken': 'token-de-teste'});
    mostrarRuasNoMapa = false;
    pedidos.clear();
    contatosNoServidor = [
      {'nome': 'Maria (irmã)', 'telefone': '+5564999991234'},
    ];
  });

  group('Horario da corrida agendada', () {
    final agora = DateTime(2026, 10, 8, 10, 0); // quinta-feira

    test('de 30 minutos a 7 dias a frente', () {
      expect(RideState.horarioInvalido(agora.add(const Duration(minutes: 10)), agora), isNotNull);
      expect(RideState.horarioInvalido(agora.add(const Duration(minutes: 45)), agora), isNull);
      expect(RideState.horarioInvalido(agora.add(const Duration(days: 6)), agora), isNull);
      expect(RideState.horarioInvalido(agora.add(const Duration(days: 8)), agora), isNotNull);
    });

    test('texto do horario: hoje, amanha e dia da semana', () {
      expect(horarioAgendado(DateTime(2026, 10, 8, 14, 30), agora), 'hoje às 14:30');
      expect(horarioAgendado(DateTime(2026, 10, 9, 7, 5), agora), 'amanhã às 07:05');
      expect(horarioAgendado(DateTime(2026, 10, 10, 20, 0), agora), 'sáb, 10/10 às 20:00');
    });
  });

  testWidgets('Inicio: calendario ao lado de Buscar destino e faixa do horario escolhido', (tester) async {
    final (ride, _) = await _abrir(tester, const HomeScreen());
    expect(find.byTooltip('Agendar corrida'), findsOneWidget);
    expect(find.text('Buscar destino'), findsOneWidget);
    ride.escolherHorario(DateTime.now().add(const Duration(days: 1)));
    await tester.pump();
    expect(find.textContaining('Agendar para amanhã às'), findsOneWidget);
    await tester.tap(find.byTooltip('Chamar agora'));
    await tester.pump();
    expect(ride.agendarPara, isNull);
    expect(find.textContaining('Agendar para'), findsNothing);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('Inicio: calendario abre o dia e depois a hora', (tester) async {
    await _abrir(tester, const HomeScreen());
    await tester.tap(find.byTooltip('Agendar corrida'));
    await tester.pumpAndSettle();
    expect(find.text('Dia da corrida'), findsOneWidget);
    await tester.tap(find.text('Próximo'));
    await tester.pumpAndSettle();
    expect(find.text('Horário da corrida'), findsOneWidget);
    await tester.tap(find.text('Cancelar'));
    await tester.pumpAndSettle();
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('Corridas agendadas: horario, endereco, valor e cancelar sem multa', (tester) async {
    final (ride, _) = await _abrir(tester, const AgendadasScreen());
    await tester.pumpAndSettle();
    expect(find.textContaining(' às '), findsOneWidget);
    expect(find.text('Rodoviária de Goiatuba'), findsOneWidget);
    expect(find.textContaining('23,50'), findsOneWidget);
    await tester.tap(find.text('Cancelar agendamento'));
    await tester.pumpAndSettle();
    expect(find.text('Cancelar o agendamento?'), findsOneWidget);
    await tester.tap(find.widgetWithText(TextButton, 'Cancelar agendamento').last);
    await tester.pumpAndSettle();
    expect(pedidos.any((p) => p.startsWith('POST /api/rides/33333333-3333-3333-3333-333333333333/cancel')), isTrue);
    expect(ride.agendadas, isEmpty);
    expect(find.textContaining('Nenhuma corrida agendada'), findsOneWidget);
  });

  testWidgets('Motorista a caminho: botao SOS no alto do mapa', (tester) async {
    await _abrir(tester, const SearchingScreen(), corrida: _aCaminho());
    expect(find.text('SOS'), findsOneWidget);
    expect(tester.getTopLeft(find.text('SOS')).dy, lessThan(120));
    await tester.tap(find.text('SOS'));
    await tester.pumpAndSettle();
    expect(find.text('Segurança'), findsOneWidget);
  });

  testWidgets('SOS: panico manda a posicao e a corrida; avisar contatos; 190 e 192', (tester) async {
    final (ride, _) = await _abrir(tester, const SosScreen(), corrida: _aCaminho());
    await tester.pumpAndSettle();
    expect(find.text('PÂNICO'), findsOneWidget);
    expect(find.text('190 Polícia'), findsOneWidget);
    expect(find.text('192 SAMU'), findsOneWidget);
    expect(find.text('Maria (irmã)'), findsOneWidget);
    expect(find.text('(64) 99999-1234'), findsOneWidget);
    expect(find.text('Avisar'), findsOneWidget);
    await tester.tap(find.text('PÂNICO'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    final sos = pedidos.firstWhere((p) => p.startsWith('POST /api/safety/sos'));
    expect(sos, contains('"rideId":"11111111-1111-1111-1111-111111111111"'));
    expect(sos, contains('"latitude"'));
    expect(ride.sosId, isNotNull);
    expect(find.text('ENVIAR DE NOVO'), findsOneWidget);
    expect(find.text('SOS ativo'), findsNothing); // botao do mapa fica na outra tela
    await tester.tap(find.text('Parar de enviar minha localização'));
    await tester.pump();
    expect(ride.sosId, isNull);
  });

  testWidgets('SOS sem contatos: botao para cadastrar', (tester) async {
    contatosNoServidor = [];
    await _abrir(tester, const SosScreen(), corrida: _aCaminho());
    await tester.pumpAndSettle();
    expect(find.text('Cadastrar contatos de emergência'), findsOneWidget);
  });

  testWidgets('Contatos de emergencia: mostra, adiciona e salva', (tester) async {
    await _abrir(tester, const ContatosEmergenciaScreen());
    await tester.pumpAndSettle();
    expect(find.text('Maria (irmã)'), findsOneWidget);
    expect(find.text('(64) 99999-1234'), findsOneWidget);
    await tester.tap(find.text('Adicionar contato'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).at(2), 'João');
    await tester.enterText(find.byType(TextField).at(3), '64988887777');
    expect(find.text('(64) 98888-7777'), findsOneWidget);
    await tester.ensureVisible(find.text('Salvar contatos'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Salvar contatos'));
    await tester.pumpAndSettle();
    final put = pedidos.firstWhere((p) => p.startsWith('PUT /api/users/me/contatos-emergencia'));
    expect(put, contains('"telefone":"64999991234"'));
    expect(put, contains('"nome":"João","telefone":"64988887777"'));
  });

  testWidgets('Contatos de emergencia: telefone incompleto nao salva', (tester) async {
    await _abrir(tester, const ContatosEmergenciaScreen());
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).at(1), '6499');
    await tester.tap(find.text('Salvar contatos'));
    await tester.pumpAndSettle();
    expect(pedidos.where((p) => p.startsWith('PUT')), isEmpty);
    expect(find.textContaining('incompleto'), findsOneWidget);
  });

  testWidgets('Conta: foto com lapis, agendadas e contatos de emergencia', (tester) async {
    await _abrir(
      tester,
      const AccountScreen(),
      usuario: const UserProfile(id: 'u1', name: 'Evandro da Silva', phone: '+5564992686632', termsAccepted: true),
    );
    expect(find.text('Evandro da Silva'), findsOneWidget);
    expect(find.byTooltip('Trocar foto'), findsOneWidget);
    expect(find.text('Corridas agendadas'), findsOneWidget);
    expect(find.text('Contatos de emergência'), findsOneWidget);
    expect(find.text('Cupons'), findsOneWidget);
    await tester.tap(find.byTooltip('Trocar foto'));
    await tester.pumpAndSettle();
    expect(find.text('Foto de perfil'), findsOneWidget);
    expect(find.text('Tirar foto agora'), findsOneWidget);
    expect(find.text('Escolher da galeria'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });
}
