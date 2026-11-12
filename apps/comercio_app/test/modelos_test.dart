import 'package:comercio_app/dados/modelos.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, dynamic> entregaJson({String etapa = 'AGUARDANDO_MOTORISTA', bool final_ = false, Map<String, dynamic>? extra}) => {
      'id': 'r1',
      'codigo': 'FM100',
      'origem': 'COMERCIO',
      'etapa': etapa,
      'situacao': Etapa.rotulos[etapa],
      'final': final_,
      'criadaEm': '2026-11-12T15:00:00.000Z',
      'encomenda': '1 pizza',
      'observacoes': 'Ligar ao chegar',
      'destinatario': {'nome': 'Maria', 'telefone': '5564999990000'},
      'enderecoDeEntrega': 'Rua A, 10, Centro, Goiatuba/GO',
      'enderecoDeColeta': 'Rua B, 20, Centro, Goiatuba/GO',
      'coletaAlternativa': false,
      'veiculo': 'MOTO',
      'valorEstimadoCents': 700,
      'valorCobradoCents': 0,
      'entregueEm': null,
      'motoristaNome': null,
      'veiculoDoMotorista': null,
      ...?extra,
    };

void main() {
  test('Entrega: estado e valor vêm do servidor', () {
    final e = Entrega.fromJson(entregaJson());
    expect(e.etapa, 'AGUARDANDO_MOTORISTA');
    expect(e.final_, isFalse);
    expect(e.problema, isFalse);
    expect(e.valorCents, 700); // aberta: o estimado
    expect(e.destinatarioNome, 'Maria');
    expect(e.temPosicaoDoMotorista, isFalse);
    expect(e.codigoDeEntrega, isNull);
  });

  test('Entrega concluída mostra o valor cobrado', () {
    final e = Entrega.fromJson(entregaJson(etapa: 'ENTREGUE', final_: true, extra: {'valorCobradoCents': 850}));
    expect(e.valorCents, 850);
  });

  test('Entrega com desfecho ruim é problema', () {
    for (final etapa in ['CANCELADA', 'FALHA_NA_ENTREGA', 'SEM_MOTORISTA']) {
      expect(Entrega.fromJson(entregaJson(etapa: etapa, final_: true)).problema, isTrue, reason: etapa);
    }
  });

  test('Entrega com motorista e posição ao vivo', () {
    final e = Entrega.fromJson(entregaJson(etapa: 'A_CAMINHO_DA_COLETA', extra: {
      'motoristaNome': 'João',
      'veiculoDoMotorista': 'CG 160 · ABC1D23',
      'codigoDeEntrega': '4821',
      'aoVivo': {
        'ride': {
          'driverPosition': {'latitude': -18.01, 'longitude': -49.35},
        },
      },
    }));
    expect(e.motoristaNome, 'João');
    expect(e.codigoDeEntrega, '4821');
    expect(e.temPosicaoDoMotorista, isTrue);
    expect(e.motoristaLatitude, closeTo(-18.01, 1e-9));
  });

  test('Entrega aguenta resposta sem campos opcionais', () {
    final e = Entrega.fromJson({'id': 'x'});
    expect(e.id, 'x');
    expect(e.etapa, 'CRIADA');
    expect(e.valorCents, 0);
  });

  test('Cotação traz só as opções que o servidor liberou', () {
    final c = Cotacao.fromJson({
      'coleta': {'endereco': 'Rua B, 20', 'alternativa': false},
      'entrega': {'endereco': 'Rua A, 10'},
      'distanciaMetros': 2300,
      'duracaoSegundos': 480,
      'opcoes': [
        {'veiculo': 'MOTO', 'nome': 'Moto', 'valorCents': 700},
      ],
      'cotacao': 'assinada',
    });
    expect(c.opcoes.length, 1);
    expect(c.opcao('MOTO')!.valorCents, 700);
    expect(c.opcao('CARRO'), isNull);
    expect(c.assinatura, 'assinada');
    expect(Cotacao.fromJson({'opcoes': []}).opcoes, isEmpty);
  });

  test('Histórico sabe se há mais páginas', () {
    final h = Historico.fromJson({'total': 45, 'pagina': 1, 'porPagina': 20, 'itens': [entregaJson()]});
    expect(h.temMais, isTrue);
    expect(Historico.fromJson({'total': 20, 'pagina': 1, 'porPagina': 20, 'itens': []}).temMais, isFalse);
  });

  test('Gastos', () {
    final g = Gastos.fromJson({
      'periodo': {'de': '2026-11-01T03:00:00.000Z', 'ate': '2026-12-01T03:00:00.000Z'},
      'realizadas': 3,
      'canceladas': 1,
      'emAndamento': 2,
      'totalCents': 2100,
      'cobrancas': [
        {'id': 'r1', 'codigo': 'FM1', 'em': '2026-11-05T12:00:00.000Z', 'destinatario': 'Maria', 'valorCents': 700},
      ],
    });
    expect(g.totalCents, 2100);
    expect(g.cobrancas.single.valorCents, 700);
  });

  test('Repetição devolve só dados para preencher (rua vem do endereço por extenso)', () {
    final r = Repeticao.fromJson({
      'encomenda': {'descricao': '1 pizza', 'observacoes': null},
      'destinatario': {'nome': 'Maria', 'telefone': '5564999990000'},
      'destino': {
        'porExtenso': 'Rua A, 10, Centro, Goiatuba/GO, CEP 75600-000',
        'latitude': -18.0,
        'longitude': -49.3,
        'numero': '10',
        'complemento': null,
        'bairro': 'Centro',
        'cidade': 'Goiatuba',
        'uf': 'GO',
        'cep': '75600000',
        'referencia': 'perto da praça',
      },
      'veiculo': 'MOTO',
      'criaEntrega': false,
      'aviso': 'Confira os dados.',
    });
    expect(r.descricao, '1 pizza');
    expect(r.destino.logradouro, 'Rua A');
    expect(r.destino.numero, '10');
    expect(r.referencia, 'perto da praça');
    expect(r.aviso, 'Confira os dados.');
  });

  test('Estabelecimento e situação', () {
    final e = Estabelecimento.fromJson({
      'id': 'c1',
      'nomeFantasia': 'Pizzaria Boa',
      'cnpj': '11222333000181',
      'responsavelNome': 'Ana',
      'telefone': '+5564999998888',
      'email': 'loja@exemplo.com',
      'endereco': {'logradouro': 'Rua B', 'numero': '20', 'bairro': 'Centro', 'cidade': 'Goiatuba', 'uf': 'GO', 'cep': '75600000', 'latitude': -18.0, 'longitude': -49.3, 'porExtenso': 'Rua B, 20'},
      'situacao': 'AGUARDANDO',
      'situacaoRotulo': 'Aguardando aprovação',
    });
    expect(e.aprovado, isFalse);
    expect(e.endereco.temLocalizacao, isTrue);
  });
}
