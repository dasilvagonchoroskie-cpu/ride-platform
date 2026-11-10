// Redmi 12 (Evandro, 09/11/2026): o "Apps ativos" / "Nenhuma restricao" da
// Xiaomi nao aparece para o Android; a bateria ficava sempre obrigatoria.
// No Xiaomi o motorista confirma na tela.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_driver/screens/permissions_screen.dart';
import 'package:mobile_driver/state/driver_state.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<DriverState> _abrir(WidgetTester tester, {required bool xiaomi}) async {
  SharedPreferences.setMockInitialValues({});
  tester.view.physicalSize = const Size(1080, 2340);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final d = DriverState()
    ..permissoes = {
      'localizacao': true, 'gps': true, 'notificacao': true, 'sobrepor': true,
      'bateria': false, 'telaCheia': true, 'xiaomi': xiaomi,
    };
  await tester.pumpWidget(ChangeNotifierProvider<DriverState>.value(
    value: d,
    child: const MaterialApp(home: PermissionsScreen()),
  ));
  await tester.pump();
  await tester.scrollUntilVisible(find.text('Sem restrição de bateria'), 200, scrollable: find.byType(Scrollable).first);
  await tester.drag(find.byType(Scrollable).first, const Offset(0, -300));
  await tester.pump();
  return d;
}

void main() {
  testWidgets('Xiaomi: bateria tem o botao "Ja deixei em Apps ativos"', (tester) async {
    final d = await _abrir(tester, xiaomi: true);
    expect(find.text('obrigatória'), findsOneWidget);
    expect(find.byKey(const ValueKey('confirmar-bateria-xiaomi')), findsOneWidget);
    expect(find.textContaining('Apps ativos'), findsWidgets);
    await tester.tap(find.byKey(const ValueKey('confirmar-bateria-xiaomi')));
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
    await tester.pump();
    expect(d.permissoes['bateria'], isTrue);
    expect(find.text('obrigatória'), findsNothing);
  });

  testWidgets('Outros aparelhos: sem o botao de confirmar', (tester) async {
    await _abrir(tester, xiaomi: false);
    expect(find.text('obrigatória'), findsOneWidget);
    expect(find.byKey(const ValueKey('confirmar-bateria-xiaomi')), findsNothing);
  });
}
