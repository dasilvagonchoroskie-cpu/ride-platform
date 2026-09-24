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
      );

  DriverProfile copyWith({
    String? name,
    String? cpf,
    String? cnhNumber,
    String? cnhCategory,
    String? cnhExpiresAt,
    DriverApproval? approval,
    bool? isOnline,
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
        rating: rating,
        totalRides: totalRides,
        acceptanceRate: acceptanceRate,
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
    required this.categorySlug,
    required this.brand,
    required this.model,
    required this.year,
    required this.color,
    required this.plate,
  });

  final String categorySlug;
  final String brand;
  final String model;
  final int year;
  final String color;
  final String plate;

  String get description => '$brand $model $year';

  String get categoryName => switch (categorySlug) {
        'moto' => 'Moto',
        'comfort' => 'Uber Comfort',
        'black' => 'Uber Black',
        'van' => 'Van',
        _ => 'UberX',
      };
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
    this.expiresInSeconds = 15,
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
