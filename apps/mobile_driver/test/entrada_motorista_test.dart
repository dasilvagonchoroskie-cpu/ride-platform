// Evandro (08/10/2026): "entrei no app do motorista e ele cai pra tela de
// fazer cadastro". No servidor, o numero que chegou foi (64) 99268-6631 (ele
// queria 6632): um digito errado criava uma conta nova e vazia, sem aviso.
// Com o numero certo, a conta aprovada tem que abrir direto.

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_driver/core/api/api_client.dart';
import 'package:mobile_driver/core/utils/formatters.dart';
import 'package:mobile_driver/data/models/driver_models.dart';
import 'package:mobile_driver/screens/otp_screen.dart';
import 'package:mobile_driver/state/driver_state.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

final List<String> pedidos = [];

http.Response _ok(Object dados) => http.Response(
      jsonEncode({'success': true, 'data': dados}),
      200,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );

/// [contaNova]: o numero nunca tinha entrado. Senao, e a conta do Evandro,
/// passageiro que virou motorista e ja foi aprovado pela Central.
MockClient _servidor({required bool contaNova}) => MockClient((r) async {
      pedidos.add('${r.method} ${r.url.path}');
      switch (r.url.path) {
        case '/api/auth/otp/verify':
          return _ok({
            'accessToken': 'acesso',
            'refreshToken': 'renova',
            'isNewUser': contaNova,
            'user': contaNova
                ? {'id': 'u-novo', 'role': 'PASSENGER', 'name': 'Motorista 6631', 'phone': '+5564992686631', 'termsAccepted': false, 'driverId': null, 'driverStatus': null}
                : {
                    'id': 'u-evandro',
                    'role': 'DRIVER',
                    'name': 'Evandro Da Silva gonchoroski',
                    'phone': '+5564992686632',
                    'email': 'dasilvagonchoroskie@gmail.com',
                    'cpf': '02443156044',
                    'termsAccepted': true,
                    'driverId': 'd-evandro',
                    'driverStatus': 'APPROVED',
                  },
          });
        case '/api/drivers/me':
          return _ok({
            'id': 'd-evandro',
            'status': 'APPROVED',
            'cpf': '02443156044',
            'cnhNumber': '05494287230',
            'cnhCategory': 'E',
            'cnhExpiresAt': '2031-06-18T00:00:00.000Z',
            'user': {'name': 'Evandro Da Silva gonchoroski'},
          });
        case '/api/vehicles/me':
          return _ok([
            {'id': 'v1', 'brand': 'Chevrolet', 'model': 'Spin', 'year': 2013, 'color': 'Cinza', 'plate': 'FBP8H67', 'isActive': true},
          ]);
        default:
          return _ok(<String, dynamic>{});
      }
    });

Future<DriverState> _telaDoCodigo(WidgetTester tester, {required bool contaNova, required String telefone}) async {
  tester.view.physicalSize = const Size(1080, 2340);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final d = DriverState(client: ApiClient(client: _servidor(contaNova: contaNova)));
  await tester.pumpWidget(
    ChangeNotifierProvider<DriverState>.value(
      value: d,
      child: MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: TextButton(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(builder: (_) => OtpScreen(phone: telefone, debugCode: '123456')),
                ),
                child: const Text('TELA DO TELEFONE'),
              ),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('TELA DO TELEFONE'));
  await tester.pumpAndSettle();
  return d;
}

/// Fim do teste: tira a tela e para os relogios do estado (vigia da
/// aprovacao), senao o teste acusa relogio pendente.
Future<void> _fim(WidgetTester tester, DriverState d) async {
  await tester.pumpWidget(const SizedBox());
  d.dispose();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    pedidos.clear();
  });

  test('Telefone da conta aparece formatado', () {
    expect(telefoneBonito('+5564992686631'), '(64) 99268-6631');
    expect(telefoneBonito('+556432641234'), '(64) 3264-1234');
    expect(telefoneBonito(null), '');
  });

  testWidgets('Numero aprovado (6632): entra direto, sem cadastro', (tester) async {
    final d = await _telaDoCodigo(tester, contaNova: false, telefone: '+5564992686632');
    expect(find.text('(64) 99268-6632'), findsOneWidget);
    await tester.tap(find.text('Verificar'));
    await tester.pumpAndSettle();

    expect(find.text('Conta nova'), findsNothing);
    expect(d.isOnboarded, isTrue, reason: 'CPF e CNH vieram do servidor');
    expect(d.isApproved, isTrue);
    expect(d.vehicle?.plate, 'FBP8H67');
    expect(pedidos, isNot(contains('POST /api/drivers/onboarding')));
    await _fim(tester, d);
  });

  testWidgets('Numero digitado errado (6631): avisa "Conta nova" e desfaz', (tester) async {
    final d = await _telaDoCodigo(tester, contaNova: true, telefone: '+5564992686631');
    expect(find.text('(64) 99268-6631'), findsOneWidget);
    expect(find.text('Número errado? Corrigir'), findsOneWidget);
    await tester.tap(find.text('Verificar'));
    await tester.pumpAndSettle();

    expect(find.text('Conta nova'), findsOneWidget);
    expect(find.textContaining('(64) 99268-6631 ainda não tinha conta'), findsOneWidget);
    await tester.tap(find.text('Número errado'));
    await tester.pumpAndSettle();

    expect(pedidos, contains('POST /api/auth/desfazer-conta-nova'));
    expect(d.profile, isNull);
    // Voltou para a tela do telefone para corrigir o numero.
    expect(find.text('TELA DO TELEFONE'), findsOneWidget);
    await _fim(tester, d);
  });

  testWidgets('Conta nova de verdade: "Esta certo" segue para o cadastro', (tester) async {
    final d = await _telaDoCodigo(tester, contaNova: true, telefone: '+5564992686631');
    await tester.tap(find.text('Verificar'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Está certo, cadastrar'));
    await tester.pumpAndSettle();
    expect(pedidos, isNot(contains('POST /api/auth/desfazer-conta-nova')));
    expect(d.profile, isNotNull);
    expect(d.profile!.approval, DriverApproval.pending);
    await _fim(tester, d);
  });
}
