// Telas novas do passageiro (04/10/2026) num celular de 360 x 780, com
// respostas no MESMO formato do servidor real: motorista a caminho no
// modelo Pop Move, chat, cupons e motoristas favoritos/bloqueados.

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
import 'package:mobile_passenger/screens/chat_screen.dart';
import 'package:mobile_passenger/screens/cupons_screen.dart';
import 'package:mobile_passenger/screens/motoristas_salvos_screen.dart';
import 'package:mobile_passenger/screens/ride_screen.dart';
import 'package:mobile_passenger/screens/searching_screen.dart';
import 'package:mobile_passenger/state/config_state.dart';
import 'package:mobile_passenger/state/ride_state.dart';
import 'package:mobile_passenger/widgets/ride_map.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Pedidos que o app fez ao "servidor" (metodo e caminho).
final List<String> pedidos = [];

Object? _resposta(String metodo, String caminho, Map<String, dynamic>? corpo) {
  if (caminho.endsWith('/messages') && metodo == 'GET') {
    return {
      'podeEscrever': true,
      'items': [
        {'id': 'm1', 'minha': true, 'autor': 'PASSENGER', 'texto': 'Estou no portão azul', 'criadaEm': '2026-10-04T12:00:00.000Z', 'lida': true},
        {'id': 'm2', 'minha': false, 'autor': 'DRIVER', 'texto': 'Chego em 2 minutos', 'criadaEm': '2026-10-04T12:01:00.000Z', 'lida': true},
      ],
    };
  }
  if (caminho.endsWith('/messages') && metodo == 'POST') {
    return {'id': 'm3', 'minha': true, 'autor': 'PASSENGER', 'texto': corpo?['texto'], 'criadaEm': '2026-10-04T12:02:00.000Z', 'lida': false};
  }
  if (caminho == '/api/rides/coupons') {
    return [
      {
        'code': 'PRIMEIRACORRIDA',
        'description': 'Desconto na primeira corrida',
        'discountType': 'FIXED',
        'discountValue': 300,
        'maxDiscountCents': null,
        'minFareCents': 1000,
        'expiresAt': '2026-12-31T23:59:00.000Z',
      },
    ];
  }
  if (caminho == '/api/rides/favoritos') {
    return {
      'items': [
        {'driverId': 'd2', 'name': 'Maria Souza', 'rating': '4.90', 'totalRides': 120, 'vehicle': 'Fiat Argo', 'color': 'Prata', 'plate': 'ABC1D23', 'online': true},
      ],
    };
  }
  if (caminho.startsWith('/api/rides/bloqueados')) {
    if (metodo == 'GET') {
      return {
        'items': [
          {'driverId': 'd3', 'name': 'Carlos Lima', 'vehicle': 'VW Gol', 'plate': 'XYZ9K88'},
        ],
      };
    }
    return {'items': <Object>[]};
  }
  return <String, dynamic>{};
}

MockClient _servidor() => MockClient((http.Request r) async {
      pedidos.add('${r.method} ${r.url.path}');
      final corpo = r.body.isEmpty ? null : jsonDecode(r.body) as Map<String, dynamic>?;
      return http.Response(
        jsonEncode({'success': true, 'data': _resposta(r.method, r.url.path, corpo)}),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });

Ride _corrida(String status) => Ride.fromServer({
      'id': '11111111-1111-1111-1111-111111111111',
      'code': 'AB12CD',
      'status': status,
      'pickupAddress': 'Rua Javari, 1234 - Setor Central, Goiatuba',
      'pickupLat': '-18.0125',
      'pickupLng': '-49.3547',
      'dropoffAddress': 'Rodoviária de Goiatuba',
      'dropoffLat': '-18.0050',
      'dropoffLng': '-49.3610',
      'estimatedFareCents': 1850,
      'paymentMethodType': 'CASH',
      'pin': '4821',
      'mensagensNaoLidas': 2,
      'favorito': false,
      'bloqueado': false,
      'driverPosition': {'latitude': -18.0040, 'longitude': -49.3500, 'updatedAt': '2026-10-04T12:00:00.000Z'},
      'driver': {
        'id': '22222222-2222-2222-2222-222222222222',
        'ratingAvg': '5.00',
        'totalRides': 6804,
        'fotoCarroUrl': null,
        'user': {'name': 'José Santos', 'phone': '+5564999990000', 'avatarUrl': null},
      },
      'vehicle': {'brand': 'Chevrolet', 'model': 'Prisma', 'color': 'Branco', 'plate': 'OBL3A45'},
    });

Future<RideState> _abrir(WidgetTester tester, Widget tela, {Ride? corrida}) async {
  tester.view.physicalSize = const Size(360, 780);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final estado = RideState(repository: RideRepository(client: ApiClient(client: _servidor())));
  estado.activeRide = corrida;
  await tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<RideState>.value(value: estado),
        ChangeNotifierProvider<ConfigState>(create: (_) => ConfigState(client: ApiClient(client: _servidor()))),
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
  await tester.pumpAndSettle();
  return estado;
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({'ride.accessToken': 'token-de-teste'});
    mostrarRuasNoMapa = false;
    pedidos.clear();
  });

  testWidgets('Motorista a caminho: tempo, chat, fotos, nota, viagens, carro, placa e Cancelar', (tester) async {
    await _abrir(tester, const SearchingScreen(), corrida: _corrida('DRIVER_ARRIVING'));
    expect(find.text('Tempo até você'), findsOneWidget);
    expect(find.textContaining(' min · '), findsOneWidget);
    expect(find.text('chat'), findsOneWidget);
    expect(find.text('2'), findsOneWidget); // mensagens novas
    expect(find.text('José Santos'), findsOneWidget);
    expect(find.text('5,0'), findsOneWidget);
    expect(find.text('6804 viagens'), findsOneWidget);
    expect(find.text('Bloquear'), findsOneWidget);
    expect(find.text('Favoritar'), findsOneWidget);
    expect(find.text('Ligar'), findsOneWidget);
    expect(find.text('CHEVROLET PRISMA'), findsOneWidget);
    expect(find.text('BRANCO'), findsOneWidget);
    expect(find.text('OBL3A45'), findsOneWidget);
    expect(find.text('4821'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Cancelar'), 200, scrollable: find.byType(Scrollable).last);
    expect(find.text('Cancelar'), findsOneWidget);
  });

  testWidgets('Bloquear pede confirmacao e avisa o servidor', (tester) async {
    final estado = await _abrir(tester, const SearchingScreen(), corrida: _corrida('DRIVER_ARRIVING'));
    await tester.tap(find.text('Bloquear'));
    await tester.pumpAndSettle();
    expect(find.text('Bloquear José?'), findsOneWidget);
    await tester.tap(find.widgetWithText(TextButton, 'Bloquear'));
    await tester.pumpAndSettle();
    expect(pedidos, contains('POST /api/rides/bloqueados/22222222-2222-2222-2222-222222222222'));
    expect(estado.activeRide!.bloqueado, isTrue);
    expect(find.text('Desbloquear'), findsOneWidget);
  });

  testWidgets('Favoritar avisa o servidor e o coracao fica marcado', (tester) async {
    final estado = await _abrir(tester, const SearchingScreen(), corrida: _corrida('DRIVER_ARRIVING'));
    await tester.tap(find.text('Favoritar'));
    await tester.pumpAndSettle();
    expect(pedidos, contains('POST /api/rides/favoritos/22222222-2222-2222-2222-222222222222'));
    expect(estado.activeRide!.favorito, isTrue);
    expect(find.text('Favorito'), findsOneWidget);
  });

  testWidgets('Motorista chegou: faixa verde', (tester) async {
    await _abrir(tester, const SearchingScreen(), corrida: _corrida('DRIVER_WAITING'));
    expect(find.text('O motorista chegou'), findsOneWidget);
    expect(find.text('Ele está te esperando'), findsOneWidget);
  });

  testWidgets('Em viagem: painel do motorista e chat continuam', (tester) async {
    await _abrir(tester, const RideScreen(), corrida: _corrida('IN_PROGRESS'));
    expect(find.text('Em viagem'), findsOneWidget);
    expect(find.text('Até o destino'), findsOneWidget);
    expect(find.text('chat'), findsOneWidget);
    expect(find.text('OBL3A45'), findsOneWidget);
  });

  testWidgets('Chat: conversa, mensagem lida e resposta pronta', (tester) async {
    final api = ApiClient(client: _servidor());
    tester.view.physicalSize = const Size(360, 780);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(
      home: ChatScreen(
        api: api,
        caminho: '/rides/r1/messages',
        titulo: 'Conversa com José',
        atalhos: const ['Já estou indo', 'Estou no local de embarque'],
      ),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('Conversa com José'), findsOneWidget);
    expect(find.text('Estou no portão azul'), findsOneWidget);
    expect(find.text('Chego em 2 minutos'), findsOneWidget);
    expect(find.textContaining('lida'), findsOneWidget);
    await tester.tap(find.text('Já estou indo'));
    await tester.pump(const Duration(milliseconds: 100));
    expect(pedidos, contains('POST /api/rides/r1/messages'));
    // Para o relogio de 3 s da conversa.
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('Cupons: lista, desconto, minimo e usar na proxima corrida', (tester) async {
    final estado = await _abrir(tester, const CuponsScreen());
    expect(find.text('PRIMEIRACORRIDA'), findsOneWidget);
    expect(find.textContaining('3,00 de desconto'), findsOneWidget);
    expect(find.textContaining('a partir de'), findsOneWidget);
    expect(find.text('Válido até 31/12/2026'), findsOneWidget);
    await tester.tap(find.text('Usar na próxima corrida'));
    await tester.pumpAndSettle();
    expect(estado.cupomCodigo, 'PRIMEIRACORRIDA');
  });

  testWidgets('Conta: motoristas favoritos e bloqueados', (tester) async {
    await _abrir(tester, const MotoristasSalvosScreen());
    expect(find.text('Maria Souza'), findsOneWidget);
    expect(find.text('Carlos Lima'), findsOneWidget);
    await tester.tap(find.text('Desbloquear'));
    await tester.pumpAndSettle();
    expect(pedidos, contains('DELETE /api/rides/bloqueados/d3'));
  });
}
