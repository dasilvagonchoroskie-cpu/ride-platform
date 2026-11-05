// Bussola do mapa (Evandro, 05/11/2026): "travei no norte e quando eu saio
// ela volta no padrao". A escolha agora fica guardada no celular.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_driver/widgets/bussola.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _MapaDeMentira implements ControleDoMapa {
  final _giros = StreamController<double>.broadcast();
  double _r = 0;

  @override
  double get rotacao => _r;

  @override
  Stream<double> get rotacoes => _giros.stream;

  @override
  void girar(double graus) {
    _r = graus;
    _giros.add(graus);
  }
}

Future<void> _abrir(WidgetTester tester, {bool automatico = true}) async {
  await tester.pumpWidget(MaterialApp(
    home: Scaffold(body: Center(child: BotaoBussola(key: UniqueKey(), controle: _MapaDeMentira(), automatico: automatico))),
  ));
  for (var i = 0; i < 3; i++) {
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
    await tester.pump();
  }
}

bool _automatica(WidgetTester tester) => tester.widget<BotaoDoMapa>(find.byType(BotaoDoMapa)).ativo;

void main() {
  setUp(() => BotaoBussola.escolha = null);

  testWidgets('Sem escolha ainda: a tela do motorista comeca no automatico', (tester) async {
    SharedPreferences.setMockInitialValues({});
    await _abrir(tester);
    expect(_automatica(tester), isTrue);
  });

  testWidgets('Travou o norte: ao voltar para o mapa continua travado', (tester) async {
    SharedPreferences.setMockInitialValues({});
    await _abrir(tester);
    await tester.tap(find.byType(BotaoDoMapa));
    await tester.pump();
    expect(_automatica(tester), isFalse);
    // Sai e volta (mapa novo): continua no norte travado.
    await _abrir(tester);
    expect(_automatica(tester), isFalse);
    // Fechou o aplicativo e abriu de novo: vale o que ficou guardado.
    BotaoBussola.escolha = null;
    final guardado = await tester.runAsync(() async => (await SharedPreferences.getInstance()).getString('ride.bussolaAutomatica'));
    expect(guardado, '0');
    await _abrir(tester);
    expect(_automatica(tester), isFalse);
  });

  testWidgets('Ligou o automatico de novo: tambem fica guardado', (tester) async {
    SharedPreferences.setMockInitialValues({'ride.bussolaAutomatica': '0'});
    await _abrir(tester);
    expect(_automatica(tester), isFalse);
    await tester.tap(find.byType(BotaoDoMapa));
    await tester.pump();
    expect(_automatica(tester), isTrue);
    await _abrir(tester);
    expect(_automatica(tester), isTrue);
  });
}
