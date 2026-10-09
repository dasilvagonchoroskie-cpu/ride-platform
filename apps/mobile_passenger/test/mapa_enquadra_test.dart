// Evandro (09/10/2026): simulou Goiatuba -> Rio Verde (193 km) e o mapa da
// tela "Confirmar viagem" mostrava so um pedaco vazio no meio do caminho
// (zoom fixo). Agora o mapa enquadra embarque, destino e rota inteiros.

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
const _rioVerde = Coords(-17.7923, -50.9192);

Finder _pino(String arquivo) => find.byWidgetPredicate(
      (w) => w is Image && w.image is AssetImage && (w.image as AssetImage).assetName == arquivo,
    );

Future<void> _abrir(WidgetTester tester, {required List<Coords> enquadrar}) async {
  tester.view.physicalSize = const Size(1080, 2340);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: Column(
          children: [
            // Mesmo tamanho da tela de confirmar: 40% de cima.
            Expanded(
              flex: 4,
              child: RideMap(
                center: Coords(
                  (_goiatuba.latitude + _rioVerde.latitude) / 2,
                  (_goiatuba.longitude + _rioVerde.longitude) / 2,
                ),
                span: 0.075,
                rounded: false,
                enquadrar: enquadrar,
                enquadrarMargem: const EdgeInsets.fromLTRB(40, 72, 40, 36),
                markers: const [
                  MapMarker(id: 'pickup', coords: _goiatuba, kind: MarkerKind.pickup),
                  MapMarker(id: 'dropoff', coords: _rioVerde, kind: MarkerKind.dropoff),
                ],
              ),
            ),
            const Expanded(flex: 6, child: SizedBox()),
          ],
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  setUp(() => mostrarRuasNoMapa = false);

  testWidgets('Corrida longa: embarque e destino aparecem os dois na tela', (tester) async {
    await _abrir(tester, enquadrar: const [_goiatuba, _rioVerde]);
    expect(_pino('assets/markers/pin_pickup.png'), findsOneWidget);
    expect(_pino('assets/markers/pin_dropoff.png'), findsOneWidget);
    // Os dois dentro da area do mapa (os 40% de cima da tela de 780).
    final mapa = tester.getRect(find.byType(RideMap));
    for (final f in ['assets/markers/pin_pickup.png', 'assets/markers/pin_dropoff.png']) {
      final c = tester.getCenter(_pino(f));
      expect(mapa.contains(c), isTrue, reason: '$f fora do mapa: $c em $mapa');
    }
  });

  testWidgets('Sem enquadrar (zoom fixo antigo): o destino longe ficava fora', (tester) async {
    await _abrir(tester, enquadrar: const []);
    expect(_pino('assets/markers/pin_dropoff.png'), findsNothing);
  });

  // Evandro (09/10/2026, 18:13): mesmo depois do enquadramento, o mapa da
  // "Confirmar viagem" continuava uma FITA no meio da tela. A pilha do mapa
  // ficava da largura do botao de voltar; agora ocupa a largura toda.
  testWidgets('Confirmar viagem: o mapa ocupa a largura toda da tela', (tester) async {
    SharedPreferences.setMockInitialValues({});
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final servidor = MockClient((r) async => http.Response('{"success":true,"data":{}}', 200,
        headers: {'content-type': 'application/json; charset=utf-8'}));
    final app = AppState(client: ApiClient(client: servidor))..coords = _goiatuba;
    final corridas = RideState(repository: RideRepository(client: ApiClient(client: servidor)));
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
          home: ConfirmScreen(destination: _rioVerde, address: 'Rio Verde - GO'),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 300));
    final mapa = tester.getRect(find.byType(RideMap));
    expect(mapa.width, 360, reason: 'o mapa tem que ter a largura da tela (era uma fita): $mapa');
    expect(mapa.height, greaterThan(250));
    expect(_pino('assets/markers/pin_pickup.png'), findsOneWidget);
    expect(_pino('assets/markers/pin_dropoff.png'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    corridas.dispose();
    app.dispose();
  });
}
