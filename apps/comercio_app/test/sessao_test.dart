import 'dart:convert';

import 'package:comercio_app/core/api.dart';
import 'package:comercio_app/core/armazenamento.dart';
import 'package:comercio_app/dados/modelos.dart';
import 'package:comercio_app/estado/sessao.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

http.Response ok(Object data) => http.Response(jsonEncode({'success': true, 'data': data}), 200, headers: {'content-type': 'application/json'});

Map<String, dynamic> login({String role = 'PASSENGER'}) => {
      'accessToken': 'acesso-123',
      'refreshToken': 'renova-${'x' * 30}',
      'user': {'id': 'u1', 'role': role, 'name': 'Loja'},
    };

Sessao montar(Future<http.Response> Function(http.Request) resposta) => Sessao(api: ApiClient(cliente: MockClient(resposta)));

void main() {
  setUp(() {
    Armazenamento.atual = ArmazenamentoEmMemoria();
  });

  test('entrar com código guarda o login e descobre que falta cadastrar', () async {
    final pedidos = <String>[];
    final s = montar((req) async {
      pedidos.add('${req.method} ${req.url.path}');
      if (req.url.path.endsWith('/auth/otp/verify')) {
        final corpo = jsonDecode(req.body) as Map<String, dynamic>;
        expect(corpo['role'], 'PASSENGER');
        expect(corpo['email'], 'loja@exemplo.com');
        expect((corpo['device'] as Map)['platform'], 'ANDROID');
        return ok(login());
      }
      if (req.url.path.endsWith('/comercio/meu')) return ok({'cadastrado': false, 'comercio': null});
      return http.Response('?', 404);
    });
    await s.entrarComCodigo(' Loja@Exemplo.com ', '123456');
    expect(s.logado, isTrue);
    expect(s.cadastrado, isFalse);
    expect(s.email, 'loja@exemplo.com');
    expect(await Armazenamento.atual.ler(Armazenamento.acesso), 'acesso-123');
    expect(await Armazenamento.atual.ler(Armazenamento.email), 'loja@exemplo.com');
    expect(pedidos, contains('GET /api/comercio/meu'));
  });

  test('conta de motorista ou da Central não entra no Comércio', () async {
    final s = montar((req) async => ok(login(role: 'DRIVER')));
    await expectLater(s.entrarComSenha('a@b.com', 'senha1234'), throwsA(isA<ApiException>().having((e) => e.code, 'code', 'PAPEL_INVALIDO')));
    expect(s.logado, isFalse);
    expect(await Armazenamento.atual.ler(Armazenamento.acesso), isNull);
  });

  test('conta que exige duas etapas não entra', () async {
    final s = montar((req) async => ok({'precisa2fa': true, 'desafio': 'x', 'nome': 'Dono'}));
    await expectLater(s.entrarComSenha('a@b.com', 'senha1234'), throwsA(isA<ApiException>().having((e) => e.code, 'code', 'DOIS_FATORES')));
    expect(s.logado, isFalse);
  });

  test('ao abrir o app com login guardado, confere a situação do estabelecimento', () async {
    await Armazenamento.atual.gravar(Armazenamento.acesso, 'acesso-123');
    await Armazenamento.atual.gravar(Armazenamento.email, 'loja@exemplo.com');
    final s = montar((req) async => ok({
          'cadastrado': true,
          'comercio': {
            'id': 'c1',
            'nomeFantasia': 'Pizzaria Boa',
            'cnpj': '11222333000181',
            'responsavelNome': 'Ana',
            'telefone': '+5564999998888',
            'email': 'loja@exemplo.com',
            'endereco': {'logradouro': 'Rua B', 'numero': '20', 'bairro': 'Centro', 'cidade': 'Goiatuba', 'uf': 'GO', 'cep': '75600000'},
            'situacao': 'SUSPENSO',
            'situacaoRotulo': 'Seu estabelecimento está suspenso. Fale com a Central.',
            'motivo': 'Documento vencido',
          },
        }));
    await s.iniciar();
    expect(s.iniciando, isFalse);
    expect(s.logado, isTrue);
    expect(s.cadastrado, isTrue);
    expect(s.aprovado, isFalse);
    expect(s.estabelecimento!.situacao, Situacao.suspenso);
    expect(s.estabelecimento!.motivo, 'Documento vencido');
    expect(s.email, 'loja@exemplo.com');
  });

  test('sem rede ao abrir: continua logado, mas avisa a falha (não finge que não há cadastro)', () async {
    await Armazenamento.atual.gravar(Armazenamento.acesso, 'acesso-123');
    final s = montar((req) async => throw http.ClientException('offline'));
    await s.iniciar();
    expect(s.logado, isTrue);
    expect(s.cadastrado, isFalse);
    expect(s.falha, isNotNull);
  });

  test('sair apaga o login deste aparelho mesmo sem rede', () async {
    await Armazenamento.atual.gravar(Armazenamento.acesso, 'acesso-123');
    await Armazenamento.atual.gravar(Armazenamento.renovacao, 'r' * 30);
    final s = montar((req) async => throw http.ClientException('offline'));
    await s.sair();
    expect(s.logado, isFalse);
    expect(await Armazenamento.atual.ler(Armazenamento.acesso), isNull);
    expect(await Armazenamento.atual.ler(Armazenamento.renovacao), isNull);
  });

  test('chave de pedido tem o formato que o servidor aceita e não se repete', () {
    final a = novaChaveDePedido();
    final b = novaChaveDePedido();
    expect(RegExp(r'^[A-Za-z0-9_-]{16,64}$').hasMatch(a), isTrue);
    expect(a, isNot(b));
  });
}
