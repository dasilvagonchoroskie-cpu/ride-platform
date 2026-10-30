// Etapa 5 (30/10/2026): entrega de encomenda pelo app do cliente.

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_passenger/core/api/api_client.dart';
import 'package:mobile_passenger/core/avisos.dart';
import 'package:mobile_passenger/core/utils/geo.dart';
import 'package:mobile_passenger/data/models/models.dart';
import 'package:mobile_passenger/data/repositories/ride_repository.dart';
import 'package:mobile_passenger/screens/entrega_screen.dart';
import 'package:mobile_passenger/state/app_state.dart';
import 'package:mobile_passenger/state/ride_state.dart';
import 'package:mobile_passenger/widgets/entrega_ui.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _aqui = Coords(-18.0125, -49.3547);

class _Servidor {
  bool ligada = true;
  final pedidos = <String>[];
  Map<String, dynamic>? corpoDoPedido;

  MockClient cliente() => MockClient((r) async {
        final p = r.url.path;
        pedidos.add('${r.method} $p');
        Object? dados = <String, dynamic>{};
        if (p == '/api/entregas/disponivel') {
          dados = {'ligada': ligada, 'veiculos': 'TODOS', 'cidade': 'Goiatuba'};
        } else if (p == '/api/geo/reverse') {
          dados = {'address': 'Rua Javari, 1234', 'detail': 'Centro, Goiatuba', 'latitude': _aqui.latitude, 'longitude': _aqui.longitude};
        } else if (p == '/api/rides/estimate') {
          final corpo = jsonDecode(r.body) as Map<String, dynamic>;
          dados = {
            'flag': 'DIURNA',
            'estimatedFareCents': corpo['category'] == 'ENTREGA' ? 1200 : 1500,
            'totalToPayCents': 1200,
            'category': corpo['category'],
            'distanceMeters': 1400,
            'durationSeconds': 300,
            'cobranca': 'FECHADO',
            'entrega': true,
            'pontos': [
              [-18.0125, -49.3547],
              [-18.0080, -49.3580],
              [-18.0050, -49.3610],
            ],
          };
        } else if (p == '/api/rides' && r.method == 'POST') {
          corpoDoPedido = jsonDecode(r.body) as Map<String, dynamic>;
          dados = {
            'ride': {
              'id': '11111111-1111-1111-1111-111111111111',
              'code': 'ENT001',
              'status': 'SEARCHING',
              'category': 'ENTREGA',
              'pickupAddress': 'Rua Javari, 1234',
              'pickupLat': '-18.0125',
              'pickupLng': '-49.3547',
              'dropoffAddress': 'Rodoviária',
              'dropoffLat': '-18.0050',
              'dropoffLng': '-49.3610',
              'estimatedFareCents': 1200,
              'paymentMethodType': 'CASH',
              'pin': '1111',
              'entrega': {'descricao': 'Envelope', 'destinatarioNome': 'Ana', 'destinatarioTelefone': '5564999991234', 'codigo': '4821'},
            },
          };
        }
        return http.Response(jsonEncode({'success': true, 'data': dados}), 200,
            headers: {'content-type': 'application/json; charset=utf-8'});
      });
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({'ride.accessToken': 'token-de-teste'}));

  test('Botao Entrega so aparece onde a Central ligou', () async {
    final s = _Servidor()..ligada = false;
    final r = RideState(repository: RideRepository(client: ApiClient(client: s.cliente()), demo: false));
    await r.conferirEntrega(_aqui, forcar: true);
    expect(r.entregaAqui, isFalse);
    s.ligada = true;
    await r.conferirEntrega(_aqui, forcar: true);
    expect(r.entregaAqui, isTrue);
    // Sem forcar, pergunta no maximo a cada 5 minutos.
    final antes = s.pedidos.length;
    await r.conferirEntrega(_aqui);
    expect(s.pedidos.length, antes);
  });

  testWidgets('Entrega: preenche, ve o preco e pede (vai como ENTREGA com quem recebe)', (tester) async {
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final s = _Servidor();
    final app = AppState(client: ApiClient(client: s.cliente()))..coords = _aqui;
    final corridas = RideState(repository: RideRepository(client: ApiClient(client: s.cliente()), demo: false));
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<AppState>.value(value: app),
          ChangeNotifierProvider<RideState>.value(value: corridas),
        ],
        child: MaterialApp(
          scaffoldMessengerKey: avisos,
          locale: const Locale('pt', 'BR'),
          supportedLocales: const [Locale('pt', 'BR')],
          localizationsDelegates: GlobalMaterialLocalizations.delegates,
          home: const EntregaScreen(),
        ),
      ),
    );
    for (var i = 0; i < 4; i++) {
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(find.textContaining('Rua Javari, 1234'), findsOneWidget, reason: 'coleta comeca onde o cliente esta');

    // Sem o endereco de entrega: avisa o que falta.
    await tester.ensureVisible(find.text('Ver o preço'));
    await tester.tap(find.text('Ver o preço'));
    await tester.pump();
    expect(find.text('Escolha o endereço de entrega.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Cartao da entrega: codigo e botao do WhatsApp; entregue some o codigo', (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(
        body: CartaoDaEntrega(
          entrega: EntregaDaCorrida(descricao: 'Envelope', destinatarioNome: 'Ana', destinatarioTelefone: '5564999991234', codigo: '4821'),
        ),
      ),
    ));
    expect(find.text('4821'), findsOneWidget);
    expect(find.text('Mandar o código pelo WhatsApp'), findsOneWidget);
    expect(find.text('Quem recebe: Ana'), findsOneWidget);
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(
        body: CartaoDaEntrega(
          entrega: EntregaDaCorrida(
            descricao: 'Envelope',
            destinatarioNome: 'Ana',
            destinatarioTelefone: '5564999991234',
            codigo: '4821',
            entregueEm: '2026-10-30T13:00:00.000Z',
          ),
        ),
      ),
    ));
    expect(find.text('4821'), findsNothing);
    expect(find.text('Entregue.'), findsOneWidget);
  });

  test('Pedido de entrega vai com categoria ENTREGA e os dados de quem recebe', () async {
    final s = _Servidor();
    final r = RideState(repository: RideRepository(client: ApiClient(client: s.cliente()), demo: false));
    final q = await r.estimarEntrega(_aqui, const Coords(-18.0050, -49.3610), coletaEndereco: 'Rua Javari, 1234', entregaEndereco: 'Rodoviária');
    expect(q?.priceCents, 1200);
    expect(r.rotaPrevia.length, 3);
    final ride = await r.requestRide(
      origin: _aqui,
      destination: const Coords(-18.0050, -49.3610),
      pickupAddress: 'Rua Javari, 1234',
      dropoffAddress: 'Rodoviária',
      paymentMethod: 'Dinheiro',
      entrega: {'descricao': 'Envelope', 'destinatarioNome': 'Ana', 'destinatarioTelefone': '64999991234'},
    );
    expect(s.corpoDoPedido?['category'], 'ENTREGA');
    expect(s.corpoDoPedido?['entrega'], {'descricao': 'Envelope', 'destinatarioNome': 'Ana', 'destinatarioTelefone': '64999991234'});
    expect(ride.ehEntrega, isTrue);
    expect(ride.entrega?.codigo, '4821');
    await r.limpar();
  });
}
