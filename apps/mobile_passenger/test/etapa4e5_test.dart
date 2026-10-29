// Etapas 4 e 5 (Evandro, 29/10/2026):
// - "Apagar historico de destinos": apaga no servidor e SO depois limpa a tela;
//   sem resposta do servidor, nada muda.
// - "Meus cartoes": so a tela "Em breve"; nenhum campo de numero de cartao;
//   o pagamento continua direto ao motorista.

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_passenger/core/api/api_client.dart';
import 'package:mobile_passenger/data/repositories/ride_repository.dart';
import 'package:mobile_passenger/screens/wallet_screen.dart';
import 'package:mobile_passenger/state/ride_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

http.Response _ok(Object? dados) => http.Response(jsonEncode({'success': true, 'data': dados}), 200,
    headers: {'content-type': 'application/json; charset=utf-8'});

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('Apagar tudo: sem servidor nada muda; com servidor a lista some depois do OK', () async {
    var falhar = true;
    final pedidos = <String>[];
    final servidor = MockClient((r) async {
      pedidos.add('${r.method} ${r.url.path}');
      if (r.method == 'GET' && r.url.path.endsWith('/rides/destinos')) {
        return _ok([
          {'chave': 'a|1|1', 'address': 'Rodoviária', 'latitude': -18.005, 'longitude': -49.361, 'vezes': 2},
        ]);
      }
      if (r.method == 'DELETE' && r.url.path.endsWith('/rides/destinos')) {
        return falhar
            ? http.Response(jsonEncode({'success': false, 'error': {'code': 'INTERNAL', 'message': 'Falhou.'}}), 500,
                headers: {'content-type': 'application/json; charset=utf-8'})
            : _ok({'apagados': 1});
      }
      return _ok(const []);
    });
    final corridas = RideState(repository: RideRepository(client: ApiClient(client: servidor), demo: false));
    await corridas.carregarEnderecos();
    expect(corridas.recentes, hasLength(1));

    expect(await corridas.apagarDestinos(), isFalse);
    expect(corridas.recentes, hasLength(1), reason: 'sem o OK do servidor a tela nao muda');

    falhar = false;
    expect(await corridas.apagarDestinos(), isTrue);
    expect(corridas.recentes, isEmpty);
    expect(pedidos.where((p) => p == 'DELETE /api/rides/destinos'), hasLength(2));
    corridas.dispose();
  });

  testWidgets('Meus cartoes: so "Em breve", sem campo de cartao; pagamento direto ao motorista', (tester) async {
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(const MaterialApp(home: WalletScreen()));
    await tester.pump();
    expect(find.textContaining('direto ao motorista'), findsAtLeastNWidgets(1));
    await tester.scrollUntilVisible(find.text('EM BREVE'), 200, scrollable: find.byType(Scrollable).first);
    expect(find.text('Meus cartões'), findsOneWidget);
    expect(find.text('EM BREVE'), findsOneWidget);
    expect(find.byType(TextField), findsNothing, reason: 'nenhum numero de cartao e digitado nem guardado');
    expect(find.byType(EditableText), findsNothing);
  });
}
