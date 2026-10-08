// Defeito visto no celular do Evandro (08/10/2026): ao tocar em "Enviar
// documentos" aparecia "Cadastro de motorista nao encontrado". O servidor
// tinha recusado o cadastro com "Este e-mail ja esta em outra conta", mas o
// app tratava QUALQUER recusa 409 como "ja cadastrado", escondia o motivo e
// seguia para o veiculo.

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_driver/core/api/api_client.dart';
import 'package:mobile_driver/data/models/driver_models.dart';
import 'package:mobile_driver/screens/onboarding_screen.dart';
import 'package:mobile_driver/state/driver_state.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

final List<String> pedidos = [];

MockClient _servidor({required int status, String? codigo, String mensagem = ''}) => MockClient((r) async {
      pedidos.add('${r.method} ${r.url.path}');
      if (r.url.path == '/api/drivers/onboarding' && status != 200) {
        return http.Response(
          jsonEncode({
            'success': false,
            'error': {'code': codigo, 'message': mensagem},
          }),
          status,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }
      return http.Response(
        jsonEncode({'success': true, 'data': <String, dynamic>{}}),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });

Future<DriverState> _enviar(MockClient servidor) async {
  final d = DriverState(client: ApiClient(client: servidor));
  d.profile = const DriverProfile(id: 'u1', name: 'Motorista 2794', phone: '+5564996472794');
  d.vehicle = const VehicleInfo(brand: 'Chevrolet', model: 'Spin', year: 2013, color: 'cinza', plate: 'FBP8H67');
  await d.completeOnboarding(
    nome: 'Evandro da Silva',
    emailConta: 'evandro@exemplo.com',
    cpf: '52998224725',
    cnhNumber: '05494287230',
    cnhCategory: 'E',
    cnhExpiresAt: '18/06/2031',
    birthDate: '10/05/1990',
  );
  return d;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() {
    SharedPreferences.setMockInitialValues({'ride.accessToken': 'token-de-teste', 'ride.refreshToken': 'refresh-de-teste'});
    pedidos.clear();
  });

  test('E-mail de outra conta: mostra o motivo e NAO segue para o veiculo', () async {
    const motivo = 'Este e-mail ja esta em outra conta. Se voce ja usa o app do passageiro, entre no app do motorista com o MESMO telefone.';
    final d = await _enviar(_servidor(status: 409, codigo: 'EMAIL_ALREADY_USED', mensagem: motivo));
    expect(d.error, motivo);
    expect(pedidos, isNot(contains('POST /api/vehicles')));
  });

  test('CPF de outra conta: mostra o motivo e NAO segue para o veiculo', () async {
    final d = await _enviar(_servidor(status: 409, codigo: 'CPF_ALREADY_USED', mensagem: 'Este CPF ja esta em outra conta.'));
    expect(d.error, 'Este CPF ja esta em outra conta.');
    expect(pedidos, isNot(contains('POST /api/vehicles')));
  });

  test('Ja era motorista (reinstalou o app): segue para o veiculo', () async {
    await _enviar(_servidor(status: 409, codigo: 'DRIVER_ALREADY_EXISTS', mensagem: 'Motorista ja cadastrado.'));
    expect(pedidos, contains('POST /api/vehicles'));
  });

  test('Cadastro aceito: manda o veiculo depois do motorista', () async {
    final d = await _enviar(_servidor(status: 200));
    expect(pedidos, ['POST /api/drivers/onboarding', 'POST /api/vehicles']);
    expect(d.profile!.name, 'Evandro da Silva');
  });

  testWidgets('Cadastro: botao Sair para entrar com outro telefone', (tester) async {
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final d = DriverState(client: ApiClient(client: _servidor(status: 200)));
    d.profile = const DriverProfile(id: 'u1', name: 'Motorista 2794', phone: '+5564996472794', termsAccepted: true);
    await tester.pumpWidget(
      ChangeNotifierProvider<DriverState>.value(
        value: d,
        child: const MaterialApp(home: OnboardingScreen()),
      ),
    );
    await tester.pump();
    await tester.tap(find.text('Sair'));
    await tester.pumpAndSettle();
    expect(find.text('Sair do cadastro?'), findsOneWidget);
    expect(find.textContaining('MESMO telefone'), findsOneWidget);
    await tester.tap(find.text('Sair').last);
    await tester.pumpAndSettle();
    expect(d.profile, isNull);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('ride.refreshToken'), isNull);
  });
}
