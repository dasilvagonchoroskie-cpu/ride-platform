// Etapa 6 (Evandro, 29/10/2026): aparencia do app pela Central — nome, cor,
// logo e faixa de aviso no Inicio, vindos do /app/config.

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_passenger/core/api/api_client.dart';
import 'package:mobile_passenger/core/config/app_config.dart';
import 'package:mobile_passenger/core/marca.dart';
import 'package:mobile_passenger/core/theme/app_theme.dart';
import 'package:mobile_passenger/screens/home_screen.dart';
import 'package:mobile_passenger/screens/welcome_screen.dart';
import 'package:mobile_passenger/state/app_state.dart';
import 'package:mobile_passenger/state/config_state.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

ApiClient _api(Map<String, dynamic> data) => ApiClient(
      client: MockClient((r) async => http.Response(jsonEncode({'success': true, 'data': data}), 200,
          headers: {'content-type': 'application/json; charset=utf-8'})),
    );

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    Marca.voltarAoPadrao();
    SharedPreferences.setMockInitialValues({});
  });

  test('Central ainda nao mexeu: fica o nome e a cor da montagem', () {
    final mudou = Marca.aplicar({'definida': false, 'nome': 'Outro', 'cor': '#FF0000', 'banner': null, 'logoUrl': null});
    expect(mudou, isFalse);
    expect(Marca.nome, 'Fortaleza Mov');
    expect(Marca.cor, AppColors.brand);
  });

  test('Central escolheu: nome, cor, logo (endereco completo) e faixa', () {
    final mudou = Marca.aplicar({
      'definida': true,
      'nome': 'Goiatuba Mov',
      'cor': '#12AB34',
      'banner': {'texto': 'Feriado: corridas ate 2h'},
      'logoUrl': '/app/logo?v=0f8fad5b',
    });
    expect(mudou, isTrue);
    expect(Marca.nome, 'Goiatuba Mov');
    expect(Marca.cor, const Color(0xFF12AB34));
    expect(Marca.logoUrl, '${AppConfig.apiUrl}/api/app/logo?v=0f8fad5b');
    expect(Marca.faixa, 'Feriado: corridas ate 2h');
    // Cor estranha volta para a da montagem; faixa desligada some.
    Marca.aplicar({'definida': true, 'nome': 'Goiatuba Mov', 'cor': 'verde', 'banner': null, 'logoUrl': null});
    expect(Marca.cor, AppColors.brand);
    expect(Marca.faixa, isNull);
    expect(Marca.logoUrl, isNull);
  });

  test('a configuracao do servidor aplica a marca e o tema segue a cor', () async {
    final config = ConfigState(
      client: _api({
        'cidades': const [],
        'aparencia': {'definida': true, 'nome': 'Itumbiara Mov', 'cor': '#AA2200', 'banner': null, 'logoUrl': null},
      }),
    );
    await config.iniciar();
    expect(config.nomeDoApp, 'Itumbiara Mov');
    expect(config.corDaMarca, const Color(0xFFAA2200));
    expect(AppTheme.comCor(config.corDaMarca).colorScheme.primary, const Color(0xFFAA2200));
    config.dispose();
  });

  testWidgets('tela de entrada e faixa do Inicio com o que a Central escolheu', (tester) async {
    Marca.aplicar({'definida': true, 'nome': 'Buriti Mov', 'cor': '#7A1FA2', 'banner': {'texto': 'Promoção de sábado'}, 'logoUrl': null});
    final app = AppState(client: _api(const {}));
    final config = ConfigState(client: _api(const {}));
    await tester.pumpWidget(MultiProvider(
      providers: [
        ChangeNotifierProvider<AppState>.value(value: app),
        ChangeNotifierProvider<ConfigState>.value(value: config),
      ],
      child: MaterialApp(
        theme: AppTheme.comCor(Marca.cor),
        home: const WelcomeScreen(),
      ),
    ));
    await tester.pump();
    final titulo = tester.widget<Text>(find.text('Buriti Mov'));
    expect(titulo.style?.color, const Color(0xFF7A1FA2));

    await tester.pumpWidget(MaterialApp(home: Scaffold(body: FaixaDaCentral(texto: Marca.faixa!))));
    expect(find.text('Promoção de sábado'), findsOneWidget);
    expect(find.byIcon(Icons.campaign), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    app.dispose();
    config.dispose();
  });
}
