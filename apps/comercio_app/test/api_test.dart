import 'dart:convert';

import 'package:comercio_app/core/api.dart';
import 'package:comercio_app/core/armazenamento.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

http.Response ok(Object data, [int status = 200]) => http.Response(jsonEncode({'success': true, 'data': data}), status, headers: {'content-type': 'application/json'});
http.Response erro(String code, String msg, int status) =>
    http.Response(jsonEncode({'success': false, 'error': {'code': code, 'message': msg}}), status, headers: {'content-type': 'application/json'});

void main() {
  setUp(() {
    Armazenamento.atual = ArmazenamentoEmMemoria();
  });

  test('resposta de sucesso devolve data e manda o token', () async {
    await Armazenamento.atual.gravar(Armazenamento.acesso, 'tok');
    String? auth;
    final api = ApiClient(cliente: MockClient((req) async {
      auth = req.headers['Authorization'];
      return ok({'a': 1});
    }));
    final r = await api.get('/comercio/meu');
    expect(r, {'a': 1});
    expect(auth, 'Bearer tok');
  });

  test('erro do servidor vira ApiException com a mensagem', () async {
    final api = ApiClient(cliente: MockClient((_) async => erro('FORBIDDEN', 'Seu cadastro ainda está aguardando aprovação da Central.', 403)));
    await expectLater(
      api.post('/comercio/entregas', {}),
      throwsA(isA<ApiException>().having((e) => e.message, 'message', contains('aguardando aprovação')).having((e) => e.semRede, 'semRede', isFalse)),
    );
  });

  test('queda de rede é "semRede" e nunca devolve dados', () async {
    final api = ApiClient(cliente: MockClient((_) async => throw http.ClientException('sem sinal')));
    await expectLater(api.post('/comercio/entregas', {}), throwsA(isA<ApiException>().having((e) => e.semRede, 'semRede', isTrue)));
  });

  test('resposta quebrada do servidor (5xx sem JSON) é tratada como falha de conexão', () async {
    final api = ApiClient(cliente: MockClient((_) async => http.Response('Bad gateway', 502)));
    await expectLater(api.get('/comercio/meu'), throwsA(isA<ApiException>().having((e) => e.semRede, 'semRede', isTrue)));
  });

  test('401 renova o login e repete o pedido', () async {
    await Armazenamento.atual.gravar(Armazenamento.acesso, 'velho');
    await Armazenamento.atual.gravar(Armazenamento.renovacao, 'r' * 30);
    var chamadas = 0;
    final api = ApiClient(cliente: MockClient((req) async {
      if (req.url.path.endsWith('/auth/refresh')) return ok({'accessToken': 'novo', 'refreshToken': 'r2' * 15});
      chamadas++;
      if (req.headers['Authorization'] == 'Bearer velho') return erro('UNAUTHORIZED', 'Token de acesso ausente ou invalido', 401);
      return ok({'cadastrado': false});
    }));
    final r = await api.get('/comercio/meu');
    expect(r, {'cadastrado': false});
    expect(chamadas, 2);
    expect(await Armazenamento.atual.ler(Armazenamento.acesso), 'novo');
  });

  test('401 sem renovação possível encerra a sessão', () async {
    await Armazenamento.atual.gravar(Armazenamento.acesso, 'velho');
    var expirou = false;
    final api = ApiClient(cliente: MockClient((_) async => erro('UNAUTHORIZED', 'x', 401)))..aoSessaoExpirar = () => expirou = true;
    await expectLater(api.get('/comercio/meu'), throwsA(isA<ApiException>().having((e) => e.code, 'code', 'SESSION_EXPIRED')));
    expect(expirou, isTrue);
  });

  test('senha errada no login (401) não tenta renovar nem desloga', () async {
    var expirou = false;
    final api = ApiClient(cliente: MockClient((_) async => erro('INVALID_CREDENTIALS', 'E-mail ou senha incorretos.', 401)))..aoSessaoExpirar = () => expirou = true;
    await expectLater(api.post('/auth/password/login', {}), throwsA(isA<ApiException>().having((e) => e.code, 'code', 'INVALID_CREDENTIALS')));
    expect(expirou, isFalse);
  });
}
