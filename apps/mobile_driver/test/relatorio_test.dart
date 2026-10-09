// Evandro (08/10/2026): relatorio de faturamento em PDF no app do motorista.

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_driver/core/api/api_client.dart';
import 'package:mobile_driver/core/config/app_config.dart';
import 'package:mobile_driver/state/driver_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('Pede o link do PDF com o periodo e devolve o endereco completo', () async {
    SharedPreferences.setMockInitialValues({'ride.accessToken': 'token-de-teste'});
    Uri? pedido;
    final d = DriverState(
      client: ApiClient(
        client: MockClient((r) async {
          pedido = r.url;
          return http.Response(
            jsonEncode({
              'success': true,
              'data': {'caminho': '/api/relatorios/abc.def/relatorio-motorista-2026-10-01-a-2026-10-31.pdf', 'arquivo': 'x.pdf'},
            }),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }),
      ),
    );
    final link = await d.linkDoRelatorio(DateTime(2026, 10, 1), DateTime(2026, 10, 31));
    expect(pedido!.path, '/api/driver/relatorio');
    expect(pedido!.queryParameters['de'], '2026-10-01');
    expect(pedido!.queryParameters['ate'], '2026-10-31');
    expect(link, '${AppConfig.apiUrl}/api/relatorios/abc.def/relatorio-motorista-2026-10-01-a-2026-10-31.pdf');
  });

  test('Cidades da operacao vem da configuracao do servidor', () async {
    SharedPreferences.setMockInitialValues({});
    final d = DriverState(
      client: ApiClient(
        client: MockClient((r) async => http.Response(
              jsonEncode({
                'success': true,
                'data': {
                  'pracas': [
                    {'id': 'goiatuba', 'nome': 'Goiatuba', 'uf': 'GO'},
                    {'id': 'teutonia-rs', 'nome': 'Teutônia', 'uf': 'RS'},
                  ],
                },
              }),
              200,
              headers: {'content-type': 'application/json; charset=utf-8'},
            )),
      ),
    );
    await d.carregarPracas();
    expect(d.pracas.map((p) => p.nome), ['Goiatuba - GO', 'Teutônia - RS']);
  });
}
