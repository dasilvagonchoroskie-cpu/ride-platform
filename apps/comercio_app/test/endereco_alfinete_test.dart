import 'dart:convert';

import 'package:comercio_app/core/api.dart';
import 'package:comercio_app/core/armazenamento.dart';
import 'package:comercio_app/dados/comercio_api.dart';
import 'package:comercio_app/dados/modelos.dart';
import 'package:comercio_app/widgets/endereco_campos.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

http.Response ok(Object data) => http.Response(jsonEncode({'success': true, 'data': data}), 200, headers: {'content-type': 'application/json'});

void main() {
  setUp(() => Armazenamento.atual = ArmazenamentoEmMemoria());

  group('cidade e UF vindos do mapa (13/11/2026)', () {
    test('"Goiatuba - GO" vira cidade e UF separados', () {
      final r = EnderecoControle.cidadeEUf('Goiatuba - GO')!;
      expect(r.cidade, 'Goiatuba');
      expect(r.uf, 'GO');
      expect(EnderecoControle.cidadeEUf('Goiatuba'), isNull);
    });

    test('escolher um resultado preenche a cidade SÓ com o nome e a UF no campo próprio', () {
      final c = EnderecoControle();
      c.escolher(const Lugar(endereco: 'Rua Javari, 5', detalhe: 'Imperial, Itumbiara - GO', latitude: -18.4, longitude: -49.2));
      expect(c.logradouro.text, 'Rua Javari');
      expect(c.numero.text, '5');
      expect(c.bairro.text, 'Imperial');
      expect(c.cidade.text, 'Itumbiara');
      expect(c.uf.text, 'GO');
      expect(c.temLocalizacao, true);
      c.dispose();
    });

    test('a cidade e a UF do ponto escolhido trocam as digitadas; o resto só se estiver vazio', () {
      final c = EnderecoControle();
      c.cidade.text = 'Goiatuba';
      c.bairro.text = 'Centro';
      c.escolher(const Lugar(endereco: 'Rua A, 10', detalhe: 'Imperial, Itumbiara - GO', latitude: -18.4, longitude: -49.2));
      expect(c.cidade.text, 'Itumbiara'); // o ponto do mapa manda
      expect(c.uf.text, 'GO');
      expect(c.bairro.text, 'Centro'); // o que a pessoa escreveu fica
      c.dispose();
    });

    test('resultado sem bairro: o bairro não vira a rua', () {
      final c = EnderecoControle();
      c.escolher(const Lugar(endereco: 'Rua B, 3', detalhe: 'Goiatuba - GO', latitude: -18.0, longitude: -49.3));
      expect(c.cidade.text, 'Goiatuba');
      expect(c.uf.text, 'GO');
      expect(c.bairro.text, '');
      c.dispose();
    });
  });

  group('alfinete', () {
    test('o ponto marcado vale mais que o texto: completar o número não apaga a localização', () {
      final c = EnderecoControle();
      c.escolher(const Lugar(endereco: 'Rua C', detalhe: 'Centro, Goiatuba - GO', latitude: -18.01, longitude: -49.35), doAlfinete: true);
      expect(c.porAlfinete, true);
      expect(c.numero.text, ''); // o alfinete não sabe o número
      c.numero.text = '77';
      c.bairro.text = 'Centro novo';
      expect(c.temLocalizacao, true);
      c.dispose();
    });

    test('alfinete preenche bairro e CEP que vieram do mapa, e troca os do ponto anterior', () {
      final c = EnderecoControle();
      c.escolher(const Lugar(endereco: 'Rua C', detalhe: 'Goiatuba - GO', latitude: -18.01, longitude: -49.35, bairro: 'Setor Sul', cep: '75600000'), doAlfinete: true);
      expect(c.bairro.text, 'Setor Sul');
      expect(c.cep.text, '75600-000');
      c.escolher(const Lugar(endereco: 'Rua D', detalhe: 'Goiatuba - GO', latitude: -18.02, longitude: -49.36, bairro: 'Centro', cep: '75600001'), doAlfinete: true);
      expect(c.bairro.text, 'Centro');
      expect(c.cep.text, '75600-001');
      // ponto que o mapa nao sabe o bairro/CEP: nao deixa o valor do ponto velho
      c.escolher(const Lugar(endereco: 'Rua E', detalhe: 'Goiatuba - GO', latitude: -18.03, longitude: -49.37), doAlfinete: true);
      expect(c.bairro.text, '');
      expect(c.cep.text, '');
      c.dispose();
    });

    test('endereço achado por busca: mexer na rua apaga a localização (precisa confirmar de novo)', () {
      final c = EnderecoControle();
      c.escolher(const Lugar(endereco: 'Rua C, 5', detalhe: 'Centro, Goiatuba - GO', latitude: -18.01, longitude: -49.35));
      c.logradouro.text = 'Rua D';
      expect(c.temLocalizacao, false);
      c.dispose();
    });

    test('ponto sem nome de rua (limite do mapa) não escreve "Ponto no mapa" no campo da rua', () {
      final c = EnderecoControle();
      c.escolher(const Lugar(endereco: 'Ponto no mapa (-18.01000, -49.35000)', detalhe: '', latitude: -18.01, longitude: -49.35), doAlfinete: true);
      expect(c.logradouro.text, '');
      expect(c.temLocalizacao, true);
      c.dispose();
    });
  });

  group('chamadas ao servidor', () {
    test('consultar o preço sem veículo escolhido manda um valor neutro (o servidor atual exige o campo)', () async {
      Map<String, dynamic>? corpo;
      final api = ComercioApi(ApiClient(cliente: MockClient((req) async {
        corpo = jsonDecode(req.body) as Map<String, dynamic>;
        return ok({'coleta': {'endereco': 'a'}, 'entrega': {'endereco': 'b'}, 'opcoes': []});
      })));
      await api.consultarPreco(DadosDeEntrega(
        descricao: 'x y z',
        destinatarioNome: 'Maria',
        destinatarioTelefone: '64999990000',
        destino: const Endereco(logradouro: 'Rua A', numero: '1', bairro: 'C', cidade: 'Goiatuba', uf: 'GO', cep: '75600000', latitude: -18.0, longitude: -49.3),
      ));
      expect(corpo!['veiculo'], 'CARRO');
    });

    test('o endereço do ponto vem de /geo/reverse com latitude e longitude', () async {
      Uri? url;
      final api = ComercioApi(ApiClient(cliente: MockClient((req) async {
        url = req.url;
        return ok({'address': 'Rua E, 9', 'detail': 'Centro, Goiatuba - GO', 'latitude': -18.01, 'longitude': -49.35});
      })));
      final l = await api.enderecoDoPonto(-18.01, -49.35);
      expect(url!.path, '/api/geo/reverse');
      expect(url!.queryParameters['lat'], '-18.01');
      expect(l!.endereco, 'Rua E, 9');
    });
  });
}
