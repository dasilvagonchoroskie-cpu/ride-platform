// Mototaxi (Evandro, 10/10/2026): com Carro e Moto ativos na Central, o
// passageiro escolhe na "Confirmar viagem", vendo o preco de cada um, e o
// pedido vai com a categoria escolhida.

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_passenger/core/api/api_client.dart';
import 'package:mobile_passenger/core/utils/geo.dart';
import 'package:mobile_passenger/data/repositories/ride_repository.dart';
import 'package:mobile_passenger/screens/confirm_screen.dart';
import 'package:mobile_passenger/state/app_state.dart';
import 'package:mobile_passenger/state/ride_state.dart';
import 'package:mobile_passenger/widgets/ride_map.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _goiatuba = Coords(-18.0125, -49.3547);
const _destino = Coords(-18.0010, -49.3600);

Map<String, dynamic> _orcamento(String categoria) {
  final moto = categoria == 'MOTO';
  return {
    'flag': 'DIURNA',
    'estimatedFareCents': moto ? 1200 : 1800,
    'discountCents': 0,
    'totalToPayCents': moto ? 1200 : 1800,
    'category': categoria,
    'moto': moto,
    'baseFareCents': moto ? 700 : 1000,
    'distanceCents': moto ? 500 : 800,
    'distanceMeters': 2400,
    'durationSeconds': 420,
    'chargedDistanceMeters': 900,
    'minFareApplied': false,
    'cobranca': 'TAXIMETRO',
    'opcoes': [
      {'category': 'CARRO', 'nome': 'Carro', 'moto': false, 'estimatedFareCents': 1800, 'totalToPayCents': 1800},
      {'category': 'MOTO', 'nome': 'Moto', 'moto': true, 'estimatedFareCents': 1200, 'totalToPayCents': 1200},
    ],
  };
}

void main() {
  setUp(() => mostrarRuasNoMapa = false);

  testWidgets('Confirmar viagem: escolhe Moto e o preco e o pedido mudam', (tester) async {
    SharedPreferences.setMockInitialValues({});
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final pedidosDePreco = <String?>[];
    final servidor = MockClient((r) async {
      Object? dados = const {};
      if (r.url.path.endsWith('/rides/estimate')) {
        final corpo = jsonDecode(r.body) as Map<String, dynamic>;
        pedidosDePreco.add(corpo['category'] as String?);
        dados = _orcamento((corpo['category'] as String?) ?? 'CARRO');
      }
      return http.Response(jsonEncode({'success': true, 'data': dados}), 200,
          headers: {'content-type': 'application/json; charset=utf-8'});
    });
    final app = AppState(client: ApiClient(client: servidor))..coords = _goiatuba;
    final corridas = RideState(repository: RideRepository(client: ApiClient(client: servidor), demo: false));
    // O preco e pedido na tela anterior (Inicio), antes de abrir a confirmacao.
    await tester.runAsync(() => corridas.estimate(_goiatuba, _destino, dropoffAddress: 'Rua Destino, 10'));
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<AppState>.value(value: app),
          ChangeNotifierProvider<RideState>.value(value: corridas),
        ],
        child: const MaterialApp(
          locale: Locale('pt', 'BR'),
          supportedLocales: [Locale('pt', 'BR')],
          localizationsDelegates: [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          home: ConfirmScreen(destination: _destino, address: 'Rua Destino, 10'),
        ),
      ),
    );
    for (var i = 0; i < 5; i++) {
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
      await tester.pump(const Duration(milliseconds: 100));
    }

    // As duas categorias aparecem, com o preco de cada uma.
    expect(find.text('Carro'), findsAtLeastNWidgets(1));
    expect(find.text('Moto'), findsOneWidget);
    expect(find.byIcon(Icons.two_wheeler), findsOneWidget);
    expect(find.textContaining('12,00'), findsOneWidget);

    await tester.tap(find.text('Moto'));
    for (var i = 0; i < 5; i++) {
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(corridas.categoria, 'MOTO');
    expect(pedidosDePreco.last, 'MOTO', reason: 'o preco foi refeito para a moto');
    expect(corridas.quote?.moto, isTrue);
    expect(corridas.quote?.priceCents, 1200);

    await tester.pumpWidget(const SizedBox());
    corridas.dispose();
    app.dispose();
  });
}
