import 'package:comercio_app/core/armazenamento.dart';
import 'package:comercio_app/telas/permissoes_tela.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _app(Widget filho) => MaterialApp(home: filho);

/// Tela alta: a lista de autorizacoes rola e o que fica fora da tela nem e montado.
void _telaAlta(WidgetTester tester) {
  tester.view.physicalSize = const Size(800, 3200);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

void main() {
  setUp(() => Armazenamento.atual = ArmazenamentoEmMemoria());

  testWidgets('fora do Android o portão passa direto (computador e testes)', (tester) async {
    await tester.pumpWidget(_app(const PortaoPermissoes(child: Text('app'))));
    await tester.pump();
    expect(find.text('app'), findsOneWidget);
  });

  testWidgets('no celular, na primeira abertura mostra as autorizações e continua sem travar', (tester) async {
    _telaAlta(tester);
    await tester.pumpWidget(_app(const PortaoPermissoes(forcarAndroid: true, child: Text('app'))));
    await tester.pumpAndSettle();
    expect(find.text('Autorizações do celular'), findsOneWidget);
    expect(find.text('app'), findsNothing);
    await tester.tap(find.byKey(const ValueKey('continuar-permissoes')));
    await tester.pumpAndSettle();
    expect(find.text('app'), findsOneWidget);
  });

  testWidgets('depois de ver uma vez, não mostra de novo', (tester) async {
    await Armazenamento.atual.gravar('comercio.permissoes_vistas', '1');
    await tester.pumpWidget(_app(const PortaoPermissoes(forcarAndroid: true, child: Text('app'))));
    await tester.pumpAndSettle();
    expect(find.text('app'), findsOneWidget);
  });

  testWidgets('lista: notificações, localização, GPS e bateria; ajuste do fabricante com "Já fiz"', (tester) async {
    _telaAlta(tester);
    await tester.pumpWidget(_app(const Scaffold(
      body: ConteudoAutorizacoes(
        estadoDeTeste: {'notificacao': true, 'localizacao': false, 'gps': true, 'bateria': false, 'x_inicioAutomatico': false},
        perfilDeTeste: {'familia': 'oppo', 'marca': 'Oppo', 'modelo': 'A5', 'sistema': 'ColorOS 14', 'android': '14', 'extras': ['inicioAutomatico', 'segundoPlano']},
      ),
    )));
    await tester.pumpAndSettle();
    expect(find.text('Notificações'), findsOneWidget);
    expect(find.text('Localização'), findsOneWidget);
    expect(find.byKey(const ValueKey('liberar-localizacao')), findsOneWidget);
    expect(find.byKey(const ValueKey('liberar-notificacao')), findsNothing);
    expect(find.byKey(const ValueKey('nome-aparelho')), findsOneWidget);
    expect(find.byKey(const ValueKey('ajuste-inicioAutomatico')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('feito-inicioAutomatico')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('refazer-inicioAutomatico')), findsOneWidget);
  });
}
