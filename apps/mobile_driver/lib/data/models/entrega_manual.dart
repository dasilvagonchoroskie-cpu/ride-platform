import 'dart:math';

/// Lancamento manual de entrega do Comercio pelo motorista (12/11/2026).
///
/// Tudo aqui vem do servidor (`/driver/manual-deliveries/*`): o aplicativo
/// nao calcula preco, nao decide quem pode lancar e nao libera nada. As cinco
/// portas (e-mail confirmado, loja aprovada, chave geral, Entrega ligada na
/// cidade, veiculo aceito) sao conferidas no servidor a cada passo.

String _txt(Object? v, [String vazio = '']) {
  final s = v is String ? v.trim() : '';
  return s.isEmpty ? vazio : s;
}

int _int(Object? v) => v is num ? v.toInt() : int.tryParse('${v ?? ''}') ?? 0;

/// Um estabelecimento achado na busca (so o que ajuda a reconhecer: nada de CNPJ ou telefone inteiro).
class EstabelecimentoAchado {
  const EstabelecimentoAchado({
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

  /// Cadastro apto (aprovado). As outras portas o servidor confere no lancamento.
  final bool podeLancar;

  /// Por que nao pode (null = pode).
  final String? motivo;

  factory EstabelecimentoAchado.fromJson(Map<String, dynamic> j) => EstabelecimentoAchado(
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

class ResultadoDaBusca {
  const ResultadoDaBusca({required this.itens, required this.liberado});

  final List<EstabelecimentoAchado> itens;

  /// Chave geral do Comercio ligada na Central (so quem decide e o proprietario).
  final bool liberado;

  factory ResultadoDaBusca.fromJson(Map<String, dynamic> j) => ResultadoDaBusca(
        itens: [for (final x in (j['itens'] as List? ?? const []).whereType<Map<String, dynamic>>()) EstabelecimentoAchado.fromJson(x)],
        liberado: j['liberado'] == true,
      );
}

/// Uma linha do historico recente do estabelecimento (sem endereco nem telefone de quem recebe).
class HistoricoDoEstabelecimento {
  const HistoricoDoEstabelecimento({required this.codigo, required this.situacao, required this.origem, required this.bairro, this.em});

  final String codigo;
  final String situacao;

  /// APP (pedida pelo aplicativo do estabelecimento) ou MOTORISTA (lancada por motorista).
  final String origem;
  final String bairro;
  final DateTime? em;

  String get origemRotulo => origem == 'MOTORISTA' ? 'lançada por motorista' : 'pelo aplicativo';

  factory HistoricoDoEstabelecimento.fromJson(Map<String, dynamic> j) => HistoricoDoEstabelecimento(
        codigo: _txt(j['codigo']),
        situacao: _txt(j['situacao']),
        origem: _txt(j['origem'], 'APP'),
        bairro: _txt(j['bairro']),
        em: DateTime.tryParse(_txt(j['em']))?.toLocal(),
      );
}

/// Perfil para o motorista confirmar que e o estabelecimento certo.
class PerfilDoEstabelecimento {
  const PerfilDoEstabelecimento({
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
    required this.historico,
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

  /// So entregas CONCLUIDAS (pedido iniciado ou cancelado nao conta).
  final int entregasConcluidas;
  final List<HistoricoDoEstabelecimento> historico;

  factory PerfilDoEstabelecimento.fromJson(Map<String, dynamic> j) => PerfilDoEstabelecimento(
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
        historico: [
          for (final x in (j['historico'] as List? ?? const []).whereType<Map<String, dynamic>>()) HistoricoDoEstabelecimento.fromJson(x),
        ],
      );
}

/// Endereco do destino da entrega, como o servidor exige (rua, numero, bairro,
/// cidade, UF, CEP e a posicao confirmada no mapa).
class DestinoDaEntrega {
  const DestinoDaEntrega({
    required this.logradouro,
    required this.numero,
    required this.bairro,
    required this.cidade,
    required this.uf,
    required this.cep,
    required this.latitude,
    required this.longitude,
    this.complemento,
    this.referencia,
  });

  final String logradouro;
  final String numero;
  final String? complemento;
  final String bairro;
  final String cidade;
  final String uf;
  final String cep;
  final double latitude;
  final double longitude;
  final String? referencia;

  Map<String, dynamic> toJson() => {
        'logradouro': logradouro.trim(),
        'numero': numero.trim(),
        if ((complemento ?? '').trim().isNotEmpty) 'complemento': complemento!.trim(),
        'bairro': bairro.trim(),
        'cidade': cidade.trim(),
        'uf': uf.trim().toUpperCase(),
        'cep': cep.replaceAll(RegExp(r'\D'), ''),
        'latitude': latitude,
        'longitude': longitude,
        if ((referencia ?? '').trim().isNotEmpty) 'referencia': referencia!.trim(),
      };

  String get porExtenso => '${logradouro.trim()}, ${numero.trim()} - ${bairro.trim()}, ${cidade.trim()} - ${uf.trim().toUpperCase()}';
}

/// O que o motorista digita para a entrega (a encomenda e quem recebe).
class DadosDaEntregaManual {
  const DadosDaEntregaManual({
    required this.comercioId,
    required this.descricao,
    required this.destinatarioNome,
    required this.destinatarioTelefone,
    required this.destino,
    this.observacoes,
  });

  final String comercioId;
  final String descricao;
  final String? observacoes;
  final String destinatarioNome;
  final String destinatarioTelefone;
  final DestinoDaEntrega destino;

  Map<String, dynamic> toJson({String? chave, String? cotacao, int? valorEsperadoCents}) => {
        'comercioId': comercioId,
        if (chave != null) 'chave': chave,
        'encomenda': {
          'descricao': descricao.trim(),
          if ((observacoes ?? '').trim().isNotEmpty) 'observacoes': observacoes!.trim(),
        },
        'destinatario': {'nome': destinatarioNome.trim(), 'telefone': destinatarioTelefone.trim()},
        'destino': destino.toJson(),
        if (cotacao != null && cotacao.isNotEmpty) 'cotacao': cotacao,
        if (valorEsperadoCents != null) 'valorEsperadoCents': valorEsperadoCents,
      };
}

/// Preco oficial calculado pelo servidor para o veiculo do proprio motorista.
class CotacaoDaEntrega {
  const CotacaoDaEntrega({
    required this.valorCents,
    required this.veiculo,
    required this.coleta,
    required this.entrega,
    required this.distanciaMetros,
    required this.duracaoSegundos,
    this.cotacao,
  });

  final int valorCents;

  /// MOTO ou CARRO (o veiculo em uso do motorista).
  final String veiculo;
  final String coleta;
  final String entrega;
  final int distanciaMetros;
  final int duracaoSegundos;

  /// Medida assinada: o pedido a devolve para o servidor nao medir a rota de novo.
  final String? cotacao;

  bool get moto => veiculo == 'MOTO';

  /// null = o servidor nao tem preco para este veiculo agora.
  static CotacaoDaEntrega? ler(Map<String, dynamic> j) {
    final veiculo = _txt(j['veiculo']);
    final opcoes = (j['opcoes'] as List? ?? const []).whereType<Map<String, dynamic>>().where((o) => _txt(o['veiculo']) == veiculo);
    if (opcoes.isEmpty) return null;
    return CotacaoDaEntrega(
      valorCents: _int(opcoes.first['valorCents']),
      veiculo: veiculo,
      coleta: _txt((j['coleta'] as Map?)?['endereco']),
      entrega: _txt((j['entrega'] as Map?)?['endereco']),
      distanciaMetros: _int(j['distanciaMetros']),
      duracaoSegundos: _int(j['duracaoSegundos']),
      cotacao: j['cotacao'] as String?,
    );
  }
}

/// Um endereco achado na busca do mapa (o mesmo servico da corrida).
class LugarAchado {
  const LugarAchado({required this.endereco, required this.detalhe, required this.latitude, required this.longitude});

  final String endereco;
  final String detalhe;
  final double latitude;
  final double longitude;

  static LugarAchado? tentar(Object? j) {
    if (j is! Map) return null;
    final lat = j['latitude'];
    final lng = j['longitude'];
    if (lat is! num || lng is! num) return null;
    return LugarAchado(endereco: _txt(j['address']), detalhe: _txt(j['detail']), latitude: lat.toDouble(), longitude: lng.toDouble());
  }
}

/// Chave de idempotencia (16 a 64 letras, numeros, _ e -): o mesmo toque
/// repetido depois de uma queda de rede nao cria outra entrega.
String novaChaveDeEntrega([Random? r]) {
  const alfabeto = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  final sorte = r ?? Random.secure();
  return 'dm-${DateTime.now().millisecondsSinceEpoch.toRadixString(36)}-${List.generate(20, (_) => alfabeto[sorte.nextInt(alfabeto.length)]).join()}';
}
