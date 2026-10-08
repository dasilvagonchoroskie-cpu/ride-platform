// Defeito visto no celular do Evandro (08/10/2026): ele aprovou o motorista
// na Central, voltou para o app do motorista e a tela "Cadastro em analise"
// nao mudou. O botao "Atualizar status" so recarregava os dados e nao olhava
// a aprovacao; com o app em segundo plano o relogio de 20 s ficou congelado.
// Ele tocou em "Sair" e caiu na tela de boas-vindas.

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_driver/core/api/api_client.dart';
import 'package:mobile_driver/data/models/driver_models.dart';
import 'package:mobile_driver/screens/pending_screen.dart';
import 'package:mobile_driver/screens/welcome_screen.dart';
import 'package:mobile_driver/state/driver_state.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Servidor de mentira: a Central ja aprovou (ou nao) o motorista.
MockClient _servidor(String status) => MockClient((r) async {
      Object dados = <String, dynamic>{};
      if (r.url.path == '/api/auth/me') {
        dados = {'id': 'u1', 'driverId': 'd1', 'driverStatus': status, 'termsAccepted': true};
      } else if (r.url.path == '/api/drivers/me') {
        dados = {
          'id': 'd1',
          'status': status,
          'cpf': '52998224725',
          'cnhNumber': '05494287230',
          'user': {'name': 'Evandro da Silva'},
        };
      } else if (r.url.path == '/api/vehicles/me') {
        dados = <dynamic>[];
      } else if (r.url.path == '/api/documents/me') {
        dados = {'items': <dynamic>[]};
      }
      return http.Response(
        jsonEncode({'success': true, 'data': dados}),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });

DriverState _motoristaEmAnalise(String statusNoServidor) {
  final d = DriverState(client: ApiClient(client: _servidor(statusNoServidor)));
  d.profile = const DriverProfile(
    id: 'd1',
    name: 'Evandro da Silva',
    phone: '+5564992686632',
    termsAccepted: true,
    cpf: '52998224725',
    cnhNumber: '05494287230',
  );
  return d;
}

Future<void> _abrir(WidgetTester tester, DriverState d, Widget tela) async {
  tester.view.physicalSize = const Size(1080, 2340);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    ChangeNotifierProvider<DriverState>.value(
      value: d,
      // Igual ao app: aprovado sai da tela de analise.
      child: MaterialApp(
        home: Consumer<DriverState>(
          builder: (_, s, __) => s.isApproved ? const Scaffold(body: Text('TELA INICIAL')) : tela,
        ),
      ),
    ),
  );
  await tester.pump();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() {
    SharedPreferences.setMockInitialValues({'ride.accessToken': 'token-de-teste', 'ride.refreshToken': 'refresh-de-teste'});
  });

  testWidgets('Aprovado na Central: "Atualizar status" leva para a tela inicial', (tester) async {
    final d = _motoristaEmAnalise('APPROVED');
    await _abrir(tester, d, const PendingScreen());
    expect(find.text('Cadastro em análise'), findsOneWidget);

    await tester.ensureVisible(find.text('Atualizar status'));
    await tester.tap(find.text('Atualizar status'));
    await tester.pumpAndSettle();

    expect(d.isApproved, isTrue);
    expect(find.text('TELA INICIAL'), findsOneWidget);
    expect(find.text('Cadastro em análise'), findsNothing);
  });

  testWidgets('Ainda em analise: continua na tela e o perfil fica', (tester) async {
    final d = _motoristaEmAnalise('PENDING');
    await _abrir(tester, d, const PendingScreen());
    await tester.ensureVisible(find.text('Atualizar status'));
    await tester.tap(find.text('Atualizar status'));
    await tester.pumpAndSettle();
    expect(d.isApproved, isFalse);
    expect(find.text('Cadastro em análise'), findsOneWidget);
  });

  test('Dados do cadastro trazem a aprovacao (sincronizar ja basta)', () async {
    final d = _motoristaEmAnalise('APPROVED');
    await d.sincronizarCadastro();
    expect(d.isApproved, isTrue);
  });

  test('Central suspendeu ou bloqueou: nao fica como "em analise"', () async {
    final d = _motoristaEmAnalise('BLOCKED');
    await d.refreshFromServer();
    expect(d.profile!.approval, DriverApproval.rejected);
  });

  testWidgets('Sair pede confirmacao: "Ficar" nao apaga a conta', (tester) async {
    final d = _motoristaEmAnalise('PENDING');
    await _abrir(tester, d, const PendingScreen());
    await tester.tap(find.text('Sair'));
    await tester.pumpAndSettle();
    expect(find.text('Sair da conta?'), findsOneWidget);
    expect(find.textContaining('Não precisa sair para esperar'), findsOneWidget);
    await tester.tap(find.text('Ficar'));
    await tester.pumpAndSettle();
    expect(d.profile, isNotNull);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('ride.refreshToken'), 'refresh-de-teste');
  });

  testWidgets('Boas-vindas: sem modo demonstracao no app de verdade', (tester) async {
    final d = DriverState(client: ApiClient(client: _servidor('PENDING')));
    await _abrir(tester, d, const WelcomeScreen());
    expect(find.text('Entrar ou cadastrar'), findsOneWidget);
    expect(find.textContaining('mesmo telefone'), findsOneWidget);
    expect(find.text('Entrar em modo demonstração'), findsNothing);
    expect(find.textContaining('regiao'), findsNothing);
  });
}
