/// Modelos das respostas do servidor (modulo /comercio). Tudo vem pronto do
/// servidor: o app nao calcula preco, estado nem permissao.
Map<String, dynamic> _mapa(dynamic v) => v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};
String _txt(dynamic v, [String padrao = '']) => v == null ? padrao : v.toString();
int _int(dynamic v, [int padrao = 0]) => v is num ? v.toInt() : (int.tryParse(_txt(v)) ?? padrao);
double? _dbl(dynamic v) => v is num ? v.toDouble() : double.tryParse(_txt(v));

class Endereco {
  const Endereco({
    required this.logradouro,
    required this.numero,
    this.complemento,
    required this.bairro,
    required this.cidade,
    required this.uf,
    required this.cep,
    this.latitude,
    this.longitude,
    this.porExtenso = '',
  });

  final String logradouro;
  final String numero;
  final String? complemento;
  final String bairro;
  final String cidade;
  final String uf;
  final String cep;
  final double? latitude;
  final double? longitude;
  final String porExtenso;

  bool get temLocalizacao => latitude != null && longitude != null;

  factory Endereco.fromJson(dynamic j) {
    final m = _mapa(j);
    return Endereco(
      logradouro: _txt(m['logradouro']),
      numero: _txt(m['numero']),
      complemento: m['complemento'] == null ? null : _txt(m['complemento']),
      bairro: _txt(m['bairro']),
      cidade: _txt(m['cidade']),
      uf: _txt(m['uf']),
      cep: _txt(m['cep']),
      latitude: _dbl(m['latitude']),
      longitude: _dbl(m['longitude']),
      porExtenso: _txt(m['porExtenso']),
    );
  }
}

/// Situacao do cadastro do estabelecimento (decidida pela Central).
class Situacao {
  const Situacao._();
  static const aguardando = 'AGUARDANDO';
  static const aprovado = 'APROVADO';
  static const suspenso = 'SUSPENSO';
  static const rejeitado = 'REJEITADO';
}

class Estabelecimento {
  const Estabelecimento({
    required this.id,
    required this.nomeFantasia,
    this.razaoSocial,
    required this.cnpj,
    required this.responsavelNome,
    this.responsavelCpf,
    required this.telefone,
    required this.email,
    required this.endereco,
    required this.situacao,
    required this.situacaoRotulo,
    this.motivo,
    this.entregasLiberadas = true,
    this.termosVersao,
  });

  final String id;
  final String nomeFantasia;
  final String? razaoSocial;
  final String cnpj;
  final String responsavelNome;
  final String? responsavelCpf;
  final String telefone;
  final String email;
  final Endereco endereco;
  final String situacao;
  final String situacaoRotulo;
  final String? motivo;

  /// Chave geral da Central: enquanto estiver bloqueada, ninguem pede entrega
  /// (o servidor tambem recusa). Servidor antigo, sem o campo: segue como liberado.
  final bool entregasLiberadas;

  /// Versao dos termos de uso que a loja aceitou no cadastro (null = cadastro antigo).
  final String? termosVersao;

  bool get aprovado => situacao == Situacao.aprovado;

  factory Estabelecimento.fromJson(dynamic j) {
    final m = _mapa(j);
    return Estabelecimento(
      id: _txt(m['id']),
      nomeFantasia: _txt(m['nomeFantasia']),
      razaoSocial: m['razaoSocial'] == null ? null : _txt(m['razaoSocial']),
      cnpj: _txt(m['cnpj']),
      responsavelNome: _txt(m['responsavelNome']),
      responsavelCpf: m['responsavelCpf'] == null ? null : _txt(m['responsavelCpf']),
      telefone: _txt(m['telefone']),
      email: _txt(m['email']),
      endereco: Endereco.fromJson(m['endereco']),
      situacao: _txt(m['situacao'], Situacao.aguardando),
      situacaoRotulo: _txt(m['situacaoRotulo']),
      motivo: m['motivo'] == null ? null : _txt(m['motivo']),
      entregasLiberadas: m['entregasLiberadas'] != false,
      termosVersao: m['termosVersao'] == null ? null : _txt(m['termosVersao']),
    );
  }
}

/// Um endereco achado na busca do mapa.
class Lugar {
  const Lugar({required this.endereco, required this.detalhe, required this.latitude, required this.longitude});

  final String endereco;
  final String detalhe;
  final double latitude;
  final double longitude;

  static Lugar? tentar(dynamic j) {
    final m = _mapa(j);
    final lat = _dbl(m['latitude']);
    final lng = _dbl(m['longitude']);
    if (lat == null || lng == null) return null;
    return Lugar(endereco: _txt(m['address']), detalhe: _txt(m['detail']), latitude: lat, longitude: lng);
  }
}

class OpcaoPreco {
  const OpcaoPreco({required this.veiculo, required this.nome, required this.valorCents});

  /// 'MOTO' ou 'CARRO'.
  final String veiculo;
  final String nome;
  final int valorCents;

  factory OpcaoPreco.fromJson(dynamic j) {
    final m = _mapa(j);
    return OpcaoPreco(veiculo: _txt(m['veiculo']), nome: _txt(m['nome']), valorCents: _int(m['valorCents']));
  }
}

class Cotacao {
  const Cotacao({
    required this.enderecoColeta,
    required this.coletaAlternativa,
    required this.enderecoEntrega,
    this.distanciaMetros,
    this.duracaoSegundos,
    required this.opcoes,
    this.assinatura,
  });

  final String enderecoColeta;
  final bool coletaAlternativa;
  final String enderecoEntrega;
  final num? distanciaMetros;
  final num? duracaoSegundos;

  /// So os veiculos que a Central liberou na cidade. Vazio = entrega
  /// indisponivel agora.
  final List<OpcaoPreco> opcoes;
  final String? assinatura;

  OpcaoPreco? opcao(String veiculo) {
    for (final o in opcoes) {
      if (o.veiculo == veiculo) return o;
    }
    return null;
  }

  factory Cotacao.fromJson(dynamic j) {
    final m = _mapa(j);
    final coleta = _mapa(m['coleta']);
    final entrega = _mapa(m['entrega']);
    final lista = m['opcoes'] is List ? (m['opcoes'] as List) : const [];
    return Cotacao(
      enderecoColeta: _txt(coleta['endereco']),
      coletaAlternativa: coleta['alternativa'] == true,
      enderecoEntrega: _txt(entrega['endereco']),
      distanciaMetros: m['distanciaMetros'] is num ? m['distanciaMetros'] as num : null,
      duracaoSegundos: m['duracaoSegundos'] is num ? m['duracaoSegundos'] as num : null,
      opcoes: lista.map(OpcaoPreco.fromJson).toList(),
      assinatura: m['cotacao'] == null ? null : _txt(m['cotacao']),
    );
  }
}

/// Etapas que o servidor devolve (texto pronto em `situacao`).
class Etapa {
  const Etapa._();
  static const ordem = <String>[
    'CRIADA',
    'AGUARDANDO_MOTORISTA',
    'MOTORISTA_ENCONTRADO',
    'A_CAMINHO_DA_COLETA',
    'NO_ESTABELECIMENTO',
    'COLETADA',
    'A_CAMINHO_DA_ENTREGA',
    'ENTREGUE',
  ];

  static const rotulos = <String, String>{
    'CRIADA': 'Solicitação criada',
    'AGUARDANDO_MOTORISTA': 'Aguardando motorista',
    'MOTORISTA_ENCONTRADO': 'Motorista encontrado',
    'A_CAMINHO_DA_COLETA': 'Motorista a caminho da coleta',
    'NO_ESTABELECIMENTO': 'Motorista chegou ao estabelecimento',
    'COLETADA': 'Encomenda coletada',
    'A_CAMINHO_DA_ENTREGA': 'Em deslocamento para entrega',
    'ENTREGUE': 'Entregue',
    'CANCELADA': 'Cancelada',
    'FALHA_NA_ENTREGA': 'Falha na entrega',
    'SEM_MOTORISTA': 'Nenhum motorista aceitou',
  };

  static bool ehProblema(String etapa) => etapa == 'CANCELADA' || etapa == 'FALHA_NA_ENTREGA' || etapa == 'SEM_MOTORISTA';
}

class Entrega {
  const Entrega({
    required this.id,
    required this.codigo,
    required this.etapa,
    required this.situacao,
    required this.final_,
    required this.criadaEm,
    required this.encomenda,
    this.observacoes,
    this.destinatarioNome,
    this.destinatarioTelefone,
    required this.enderecoDeEntrega,
    required this.enderecoDeColeta,
    required this.coletaAlternativa,
    required this.veiculo,
    required this.valorEstimadoCents,
    required this.valorCobradoCents,
    this.entregueEm,
    this.motoristaNome,
    this.veiculoDoMotorista,
    this.codigoDeEntrega,
    this.mapa,
    this.repetido = false,
  });

  final String id;
  final String codigo;
  final String etapa;
  final String situacao;
  final bool final_;
  final String criadaEm;
  final String encomenda;
  final String? observacoes;
  final String? destinatarioNome;
  final String? destinatarioTelefone;
  final String enderecoDeEntrega;
  final String enderecoDeColeta;
  final bool coletaAlternativa;
  final String veiculo;
  final int valorEstimadoCents;
  final int valorCobradoCents;
  final String? entregueEm;
  final String? motoristaNome;
  final String? veiculoDoMotorista;

  /// Codigo de 4 numeros que quem recebe diz ao motorista. So aparece
  /// enquanto a entrega esta aberta (o servidor esconde depois).
  final String? codigoDeEntrega;
  /// Pontos do mapa (coleta, entrega e, so durante a entrega, o motorista). null = encerrada.
  final MapaDaEntrega? mapa;

  /// O servidor respondeu que este pedido ja existia (toque repetido).
  final bool repetido;

  bool get problema => Etapa.ehProblema(etapa);
  bool get temPosicaoDoMotorista => mapa?.motorista != null;

  /// Valor que vale agora: o cobrado se terminou, senao o estimado.
  int get valorCents => etapa == 'ENTREGUE' ? valorCobradoCents : valorEstimadoCents;

  factory Entrega.fromJson(dynamic j) {
    final m = _mapa(j);
    final dest = _mapa(m['destinatario']);
    return Entrega(
      id: _txt(m['id']),
      codigo: _txt(m['codigo']),
      etapa: _txt(m['etapa'], 'CRIADA'),
      situacao: _txt(m['situacao']),
      final_: m['final'] == true,
      criadaEm: _txt(m['criadaEm']),
      encomenda: _txt(m['encomenda']),
      observacoes: m['observacoes'] == null ? null : _txt(m['observacoes']),
      destinatarioNome: dest['nome'] == null ? null : _txt(dest['nome']),
      destinatarioTelefone: dest['telefone'] == null ? null : _txt(dest['telefone']),
      enderecoDeEntrega: _txt(m['enderecoDeEntrega']),
      enderecoDeColeta: _txt(m['enderecoDeColeta']),
      coletaAlternativa: m['coletaAlternativa'] == true,
      veiculo: _txt(m['veiculo'], 'MOTO'),
      valorEstimadoCents: _int(m['valorEstimadoCents']),
      valorCobradoCents: _int(m['valorCobradoCents']),
      entregueEm: m['entregueEm'] == null ? null : _txt(m['entregueEm']),
      motoristaNome: m['motoristaNome'] == null ? null : _txt(m['motoristaNome']),
      veiculoDoMotorista: m['veiculoDoMotorista'] == null ? null : _txt(m['veiculoDoMotorista']),
      codigoDeEntrega: m['codigoDeEntrega'] == null ? null : _txt(m['codigoDeEntrega']),
      mapa: m['mapa'] is Map ? MapaDaEntrega.fromJson(m['mapa']) : null,
      repetido: m['repetido'] == true,
    );
  }
}

class Historico {
  const Historico({required this.total, required this.pagina, required this.porPagina, required this.itens});

  final int total;
  final int pagina;
  final int porPagina;
  final List<Entrega> itens;

  bool get temMais => pagina * porPagina < total;

  factory Historico.fromJson(dynamic j) {
    final m = _mapa(j);
    final lista = m['itens'] is List ? (m['itens'] as List) : const [];
    return Historico(
      total: _int(m['total']),
      pagina: _int(m['pagina'], 1),
      porPagina: _int(m['porPagina'], 20),
      itens: lista.map(Entrega.fromJson).toList(),
    );
  }
}

class Cobranca {
  const Cobranca({required this.id, required this.codigo, required this.em, this.destinatario, required this.valorCents});

  final String id;
  final String codigo;
  final String em;
  final String? destinatario;
  final int valorCents;

  factory Cobranca.fromJson(dynamic j) {
    final m = _mapa(j);
    return Cobranca(
      id: _txt(m['id']),
      codigo: _txt(m['codigo']),
      em: _txt(m['em']),
      destinatario: m['destinatario'] == null ? null : _txt(m['destinatario']),
      valorCents: _int(m['valorCents']),
    );
  }
}

class Gastos {
  const Gastos({
    required this.de,
    required this.ate,
    required this.realizadas,
    required this.canceladas,
    required this.emAndamento,
    required this.totalCents,
    required this.cobrancas,
    this.listaCortada = false,
  });

  /// true = a lista de cobrancas mostra so as mais recentes (o total continua completo).
  final bool listaCortada;
  final String de;
  final String ate;
  final int realizadas;
  final int canceladas;
  final int emAndamento;
  final int totalCents;
  final List<Cobranca> cobrancas;

  factory Gastos.fromJson(dynamic j) {
    final m = _mapa(j);
    final per = _mapa(m['periodo']);
    final lista = m['cobrancas'] is List ? (m['cobrancas'] as List) : const [];
    return Gastos(
      de: _txt(per['de']),
      ate: _txt(per['ate']),
      realizadas: _int(m['realizadas']),
      canceladas: _int(m['canceladas']),
      emAndamento: _int(m['emAndamento']),
      totalCents: _int(m['totalCents']),
      cobrancas: lista.map(Cobranca.fromJson).toList(),
      listaCortada: m['listaCortada'] == true,
    );
  }
}

/// Dados da entrega anterior para PREENCHER a tela. Nao cria entrega.
class Repeticao {
  const Repeticao({
    required this.descricao,
    this.observacoes,
    required this.destinatarioNome,
    required this.destinatarioTelefone,
    required this.destino,
    required this.referencia,
    required this.veiculo,
    required this.aviso,
  });

  final String descricao;
  final String? observacoes;
  final String destinatarioNome;
  final String destinatarioTelefone;
  final Endereco destino;
  final String referencia;
  final String veiculo;
  final String aviso;

  factory Repeticao.fromJson(dynamic j) {
    final m = _mapa(j);
    final enc = _mapa(m['encomenda']);
    final dest = _mapa(m['destinatario']);
    final d = _mapa(m['destino']);
    return Repeticao(
      descricao: _txt(enc['descricao']),
      observacoes: enc['observacoes'] == null ? null : _txt(enc['observacoes']),
      destinatarioNome: _txt(dest['nome']),
      destinatarioTelefone: _txt(dest['telefone']),
      // O servidor guarda a rua dentro do endereco por extenso ("Rua X, 123, ...");
      // a rua e o que vem antes da primeira virgula. O comerciante confere na tela.
      destino: Endereco(
        logradouro: _txt(d['porExtenso']).split(',').first.trim(),
        numero: _txt(d['numero']),
        complemento: d['complemento'] == null ? null : _txt(d['complemento']),
        bairro: _txt(d['bairro']),
        cidade: _txt(d['cidade']),
        uf: _txt(d['uf']),
        cep: _txt(d['cep']),
        latitude: _dbl(d['latitude']),
        longitude: _dbl(d['longitude']),
        porExtenso: _txt(d['porExtenso']),
      ),
      referencia: _txt(d['referencia']),
      veiculo: _txt(m['veiculo'], 'MOTO'),
      aviso: _txt(m['aviso']),
    );
  }
}

/// Um ponto do mapa. So existe se o servidor mandou latitude e longitude validas.
class PontoDoMapa {
  const PontoDoMapa(this.latitude, this.longitude);

  final double latitude;
  final double longitude;

  static PontoDoMapa? tentar(dynamic j) {
    final m = _mapa(j);
    final lat = _dbl(m['latitude']);
    final lng = _dbl(m['longitude']);
    if (lat == null || lng == null || lat.abs() > 90 || lng.abs() > 180) return null;
    return PontoDoMapa(lat, lng);
  }
}

/// Ultima posicao que o aparelho do motorista mandou. `desatualizada` = o
/// servidor ja considera o sinal velho (mais de 2 minutos).
class MotoristaNoMapa extends PontoDoMapa {
  const MotoristaNoMapa(super.latitude, super.longitude, {this.atualizadaEm, this.desatualizada = false});

  final DateTime? atualizadaEm;
  final bool desatualizada;

  static MotoristaNoMapa? tentarMotorista(dynamic j) {
    final p = PontoDoMapa.tentar(j);
    if (p == null) return null;
    final m = _mapa(j);
    return MotoristaNoMapa(p.latitude, p.longitude, atualizadaEm: DateTime.tryParse(_txt(m['atualizadaEm']))?.toLocal(), desatualizada: m['desatualizada'] == true);
  }
}

class MapaDaEntrega {
  const MapaDaEntrega({this.coleta, this.entrega, this.motorista});

  final PontoDoMapa? coleta;
  final PontoDoMapa? entrega;
  final MotoristaNoMapa? motorista;

  bool get vazio => coleta == null && entrega == null && motorista == null;

  factory MapaDaEntrega.fromJson(dynamic j) {
    final m = _mapa(j);
    return MapaDaEntrega(
      coleta: PontoDoMapa.tentar(m['coleta']),
      entrega: PontoDoMapa.tentar(m['entrega']),
      motorista: MotoristaNoMapa.tentarMotorista(m['motorista']),
    );
  }
}

/// Imagens do mapa: o endereco (com a chave da plataforma) vem do servidor,
/// so para quem entrou na conta (GET /geo/mapa). Nunca fica no codigo do app.
class ConfigDoMapa {
  const ConfigDoMapa({required this.tiles, required this.atribuicao, required this.maxZoom, required this.tamanho});

  final String tiles;
  final String atribuicao;
  final double maxZoom;
  final int tamanho;

  /// So https, com {z}, {x} e {y}, sem espacos e de tamanho razoavel (mesma regra dos outros apps).
  static bool enderecoValido(Object? url) {
    if (url is! String) return false;
    final u = url.trim();
    return u.length <= 400 && u.startsWith('https://') && !RegExp(r'\s').hasMatch(u) && u.contains('{z}') && u.contains('{x}') && u.contains('{y}');
  }

  static ConfigDoMapa? tentar(dynamic j) {
    final m = _mapa(j);
    if (!enderecoValido(m['tiles'])) return null;
    final z = m['maxZoom'];
    final tam = m['tamanho'];
    final a = _txt(m['atribuicao']).trim();
    return ConfigDoMapa(
      tiles: (m['tiles'] as String).trim(),
      atribuicao: a.isEmpty ? '© TomTom' : a,
      maxZoom: z is num && z >= 10 && z <= 22 ? z.toDouble() : 19,
      tamanho: tam == 256 || tam == 512 ? tam as int : 512,
    );
  }
}

/// Item do sino. So os avisos do Comercio (tipo "comercio-...") aparecem no app.
class Aviso {
  const Aviso({required this.id, required this.titulo, required this.texto, required this.tipo, required this.criadoEm, required this.lido, this.rideId});

  final String id;
  final String titulo;
  final String texto;
  final String tipo;
  final DateTime? criadoEm;
  final bool lido;

  /// Quando o aviso e de uma entrega, qual (toque abre o acompanhamento). Hoje o servidor
  /// guarda o id dentro do aviso; null se nao houver.
  final String? rideId;

  bool get ehDoComercio => tipo.startsWith('comercio-');
  bool get ehDeEntrega => tipo == 'comercio-entrega';

  factory Aviso.fromJson(dynamic j) {
    final m = _mapa(j);
    return Aviso(
      id: _txt(m['id']),
      titulo: _txt(m['titulo']),
      texto: _txt(m['texto']),
      tipo: _txt(m['tipo'], 'aviso'),
      criadoEm: DateTime.tryParse(_txt(m['criadaEm']))?.toLocal(),
      lido: m['lida'] == true,
      rideId: m['rideId'] == null ? null : _txt(m['rideId']),
    );
  }
}

class CaixaDeAvisos {
  const CaixaDeAvisos({required this.itens});

  /// Ja filtrada: so avisos do Comercio (o sino da conta e o mesmo dos passageiros).
  final List<Aviso> itens;

  int get naoLidos => itens.where((a) => !a.lido).length;

  factory CaixaDeAvisos.fromJson(dynamic j) {
    final m = _mapa(j);
    final lista = m['itens'] is List ? (m['itens'] as List) : const [];
    return CaixaDeAvisos(itens: lista.map(Aviso.fromJson).where((a) => a.id.isNotEmpty && a.ehDoComercio).toList());
  }
}

class TermosDeUso {
  const TermosDeUso({required this.versao, required this.conteudo, required this.revisadoPorAdvogado});

  final String versao;
  final String conteudo;
  final bool revisadoPorAdvogado;

  factory TermosDeUso.fromJson(dynamic j) {
    final m = _mapa(j);
    return TermosDeUso(versao: _txt(m['version']), conteudo: _txt(m['content']), revisadoPorAdvogado: m['revisadoPorAdvogado'] == true);
  }
}
