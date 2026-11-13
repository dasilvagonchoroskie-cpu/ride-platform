import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:central_app/core/api/api_client.dart';
import 'package:central_app/core/storage/app_storage.dart';

/// Renovacao do login com o login NO COFRE do celular (13/11/2026).
///
/// Achado da auditoria: a renovacao lia o refresh token do arquivo comum,
/// que depois da migracao para o cofre fica vazio; sem isto o login nao se
/// renovaria sozinho e a pessoa seria deslogada quando o acesso vencesse.
/// O cofre dos testes e o de memoria do flutter_test_config.dart.
http.Response _ok(Object data) => http.Response(jsonEncode({'success': true, 'data': data}), 200);
http.Response _erro(int status, [String codigo = 'UNAUTHORIZED']) =>
    http.Response(jsonEncode({'success': false, 'error': {'code': codigo, 'message': 'x'}}), status);

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    ApiClient.aoSessaoExpirar = null;
    ApiClient.aoRenovarToken = null;
  });
  tearDown(() {
    ApiClient.aoSessaoExpirar = null;
    ApiClient.aoRenovarToken = null;
  });

  test('401: renova com o refresh que esta no cofre, repete o pedido e grava o par novo no cofre', () async {
    await AppStorage.write(AppStorage.accessToken, 'velho');
    await AppStorage.write(AppStorage.refreshToken, 'refresh-1');
    final enviados = <String?>[];
    String? refreshEnviado;
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path.endsWith('/auth/refresh')) {
          refreshEnviado = (jsonDecode(req.body) as Map)['refreshToken'] as String?;
          return _ok({'accessToken': 'novo', 'refreshToken': 'refresh-2'});
        }
        enviados.add(req.headers['Authorization']);
        return req.headers['Authorization'] == 'Bearer velho' ? _erro(401) : _ok({'oi': 1});
      }),
    );
    expect(await api.request('GET', '/qualquer'), {'oi': 1});
    expect(refreshEnviado, 'refresh-1');
    expect(enviados, ['Bearer velho', 'Bearer novo']);
    expect(await AppStorage.read(AppStorage.accessToken), 'novo');
    expect(await AppStorage.read(AppStorage.refreshToken), 'refresh-2');
    // Nada de login no arquivo comum.
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.containsKey(AppStorage.accessToken), isFalse);
    expect(prefs.containsKey(AppStorage.refreshToken), isFalse);
  });

  test('sem refresh guardado: o login acabou e o aplicativo e avisado', () async {
    await AppStorage.write(AppStorage.accessToken, 'velho');
    var expirou = false;
    ApiClient.aoSessaoExpirar = () => expirou = true;
    final api = ApiClient(client: MockClient((_) async => _erro(401)));
    await expectLater(api.request('GET', '/qualquer'), throwsA(isA<ApiException>().having((e) => e.code, 'code', 'SESSION_EXPIRED')));
    expect(expirou, isTrue);
  });

  test('o vigia nativo ja renovou no cofre: repete com o acesso dele, sem gastar o refresh', () async {
    await AppStorage.write(AppStorage.accessToken, 'velho');
    await AppStorage.write(AppStorage.refreshToken, 'refresh-1');
    var chamouRefresh = false;
    final enviados = <String?>[];
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path.endsWith('/auth/refresh')) {
          chamouRefresh = true;
          return _ok({'accessToken': 'x', 'refreshToken': 'y'});
        }
        enviados.add(req.headers['Authorization']);
        if (req.headers['Authorization'] == 'Bearer velho') {
          // Enquanto o servidor respondia, o servico nativo trocou o login.
          await AppStorage.write(AppStorage.accessToken, 'do-vigia');
          await AppStorage.write(AppStorage.refreshToken, 'refresh-do-vigia');
          return _erro(401);
        }
        return _ok({'ok': true});
      }),
    );
    expect(await api.request('GET', '/qualquer'), {'ok': true});
    expect(chamouRefresh, isFalse);
    expect(enviados, ['Bearer velho', 'Bearer do-vigia']);
  });

  test('refresh recusado mas o vigia ja tinha trocado o refresh: nao desloga', () async {
    await AppStorage.write(AppStorage.accessToken, 'velho');
    await AppStorage.write(AppStorage.refreshToken, 'refresh-1');
    var expirou = false;
    ApiClient.aoSessaoExpirar = () => expirou = true;
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path.endsWith('/auth/refresh')) {
          await AppStorage.write(AppStorage.refreshToken, 'refresh-do-vigia');
          await AppStorage.write(AppStorage.accessToken, 'do-vigia');
          return _erro(401, 'INVALID_REFRESH_TOKEN');
        }
        return req.headers['Authorization'] == 'Bearer do-vigia' ? _ok({'ok': true}) : _erro(401);
      }),
    );
    expect(await api.request('GET', '/qualquer'), {'ok': true});
    expect(expirou, isFalse);
  });

  test('refresh recusado de verdade: sessao expira', () async {
    await AppStorage.write(AppStorage.accessToken, 'velho');
    await AppStorage.write(AppStorage.refreshToken, 'refresh-1');
    var expirou = false;
    ApiClient.aoSessaoExpirar = () => expirou = true;
    final api = ApiClient(client: MockClient((_) async => _erro(401)));
    await expectLater(api.request('GET', '/qualquer'), throwsA(isA<ApiException>().having((e) => e.code, 'code', 'SESSION_EXPIRED')));
    expect(expirou, isTrue);
  });

  test('servidor fora (5xx) na renovacao: erro de conexao, o login continua guardado', () async {
    await AppStorage.write(AppStorage.accessToken, 'velho');
    await AppStorage.write(AppStorage.refreshToken, 'refresh-1');
    var expirou = false;
    ApiClient.aoSessaoExpirar = () => expirou = true;
    final api = ApiClient(
      client: MockClient((req) async => req.url.path.endsWith('/auth/refresh') ? http.Response('Bad gateway', 502) : _erro(401)),
    );
    await expectLater(api.request('GET', '/qualquer'), throwsA(isA<ApiException>().having((e) => e.isNetworkError, 'rede', isTrue)));
    expect(expirou, isFalse);
    expect(await AppStorage.read(AppStorage.refreshToken), 'refresh-1');
  });
}
