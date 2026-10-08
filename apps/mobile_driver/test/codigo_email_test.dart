// Evandro (08/10/2026): codigo por e-mail para todos, passageiro e motorista,
// sem SMS e sem codigo na tela. Telefone sem conta: o app pede o e-mail, a
// conta nasce por ele e o cadastro ja vem com o telefone digitado.

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_driver/core/api/api_client.dart';
import 'package:mobile_driver/screens/phone_screen.dart';
import 'package:mobile_driver/state/driver_state.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

final List<Map<String, dynamic>> pedidosDeCodigo = [];

http.Response _json(int status, Object corpo) => http.Response(
      jsonEncode(corpo),
      status,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );

MockClient _servidor() => MockClient((r) async {
      if (r.url.path == '/api/auth/otp/request') {
        final corpo = jsonDecode(r.body) as Map<String, dynamic>;
        pedidosDeCodigo.add(corpo);
        if (corpo['phone'] != null) {
          return _json(404, {
            'success': false,
            'error': {'code': 'TELEFONE_SEM_CONTA', 'message': 'Este telefone ainda nao tem conta.'},
          });
        }
        return _json(200, {
          'success': true,
          'data': {'expiresIn': 300, 'enviadoPor': 'email'},
        });
      }
      return _json(200, {
        'success': true,
        'data': {
          'login': {'telefone': true, 'email': true},
        },
      });
    });

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    pedidosDeCodigo.clear();
  });

  testWidgets('Telefone sem conta: pede o e-mail e o codigo vai para ele (nada na tela)', (tester) async {
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final d = DriverState(client: ApiClient(client: _servidor()));
    await tester.pumpWidget(
      ChangeNotifierProvider<DriverState>.value(
        value: d,
        child: const MaterialApp(home: PhoneScreen()),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField).first, '64911112222');
    await tester.pump();
    await tester.tap(find.text('Continuar'));
    await tester.pumpAndSettle();

    expect(find.textContaining('(64) 91111-2222 ainda não tem conta'), findsOneWidget);
    expect(d.telefoneParaCadastro, '+5564911112222');

    await tester.enterText(find.byType(TextField).first, 'joao@exemplo.com');
    await tester.pump();
    await tester.tap(find.text('Receber código'));
    await tester.pumpAndSettle();

    expect(pedidosDeCodigo.last['email'], 'joao@exemplo.com');
    expect(find.textContaining('caixa de Spam'), findsOneWidget);
    expect(find.textContaining('Ambiente de teste'), findsNothing);
  });
}
