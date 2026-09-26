import '../../core/utils/geo.dart';

/// Situacao cadastral do motorista (espelha DriverStatus do backend).
enum DriverApproval {
  pending,
  approved,
  rejected,
  suspended;

  String get label => switch (this) {
        DriverApproval.pending => 'Em analise',
        DriverApproval.approved => 'Aprovado',
        DriverApproval.rejected => 'Reprovado',
        DriverApproval.suspended => 'Suspenso',
      };
}

enum DocumentStatus { pending, approved, rejected }

enum DocumentType {
  profilePhoto,
  cnhFront,
  cnhBack,
  crlv,
  vehicleFront,
  vehicleBack,
  vehiclePlate;

  String get label => switch (this) {
        DocumentType.profilePhoto => 'Foto de perfil',
        DocumentType.cnhFront => 'CNH (frente)',
        DocumentType.cnhBack => 'CNH (verso)',
        DocumentType.crlv => 'CRLV do veiculo',
        DocumentType.vehicleFront => 'Veiculo (frente)',
        DocumentType.vehicleBack => 'Veiculo (traseira)',
        DocumentType.vehiclePlate => 'Placa do veiculo',
      };
}

class DriverProfile {
  const DriverProfile({
    required this.id,
    required this.name,
    required this.phone,
    this.cpf,
    this.cnhNumber,
    this.cnhCategory,
    this.cnhExpiresAt,
    this.approval = DriverApproval.pending,
    this.isOnline = false,
    this.rating = 5,
    this.totalRides = 0,
    this.acceptanceRate = 100,
    this.termsAccepted = false,
  });

  final String id;
  final String name;
  final String phone;
  final String? cpf;
  final String? cnhNumber;
  final String? cnhCategory;
  final String? cnhExpiresAt;
  final DriverApproval approval;
  final bool isOnline;
  final double rating;
  final int totalRides;
  final int acceptanceRate;

  /// Se o motorista ja tocou em "Aceito os Termos". Enquanto for falso,
  /// o aplicativo mostra a tela de aceite antes de qualquer outra coisa
  /// — inclusive antes do cadastro do veiculo.
  final bool termsAccepted;

  bool get isOnboarded => cpf != null && cnhNumber != null;

  String get firstName => name.split(' ').first;

  String get initials {
    final parts = name.split(' ').where((p) => p.isNotEmpty).take(2);
    return parts.map((p) => p[0].toUpperCase()).join();
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'phone': phone,
        'cpf': cpf,
        'cnhNumber': cnhNumber,
        'cnhCategory': cnhCategory,
        'cnhExpiresAt': cnhExpiresAt,
        'approval': approval.name,
        'isOnline': isOnline,
        'rating': rating,
        'totalRides': totalRides,
        'acceptanceRate': acceptanceRate,
        'termsAccepted': termsAccepted,
      };

  factory DriverProfile.fromJson(Map<String, dynamic> json) => DriverProfile(
        id: json['id'] as String? ?? '',
        name: json['name'] as String? ?? 'Motorista',
        phone: json['phone'] as String? ?? '',
        cpf: json['cpf'] as String?,
        cnhNumber: json['cnhNumber'] as String?,
        cnhCategory: json['cnhCategory'] as String?,
        cnhExpiresAt: json['cnhExpiresAt'] as String?,
        approval: DriverApproval.values.firstWhere(
          (a) => a.name == json['approval'],
          orElse: () => DriverApproval.pending,
        ),
        isOnline: json['isOnline'] as bool? ?? false,
        rating: (json['rating'] as num?)?.toDouble() ?? 5,
        totalRides: (json['totalRides'] as num?)?.toInt() ?? 0,
        acceptanceRate: (json['acceptanceRate'] as num?)?.toInt() ?? 100,
        termsAccepted: json['termsAccepted'] as bool? ?? false,
      );

  DriverProfile copyWith({
    String? name,
    String? cpf,
    String? cnhNumber,
    String? cnhCategory,
    String? cnhExpiresAt,
    DriverApproval? approval,
    bool? isOnline,
    bool? termsAccepted,
    double? rating,
    int? totalRides,
    int? acceptanceRate,
  }) =>
      DriverProfile(
        id: id,
        name: name ?? this.name,
        phone: phone,
        cpf: cpf ?? this.cpf,
        cnhNumber: cnhNumber ?? this.cnhNumber,
        cnhCategory: cnhCategory ?? this.cnhCategory,
        cnhExpiresAt: cnhExpiresAt ?? this.cnhExpiresAt,
        approval: approval ?? this.approval,
        isOnline: isOnline ?? this.isOnline,
        rating: rating ?? this.rating,
        totalRides: totalRides ?? this.totalRides,
        acceptanceRate: acceptanceRate ?? this.acceptanceRate,
        termsAccepted: termsAccepted ?? this.termsAccepted,
      );
}

class DriverDocumentItem {
  const DriverDocumentItem({
    required this.type,
    required this.status,
    this.rejectionReason,
  });

  final DocumentType type;
  final DocumentStatus status;
  final String? rejectionReason;

  bool get isApproved => status == DocumentStatus.approved;
  bool get isPending => status == DocumentStatus.pending;
  bool get isRejected => status == DocumentStatus.rejected;

  DriverDocumentItem copyWith({DocumentStatus? status, String? rejectionReason}) =>
      DriverDocumentItem(
        type: type,
        status: status ?? this.status,
        rejectionReason: rejectionReason ?? this.rejectionReason,
      );
}

class VehicleInfo {
  const VehicleInfo({
    required this.brand,
    required this.model,
    required this.year,
    required this.color,
    required this.plate,
  });

  final String brand;
  final String model;
  final int year;
  final String color;
  final String plate;

  String get description => '$brand $model $year';

}

class RideOffer {
  const RideOffer({
    required this.id,
    required this.code,
    required this.passengerName,
    required this.passengerRating,
    required this.pickupAddress,
    required this.pickupCoords,
    required this.dropoffAddress,
    required this.dropoffCoords,
    required this.distanceToPickupMeters,
    required this.tripDistanceMeters,
    required this.durationSeconds,
    required this.fareCents,
    required this.earningCents,
    required this.paymentMethod,
    this.expiresInSeconds = 30,
  });

  final String id;
  final String code;
  final String passengerName;
  final double passengerRating;
  final String pickupAddress;
  final Coords pickupCoords;
  final String dropoffAddress;
  final Coords dropoffCoords;
  final int distanceToPickupMeters;
  final int tripDistanceMeters;
  final int durationSeconds;
  final int fareCents;
  final int earningCents;
  final String paymentMethod;
  final int expiresInSeconds;

  String get passengerInitials {
    final parts = passengerName.split(' ').where((p) => p.isNotEmpty).take(2);
    return parts.map((p) => p[0].toUpperCase()).join();
  }
}

/// Fases da corrida do ponto de vista do motorista.
enum RidePhase { toPickup, waitingPassenger, inProgress, completed }

class DriverRide {
  const DriverRide({
    required this.offer,
    required this.phase,
    required this.pin,
    required this.startedAt,
    this.finishedAt,
  });

  final RideOffer offer;
  final RidePhase phase;
  final String pin;
  final String startedAt;
  final String? finishedAt;

  DriverRide copyWith({RidePhase? phase, String? finishedAt}) => DriverRide(
        offer: offer,
        phase: phase ?? this.phase,
        pin: pin,
        startedAt: startedAt,
        finishedAt: finishedAt ?? this.finishedAt,
      );

  Map<String, dynamic> toJson() => {
        'offerId': offer.id,
        'code': offer.code,
        'phase': phase.name,
        'pin': pin,
        'startedAt': startedAt,
        'finishedAt': finishedAt,
        'earningCents': offer.earningCents,
        'passengerName': offer.passengerName,
        'pickupAddress': offer.pickupAddress,
        'dropoffAddress': offer.dropoffAddress,
      };

  factory DriverRide.fromJson(Map<String, dynamic> json) => DriverRide(
        offer: RideOffer(
          id: json['offerId'] as String? ?? '',
          code: json['code'] as String? ?? '',
          passengerName: json['passengerName'] as String? ?? 'Passageiro',
          passengerRating: 5,
          pickupAddress: json['pickupAddress'] as String? ?? '',
          pickupCoords: fallbackCoords,
          dropoffAddress: json['dropoffAddress'] as String? ?? '',
          dropoffCoords: fallbackCoords,
          distanceToPickupMeters: 0,
          tripDistanceMeters: 0,
          durationSeconds: 0,
          fareCents: 0,
          earningCents: (json['earningCents'] as num?)?.toInt() ?? 0,
          paymentMethod: 'Pix',
        ),
        phase: RidePhase.values.firstWhere(
          (p) => p.name == json['phase'],
          orElse: () => RidePhase.toPickup,
        ),
        pin: json['pin'] as String? ?? '0000',
        startedAt: json['startedAt'] as String? ?? DateTime.now().toIso8601String(),
        finishedAt: json['finishedAt'] as String?,
      );
}

enum EarningKind { ride, commission, payout, bonus }

class EarningEntry {
  const EarningEntry({
    required this.id,
    required this.code,
    required this.description,
    required this.amountCents,
    required this.kind,
    required this.createdAt,
  });

  final String id;
  final String code;
  final String description;
  final int amountCents;
  final EarningKind kind;
  final String createdAt;

  bool get isCredit => kind != EarningKind.payout && kind != EarningKind.commission;
}

class WalletSummary {
  const WalletSummary({
    required this.balanceCents,
    required this.todayCents,
    required this.weekCents,
    required this.monthCents,
    required this.ridesToday,
    required this.hoursOnlineToday,
    required this.acceptanceRate,
    required this.minPayoutCents,
  });

  final int balanceCents;
  final int todayCents;
  final int weekCents;
  final int monthCents;
  final int ridesToday;
  final double hoursOnlineToday;
  final int acceptanceRate;
  final int minPayoutCents;

  bool get canRequestPayout => balanceCents >= minPayoutCents;
}

// ---------------------------------------------------------------------
// Painel do motorista (dados reais do servidor)
// ---------------------------------------------------------------------

int _int(dynamic v) => (v as num?)?.toInt() ?? 0;

/// Uma barra do grafico: um dia.
class ActivityBucket {
  const ActivityBucket({required this.date, required this.earningCents, required this.rides});

  /// Dia no formato 2026-09-21 (horario de Brasilia).
  final String date;
  final int earningCents;
  final int rides;

  DateTime get day => DateTime.parse(date);

  factory ActivityBucket.fromJson(Map<String, dynamic> j) => ActivityBucket(
        date: j['date'] as String? ?? '',
        earningCents: _int(j['earningCents']),
        rides: _int(j['rides']),
      );
}

/// Uma corrida concluida, com o que ficou para o motorista.
class EarningRide {
  const EarningRide({
    required this.id,
    required this.code,
    required this.finishedAt,
    required this.pickupAddress,
    required this.dropoffAddress,
    required this.fareCents,
    required this.commissionCents,
    required this.earningCents,
    required this.distanceMeters,
    required this.durationSeconds,
  });

  final String id;
  final String code;
  final DateTime finishedAt;
  final String pickupAddress;
  final String dropoffAddress;
  final int fareCents;
  final int commissionCents;
  final int earningCents;
  final int distanceMeters;
  final int durationSeconds;

  factory EarningRide.fromJson(Map<String, dynamic> j) => EarningRide(
        id: j['id'] as String? ?? '',
        code: j['code'] as String? ?? '',
        finishedAt: DateTime.tryParse(j['finishedAt'] as String? ?? '')?.toLocal() ?? DateTime.now(),
        pickupAddress: j['pickupAddress'] as String? ?? '',
        dropoffAddress: j['dropoffAddress'] as String? ?? '',
        fareCents: _int(j['fareCents']),
        commissionCents: _int(j['commissionCents']),
        earningCents: _int(j['earningCents']),
        distanceMeters: _int(j['distanceMeters']),
        durationSeconds: _int(j['durationSeconds']),
      );
}

/// Resumo de um periodo (hoje, uma semana ou um mes).
class ActivitySummary {
  const ActivitySummary({
    required this.period,
    required this.offset,
    required this.from,
    required this.to,
    required this.earningCents,
    required this.rides,
    required this.onlineSeconds,
    required this.workedSeconds,
    required this.acceptanceRate,
    required this.buckets,
    required this.items,
  });

  final String period;
  final int offset;
  final DateTime from;
  final DateTime to;
  final int earningCents;
  final int rides;
  final int onlineSeconds;
  final int workedSeconds;
  final int acceptanceRate;
  final List<ActivityBucket> buckets;
  final List<EarningRide> items;

  factory ActivitySummary.fromJson(Map<String, dynamic> j) => ActivitySummary(
        period: j['period'] as String? ?? 'day',
        offset: _int(j['offset']),
        from: DateTime.tryParse(j['from'] as String? ?? '')?.toLocal() ?? DateTime.now(),
        to: DateTime.tryParse(j['to'] as String? ?? '')?.toLocal() ?? DateTime.now(),
        earningCents: _int(j['earningCents']),
        rides: _int(j['rides']),
        onlineSeconds: _int(j['onlineSeconds']),
        workedSeconds: _int(j['workedSeconds']),
        acceptanceRate: (j['acceptanceRate'] as num?)?.toInt() ?? 100,
        buckets: [
          for (final b in (j['buckets'] as List<dynamic>? ?? const []))
            ActivityBucket.fromJson(b as Map<String, dynamic>),
        ],
        items: [
          for (final r in (j['items'] as List<dynamic>? ?? const []))
            EarningRide.fromJson(r as Map<String, dynamic>),
        ],
      );
}

/// WhatsApp e chave Pix da Central (para recarregar a carteira).
class CentralContact {
  const CentralContact({this.whatsapp, this.pixKey, this.pixHolder});

  final String? whatsapp;
  final String? pixKey;
  final String? pixHolder;

  factory CentralContact.fromJson(Map<String, dynamic>? j) => CentralContact(
        whatsapp: j?['whatsapp'] as String?,
        pixKey: j?['pixKey'] as String?,
        pixHolder: j?['pixHolder'] as String?,
      );
}

/// Um lancamento da carteira.
class WalletEntry {
  const WalletEntry({
    required this.id,
    required this.type,
    required this.amountCents,
    required this.createdAt,
    this.description,
    this.rideCode,
  });

  final String id;
  final String type;
  final int amountCents;
  final DateTime createdAt;
  final String? description;
  final String? rideCode;

  bool get isCredit => amountCents > 0;

  String get title => switch (type) {
        'COMMISSION' => 'Corrida finalizada',
        'RIDE_EARNING' => 'Corrida',
        'ADJUSTMENT' => amountCents > 0 ? 'Depósito' : 'Ajuste',
        'BONUS' => 'Bônus',
        'REFUND' => 'Estorno',
        'PAYOUT' => 'Saque',
        _ => 'Lançamento',
      };

  String get subtitle {
    if (rideCode != null && rideCode!.isNotEmpty) return 'Corrida $rideCode';
    return description ?? '';
  }

  factory WalletEntry.fromJson(Map<String, dynamic> j) => WalletEntry(
        id: j['id'] as String? ?? '',
        type: j['type'] as String? ?? '',
        amountCents: _int(j['amountCents']),
        createdAt: DateTime.tryParse(j['createdAt'] as String? ?? '')?.toLocal() ?? DateTime.now(),
        description: j['description'] as String?,
        rideCode: j['rideCode'] as String?,
      );
}

/// Carteira pre-paga: a comissao de cada corrida sai daqui.
class WalletInfo {
  const WalletInfo({
    required this.balanceCents,
    required this.minimumCents,
    required this.status,
    required this.central,
    required this.entries,
  });

  final int balanceCents;
  final int minimumCents;

  /// ok | low | insufficient
  final String status;
  final CentralContact central;
  final List<WalletEntry> entries;

  bool get isLow => status == 'low';
  bool get isInsufficient => status == 'insufficient';

  factory WalletInfo.fromJson(Map<String, dynamic> j) => WalletInfo(
        balanceCents: _int(j['balanceCents']),
        minimumCents: _int(j['minimumCents']),
        status: j['status'] as String? ?? 'ok',
        central: CentralContact.fromJson(j['central'] as Map<String, dynamic>?),
        entries: [
          for (final t in (j['transactions'] as List<dynamic>? ?? const []))
            WalletEntry.fromJson(t as Map<String, dynamic>),
        ],
      );
}

/// Uma corrida do historico (qualquer situacao).
class RideHistoryItem {
  const RideHistoryItem({
    required this.id,
    required this.code,
    required this.status,
    required this.requestedAt,
    required this.pickupAddress,
    required this.dropoffAddress,
    required this.fareCents,
    required this.earningCents,
    this.finishedAt,
  });

  final String id;
  final String code;
  final String status;
  final DateTime requestedAt;
  final DateTime? finishedAt;
  final String pickupAddress;
  final String dropoffAddress;
  final int fareCents;
  final int earningCents;

  bool get isCompleted => status == 'COMPLETED';
  bool get isCancelled => status.startsWith('CANCELLED');

  String get statusLabel => switch (status) {
        'COMPLETED' => 'Concluída',
        'CANCELLED_BY_PASSENGER' => 'Cancelada pelo passageiro',
        'CANCELLED_BY_DRIVER' => 'Cancelada por você',
        'CANCELLED_BY_SYSTEM' => 'Cancelada',
        'IN_PROGRESS' => 'Em andamento',
        'EXPIRED' => 'Sem resposta',
        _ => 'Em aberto',
      };

  factory RideHistoryItem.fromJson(Map<String, dynamic> j) => RideHistoryItem(
        id: j['id'] as String? ?? '',
        code: j['code'] as String? ?? '',
        status: j['status'] as String? ?? '',
        requestedAt: DateTime.tryParse(j['requestedAt'] as String? ?? '')?.toLocal() ?? DateTime.now(),
        finishedAt: DateTime.tryParse(j['finishedAt'] as String? ?? '')?.toLocal(),
        pickupAddress: j['pickupAddress'] as String? ?? '',
        dropoffAddress: j['dropoffAddress'] as String? ?? '',
        fareCents: _int(j['finalFareCents'] ?? j['estimatedFareCents']),
        earningCents: _int(j['driverEarningCents']),
      );
}
