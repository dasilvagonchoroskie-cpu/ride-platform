import '../../core/utils/geo.dart';

/// Situacao da corrida (espelha o enum RideStatus do servidor).
enum RideStatus {
  scheduled,
  searching,
  driverAssigned,
  driverArriving,
  driverWaiting,
  inProgress,
  completed,
  cancelledByPassenger,
  cancelledByDriver,
  cancelledBySystem,
  expired;

  String get label {
    switch (this) {
      case RideStatus.scheduled:
        return 'Agendada';
      case RideStatus.searching:
        return 'Procurando motorista';
      case RideStatus.driverAssigned:
        return 'Motorista encontrado';
      case RideStatus.driverArriving:
        return 'Motorista a caminho';
      case RideStatus.driverWaiting:
        return 'Motorista chegou';
      case RideStatus.inProgress:
        return 'Em andamento';
      case RideStatus.completed:
        return 'Concluída';
      case RideStatus.cancelledByPassenger:
        return 'Cancelada por você';
      case RideStatus.cancelledByDriver:
        return 'Cancelada pelo motorista';
      case RideStatus.cancelledBySystem:
        return 'Cancelada pela Central';
      case RideStatus.expired:
        return 'Sem motorista disponível';
    }
  }

  bool get isActive =>
      this == RideStatus.searching ||
      this == RideStatus.driverAssigned ||
      this == RideStatus.driverArriving ||
      this == RideStatus.driverWaiting ||
      this == RideStatus.inProgress;

  /// Cancelada ou sem motorista: a corrida acabou sem viagem.
  bool get encerradaSemViagem =>
      this == RideStatus.cancelledByPassenger ||
      this == RideStatus.cancelledByDriver ||
      this == RideStatus.cancelledBySystem ||
      this == RideStatus.expired;

  /// Nome que o servidor usa (SEARCHING, DRIVER_ASSIGNED...).
  static RideStatus doServidor(String? nome) {
    switch (nome) {
      case 'SCHEDULED':
        return RideStatus.scheduled;
      case 'DRIVER_ASSIGNED':
        return RideStatus.driverAssigned;
      case 'DRIVER_ARRIVING':
        return RideStatus.driverArriving;
      case 'DRIVER_WAITING':
        return RideStatus.driverWaiting;
      case 'IN_PROGRESS':
        return RideStatus.inProgress;
      case 'COMPLETED':
        return RideStatus.completed;
      case 'CANCELLED_BY_PASSENGER':
        return RideStatus.cancelledByPassenger;
      case 'CANCELLED_BY_DRIVER':
        return RideStatus.cancelledByDriver;
      case 'CANCELLED_BY_SYSTEM':
        return RideStatus.cancelledBySystem;
      case 'EXPIRED':
        return RideStatus.expired;
      default:
        return RideStatus.searching;
    }
  }
}

/// Forma de pagamento como o servidor grava -> texto da tela.
String rotuloPagamento(String? tipo) {
  switch (tipo) {
    case 'CASH':
      return 'Dinheiro';
    case 'PIX':
      return 'Pix';
    case 'CREDIT_CARD':
      return 'Cartão de crédito';
    case 'DEBIT_CARD':
      return 'Cartão de débito';
    default:
      return tipo ?? 'Dinheiro';
  }
}

class UserProfile {
  const UserProfile({
    required this.id,
    required this.name,
    required this.phone,
    this.email,
    this.role = 'PASSENGER',
    this.termsAccepted = false,
    this.cadastroCompleto = false,
    this.cpf,
    this.genero,
    this.cidade,
    this.temSenha = false,
    this.telefonePendente = false,
    this.avatarUrl,
    this.endereco,
    this.driverId,
  });

  final String id;
  final String name;
  final String phone;
  final String? email;
  final String role;

  /// Se a pessoa ja tocou em "Aceito os Termos". Enquanto for falso, o
  /// aplicativo mostra a tela de aceite antes de qualquer outra coisa.
  final bool termsAccepted;

  /// Cadastro feito (nome, e-mail, genero, CPF, senha e cidade). Enquanto
  /// for falso, o aplicativo mostra Cidade e Cadastro logo apos o login.
  final bool cadastroCompleto;
  final String? cpf;

  /// FEMININO, MASCULINO, OUTRO ou NAO_INFORMAR.
  final String? genero;
  final String? cidade;

  /// Ja tem senha para entrar pelo e-mail (a senha nunca vem do servidor).
  final bool temSenha;

  /// Entrou pelo e-mail e ainda nao informou o telefone (pedido no cadastro).
  final bool telefonePendente;

  /// Foto de perfil no servidor (ex.: /arquivos/123).
  final String? avatarUrl;

  /// Endereco (rua, numero, bairro), mudado em Meus dados.
  final String? endereco;

  /// A mesma conta tambem e motorista: nome, telefone, e-mail e endereco
  /// mudam pelo app do motorista (a Central aprova).
  final String? driverId;

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'phone': phone,
        'email': email,
        'role': role,
        'termsAccepted': termsAccepted,
        'cadastroCompleto': cadastroCompleto,
        'cpf': cpf,
        'genero': genero,
        'cidade': cidade,
        'temSenha': temSenha,
        'telefonePendente': telefonePendente,
        'avatarUrl': avatarUrl,
        'endereco': endereco,
        'driverId': driverId,
      };

  factory UserProfile.fromJson(Map<String, dynamic> json) => UserProfile(
        id: json['id'] as String? ?? '',
        name: json['name'] as String? ?? 'Passageiro',
        phone: json['phone'] as String? ?? '',
        email: json['email'] as String?,
        role: json['role'] as String? ?? 'PASSENGER',
        termsAccepted: json['termsAccepted'] as bool? ?? false,
        cadastroCompleto: json['cadastroCompleto'] as bool? ?? false,
        cpf: json['cpf'] as String?,
        genero: json['genero'] as String?,
        cidade: json['cidade'] as String?,
        temSenha: json['temSenha'] as bool? ?? false,
        telefonePendente: json['telefonePendente'] as bool? ?? false,
        avatarUrl: json['avatarUrl'] as String?,
        endereco: json['endereco'] as String?,
        driverId: json['driverId'] as String?,
      );

  UserProfile copyWith({String? name, String? email, bool? termsAccepted, String? avatarUrl}) => UserProfile(
        id: id,
        name: name ?? this.name,
        phone: phone,
        email: email ?? this.email,
        role: role,
        termsAccepted: termsAccepted ?? this.termsAccepted,
        cadastroCompleto: cadastroCompleto,
        cpf: cpf,
        genero: genero,
        cidade: cidade,
        temSenha: temSenha,
        telefonePendente: telefonePendente,
        avatarUrl: avatarUrl ?? this.avatarUrl,
        endereco: endereco,
        driverId: driverId,
      );

  String get firstName => name.split(' ').first;

  /// Iniciais para o circulo da foto: "Evandro da Silva" -> "ES".
  String get iniciais {
    final partes = name.trim().split(RegExp(r'\s+')).where((p) => p.length > 2 || p == name.trim()).toList();
    if (partes.isEmpty) return 'P';
    final primeira = partes.first.substring(0, 1);
    final ultima = partes.length > 1 ? partes.last.substring(0, 1) : '';
    return (primeira + ultima).toUpperCase();
  }
}

/// Opcoes de genero do cadastro (valor que vai ao servidor, texto na tela).
const List<(String, String)> kGeneros = [
  ('FEMININO', 'Feminino'),
  ('MASCULINO', 'Masculino'),
  ('OUTRO', 'Outro'),
  ('NAO_INFORMAR', 'Prefiro não informar'),
];

String rotuloGenero(String? valor) {
  for (final g in kGeneros) {
    if (g.$1 == valor) return g.$2;
  }
  return 'Selecione';
}

/// Aviso publicado pela Central (sino da tela inicial).
class AvisoCentral {
  const AvisoCentral({required this.id, required this.titulo, required this.texto, required this.criadoEm});

  final String id;
  final String titulo;
  final String texto;
  final String criadoEm;

  factory AvisoCentral.fromJson(Map<String, dynamic> j) => AvisoCentral(
        id: j['id'] as String? ?? '',
        titulo: j['titulo'] as String? ?? '',
        texto: j['texto'] as String? ?? '',
        criadoEm: j['criadoEm'] as String? ?? '',
      );

  Map<String, dynamic> toJson() => {'id': id, 'titulo': titulo, 'texto': texto, 'criadoEm': criadoEm};
}

/// Bandeira do horario. Quem decide e o servidor, pelo relogio dele.
enum FareFlag { diurna, noturna }

extension FareFlagLabel on FareFlag {
  String get label => this == FareFlag.noturna ? 'Noturna' : 'Diurna';
  String get faixa => this == FareFlag.noturna ? '22h às 6h' : '6h às 22h';
}

/// O preco da viagem.
///
/// Modalidade unica: nao ha categoria a escolher. O que o passageiro ve e
/// um valor so, o da bandeira vigente no momento do pedido.
class RideQuote {
  const RideQuote({
    required this.flag,
    required this.priceCents,
    required this.baseFareCents,
    required this.distanceCents,
    required this.distanceMeters,
    required this.durationSeconds,
    required this.chargedDistanceMeters,
    this.etaMinutes = 3,
    this.minFareApplied = false,
    this.discountCents = 0,
    this.couponCode,
    this.taximetro = false,
    this.category = 'CARRO',
    this.moto = false,
    this.opcoes = const [],
  });

  /// Categoria deste preco (CARRO, MOTO...) e se e mototaxi.
  final String category;
  final bool moto;

  /// Preco em cada categoria ativa: o passageiro escolhe (Carro ou Moto).
  final List<OpcaoCategoria> opcoes;

  final FareFlag flag;
  final int priceCents;

  /// O valor final sai do taximetro (trajeto feito); o preco e estimado.
  final bool taximetro;

  /// Desconto do cupom aplicado (0 sem cupom).
  final int discountCents;
  final String? couponCode;

  int get aPagarCents => (priceCents - discountCents).clamp(0, 1 << 30);

  /// Bandeirada: a parte fixa, que ja inclui a franquia.
  final int baseFareCents;

  /// O que passou da franquia e por isso foi somado.
  final int distanceCents;
  final int chargedDistanceMeters;

  final int distanceMeters;
  final int durationSeconds;
  final int etaMinutes;
  final bool minFareApplied;

  /// Se nada passou da franquia, o passageiro paga so a bandeirada.
  bool get somenteBandeirada => chargedDistanceMeters <= 0;

  factory RideQuote.fromJson(Map<String, dynamic> json) => RideQuote(
        flag: (json['flag'] as String?)?.toUpperCase() == 'NOTURNA'
            ? FareFlag.noturna
            : FareFlag.diurna,
        priceCents: (json['estimatedFareCents'] as num?)?.toInt() ??
            (json['priceCents'] as num?)?.toInt() ??
            0,
        baseFareCents: (json['baseFareCents'] as num?)?.toInt() ?? 0,
        distanceCents: (json['distanceCents'] as num?)?.toInt() ?? 0,
        distanceMeters: (json['distanceMeters'] as num?)?.toInt() ?? 0,
        durationSeconds: (json['durationSeconds'] as num?)?.toInt() ?? 0,
        chargedDistanceMeters: (json['chargedDistanceMeters'] as num?)?.toInt() ?? 0,
        minFareApplied: json['minFareApplied'] as bool? ?? false,
        discountCents: (json['discountCents'] as num?)?.toInt() ?? 0,
        couponCode: json['couponCode'] as String?,
        taximetro: json['cobranca'] == 'TAXIMETRO',
        category: json['category'] as String? ?? 'CARRO',
        moto: json['moto'] == true,
        opcoes: [
          for (final o in (json['opcoes'] as List? ?? const []).whereType<Map<String, dynamic>>()) OpcaoCategoria.fromJson(o),
        ],
      );

  Map<String, dynamic> toJson() => {
        'flag': flag == FareFlag.noturna ? 'NOTURNA' : 'DIURNA',
        'estimatedFareCents': priceCents,
        'baseFareCents': baseFareCents,
        'distanceCents': distanceCents,
        'distanceMeters': distanceMeters,
        'durationSeconds': durationSeconds,
        'chargedDistanceMeters': chargedDistanceMeters,
        'minFareApplied': minFareApplied,
      };
}

/// Uma categoria para escolher na confirmacao (ex.: Carro R\$ 18,00 / Moto R\$ 12,00).
class OpcaoCategoria {
  const OpcaoCategoria({required this.category, required this.nome, required this.moto, required this.precoCents, required this.aPagarCents});

  final String category;
  final String nome;
  final bool moto;
  final int precoCents;
  final int aPagarCents;

  factory OpcaoCategoria.fromJson(Map<String, dynamic> j) => OpcaoCategoria(
        category: j['category'] as String? ?? 'CARRO',
        nome: j['nome'] as String? ?? 'Carro',
        moto: j['moto'] == true,
        precoCents: (j['estimatedFareCents'] as num?)?.toInt() ?? 0,
        aPagarCents: (j['totalToPayCents'] as num?)?.toInt() ?? (j['estimatedFareCents'] as num?)?.toInt() ?? 0,
      );
}

class DriverInfo {
  const DriverInfo({
    required this.id,
    required this.name,
    required this.rating,
    required this.totalRides,
    required this.vehicle,
    required this.plate,
    required this.color,
    required this.position,
    this.telefone,
    this.posicaoReal = false,
    this.fotoUrl,
    this.fotoCarroUrl,
    this.moto = false,
  });

  /// Foto do rosto do motorista (/arquivos/...), se ele mandou.
  final String? fotoUrl;

  /// Foto do carro de frente (/arquivos/...), se ele mandou.
  final String? fotoCarroUrl;

  /// Mototaxi: o mapa mostra uma moto no lugar do carro.
  final bool moto;

  final String id;
  final String name;
  final double rating;
  final int totalRides;
  final String vehicle;
  final String plate;
  final String color;
  final Coords position;

  /// Telefone do motorista (para ligar ou chamar no WhatsApp).
  final String? telefone;

  /// A posicao veio do GPS do carro (e nao e um palpite).
  final bool posicaoReal;

  String get initials {
    final parts = name.split(' ').where((p) => p.isNotEmpty).take(2);
    return parts.map((p) => p[0].toUpperCase()).join();
  }
}

class RidePlace {
  const RidePlace({required this.address, required this.coords});

  final String address;
  final Coords coords;
}

class Ride {
  const Ride({
    required this.id,
    required this.code,
    required this.status,
    required this.pickup,
    required this.dropoff,
    required this.fareFlag,
    required this.distanceMeters,
    required this.durationSeconds,
    required this.fareCents,
    required this.paymentMethod,
    required this.pin,
    required this.createdAt,
    this.driver,
    this.finishedAt,
    this.rating,
    this.discountCents = 0,
    this.agendadaPara,
    this.favorito = false,
    this.bloqueado = false,
    this.mensagensNaoLidas = 0,
    this.taximetroCents,
    this.taximetroMetros,
    this.cobranca,
    this.category,
  });

  /// Categoria da corrida (CARRO, MOTO...).
  final String? category;

  /// Mototaxi: o mapa mostra uma moto.
  bool get moto => (category ?? '').toUpperCase().contains('MOTO');

  /// Taximetro ao vivo durante a viagem (Evandro, 08/10/2026: "a contagem do
  /// valor na corrida"): o valor e o trajeto ate agora, vindos do servidor.
  final int? taximetroCents;
  final int? taximetroMetros;

  /// TAXIMETRO (valor pelo trajeto) ou FECHADO (o estimado no pedido).
  final String? cobranca;

  /// O motorista desta corrida esta nos favoritos / bloqueados do passageiro.
  final bool favorito;
  final bool bloqueado;

  /// Mensagens do motorista que o passageiro ainda nao abriu (chat).
  final int mensagensNaoLidas;

  final String id;
  final String code;
  final RideStatus status;
  final RidePlace pickup;
  final RidePlace dropoff;
  final FareFlag fareFlag;
  final DriverInfo? driver;
  final int distanceMeters;
  final int durationSeconds;
  final int fareCents;
  final String paymentMethod;
  final String pin;
  final String createdAt;
  final String? finishedAt;
  final int? rating;

  /// Desconto do cupom (o passageiro paga [fareCents] menos isto).
  final int discountCents;

  /// Horario combinado da corrida agendada (ISO).
  final String? agendadaPara;

  int get aPagarCents => (fareCents - discountCents).clamp(0, 1 << 30);

  Ride copyWith({
    RideStatus? status,
    DriverInfo? driver,
    String? finishedAt,
    int? rating,
    bool? favorito,
    bool? bloqueado,
    int? mensagensNaoLidas,
  }) =>
      Ride(
        id: id,
        code: code,
        status: status ?? this.status,
        pickup: pickup,
        dropoff: dropoff,
        fareFlag: fareFlag,
        driver: driver ?? this.driver,
        distanceMeters: distanceMeters,
        durationSeconds: durationSeconds,
        fareCents: fareCents,
        paymentMethod: paymentMethod,
        pin: pin,
        createdAt: createdAt,
        finishedAt: finishedAt ?? this.finishedAt,
        rating: rating ?? this.rating,
        discountCents: discountCents,
        agendadaPara: agendadaPara,
        favorito: favorito ?? this.favorito,
        bloqueado: bloqueado ?? this.bloqueado,
        mensagensNaoLidas: mensagensNaoLidas ?? this.mensagensNaoLidas,
        taximetroCents: taximetroCents,
        taximetroMetros: taximetroMetros,
        cobranca: cobranca,
        category: category,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'code': code,
        'status': status.name,
        'pickup': {'address': pickup.address, ...pickup.coords.toJson()},
        'dropoff': {'address': dropoff.address, ...dropoff.coords.toJson()},
        'fareFlag': fareFlag == FareFlag.noturna ? 'NOTURNA' : 'DIURNA',
        'driver': driver == null
            ? null
            : {
                'id': driver!.id,
                'name': driver!.name,
                'rating': driver!.rating,
                'totalRides': driver!.totalRides,
                'vehicle': driver!.vehicle,
                'plate': driver!.plate,
                'color': driver!.color,
                'position': driver!.position.toJson(),
                'telefone': driver!.telefone,
                'posicaoReal': driver!.posicaoReal,
                'fotoUrl': driver!.fotoUrl,
                'fotoCarroUrl': driver!.fotoCarroUrl,
              },
        'distanceMeters': distanceMeters,
        'durationSeconds': durationSeconds,
        'fareCents': fareCents,
        'paymentMethod': paymentMethod,
        'pin': pin,
        'createdAt': createdAt,
        'finishedAt': finishedAt,
        'rating': rating,
        'discountCents': discountCents,
        'agendadaPara': agendadaPara,
        'category': category,
      };

  factory Ride.fromJson(Map<String, dynamic> json) {
    final pickupJson = json['pickup'] as Map<String, dynamic>? ?? const <String, dynamic>{};
    final dropoffJson = json['dropoff'] as Map<String, dynamic>? ?? const <String, dynamic>{};
    final driverJson = json['driver'] as Map<String, dynamic>?;
    final positionJson = driverJson?['position'] as Map<String, dynamic>?;

    return Ride(
      id: json['id'] as String? ?? '',
      code: json['code'] as String? ?? '',
      status: _statusFromName(json['status'] as String?),
      pickup: RidePlace(
        address: pickupJson['address'] as String? ?? '',
        coords: Coords(
          (pickupJson['latitude'] as num?)?.toDouble() ?? fallbackCoords.latitude,
          (pickupJson['longitude'] as num?)?.toDouble() ?? fallbackCoords.longitude,
        ),
      ),
      dropoff: RidePlace(
        address: dropoffJson['address'] as String? ?? '',
        coords: Coords(
          (dropoffJson['latitude'] as num?)?.toDouble() ?? fallbackCoords.latitude,
          (dropoffJson['longitude'] as num?)?.toDouble() ?? fallbackCoords.longitude,
        ),
      ),
      fareFlag: (json['fareFlag'] as String?)?.toUpperCase() == 'NOTURNA'
          ? FareFlag.noturna
          : FareFlag.diurna,
      driver: driverJson == null
          ? null
          : DriverInfo(
              id: driverJson['id'] as String? ?? '',
              name: driverJson['name'] as String? ?? '',
              rating: (driverJson['rating'] as num?)?.toDouble() ?? 5,
              totalRides: (driverJson['totalRides'] as num?)?.toInt() ?? 0,
              vehicle: driverJson['vehicle'] as String? ?? '',
              plate: driverJson['plate'] as String? ?? '',
              color: driverJson['color'] as String? ?? '',
              position: Coords(
                (positionJson?['latitude'] as num?)?.toDouble() ?? fallbackCoords.latitude,
                (positionJson?['longitude'] as num?)?.toDouble() ?? fallbackCoords.longitude,
              ),
              telefone: driverJson['telefone'] as String?,
              posicaoReal: driverJson['posicaoReal'] as bool? ?? false,
              fotoUrl: driverJson['fotoUrl'] as String?,
              fotoCarroUrl: driverJson['fotoCarroUrl'] as String?,
            ),
      distanceMeters: (json['distanceMeters'] as num?)?.toInt() ?? 0,
      durationSeconds: (json['durationSeconds'] as num?)?.toInt() ?? 0,
      fareCents: (json['fareCents'] as num?)?.toInt() ?? 0,
      paymentMethod: json['paymentMethod'] as String? ?? 'Pix',
      pin: json['pin'] as String? ?? '0000',
      createdAt: json['createdAt'] as String? ?? DateTime.now().toIso8601String(),
      finishedAt: json['finishedAt'] as String?,
      rating: (json['rating'] as num?)?.toInt(),
      discountCents: (json['discountCents'] as num?)?.toInt() ?? 0,
      agendadaPara: json['agendadaPara'] as String?,
      category: json['category'] as String?,
    );
  }

  /// Corrida como o servidor manda (GET /rides/:id, POST /rides, historico).
  /// Antes o aplicativo lia isto com o formato local e tudo vinha vazio:
  /// endereco em branco, valor R$ 0,00 e PIN "0000".
  factory Ride.fromServer(Map<String, dynamic> j) {
    double? numero(Object? v) => v == null ? null : double.tryParse(v.toString());
    final driverJson = j['driver'] as Map<String, dynamic>?;
    final userJson = driverJson?['user'] as Map<String, dynamic>?;
    final veiculo = j['vehicle'] as Map<String, dynamic>?;
    final pos = j['driverPosition'] as Map<String, dynamic>?;
    final embarque = Coords(numero(j['pickupLat']) ?? 0, numero(j['pickupLng']) ?? 0);
    final finalCents = (j['finalFareCents'] as num?)?.toInt();

    return Ride(
      id: j['id'] as String? ?? '',
      code: j['code'] as String? ?? '',
      status: RideStatus.doServidor(j['status'] as String?),
      pickup: RidePlace(address: j['pickupAddress'] as String? ?? '', coords: embarque),
      dropoff: RidePlace(
        address: j['dropoffAddress'] as String? ?? '',
        coords: Coords(numero(j['dropoffLat']) ?? 0, numero(j['dropoffLng']) ?? 0),
      ),
      fareFlag: (j['fareFlag'] as String?)?.toUpperCase() == 'NOTURNA' ? FareFlag.noturna : FareFlag.diurna,
      driver: driverJson == null
          ? null
          : DriverInfo(
              id: driverJson['id'] as String? ?? '',
              name: userJson?['name'] as String? ?? 'Motorista',
              rating: numero(driverJson['ratingAvg']) ?? 5,
              totalRides: (driverJson['totalRides'] as num?)?.toInt() ?? 0,
              vehicle: [veiculo?['brand'], veiculo?['model']].whereType<String>().join(' '),
              plate: veiculo?['plate'] as String? ?? '',
              color: veiculo?['color'] as String? ?? '',
              position: pos == null ? embarque : Coords(numero(pos['latitude']) ?? 0, numero(pos['longitude']) ?? 0),
              telefone: userJson?['phone'] as String?,
              posicaoReal: pos != null,
              fotoUrl: userJson?['avatarUrl'] as String?,
              fotoCarroUrl: driverJson['fotoCarroUrl'] as String?,
            ),
      distanceMeters: (j['distanceMeters'] as num?)?.toInt() ?? 0,
      durationSeconds: (j['durationSeconds'] as num?)?.toInt() ?? 0,
      fareCents: finalCents ?? (j['estimatedFareCents'] as num?)?.toInt() ?? 0,
      paymentMethod: rotuloPagamento(j['paymentMethodType'] as String?),
      pin: j['pin'] as String? ?? '',
      createdAt: j['requestedAt'] as String? ?? j['createdAt'] as String? ?? DateTime.now().toIso8601String(),
      finishedAt: j['finishedAt'] as String? ?? j['cancelledAt'] as String?,
      rating: (j['minhaNota'] as num?)?.toInt(),
      discountCents: (j['discountCents'] as num?)?.toInt() ?? 0,
      agendadaPara: j['scheduledFor'] as String?,
      favorito: j['favorito'] == true,
      bloqueado: j['bloqueado'] == true,
      mensagensNaoLidas: (j['mensagensNaoLidas'] as num?)?.toInt() ?? 0,
      taximetroCents: ((j['taximetro'] as Map?)?['valorCents'] as num?)?.toInt(),
      taximetroMetros: ((j['taximetro'] as Map?)?['distanceMeters'] as num?)?.toInt(),
      cobranca: j['cobranca'] as String?,
      category: j['category'] as String?,
    );
  }

  static RideStatus _statusFromName(String? name) {
    return RideStatus.values.firstWhere(
      (s) => s.name == name,
      orElse: () => RideStatus.searching,
    );
  }
}

class PaymentOption {
  const PaymentOption({
    required this.id,
    required this.label,
    required this.detail,
    required this.type,
  });

  final String id;
  final String label;
  final String detail;
  final String type;
}

class PlaceSuggestion {
  const PlaceSuggestion({
    required this.address,
    required this.coords,
    required this.distanceKm,
    this.detail = '',
  });

  final String address;
  final Coords coords;
  final double distanceKm;

  /// Bairro e cidade (segunda linha da lista).
  final String detail;

  /// Endereco completo numa linha so (vai para o motorista).
  String get fullAddress => detail.isEmpty ? address : '$address - $detail';

  /// Resposta de /geo/search e /geo/reverse.
  factory PlaceSuggestion.fromGeo(Map<String, dynamic> j) => PlaceSuggestion(
        address: j['address'] as String? ?? 'Endereço',
        detail: j['detail'] as String? ?? '',
        coords: Coords((j['latitude'] as num).toDouble(), (j['longitude'] as num).toDouble()),
        distanceKm: (j['distanceKm'] as num?)?.toDouble() ?? 0,
      );

  Map<String, dynamic> toJson() => {
        'address': address,
        'detail': detail,
        'latitude': coords.latitude,
        'longitude': coords.longitude,
      };

  factory PlaceSuggestion.fromJson(Map<String, dynamic> j) => PlaceSuggestion(
        address: j['address'] as String? ?? '',
        detail: j['detail'] as String? ?? '',
        coords: Coords((j['latitude'] as num).toDouble(), (j['longitude'] as num).toDouble()),
        distanceKm: 0,
      );
}

/// Formas de pagamento aceitas: o passageiro paga DIRETO ao motorista —
/// o dinheiro nao passa pela plataforma. Nada de cartao salvo nem saldo.
const List<PaymentOption> kFormasDePagamento = [
  PaymentOption(id: 'dinheiro', label: 'Dinheiro', detail: 'Pague direto ao motorista', type: 'CASH'),
  PaymentOption(id: 'pix', label: 'Pix', detail: 'Pix direto para o motorista, no fim da corrida', type: 'PIX'),
  PaymentOption(
    id: 'cartao',
    label: 'Cartão',
    detail: 'Débito ou crédito, na maquininha do motorista',
    type: 'CREDIT_CARD',
  ),
];

class EstimateResult {
  const EstimateResult({required this.quote});

  /// Um orcamento so: a plataforma tem modalidade unica.
  final RideQuote quote;

  int get distanceMeters => quote.distanceMeters;
  int get durationSeconds => quote.durationSeconds;
}

/// Cupom disponivel para o passageiro (tela Cupons).
class CupomDisponivel {
  const CupomDisponivel({
    required this.code,
    required this.description,
    required this.percentual,
    required this.valor,
    this.maxDescontoCents,
    this.minimoCents = 0,
    this.validoAte,
  });

  final String code;
  final String description;
  final bool percentual;
  final int valor;
  final int? maxDescontoCents;
  final int minimoCents;
  final String? validoAte;

  factory CupomDisponivel.fromJson(Map<String, dynamic> j) => CupomDisponivel(
        code: j['code'] as String? ?? '',
        description: j['description'] as String? ?? '',
        percentual: j['discountType'] == 'PERCENT',
        valor: (j['discountValue'] as num?)?.toInt() ?? 0,
        maxDescontoCents: (j['maxDiscountCents'] as num?)?.toInt(),
        minimoCents: (j['minFareCents'] as num?)?.toInt() ?? 0,
        validoAte: j['expiresAt'] as String?,
      );
}

/// Motorista favorito (recebe primeiro os chamados do passageiro).
class MotoristaFavorito {
  const MotoristaFavorito({
    required this.driverId,
    required this.name,
    required this.rating,
    required this.vehicle,
    required this.color,
    required this.plate,
    required this.online,
  });

  final String driverId;
  final String name;
  final double rating;
  final String vehicle;
  final String color;
  final String plate;
  final bool online;

  factory MotoristaFavorito.fromJson(Map<String, dynamic> j) => MotoristaFavorito(
        driverId: j['driverId'] as String? ?? '',
        name: j['name'] as String? ?? 'Motorista',
        rating: double.tryParse('${j['rating']}') ?? 5,
        vehicle: j['vehicle'] as String? ?? '',
        color: j['color'] as String? ?? '',
        plate: j['plate'] as String? ?? '',
        online: j['online'] as bool? ?? false,
      );
}



/// Motorista que o passageiro bloqueou (nao recebe mais as corridas dele).
class MotoristaBloqueado {
  const MotoristaBloqueado({required this.driverId, required this.name, required this.vehicle, required this.plate});

  final String driverId;
  final String name;
  final String vehicle;
  final String plate;

  factory MotoristaBloqueado.fromJson(Map<String, dynamic> j) => MotoristaBloqueado(
        driverId: j['driverId'] as String? ?? '',
        name: j['name'] as String? ?? 'Motorista',
        vehicle: j['vehicle'] as String? ?? '',
        plate: j['plate'] as String? ?? '',
      );
}


/// Pessoa avisada em caso de SOS (ate 3 por passageiro).
class ContatoEmergencia {
  const ContatoEmergencia({required this.nome, required this.telefone});

  final String nome;

  /// No formato do servidor: +5564999991234.
  final String telefone;

  Map<String, dynamic> toJson() => {'nome': nome, 'telefone': telefone};

  factory ContatoEmergencia.fromJson(Map<String, dynamic> j) => ContatoEmergencia(
        nome: j['nome'] as String? ?? 'Contato',
        telefone: j['telefone'] as String? ?? '',
      );

  /// "+5564999991234" -> "(64) 99999-1234".
  String get telefoneBonito {
    var d = telefone.replaceAll(RegExp(r'\D'), '');
    if (d.startsWith('55') && d.length > 11) d = d.substring(2);
    if (d.length == 11) return '(${d.substring(0, 2)}) ${d.substring(2, 7)}-${d.substring(7)}';
    if (d.length == 10) return '(${d.substring(0, 2)}) ${d.substring(2, 6)}-${d.substring(6)}';
    return telefone;
  }
}
