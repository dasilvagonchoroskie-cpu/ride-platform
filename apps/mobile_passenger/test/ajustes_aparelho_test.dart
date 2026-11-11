// Ajustes por fabricante no app do passageiro (Evandro, 10/11/2026): mostra
// o celular e os ajustes da marca, todos recomendados (nunca travam o pedido).

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_passenger/core/ajustes_aparelho.dart';
import 'package:mobile_passenger/screens/permissoes_screen.dart';

const _android = {'localizacao': true, 'gps': true, 'notificacao': true, 'bateria': false};

Map<String, dynamic> _perfil(String familia, List<String> extras) => {
      'familia': familia,
      'marca': familia == 'xiaomi' ? 'Redmi' : 'Samsung',
      'modelo': familia == 'xiaomi' ? '23053RN02L' : 'SM-A155M',
      'sistema': familia == 'xiaomi' ? 'HyperOS 1.0' : 'One UI',
      'android': '14',
      'extras': extras,
    };

Future<void> _abrir(WidgetTester tester, Map<String, dynamic> perfil) async {
  tester.view.physicalSize = const Size(1080, 2340);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(MaterialApp(
    key: UniqueKey(),
    home: AutorizacoesScreen(estadoDeTeste: _android, perfilDeTeste: perfil),
  ));
  await tester.pump();
}

void main() {
  test('Passageiro: ajustes por marca', () {
    expect(ajustesDoAparelho('xiaomi', ['inicioAutomatico', 'bateriaFabricante']).length, 2);
    expect(ajustesDoAparelho('samsung', ['nuncaSuspender']).single.chave, 'nuncaSuspender');
    expect(ajustesDoAparelho('motorola', const []), isEmpty);
  });

  testWidgets('Redmi: mostra o celular e os ajustes da Xiaomi; "Ja fiz" marca feito', (tester) async {
    await _abrir(tester, _perfil('xiaomi', ['inicioAutomatico', 'bateriaFabricante']));
    expect(find.textContaining('Seu celular: Redmi 23053RN02L · HyperOS 1.0 · Android 14'), findsOneWidget);
    // No Xiaomi a bateria do Android da lugar ao ajuste da Xiaomi.
    expect(find.text('Bateria sem restrição'), findsNothing);
    await tester.scrollUntilVisible(find.byKey(const ValueKey('feito-inicioAutomatico')), 200, scrollable: find.byType(Scrollable).first);
    await tester.tap(find.byKey(const ValueKey('feito-inicioAutomatico')));
    await tester.pump();
    expect(find.byKey(const ValueKey('refazer-inicioAutomatico')), findsOneWidget);
    expect(find.text('obrigatória'), findsNothing);
  });

  testWidgets('Samsung: bateria do Android e o ajuste da Samsung, recomendados', (tester) async {
    await _abrir(tester, _perfil('samsung', ['nuncaSuspender']));
    await tester.scrollUntilVisible(find.text('Bateria sem restrição'), 200, scrollable: find.byType(Scrollable).first);
    expect(find.text('Bateria sem restrição'), findsOneWidget);
    await tester.scrollUntilVisible(find.byKey(const ValueKey('ajuste-nuncaSuspender')), 200, scrollable: find.byType(Scrollable).first);
    expect(find.text('Ajustes do seu Samsung'), findsOneWidget);
  });
}
