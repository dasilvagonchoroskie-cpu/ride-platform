import '../core/api/api_client.dart';
import '../core/utils/geo.dart';

// ---------------------------------------------------------------------------
// Modelos simples do painel. Cada um le exatamente o que o servidor manda
// (as mesmas chaves conferidas no teste automatico de ponta a ponta).
// ---------------------------------------------------------------------------

int _int(Object? v) => v is num ? v.toInt() : int.tryParse('$v') ?? 0;
double? _num(Object? v) => v is num ? v.toDouble() : double.tryParse('$v');
String _txt(Object? v, [String padrao = '']) => v == null ? padrao : '$v';
DateTime? _data(Object? v) => v == null ? null : DateTime.tryParse('$v')?.toLocal();

/// Indicadores da tela inicial.
class Indicadores {
  const Indicadores({
    this.ativas = 0,
    this.concluidasHoje = 0,
    this.online = 0,
    this.ocupados = 0,
    this.livres = 0,
    this.faturamentoHojeCents = 0,
    this.comissaoHojeCents = 0,
    this.sosAbertos = 0,
    this.pendentes = 0,
    this.ultimoPendente,
    this.paraConferir = 0,
    this.ultimoParaConferir,
  });

  final int ativas;
  final int concluidasHoje;
  final int online;
  final int ocupados;
  final int livres;
  final int faturamentoHojeCents;
  final int comissaoHojeCents;
  final int sosAbertos;

  /// Cadastros de motorista esperando a Central aprovar.
  final int pendentes;

  /// O cadastro pendente mais novo (para avisar quando chega um).
  final MotoristaPendenteResumo? ultimoPendente;

  /// Motoristas ja ativos que trocaram a foto de perfil (ou outro documento)
  /// e esperam a Central conferir.
  final int paraConferir;
  final DocumentoParaConferir? ultimoParaConferir;

  factory Indicadores.fromJson(Map<String, dynamic> j) => Indicadores(
        ativas: _int(j['activeRides']),
        concluidasHoje: _int(j['completedToday']),
        online: _int(j['driversOnline']),
        ocupados: _int(j['driversBusy']),
        livres: _int(j['driversFree']),
        faturamentoHojeCents: _int(j['revenueTodayCents']),
        comissaoHojeCents: _int(j['commissionTodayCents']),
        sosAbertos: _int(j['sosActive']),
        pendentes: _int(j['driversPending']),
        ultimoPendente: j['latestPendingDriver'] is Map<String, dynamic>
            ? MotoristaPendenteResumo.fromJson(j['latestPendingDriver'] as Map<String, dynamic>)
            : null,
        paraConferir: _int(j['documentsToReview']),
        ultimoParaConferir: j['latestDocumentToReview'] is Map<String, dynamic>
            ? DocumentoParaConferir.fromJson(j['latestDocumentToReview'] as Map<String, dynamic>)
            : null,
      );
}

/// Documento novo de motorista ativo esperando a Central (ex.: foto de
/// perfil trocada no aplicativo do motorista).
class DocumentoParaConferir {
  const DocumentoParaConferir({required this.id, required this.tipo, required this.motoristaId, required this.nome});

  final String id;
  final String tipo;
  final String motoristaId;
  final String nome;

  bool get ehFotoDePerfil => tipo == 'PROFILE_PHOTO';

  factory DocumentoParaConferir.fromJson(Map<String, dynamic> j) => DocumentoParaConferir(
        id: j['id'] as String? ?? '',
        tipo: j['type'] as String? ?? '',
        motoristaId: j['driverId'] as String? ?? '',
        nome: (j['name'] as String?)?.trim().isNotEmpty == true ? j['name'] as String : 'Motorista',
      );
}

/// Motorista que acabou de se cadastrar e espera aprovacao.
class MotoristaPendenteResumo {
  const MotoristaPendenteResumo({required this.id, required this.nome, required this.telefone});

  final String id;
  final String nome;
  final String telefone;

  factory MotoristaPendenteResumo.fromJson(Map<String, dynamic> j) => MotoristaPendenteResumo(
        id: j['id'] as String? ?? '',
        nome: (j['name'] as String?)?.trim().isNotEmpty == true ? j['name'] as String : 'Motorista novo',
        telefone: j['phone'] as String? ?? '',
      );
}

/// Corrida na fila ou em andamento (despacho e mapa).
class CorridaAtiva {
  const CorridaAtiva({
    required this.id,
    required this.codigo,
    required this.status,
    required this.passageiro,
    required this.telefonePassageiro,
    required this.motoristaId,
    required this.motorista,
    required this.telefoneMotorista,
    required this.placa,
    required this.embarque,
    required this.enderecoEmbarque,
    required this.destino,
    required this.enderecoDestino,
    required this.valorCents,
    required this.pedidaEm,
    required this.agendadaPara,
    required this.categoria,
    required this.pagamento,
    required this.posicaoMotorista,
  });

  final String id;
  final String codigo;
  final String status;
  final String passageiro;
  final String? telefonePassageiro;
  final String? motoristaId;
  final String motorista;
  final String? telefoneMotorista;
  final String placa;
  final Coords embarque;
  final String enderecoEmbarque;
  final Coords destino;
  final String enderecoDestino;
  final int valorCents;
  final DateTime? pedidaEm;
  final DateTime? agendadaPara;
  final String categoria;
  final String pagamento;
  final Coords? posicaoMotorista;

  bool get naFila => const ['SCHEDULED', 'REQUESTED', 'SEARCHING'].contains(status);
  bool get viagemComecou => status == 'IN_PROGRESS';

  String get fase {
    switch (status) {
      case 'SCHEDULED':
        return 'Agendada';
      case 'REQUESTED':
      case 'SEARCHING':
        return 'Procurando motorista';
      case 'DRIVER_ASSIGNED':
      case 'DRIVER_ARRIVING':
        return 'Motorista a caminho';
      case 'DRIVER_WAITING':
        return 'Motorista no embarque';
      case 'IN_PROGRESS':
        return 'Em viagem';
      default:
        return status;
    }
  }

  factory CorridaAtiva.fromJson(Map<String, dynamic> j) {
    Coords ponto(Object? v) {
      final m = v is Map ? v : const {};
      return Coords(_num(m['latitude']) ?? 0, _num(m['longitude']) ?? 0);
    }

    final pos = j['driverPosition'];
    return CorridaAtiva(
      id: _txt(j['id']),
      codigo: _txt(j['code']),
      status: _txt(j['status']),
      passageiro: _txt(j['passengerName'], 'Passageiro'),
      telefonePassageiro: j['passengerPhone'] as String?,
      motoristaId: j['driverId'] as String?,
      motorista: _txt(j['driverName'], 'Procurando motorista'),
      telefoneMotorista: j['driverPhone'] as String?,
      placa: _txt(j['driverPlate']),
      embarque: ponto(j['pickup']),
      enderecoEmbarque: _txt((j['pickup'] as Map?)?['address']),
      destino: ponto(j['dropoff']),
      enderecoDestino: _txt((j['dropoff'] as Map?)?['address']),
      valorCents: _int(j['estimatedFareCents']),
      pedidaEm: _data(j['requestedAt']),
      agendadaPara: _data(j['scheduledFor']),
      categoria: _txt(j['category'], 'CARRO'),
      pagamento: _txt(j['paymentMethodType'], 'CASH'),
      posicaoMotorista: pos is Map ? ponto(pos) : null,
    );
  }
}

/// Motorista online (mapa e escolha no despacho).
class MotoristaOnline {
  const MotoristaOnline({
    required this.id,
    required this.nome,
    required this.telefone,
    required this.ocupado,
    required this.veiculo,
    required this.placa,
    required this.categoria,
    required this.distanciaKm,
    required this.posicao,
    required this.nota,
    this.online = true,
    this.vistoEm,
  });

  final String id;
  final String nome;
  final String? telefone;
  final bool ocupado;

  /// Offline aparece cinza no mapa, na ultima posicao conhecida.
  final bool online;

  /// Ultima vez que o aparelho mandou a posicao.
  final DateTime? vistoEm;
  final String veiculo;
  final String placa;
  final String categoria;
  final double? distanciaKm;
  final Coords? posicao;
  final double nota;

  factory MotoristaOnline.fromJson(Map<String, dynamic> j) {
    final lat = _num(j['latitude']);
    final lng = _num(j['longitude']);
    return MotoristaOnline(
      id: _txt(j['driverId']),
      nome: _txt(j['name'], 'Motorista'),
      telefone: j['phone'] as String?,
      ocupado: j['busy'] == true,
      veiculo: _txt(j['vehicle']),
      placa: _txt(j['plate']),
      categoria: _txt(j['category'], 'CARRO'),
      distanciaKm: _num(j['distanceKm']),
      posicao: lat != null && lng != null ? Coords(lat, lng) : null,
      nota: _num(j['rating']) ?? 5,
      online: j['online'] != false,
      vistoEm: DateTime.tryParse('${j['lastSeenAt'] ?? ''}')?.toLocal(),
    );
  }
}

/// Foto de documento (ultima de cada tipo).
class DocumentoFoto {
  const DocumentoFoto({
    required this.id,
    required this.tipo,
    required this.status,
    required this.url,
    required this.motivo,
  });

  final String id;
  final String tipo;
  final String status;
  final String? url;
  final String? motivo;

  String get nome => nomeDoDocumento(tipo);

  factory DocumentoFoto.fromJson(Map<String, dynamic> j) => DocumentoFoto(
        id: _txt(j['id']),
        tipo: _txt(j['type']),
        status: _txt(j['status'], 'PENDING'),
        url: j['fileUrl'] as String?,
        motivo: j['rejectionReason'] as String?,
      );
}

String nomeDoDocumento(String tipo) {
  switch (tipo) {
    case 'PROFILE_PHOTO':
      return 'Foto do motorista';
    case 'CNH_FRONT':
      return 'CNH (frente)';
    case 'CNH_BACK':
      return 'CNH (verso)';
    case 'CRLV':
      return 'CRLV do veículo';
    case 'VEHICLE_FRONT':
      return 'Veículo (frente)';
    case 'VEHICLE_BACK':
      return 'Veículo (traseira)';
    case 'VEHICLE_PLATE':
      return 'Placa do veículo';
    case 'RESIDENCE_PROOF':
      return 'Comprovante de residência';
    case 'CRIMINAL_RECORD':
      return 'Antecedentes criminais';
    default:
      return tipo;
  }
}

/// Motorista na lista (Gestao de Motoristas).
/// O que aconteceu ao excluir motoristas.
class ResultadoExclusao {
  const ResultadoExclusao({required this.excluidos, required this.continuamPassageiros, required this.erros});

  final int excluidos;

  /// Usavam tambem o app do passageiro: a conta continua, so como passageiro.
  final int continuamPassageiros;

  /// Motivo de cada um que nao saiu (ex.: em corrida agora).
  final List<String> erros;

  factory ResultadoExclusao.fromJson(Map<String, dynamic> j) {
    final itens = [for (final i in (j['itens'] as List<dynamic>? ?? const [])) i as Map<String, dynamic>];
    return ResultadoExclusao(
      excluidos: _int(j['excluidos']),
      continuamPassageiros: itens.where((i) => i['resultado'] == 'VIROU_PASSAGEIRO').length,
      erros: [for (final i in itens) if (i['erro'] != null) '${i['erro']}'],
    );
  }

  String get resumo {
    final partes = <String>[
      excluidos == 1 ? '1 motorista excluído.' : '$excluidos motoristas excluídos.',
      if (continuamPassageiros > 0) '$continuamPassageiros continua(m) como passageiro(s).',
      if (erros.isNotEmpty) 'Não excluído(s): ${erros.toSet().join(' ')}',
    ];
    return partes.join(' ');
  }
}

class MotoristaCadastro {
  const MotoristaCadastro({
    required this.id,
    required this.nome,
    required this.telefone,
    required this.email,
    required this.status,
    required this.online,
    required this.veiculo,
    required this.placa,
    required this.categoria,
    required this.documentos,
    required this.cadastradoEm,
    required this.motivo,
  });

  final String id;
  final String nome;
  final String telefone;
  final String email;
  final String status;
  final bool online;
  final String veiculo;
  final String placa;
  final String categoria;
  final List<DocumentoFoto> documentos;
  final DateTime? cadastradoEm;
  final String? motivo;

  factory MotoristaCadastro.fromJson(Map<String, dynamic> j) {
    final u = j['user'] is Map ? j['user'] as Map : const {};
    final vs = j['vehicles'] is List ? j['vehicles'] as List : const [];
    final v = vs.isEmpty ? const {} : vs.first as Map;
    final docs = j['documents'] is List ? j['documents'] as List : const [];
    return MotoristaCadastro(
      id: _txt(j['id']),
      nome: _txt(u['name'], 'Motorista'),
      telefone: _txt(u['phone']),
      email: _txt(u['email']),
      status: _txt(j['status'], 'PENDING'),
      online: j['isOnline'] == true,
      veiculo: [v['brand'], v['model'], v['color']].where((x) => x != null && '$x'.isNotEmpty).join(' '),
      placa: _txt(v['plate']),
      categoria: _txt(v['category'], 'CARRO'),
      documentos: [for (final d in docs.whereType<Map<String, dynamic>>()) DocumentoFoto.fromJson(d)],
      cadastradoEm: _data(j['createdAt']),
      motivo: j['rejectionReason'] as String?,
    );
  }
}

String nomeDoStatusMotorista(String s) {
  switch (s) {
    case 'PENDING':
      return 'Pendente';
    case 'APPROVED':
      return 'Ativo';
    case 'SUSPENDED':
      return 'Suspenso';
    case 'BLOCKED':
      return 'Bloqueado';
    case 'REJECTED':
      return 'Recusado';
    default:
      return s;
  }
}

/// Detalhe do motorista (documentos, financeiro, carteira).
class MotoristaDetalhe {
  const MotoristaDetalhe({
    required this.base,
    required this.cpf,
    required this.cnh,
    required this.categoriaCnh,
    required this.validadeCnh,
    required this.modelo,
    required this.comissaoPercent,
    required this.taxaFixaCents,
    required this.mensalidadeCents,
    required this.mensalidadePagaAte,
    required this.saldoCents,
    required this.avatarUrl,
    required this.nota,
    required this.corridas,
    this.praca,
    this.pracaNome,
    this.tiposAprovados = const {},
  });

  final MotoristaCadastro base;
  final String cpf;
  final String cnh;
  final String categoriaCnh;
  final DateTime? validadeCnh;
  final String modelo;
  final double? comissaoPercent;
  final int? taxaFixaCents;
  final int? mensalidadeCents;
  final DateTime? mensalidadePagaAte;
  final int saldoCents;
  final String? avatarUrl;
  final double nota;
  final int corridas;

  /// Cidade onde trabalha (varias cidades na mesma Central).
  final String? praca;
  final String? pracaNome;

  /// Tipos de documento que ja tem um aprovado (a foto nova de quem ja tem
  /// foto aprovada e uma troca: a aprovada vale ate a Central conferir).
  final Set<String> tiposAprovados;

  factory MotoristaDetalhe.fromJson(Map<String, dynamic> j) {
    final u = j['user'] is Map ? j['user'] as Map : const {};
    final w = j['wallet'] is Map ? j['wallet'] as Map : const {};
    final docs = (j['documents'] is List ? j['documents'] as List : const []).whereType<Map<String, dynamic>>();
    // So a ultima foto de cada documento.
    final vistos = <String>{};
    final ultimos = <Map<String, dynamic>>[];
    for (final d in docs) {
      if (vistos.add(_txt(d['type']))) ultimos.add(d);
    }
    return MotoristaDetalhe(
      base: MotoristaCadastro.fromJson({...j, 'documents': ultimos}),
      cpf: _txt(j['cpf']),
      cnh: _txt(j['cnhNumber']),
      categoriaCnh: _txt(j['cnhCategory']),
      validadeCnh: _data(j['cnhExpiresAt']),
      modelo: _txt(j['financeModel'], 'PADRAO'),
      comissaoPercent: _num(j['customCommissionPercent']),
      taxaFixaCents: j['fixedFeeCents'] == null ? null : _int(j['fixedFeeCents']),
      mensalidadeCents: j['monthlyFeeCents'] == null ? null : _int(j['monthlyFeeCents']),
      mensalidadePagaAte: _data(j['monthlyPaidUntil']),
      saldoCents: _int(w['balanceCents']),
      avatarUrl: u['avatarUrl'] as String?,
      nota: _num(j['ratingAvg']) ?? 5,
      corridas: _int(j['totalRides']),
      praca: j['praca'] as String?,
      pracaNome: j['pracaNome'] as String?,
      tiposAprovados: {for (final d in docs) if (d['status'] == 'APPROVED') _txt(d['type'])},
    );
  }
}

class Passageiro {
  const Passageiro({
    required this.id,
    required this.nome,
    required this.telefone,
    required this.email,
    required this.bloqueado,
    required this.motivo,
    required this.corridas,
    required this.desde,
  });

  final String id;
  final String nome;
  final String telefone;
  final String email;
  final bool bloqueado;
  final String? motivo;
  final int corridas;
  final DateTime? desde;

  factory Passageiro.fromJson(Map<String, dynamic> j) => Passageiro(
        id: _txt(j['id']),
        nome: _txt(j['name'], 'Passageiro'),
        telefone: _txt(j['phone']),
        email: _txt(j['email']),
        bloqueado: j['status'] == 'BLOCKED',
        motivo: j['blockedReason'] as String?,
        corridas: _int(j['rides']),
        desde: _data(j['createdAt']),
      );
}

class RegistroBloqueio {
  const RegistroBloqueio({required this.acao, required this.motivo, required this.por, required this.quando});

  final String acao;
  final String motivo;
  final String por;
  final DateTime? quando;

  factory RegistroBloqueio.fromJson(Map<String, dynamic> j) => RegistroBloqueio(
        acao: _txt(j['action']) == 'BLOQUEIO' ? 'Bloqueado' : 'Desbloqueado',
        motivo: _txt(j['reason']),
        por: _txt(j['by'], 'Central'),
        quando: _data(j['at']),
      );
}

/// Valores de uma bandeira (em centavos e metros/segundos, como o servidor guarda).
class Bandeira {
  Bandeira(Map<String, dynamic> j)
      : inicio = _int(j['startHour']),
        fim = _int(j['endHour']),
        bandeiradaCents = _int(j['baseFareCents']),
        porKmCents = _int(j['perKmCents']),
        porMinutoCents = _int(j['perMinuteCents']),
        paradoCents = _int(j['waitingPerMinuteCents']),
        franquiaMetros = _int(j['freeDistanceMeters']),
        franquiaSegundos = _int(j['freeWaitingSeconds']),
        minimoCents = _int(j['minFareCents']),
        multaCents = _int(j['cancellationFeeCents']),
        comissao = _num(j['commissionPercent']) ?? 0;

  int inicio;
  int fim;
  int bandeiradaCents;
  int porKmCents;
  int porMinutoCents;
  int paradoCents;
  int franquiaMetros;
  int franquiaSegundos;
  int minimoCents;
  int multaCents;
  double comissao;

  Map<String, dynamic> toJson() => {
        'startHour': inicio,
        'endHour': fim,
        'baseFareCents': bandeiradaCents,
        'perKmCents': porKmCents,
        'perMinuteCents': porMinutoCents,
        'waitingPerMinuteCents': paradoCents,
        'freeDistanceMeters': franquiaMetros,
        'freeWaitingSeconds': franquiaSegundos,
        'minFareCents': minimoCents,
        'cancellationFeeCents': multaCents,
        'commissionPercent': comissao,
      };
}

class Categoria {
  Categoria({required this.codigo, required this.nome, required this.ativa, required this.diurna, required this.noturna});

  final String codigo;
  String nome;
  bool ativa;
  final Bandeira diurna;
  final Bandeira noturna;

  factory Categoria.fromJson(Map<String, dynamic> j) => Categoria(
        codigo: _txt(j['codigo']),
        nome: _txt(j['nome']),
        ativa: j['ativa'] != false,
        diurna: Bandeira((j['diurna'] as Map).cast<String, dynamic>()),
        noturna: Bandeira((j['noturna'] as Map).cast<String, dynamic>()),
      );
}

class Zona {
  Zona({required this.nome, required this.centro, required this.raioKm, required this.multiplicador});

  String nome;
  Coords centro;
  double raioKm;
  double multiplicador;

  factory Zona.fromJson(Map<String, dynamic> j) => Zona(
        nome: _txt(j['nome']),
        centro: Coords(_num(j['latitude']) ?? 0, _num(j['longitude']) ?? 0),
        raioKm: _num(j['raioKm']) ?? 1,
        multiplicador: _num(j['multiplicador']) ?? 1,
      );

  Map<String, dynamic> toJson() => {
        'nome': nome,
        'latitude': centro.latitude,
        'longitude': centro.longitude,
        'raioKm': raioKm,
        'multiplicador': multiplicador,
      };
}

class Tarifas {
  Tarifas({required this.categorias, required this.multiplicadorCidade, required this.zonas, this.cobranca = 'TAXIMETRO'});

  final List<Categoria> categorias;
  double multiplicadorCidade;
  final List<Zona> zonas;

  /// Como a corrida e cobrada: TAXIMETRO (valor corre pelo trajeto feito)
  /// ou FECHADO (o valor estimado no pedido).
  String cobranca;

  factory Tarifas.fromJson(Map<String, dynamic> j) {
    final m = j['multiplicador'] is Map ? j['multiplicador'] as Map : const {};
    return Tarifas(
      categorias: [
        for (final c in (j['categorias'] as List? ?? const []).whereType<Map<String, dynamic>>()) Categoria.fromJson(c),
      ],
      multiplicadorCidade: _num(m['cidade']) ?? 1,
      zonas: [for (final z in (m['zonas'] as List? ?? const []).whereType<Map<String, dynamic>>()) Zona.fromJson(z)],
      cobranca: j['cobranca'] == 'FECHADO' ? 'FECHADO' : 'TAXIMETRO',
    );
  }
}

class Saque {
  const Saque({
    required this.id,
    required this.motorista,
    required this.telefone,
    required this.chavePix,
    required this.valorCents,
    required this.saldoCents,
    required this.status,
    required this.motivo,
    required this.pedidoEm,
    required this.feitoEm,
  });

  final String id;
  final String motorista;
  final String? telefone;
  final String chavePix;
  final int valorCents;
  final int saldoCents;
  final String status;
  final String? motivo;
  final DateTime? pedidoEm;
  final DateTime? feitoEm;

  bool get aberto => status == 'REQUESTED' || status == 'PROCESSING';

  String get situacao => switch (status) {
        'PAID' => 'Pago',
        'FAILED' => 'Recusado',
        _ => 'Aguardando',
      };

  factory Saque.fromJson(Map<String, dynamic> j) => Saque(
        id: _txt(j['id']),
        motorista: _txt(j['driverName'], 'Motorista'),
        telefone: j['driverPhone'] as String?,
        chavePix: _txt(j['pixKey']),
        valorCents: _int(j['amountCents']),
        saldoCents: _int(j['balanceCents']),
        status: _txt(j['status']),
        motivo: j['failureReason'] as String?,
        pedidoEm: _data(j['requestedAt']),
        feitoEm: _data(j['processedAt']),
      );
}

class Receitas {
  const Receitas({
    required this.dinheiroCents,
    required this.pixAppCents,
    required this.totalCents,
    required this.comissaoCents,
    required this.cuponsCents,
    required this.corridas,
    required this.saquesPagosCents,
    required this.creditosVendidosCents,
    required this.porForma,
  });

  final int dinheiroCents;
  final int pixAppCents;
  final int totalCents;
  final int comissaoCents;
  final int cuponsCents;
  final int corridas;
  final int saquesPagosCents;
  final int creditosVendidosCents;
  final List<(String, int, int)> porForma;

  factory Receitas.fromJson(Map<String, dynamic> j) => Receitas(
        dinheiroCents: _int(j['cashCents']),
        pixAppCents: _int(j['pixAndAppCents']),
        totalCents: _int(j['totalCents']),
        comissaoCents: _int(j['commissionCents']),
        cuponsCents: _int(j['couponCents']),
        corridas: _int(j['rides']),
        saquesPagosCents: _int(j['payoutsPaidCents']),
        creditosVendidosCents: _int(j['creditsSoldCents']),
        porForma: [
          for (final f in (j['byPaymentMethod'] as List? ?? const []).whereType<Map>())
            (_txt(f['paymentMethodType']), _int(f['rides']), _int(f['totalCents'])),
        ],
      );
}

String nomeDoPagamento(String tipo) => switch (tipo) {
      'CASH' => 'Dinheiro',
      'PIX' => 'PIX',
      'CREDIT_CARD' => 'Cartão de crédito',
      'DEBIT_CARD' => 'Cartão de débito',
      'WALLET' => 'Carteira',
      _ => tipo,
    };

class ContatoSos {
  const ContatoSos(this.nome, this.telefone);
  final String nome;
  final String telefone;
}

class AlertaSos {
  const AlertaSos({
    required this.id,
    required this.quem,
    required this.telefone,
    required this.papel,
    required this.posicao,
    required this.criadoEm,
    required this.atualizadoEm,
    required this.contatos,
    required this.corridaCodigo,
    required this.corridaStatus,
    required this.embarque,
    required this.destino,
    required this.passageiro,
    required this.telefonePassageiro,
    required this.motorista,
    required this.telefoneMotorista,
    required this.veiculo,
    required this.resolvido,
    required this.nota,
  });

  final String id;
  final String quem;
  final String? telefone;
  final String papel;
  final Coords? posicao;
  final DateTime? criadoEm;
  final DateTime? atualizadoEm;
  final List<ContatoSos> contatos;
  final String? corridaCodigo;
  final String? corridaStatus;
  final String? embarque;
  final String? destino;
  final String? passageiro;
  final String? telefonePassageiro;
  final String? motorista;
  final String? telefoneMotorista;
  final String? veiculo;
  final bool resolvido;
  final String? nota;

  String get papelNome => papel == 'DRIVER' ? 'Motorista' : 'Passageiro';

  factory AlertaSos.fromJson(Map<String, dynamic> j) {
    final w = j['who'] is Map ? j['who'] as Map : const {};
    final r = j['ride'] is Map ? j['ride'] as Map : null;
    final lat = _num(j['latitude']);
    final lng = _num(j['longitude']);
    return AlertaSos(
      id: _txt(j['id']),
      quem: _txt(w['name'], 'Usuário'),
      telefone: w['phone'] as String?,
      papel: _txt(w['role'], 'PASSENGER'),
      posicao: lat != null && lng != null ? Coords(lat, lng) : null,
      criadoEm: _data(j['createdAt']),
      atualizadoEm: _data(j['updatedAt']),
      contatos: [
        for (final c in (j['emergencyContacts'] as List? ?? const []).whereType<Map>())
          ContatoSos(_txt(c['name'], 'Contato'), _txt(c['phone'])),
      ],
      corridaCodigo: r?['code'] as String?,
      corridaStatus: r?['status'] as String?,
      embarque: r?['pickupAddress'] as String?,
      destino: r?['dropoffAddress'] as String?,
      passageiro: (r?['passenger'] as Map?)?['name'] as String?,
      telefonePassageiro: (r?['passenger'] as Map?)?['phone'] as String?,
      motorista: (r?['driver'] as Map?)?['name'] as String?,
      telefoneMotorista: (r?['driver'] as Map?)?['phone'] as String?,
      veiculo: r?['vehicle'] as String?,
      resolvido: j['resolved'] == true,
      nota: j['note'] as String?,
    );
  }
}

class Lugar {
  const Lugar(this.endereco, this.detalhe, this.coords);
  final String endereco;
  final String detalhe;
  final Coords coords;

  factory Lugar.fromJson(Map<String, dynamic> j) => Lugar(
        _txt(j['address']),
        _txt(j['detail']),
        Coords(_num(j['latitude']) ?? 0, _num(j['longitude']) ?? 0),
      );
}

class Cupom {
  const Cupom({
    required this.id,
    required this.codigo,
    required this.descricao,
    required this.percentual,
    required this.valor,
    required this.usados,
    required this.limite,
    required this.porPessoa,
    required this.minimoCents,
    required this.validoAte,
    required this.ativo,
  });

  final String id;
  final String codigo;
  final String descricao;
  final bool percentual;
  final int valor;
  final int usados;
  final int limite;
  final int porPessoa;
  final int minimoCents;
  final DateTime? validoAte;
  final bool ativo;

  factory Cupom.fromJson(Map<String, dynamic> j) => Cupom(
        id: _txt(j['id']),
        codigo: _txt(j['code']),
        descricao: _txt(j['description']),
        percentual: j['discountType'] == 'PERCENT',
        valor: _int(j['discountValue']),
        usados: _int(j['usedCount']),
        limite: _int(j['maxUses']),
        porPessoa: _int(j['maxUsesPerUser']),
        minimoCents: _int(j['minFareCents']),
        validoAte: _data(j['expiresAt']),
        ativo: j['isActive'] != false,
      );
}

// ---------------------------------------------------------------------------
// Chamadas ao servidor
// ---------------------------------------------------------------------------

class PainelApi {
  PainelApi([ApiClient? client]) : _c = client ?? ApiClient();

  final ApiClient _c;

  /// Cidade escolhida pelo dono no topo da Central (null = todas). O
  /// operador de uma cidade nao escolhe: o servidor mostra so a dele.
  String? praca;

  Map<String, String> get _naPraca => praca == null ? const {} : {'praca': praca!};

  /// Cliente do servidor (usado tambem pela tela de carteiras).
  ApiClient get cliente => _c;

  List<Map<String, dynamic>> _lista(Object? data) {
    if (data is List) return data.whereType<Map<String, dynamic>>().toList();
    if (data is Map && data['items'] is List) return (data['items'] as List).whereType<Map<String, dynamic>>().toList();
    return const [];
  }

  // Visao geral e despacho
  Future<Indicadores> indicadores() async =>
      Indicadores.fromJson(await _c.request('GET', '/admin/overview', query: _naPraca) as Map<String, dynamic>);

  Future<List<CorridaAtiva>> corridas() async =>
      [for (final j in _lista(await _c.request('GET', '/admin/rides/active', query: _naPraca))) CorridaAtiva.fromJson(j)];

  /// Motoristas online do mais perto ao mais longe. [todos]: tambem os
  /// offline (mapa da Central, cinza na ultima posicao).
  Future<List<MotoristaOnline>> motoristasOnline(Coords perto, {bool todos = false}) async => [
        for (final j in _lista(await _c.request('GET', '/admin/dispatch/drivers', query: {
          'lat': '${perto.latitude}',
          'lng': '${perto.longitude}',
          if (todos) 'todos': '1',
          ..._naPraca,
        })))
          MotoristaOnline.fromJson(j),
      ];

  Future<String> criarCorrida(Map<String, dynamic> dados) async {
    final r = await _c.request('POST', '/admin/rides', body: dados) as Map<String, dynamic>;
    return _txt(r['rideId']);
  }

  Future<void> enviarParaMotorista(String rideId, String driverId) =>
      _c.request('POST', '/admin/rides/$rideId/assign', body: {'driverId': driverId});

  Future<void> cancelarCorrida(String rideId, String motivo) =>
      _c.request('POST', '/admin/rides/$rideId/cancel', body: {'reason': motivo});

  Future<List<Lugar>> buscarEndereco(String texto, Coords perto) async => [
        for (final j in _lista(await _c.request('GET', '/geo/search',
            query: {'q': texto, 'lat': '${perto.latitude}', 'lng': '${perto.longitude}'})))
          Lugar.fromJson(j),
      ];

  // Motoristas
  Future<List<MotoristaCadastro>> motoristas(String status) async => [
        for (final j in _lista(await _c.request('GET', '/admin/drivers', query: {'status': status, 'limit': '100', ..._naPraca})))
          MotoristaCadastro.fromJson(j),
      ];

  Future<MotoristaDetalhe> motorista(String id) async =>
      MotoristaDetalhe.fromJson(await _c.request('GET', '/admin/drivers/$id') as Map<String, dynamic>);

  /// Exclui motoristas (um ou varios). Corridas ja feitas ficam no historico.
  Future<ResultadoExclusao> excluirMotoristas(List<String> ids) async =>
      ResultadoExclusao.fromJson(await _c.request('POST', '/admin/drivers/excluir', body: {'ids': ids}) as Map<String, dynamic>);

  Future<void> mudarStatusMotorista(String id, String status, String motivo) =>
      _c.request('PATCH', '/admin/drivers/$id/review', body: {
        'status': status,
        'reason': motivo,
        if (status == 'APPROVED') 'presentialCheck': true,
      });

  /// A Central poe ou troca a foto do motorista (ja entra aprovada).
  /// Devolve o endereco da foto nova.
  Future<String?> fotoDoMotorista(String id, String mime, String base64) async {
    final r = await _c.request('POST', '/admin/drivers/$id/foto', body: {'mime': mime, 'dados': base64});
    return r is Map ? r['avatarUrl'] as String? : null;
  }

  Future<void> avaliarDocumento(String documentoId, bool aprovado, String? motivo) =>
      _c.request('PATCH', '/admin/documents/$documentoId/review', body: {
        'status': aprovado ? 'APPROVED' : 'REJECTED',
        if (!aprovado) 'rejectionReason': motivo,
      });

  Future<void> modeloFinanceiro(String id, Map<String, dynamic> dados) =>
      _c.request('PATCH', '/admin/drivers/$id/finance', body: dados);

  Future<void> categoriaDoVeiculo(String id, String categoria) =>
      _c.request('PATCH', '/admin/drivers/$id/category', body: {'category': categoria});

  /// Cadastro de motorista pela Central (ja com carro; aprovado se pedido).
  Future<({String id, bool contaExistente})> cadastrarMotorista(Map<String, dynamic> dados) async {
    final r = await _c.request('POST', '/admin/drivers', body: dados) as Map<String, dynamic>;
    return (id: r['id'] as String? ?? '', contaExistente: r['contaExistente'] == true);
  }

  Future<void> creditarCarteira(String id, int cents, String descricao) =>
      _c.request('POST', '/admin/drivers/$id/wallet/credit', body: {'amountCents': cents, 'description': descricao});

  // Passageiros
  Future<List<Passageiro>> passageiros(String busca, {bool soBloqueados = false}) async => [
        for (final j in _lista(await _c.request('GET', '/admin/passengers', query: {
          if (busca.trim().isNotEmpty) 'search': busca.trim(),
          if (soBloqueados) 'status': 'BLOCKED',
        })))
          Passageiro.fromJson(j),
      ];

  Future<List<RegistroBloqueio>> historicoPassageiro(String id) async {
    final r = await _c.request('GET', '/admin/passengers/$id/history') as Map<String, dynamic>;
    return [for (final h in (r['history'] as List? ?? const []).whereType<Map<String, dynamic>>()) RegistroBloqueio.fromJson(h)];
  }

  Future<void> bloquearPassageiro(String id, bool bloquear, String motivo) =>
      _c.request('PATCH', '/admin/passengers/$id/block', body: {'blocked': bloquear, 'reason': motivo});

  // Tarifas
  Future<Tarifas> tarifas() async => Tarifas.fromJson(await _c.request('GET', '/admin/tariffs') as Map<String, dynamic>);

  Future<Tarifas> salvarCategoria(String codigo, Categoria c) async => Tarifas.fromJson(await _c.request(
        'PUT',
        '/admin/tariffs/categoria/$codigo',
        body: {'nome': c.nome, 'ativa': c.ativa, 'diurna': c.diurna.toJson(), 'noturna': c.noturna.toJson()},
      ) as Map<String, dynamic>);

  Future<Tarifas> salvarCobranca(String modo) async => Tarifas.fromJson(
      await _c.request('PUT', '/admin/tariffs/cobranca', body: {'modo': modo}) as Map<String, dynamic>);

  Future<Tarifas> salvarMultiplicador(double cidade, List<Zona> zonas) async => Tarifas.fromJson(await _c.request(
        'PUT',
        '/admin/tariffs/multiplicador',
        body: {'cidade': cidade, 'zonas': [for (final z in zonas) z.toJson()]},
      ) as Map<String, dynamic>);

  // Financeiro
  Future<List<Saque>> saques() async =>
      [for (final j in _lista(await _c.request('GET', '/admin/payouts', query: _naPraca))) Saque.fromJson(j)];

  Future<void> decidirSaque(String id, bool pago, [String? motivo]) =>
      _c.request('PATCH', '/admin/payouts/$id', body: {'paid': pago, if (motivo != null) 'reason': motivo});

  Future<Receitas> receitas(int dias) async =>
      Receitas.fromJson(await _c.request('GET', '/admin/reports/finance', query: {'days': '$dias', ..._naPraca}) as Map<String, dynamic>);

  // SOS
  Future<List<AlertaSos>> alertas({bool resolvidos = false}) async => [
        for (final j in _lista(await _c.request('GET', '/admin/safety', query: {'resolved': '$resolvidos', ..._naPraca})))
          AlertaSos.fromJson(j),
      ];

  Future<void> encerrarAlerta(String id, String nota) =>
      _c.request('PATCH', '/admin/safety/$id/resolve', body: {'note': nota});

  // Cupons
  Future<List<Cupom>> cupons() async => [for (final j in _lista(await _c.request('GET', '/admin/coupons'))) Cupom.fromJson(j)];

  Future<void> criarCupom(Map<String, dynamic> dados) => _c.request('POST', '/admin/coupons', body: dados);

  Future<void> ligarCupom(String id, bool ativo) => _c.request('PATCH', '/admin/coupons/$id', body: {'isActive': ativo});

  // ------------------------------------------------------------------
  // Cidades e equipe (Evandro, 08/10/2026: "se eu abrir em Goiatuba e a
  // minha sobrinha cuidar de Teutonia, como fica a Central?")
  // ------------------------------------------------------------------

  /// Quem esta na Central: dono (todas as cidades) ou operador de uma.
  Future<QuemSouEu> eu() async => QuemSouEu.fromJson(await _c.request('GET', '/admin/eu') as Map<String, dynamic>);

  Future<List<Praca>> pracas() async => [for (final j in _lista(await _c.request('GET', '/admin/pracas'))) Praca.fromJson(j)];

  Future<List<Praca>> criarPraca(Map<String, dynamic> dados) async =>
      [for (final j in _lista(await _c.request('POST', '/admin/pracas', body: dados))) Praca.fromJson(j)];

  Future<List<Praca>> alterarPraca(String id, Map<String, dynamic> dados) async =>
      [for (final j in _lista(await _c.request('PATCH', '/admin/pracas/$id', body: dados))) Praca.fromJson(j)];

  Future<void> mudarPracaDoMotorista(String driverId, String praca) =>
      _c.request('PATCH', '/admin/drivers/$driverId/praca', body: {'praca': praca});

  Future<List<ContaDaEquipe>> equipe() async =>
      [for (final j in _lista(await _c.request('GET', '/admin/equipe'))) ContaDaEquipe.fromJson(j)];

  Future<void> criarOperador(Map<String, dynamic> dados) => _c.request('POST', '/admin/equipe', body: dados);

  Future<List<ContaDaEquipe>> mudarOperador(String id, Map<String, dynamic> dados) async =>
      [for (final j in _lista(await _c.request('PATCH', '/admin/equipe/$id', body: dados))) ContaDaEquipe.fromJson(j)];

  Future<List<ContaDaEquipe>> apagarOperador(String id) async =>
      [for (final j in _lista(await _c.request('DELETE', '/admin/equipe/$id'))) ContaDaEquipe.fromJson(j)];

  // ------------------------------------------------------------------
  // Limpeza de dados (so o dono)
  // ------------------------------------------------------------------

  Future<ResumoLimpeza> resumoLimpeza() async =>
      ResumoLimpeza.fromJson(await _c.request('GET', '/admin/limpeza') as Map<String, dynamic>);

  Future<Map<String, dynamic>> apagarDadosDeTeste() async =>
      await _c.request('POST', '/admin/limpeza/teste', body: const <String, dynamic>{}) as Map<String, dynamic>;

  Future<Map<String, dynamic>> zerarOperacao() async =>
      await _c.request('POST', '/admin/limpeza/zerar', body: {'confirmacao': 'ZERAR'}) as Map<String, dynamic>;

  Future<List<ContaParaLimpar>> contasParaLimpar(String busca) async => [
        for (final j in _lista(await _c.request('GET', '/admin/limpeza/contas', query: {if (busca.trim().isNotEmpty) 'busca': busca.trim()})))
          ContaParaLimpar.fromJson(j),
      ];

  Future<Map<String, dynamic>> apagarContas(List<String> ids) async =>
      await _c.request('POST', '/admin/limpeza/contas/apagar', body: {'ids': ids}) as Map<String, dynamic>;

  // ------------------------------------------------------------------
  // Relatorio de faturamento em PDF
  // ------------------------------------------------------------------

  /// Link do PDF (vale 15 minutos). [tipo]: frota, praca ou motorista.
  Future<String> linkDoRelatorio({required String tipo, String? driverId, String? pracaId, required DateTime de, required DateTime ate}) async {
    String dia(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
    final r = await _c.request('GET', '/admin/relatorio', query: {
      'tipo': tipo,
      if (driverId != null) 'driverId': driverId,
      if (pracaId != null) 'praca': pracaId,
      'de': dia(de),
      'ate': dia(ate),
    }) as Map<String, dynamic>;
    return _txt(r['caminho']);
  }
}

/// Cidade atendida (praca).
class Praca {
  const Praca({required this.id, required this.nome, required this.uf, required this.posicao, required this.raioKm, required this.ativa, this.whatsapp});

  final String id;
  final String nome;
  final String uf;
  final Coords posicao;
  final double raioKm;
  final bool ativa;
  final String? whatsapp;

  String get rotulo => uf.isEmpty ? nome : '$nome - $uf';

  factory Praca.fromJson(Map<String, dynamic> j) => Praca(
        id: _txt(j['id']),
        nome: _txt(j['nome'], 'Cidade'),
        uf: _txt(j['uf']),
        posicao: Coords(_num(j['latitude']) ?? 0, _num(j['longitude']) ?? 0),
        raioKm: _num(j['raioKm']) ?? 60,
        ativa: j['ativa'] != false,
        whatsapp: j['whatsapp'] as String?,
      );
}

/// Quem esta na Central.
class QuemSouEu {
  const QuemSouEu({required this.dono, required this.praca, required this.pracaNome, required this.pracas});

  /// Dono: ve todas as cidades. Operador: so [praca].
  final bool dono;
  final String? praca;
  final String? pracaNome;
  final List<Praca> pracas;

  factory QuemSouEu.fromJson(Map<String, dynamic> j) => QuemSouEu(
        dono: j['dono'] != false,
        praca: j['praca'] as String?,
        pracaNome: j['pracaNome'] as String?,
        pracas: [for (final p in (j['pracas'] as List? ?? const []).whereType<Map<String, dynamic>>()) Praca.fromJson(p)],
      );
}

/// Conta da Central (dono ou operador de uma cidade).
class ContaDaEquipe {
  const ContaDaEquipe({
    required this.id,
    required this.nome,
    required this.email,
    required this.telefone,
    required this.ativo,
    required this.dono,
    required this.praca,
    required this.pracaNome,
    required this.ultimoAcesso,
  });

  final String id;
  final String nome;
  final String email;
  final String telefone;
  final bool ativo;
  final bool dono;
  final String? praca;
  final String? pracaNome;
  final DateTime? ultimoAcesso;

  factory ContaDaEquipe.fromJson(Map<String, dynamic> j) => ContaDaEquipe(
        id: _txt(j['id']),
        nome: _txt(j['name'], 'Conta da Central'),
        email: _txt(j['email']),
        telefone: _txt(j['phone']),
        ativo: j['ativo'] != false,
        dono: j['dono'] == true,
        praca: j['praca'] as String?,
        pracaNome: j['pracaNome'] as String?,
        ultimoAcesso: _data(j['lastLoginAt']),
      );
}

/// Quanto ha de cada coisa no banco (tela Limpeza de dados).
class ResumoLimpeza {
  const ResumoLimpeza({
    required this.contasTeste,
    required this.contas,
    required this.corridas,
    required this.movimentos,
    required this.saques,
    required this.sos,
    required this.avaliacoes,
    required this.cuponsTeste,
    required this.ultimaCopia,
  });

  final int contasTeste;
  final int contas;
  final int corridas;
  final int movimentos;
  final int saques;
  final int sos;
  final int avaliacoes;
  final int cuponsTeste;
  final String? ultimaCopia;

  factory ResumoLimpeza.fromJson(Map<String, dynamic> j) => ResumoLimpeza(
        contasTeste: _int(j['contasTeste']),
        contas: _int(j['contas']),
        corridas: _int(j['corridas']),
        movimentos: _int(j['movimentos']),
        saques: _int(j['saques']),
        sos: _int(j['sos']),
        avaliacoes: _int(j['avaliacoes']),
        cuponsTeste: _int(j['cuponsTeste']),
        ultimaCopia: j['ultimaCopia'] as String?,
      );
}

/// Conta de passageiro ou motorista na tela Limpeza de dados.
class ContaParaLimpar {
  const ContaParaLimpar({
    required this.id,
    required this.nome,
    required this.telefone,
    required this.email,
    required this.motorista,
    required this.corridas,
    required this.teste,
  });

  final String id;
  final String nome;
  final String telefone;
  final String email;
  final bool motorista;
  final int corridas;
  final bool teste;

  factory ContaParaLimpar.fromJson(Map<String, dynamic> j) => ContaParaLimpar(
        id: _txt(j['id']),
        nome: _txt(j['name'], 'Sem nome'),
        telefone: _txt(j['phone']),
        email: _txt(j['email']),
        motorista: j['motorista'] == true,
        corridas: _int(j['corridas']),
        teste: j['teste'] == true,
      );
}
