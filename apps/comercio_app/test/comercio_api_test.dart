import 'dart:convert';

import 'package:comercio_app/core/api.dart';
import 'package:comercio_app/core/armazenamento.dart';
import 'package:comercio_app/dados/comercio_api.dart';
import 'package:comercio_app/dados/modelos.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

http.Response ok(Object data) => http.Response(jsonEncode({'success': true, 'data': data}), 200, headers: {'content-type': 'application/json'});

DadosDeEntrega dados({Lugar? coleta}) => DadosDeEntrega(
      descricao: ' 1 pizza ',
      observacoes: '',
      coletaAlternativa: coleta,
      destinatarioNome: ' Maria ',
      destinatarioTelefone: '(64) 99999-0000',
      destino: const Endereco(
        logradouro: 'Rua A',
        numero: '10',
        complemento: '',
        bairro: 'Centro',
        cidade: 'Goiatuba',
        uf: 'go',
        cep: '75600-000',
        latitude: -18.01,
        longitude: -49.35,
      ),
      referencia: 'perto da praça',
      veiculo: 'MOTO',
    );

void main() {
  setUp(() {
    Armazenamento.atual = ArmazenamentoEmMemoria();
  });

  test('o pedido leva a chave, a medida do preço e os dados limpos', () async {
    Map<String, dynamic>? corpo;
    final api = ComercioApi(ApiClient(cliente: MockClient((req) async {
      expect(req.url.path, '/api/comercio/entregas');
      corpo = jsonDecode(req.body) as Map<String, dynamic>;
      return ok({'id': 'r1', 'codigo': 'FM1', 'etapa': 'AGUARDANDO_MOTORISTA', 'situacao': 'Aguardando motorista', 'final': false, 'repetido': false});
    })));
    final e = await api.pedirEntrega('c' * 32, dados(), 'assinada');
    expect(e.id, 'r1');
    expect(corpo!['chave'], 'c' * 32);
    expect(corpo!['cotacao'], 'assinada');
    expect(corpo!['veiculo'], 'MOTO');
    expect((corpo!['encomenda'] as Map)['descricao'], '1 pizza');
    expect((corpo!['encomenda'] as Map).containsKey('observacoes'), isFalse); // vazio não vai
    expect(corpo!.containsKey('coletaAlternativa'), isFalse); // coleta no endereço da loja
    final destino = corpo!['destino'] as Map;
    expect(destino['uf'], 'GO');
    expect(destino['cep'], '75600000');
    expect(destino.containsKey('complemento'), isFalse);
    expect(destino['latitude'], -18.01);
  });

  test('coleta em outro endereço vai com a posição', () async {
    Map<String, dynamic>? corpo;
    final api = ComercioApi(ApiClient(cliente: MockClient((req) async {
      corpo = jsonDecode(req.body) as Map<String, dynamic>;
      return ok({'coleta': {'endereco': 'x', 'alternativa': true}, 'entrega': {'endereco': 'y'}, 'opcoes': []});
    })));
    await api.consultarPreco(dados(coleta: const Lugar(endereco: 'Av. C, 5', detalhe: 'Centro', latitude: -18.0, longitude: -49.0)));
    final alt = corpo!['coletaAlternativa'] as Map;
    expect(alt['address'], 'Av. C, 5');
    expect(alt['latitude'], -18.0);
    expect(corpo!.containsKey('chave'), isFalse); // consultar preço não leva chave: não cria nada
  });

  test('falha de rede ao pedir NUNCA devolve uma entrega', () async {
    final api = ComercioApi(ApiClient(cliente: MockClient((req) async => throw http.ClientException('caiu'))));
    await expectLater(api.pedirEntrega('c' * 32, dados(), null), throwsA(isA<ApiException>().having((e) => e.semRede, 'semRede', isTrue)));
  });

  test('o mesmo pedido repetido manda a MESMA chave', () async {
    final chaves = <String>[];
    var chamada = 0;
    final api = ComercioApi(ApiClient(cliente: MockClient((req) async {
      chaves.add((jsonDecode(req.body) as Map)['chave'] as String);
      chamada++;
      if (chamada == 1) throw http.ClientException('caiu'); // 1º: sem resposta
      return ok({'id': 'r1', 'repetido': true});
    })));
    final chave = 'k' * 32;
    await expectLater(api.pedirEntrega(chave, dados(), null), throwsA(isA<ApiException>()));
    final e = await api.pedirEntrega(chave, dados(), null);
    expect(chaves, [chave, chave]);
    expect(e.repetido, isTrue);
  });

  test('meu(): sem cadastro devolve null', () async {
    final api = ComercioApi(ApiClient(cliente: MockClient((_) async => ok({'cadastrado': false, 'comercio': null}))));
    expect(await api.meu(), isNull);
  });

  test('cadastro manda só números no CNPJ/CPF/CEP e a senha só se informada', () async {
    Map<String, dynamic>? corpo;
    final api = ComercioApi(ApiClient(cliente: MockClient((req) async {
      corpo = jsonDecode(req.body) as Map<String, dynamic>;
      return ok({
        'id': 'c1',
        'nomeFantasia': 'Pizzaria Boa',
        'cnpj': '11222333000181',
        'endereco': {},
        'situacao': 'AGUARDANDO',
      });
    })));
    final c = await api.cadastrar(DadosDoCadastro(
      nomeFantasia: ' Pizzaria Boa ',
      cnpj: '11.222.333/0001-81',
      responsavelNome: 'Ana',
      responsavelCpf: '529.982.247-25',
      telefone: '(64) 99999-8888',
      email: ' Loja@Exemplo.com ',
      endereco: const Endereco(logradouro: 'Rua B', numero: '20', bairro: 'Centro', cidade: 'Goiatuba', uf: 'GO', cep: '75600-000', latitude: -18.0, longitude: -49.3),
      senha: 'abc12345',
    ));
    expect(c.situacao, Situacao.aguardando);
    expect(corpo!['cnpj'], '11222333000181');
    expect(corpo!['responsavelCpf'], '52998224725');
    expect(corpo!['email'], 'loja@exemplo.com');
    expect(corpo!['cep'], '75600000');
    expect(corpo!['senha'], 'abc12345');
    expect(corpo!.containsKey('razaoSocial'), isFalse);
  });

  test('busca de endereço usa o centro padrão quando não há loja', () async {
    Map<String, String>? q;
    final api = ComercioApi(ApiClient(cliente: MockClient((req) async {
      q = req.url.queryParameters;
      return ok([
        {'address': 'Rua A, 10', 'detail': 'Centro, Goiatuba', 'latitude': -18.01, 'longitude': -49.35, 'distanceKm': 1},
        {'address': 'sem posição', 'detail': ''},
      ]);
    })));
    final r = await api.buscarEndereco('Rua A 10');
    expect(r.length, 1); // resultado sem posição é descartado
    expect(q!['q'], 'Rua A 10');
    expect(q!.containsKey('lat'), isTrue);
  });
}
