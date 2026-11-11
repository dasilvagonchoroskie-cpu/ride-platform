// Ajustes por fabricante (Evandro, 10/11/2026, Redmi 12): o aplicativo
// identifica o celular e mostra os ajustes proprios da marca. O Android nao
// informa esses ajustes; o motorista abre cada um e confirma ("Ja fiz").

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_driver/core/native/ajustes_aparelho.dart';
import 'package:mobile_driver/core/native/corridas_nativo.dart';
import 'package:mobile_driver/screens/permissions_screen.dart';
import 'package:mobile_driver/state/driver_state.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _android = {'localizacao': true, 'gps': true, 'notificacao': true, 'sobrepor': true, 'bateria': true, 'telaCheia': true};

Map<String, dynamic> _perfil(String familia, List<String> extras, {String marca = 'Redmi', String modelo = '23053RN02L', String sistema = 'HyperOS 1.0'}) =>
    {'familia': familia, 'marca': marca, 'modelo': modelo, 'sistema': sistema, 'android': '14', 'sdk': 34, 'extras': extras};

const _xiaomi = ['inicioAutomatico', 'bateriaFabricante', 'outrasPermissoes', 'travarRecentes'];

Future<DriverState> _abrir(WidgetTester tester, Map<String, dynamic> perfil, {Map<String, bool> extra = const {}}) async {
  SharedPreferences.setMockInitialValues({});
  tester.view.physicalSize = const Size(1080, 2340);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final d = DriverState()
    ..aparelho = perfil
    ..permissoes = {..._android, ...extra};
  d.permissoesOk = CorridasNativo.essenciaisOk(d.permissoes, perfil);
  await tester.pumpWidget(ChangeNotifierProvider<DriverState>.value(
    value: d,
    child: MaterialApp(key: UniqueKey(), home: const PermissionsScreen()),
  ));
  await tester.pump();
  return d;
}

Future<void> _rolarAte(WidgetTester tester, Finder f) async {
  await tester.scrollUntilVisible(f, 200, scrollable: find.byType(Scrollable).first);
  await tester.pump();
}

void main() {
  test('Regra: no Xiaomi so fica Disponivel com os 3 ajustes obrigatorios (travar nos recentes e recomendado)', () {
    final perfil = _perfil('xiaomi', _xiaomi);
    expect(CorridasNativo.essenciaisOk(_android, perfil), isFalse);
    final quase = {..._android, 'x_inicioAutomatico': true, 'x_bateriaFabricante': true};
    expect(CorridasNativo.essenciaisOk(quase, perfil), isFalse);
    expect(CorridasNativo.essenciaisOk({...quase, 'x_outrasPermissoes': true}, perfil), isTrue);
    // Motorola (Android puro): so as do Android.
    expect(CorridasNativo.essenciaisOk(_android, _perfil('motorola', const [])), isTrue);
    // Faltando uma do Android, nunca.
    expect(CorridasNativo.essenciaisOk({..._android, 'notificacao': false}, _perfil('motorola', const [])), isFalse);
  });

  test('Cada marca tem a sua lista; nome do celular aparece legivel', () {
    expect(ajustesDoAparelho('samsung', ['nuncaSuspender']).single.titulo, 'Apps que nunca entram em suspensão');
    expect(ajustesDoAparelho('oppo', ['inicioAutomatico', 'segundoPlano', 'travarRecentes']).length, 3);
    expect(ajustesDoAparelho('outro', const []), isEmpty);
    expect(nomeDoAparelho(_perfil('xiaomi', _xiaomi)), 'Redmi 23053RN02L · HyperOS 1.0 · Android 14');
    expect(nomeDoAparelho(_perfil('motorola', const [], marca: 'Motorola', modelo: 'moto g54 5G', sistema: 'Android')), 'Motorola moto g54 5G · Android 14');
  });

  testWidgets('Redmi: mostra o celular, os ajustes da Xiaomi e libera ao confirmar', (tester) async {
    final d = await _abrir(tester, _perfil('xiaomi', _xiaomi));
    expect(find.textContaining('Seu celular: Redmi 23053RN02L · HyperOS 1.0'), findsOneWidget);
    expect(find.text('Faltam 3 para você poder ficar Disponível.'), findsOneWidget);
    // No Xiaomi a bateria do Android vira o ajuste "Nenhuma restricao" da Xiaomi.
    expect(find.text('Sem restrição de bateria'), findsNothing);
    for (final chave in ['inicioAutomatico', 'bateriaFabricante', 'outrasPermissoes']) {
      await _rolarAte(tester, find.byKey(ValueKey('feito-$chave')));
      expect(find.byKey(ValueKey('abrir-$chave')), findsOneWidget);
      await tester.tap(find.byKey(ValueKey('feito-$chave')));
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
      await tester.pump();
    }
    expect(d.permissoesOk, isTrue);
    // Travar nos recentes e so recomendado e nao tem tela para abrir.
    await _rolarAte(tester, find.byKey(const ValueKey('ajuste-travarRecentes')));
    expect(find.text('recomendado'), findsOneWidget);
    expect(find.byKey(const ValueKey('abrir-travarRecentes')), findsNothing);
    await tester.scrollUntilVisible(find.byKey(const ValueKey('faltam-autorizacoes')), -200, scrollable: find.byType(Scrollable).first);
    expect(find.text('Tudo pronto para receber corridas.'), findsOneWidget);
  });

  testWidgets('Samsung: um ajuste so; Motorola: nenhum', (tester) async {
    await _abrir(tester, _perfil('samsung', ['nuncaSuspender'], marca: 'Samsung', modelo: 'SM-A155M', sistema: 'One UI'));
    expect(find.text('Faltam 1 para você poder ficar Disponível.'), findsNothing);
    expect(find.text('Falta 1 para você poder ficar Disponível.'), findsOneWidget);
    await _rolarAte(tester, find.text('Sem restrição de bateria'));
    expect(find.text('Sem restrição de bateria'), findsOneWidget);
    await _rolarAte(tester, find.byKey(const ValueKey('ajuste-nuncaSuspender')));
    expect(find.byKey(const ValueKey('abrir-nuncaSuspender')), findsOneWidget);

    await _abrir(tester, _perfil('motorola', const [], marca: 'Motorola', modelo: 'moto g54 5G', sistema: 'Android'));
    expect(find.text('Tudo pronto para receber corridas.'), findsOneWidget);
    expect(find.textContaining('Ajustes do seu'), findsNothing);
  });
}
