import 'dart:math';

/// Entrega manual lancada pela Central (13/11/2026). Tudo vem do servidor
/// (`/admin/manual-deliveries/*`): o aplicativo nao calcula preco nem decide
/// quem pode receber entrega; so pergunta e mostra.

String _txt(Object? v, [String vazio = '']) {
  final s = v is String ? v.trim() : '';
  return s.isEmpty ? vazio : s;
}

int _int(Object? v) => v is num ? v.toInt() : int.tryParse('${v ?? ''}') ?? 0;

class LojaAchada {
  const LojaAchada({
    required this.id,
    required this.nome,
    required this.endereco,
    required this.cidade,
    required this.telefoneFinal,
    required this.situacaoRotulo,
    required this.podeLancar,
    this.motivo,
  });

  final String id;
  final String nome;
  final String endereco;
  final String cidade;
  final String telefoneFinal;
  final String situacaoRotulo;
  final bool podeLancar;
  final String? motivo;

  factory LojaAchada.fromJson(Map<String, dynamic> j) => LojaAchada(
        id: _txt(j['id']),
        nome: _txt(j['nomeFantasia'], 'Estabelecimento'),
        endereco: _txt(j['endereco']),
        cidade: _txt(j['cidade']),
        telefoneFinal: _txt(j['telefoneFinal']),
        situacaoRotulo: _txt(j['situacaoRotulo']),
        podeLancar: j['podeLancar'] == true,
        motivo: j['motivo'] as String?,
      );
}

class ResultadoDaBuscaDeLoja {
  const ResultadoDaBuscaDeLoja({required this.itens, required this.liberado});

  final List<LojaAchada> itens;

  /// Chave geral do Comercio ligada (quem decide e so o proprietario).
  final bool liberado;

  factory ResultadoDaBuscaDeLoja.fromJson(Map<String, dynamic> j) => ResultadoDaBuscaDeLoja(
        itens: [for (final x in (j['itens'] as List? ?? const []).whereType<Map<String, dynamic>>()) LojaAchada.fromJson(x)],
        liberado: j['liberado'] == true,
      );
}

class PerfilDaLoja {
  const PerfilDaLoja({
    required this.id,
    required this.nome,
    required this.razaoSocial,
    required this.cnpj,
    required this.telefone,
    required this.enderecoDeRetirada,
    required this.cidade,
    required this.uf,
    required this.situacaoRotulo,
    required this.podeLancar,
    required this.entregasConcluidas,
    this.motivo,
  });

  final String id;
  final String nome;
  final String razaoSocial;
  final String cnpj;
  final String telefone;
  final String enderecoDeRetirada;
  final String cidade;
  final String uf;
  final String situacaoRotulo;
  final bool podeLancar;
  final String? motivo;
  final int entregasConcluidas;

  factory PerfilDaLoja.fromJson(Map<String, dynamic> j) => PerfilDaLoja(
        id: _txt(j['id']),
        nome: _txt(j['nomeFantasia'], 'Estabelecimento'),
        razaoSocial: _txt(j['razaoSocial']),
        cnpj: _txt(j['cnpj']),
        telefone: _txt(j['telefone']),
        enderecoDeRetirada: _txt(j['enderecoDeRetirada']),
        cidade: _txt(j['cidade']),
        uf: _txt(j['uf']).toUpperCase(),
        situacaoRotulo: _txt(j['situacaoRotulo']),
        podeLancar: j['podeLancar'] == true,
        motivo: j['motivo'] as String?,
        entregasConcluidas: _int(j['entregasConcluidas']),
      );
}

/// Uma opcao de preco do servidor (Moto ou Carro), so das que a cidade aceita.
class OpcaoDeEntrega {
  const OpcaoDeEntrega({required this.veiculo, required this.nome, required this.valorCents});

  final String veiculo;
  final String nome;
  final int valorCents;

  bool get moto => veiculo == 'MOTO';
}

class CotacaoDaCentral {
  const CotacaoDaCentral({
    required this.opcoes,
    required this.coleta,
    required this.entrega,
    required this.distanciaMetros,
    this.cotacao,
  });

  final List<OpcaoDeEntrega> opcoes;
  final String coleta;
  final String entrega;
  final int distanciaMetros;

  /// Medida assinada do servidor: volta no pedido para ele nao medir a rota de novo.
  final String? cotacao;

  OpcaoDeEntrega? opcao(String veiculo) {
    for (final o in opcoes) {
      if (o.veiculo == veiculo) return o;
    }
    return null;
  }

  factory CotacaoDaCentral.fromJson(Map<String, dynamic> j) => CotacaoDaCentral(
        opcoes: [
          for (final o in (j['opcoes'] as List? ?? const []).whereType<Map<String, dynamic>>())
            OpcaoDeEntrega(veiculo: _txt(o['veiculo']), nome: _txt(o['nome']), valorCents: _int(o['valorCents'])),
        ],
        coleta: _txt((j['coleta'] as Map?)?['endereco']),
        entrega: _txt((j['entrega'] as Map?)?['endereco']),
        distanciaMetros: _int(j['distanciaMetros']),
        cotacao: j['cotacao'] as String?,
      );
}

/// Chave de idempotencia (16 a 64 letras, numeros, _ e -): o mesmo toque
/// repetido depois de uma queda de rede nao cria outra entrega.
String novaChaveDeEntregaDaCentral([Random? r]) {
  const alfabeto = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  final sorte = r ?? Random.secure();
  return 'ce-${DateTime.now().millisecondsSinceEpoch.toRadixString(36)}-${List.generate(20, (_) => alfabeto[sorte.nextInt(alfabeto.length)]).join()}';
}
