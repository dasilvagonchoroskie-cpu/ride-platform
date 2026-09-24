import '../../core/utils/geo.dart';

/// Situacao da corrida (espelha o enum RideStatus do backend).
enum RideStatus {
  searching,
  driverAssigned,
  driverArriving,
  inProgress,
  completed,
  cancelledByPassenger;

  String get label {
    switch (this) {
      case RideStatus.searching:
        return 'Procurando motorista';
      case RideStatus.driverAssigned:
        return 'Motorista encontrado';
      case RideStatus.driverArriving:
        return 'Motorista a caminho';
      case RideStatus.inProgress:
        return 'Em andamento';
      case RideStatus.completed:
        return 'Concluida';
      case RideStatus.cancelledByPassenger:
        return 'Cancelada';
    }
  }

  bool get isActive =>
      this == RideStatus.searching ||
      this == RideStatus.driverAssigned ||
      this == RideStatus.driverArriving ||
      this == RideStatus.inProgress;
}

class UserProfile {
  const UserProfile({
    required this.id,
    required this.name,
    required this.phone,
    this.email,
    this.role = 'PASSENGER',
  });

  final String id;
  final String name;
  final String phone;
  final String? email;
  final String role;

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'phone': phone,
        'email': email,
        'role': role,
      };

  factory UserProfile.fromJson(Map<String, dynamic> json) => UserProfile(
        id: json['id'] as String? ?? '',
        name: json['name'] as String? ?? 'Passageiro',
        phone: json['phone'] as String? ?? '',
        email: json['email'] as String?,
        role: json['role'] as String? ?? 'PASSENGER',
      );

  UserProfile copyWith({String? name, String? email}) => UserProfile(
        id: id,
        name: name ?? this.name,
        phone: phone,
        email: email ?? this.email,
        role: role,
      );

  String get firstName => name.split(' ').first;
}

/// Bandeira do horario. Quem decide e o servidor, pelo relogio dele.
enum FareFlag { diurna, noturna }

extension FareFlagLabel on FareFlag {
  String get label => this == FareFlag.noturna ? 'Noturna' : 'Diurna';
  String get faixa => this == FareFlag.noturna ? '22h as 6h' : '6h as 22h';
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
  });

  final FareFlag flag;
  final int priceCents;

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
  });

  final String id;
  final String name;
  final double rating;
  final int totalRides;
  final String vehicle;
  final String plate;
  final String color;
  final Coords position;

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
  });

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

  Ride copyWith({
    RideStatus? status,
    DriverInfo? driver,
    String? finishedAt,
    int? rating,
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
              },
        'distanceMeters': distanceMeters,
        'durationSeconds': durationSeconds,
        'fareCents': fareCents,
        'paymentMethod': paymentMethod,
        'pin': pin,
        'createdAt': createdAt,
        'finishedAt': finishedAt,
        'rating': rating,
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
            ),
      distanceMeters: (json['distanceMeters'] as num?)?.toInt() ?? 0,
      durationSeconds: (json['durationSeconds'] as num?)?.toInt() ?? 0,
      fareCents: (json['fareCents'] as num?)?.toInt() ?? 0,
      paymentMethod: json['paymentMethod'] as String? ?? 'Pix',
      pin: json['pin'] as String? ?? '0000',
      createdAt: json['createdAt'] as String? ?? DateTime.now().toIso8601String(),
      finishedAt: json['finishedAt'] as String?,
      rating: (json['rating'] as num?)?.toInt(),
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
  });

  final String address;
  final Coords coords;
  final double distanceKm;
}

class EstimateResult {
  const EstimateResult({required this.quote});

  /// Um orcamento so: a plataforma tem modalidade unica.
  final RideQuote quote;

  int get distanceMeters => quote.distanceMeters;
  int get durationSeconds => quote.durationSeconds;
}
