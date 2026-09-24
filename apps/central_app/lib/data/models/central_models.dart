import '../../core/utils/geo.dart';

/// Status cadastral do motorista (espelha DriverStatus do backend).
enum DriverApproval {
  pending,
  approved,
  rejected,
  suspended;

  String get label => switch (this) {
        DriverApproval.pending => 'Pendente',
        DriverApproval.approved => 'Aprovado',
        DriverApproval.rejected => 'Rejeitado',
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

class AdminUser {
  const AdminUser({required this.id, required this.name, required this.email, required this.role});

  final String id;
  final String name;
  final String email;
  final String role;

  String get initials {
    final parts = name.split(' ').where((p) => p.isNotEmpty).take(2);
    return parts.map((p) => p[0].toUpperCase()).join();
  }

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'email': email, 'role': role};

  factory AdminUser.fromJson(Map<String, dynamic> json) => AdminUser(
        id: json['id'] as String? ?? '',
        name: json['name'] as String? ?? 'Administrador',
        email: json['email'] as String? ?? '',
        role: json['role'] as String? ?? 'ADMIN',
      );
}

class DriverDocumentFile {
  const DriverDocumentFile({required this.type, required this.status, this.rejectionReason});

  final DocumentType type;
  final DocumentStatus status;
  final String? rejectionReason;

  bool get isApproved => status == DocumentStatus.approved;
  bool get isRejected => status == DocumentStatus.rejected;
  bool get isPending => status == DocumentStatus.pending;
}

/// Motorista na fila de analise, com documentos e dados do veiculo.
class DriverApplication {
  const DriverApplication({
    required this.id,
    required this.name,
    required this.phone,
    required this.email,
    required this.cpf,
    required this.cnhNumber,
    required this.cnhCategory,
    required this.cnhExpiresAt,
    required this.city,
    required this.vehicle,
    required this.documents,
    required this.approval,
    required this.submittedAt,
    this.rejectionReason,
    this.rating = 5,
    this.totalRides = 0,
  });

  final String id;
  final String name;
  final String phone;
  final String email;
  final String cpf;
  final String cnhNumber;
  final String cnhCategory;
  final String cnhExpiresAt;
  final String city;
  final VehicleSummary vehicle;
  final List<DriverDocumentFile> documents;
  final DriverApproval approval;
  final String submittedAt;
  final String? rejectionReason;
  final double rating;
  final int totalRides;

  String get initials {
    final parts = name.split(' ').where((p) => p.isNotEmpty).take(2);
    return parts.map((p) => p[0].toUpperCase()).join();
  }

  int get documentsApproved => documents.where((d) => d.isApproved).length;
  int get documentsRejected => documents.where((d) => d.isRejected).length;
  bool get documentsComplete => documentsApproved == documents.length;

  DriverApplication copyWith({
    DriverApproval? approval,
    String? rejectionReason,
    List<DriverDocumentFile>? documents,
  }) =>
      DriverApplication(
        id: id,
        name: name,
        phone: phone,
        email: email,
        cpf: cpf,
        cnhNumber: cnhNumber,
        cnhCategory: cnhCategory,
        cnhExpiresAt: cnhExpiresAt,
        city: city,
        vehicle: vehicle,
        documents: documents ?? this.documents,
        approval: approval ?? this.approval,
        submittedAt: submittedAt,
        rejectionReason: rejectionReason ?? this.rejectionReason,
        rating: rating,
        totalRides: totalRides,
      );
}

class VehicleSummary {
  const VehicleSummary({
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
        'comfort' => 'Viagem',
        'black' => 'Viagem',
        'van' => 'Van',
        _ => 'Viagem',
      };
}

/// Corrida ativa no mapa de monitoramento.
enum RidePhase { toPickup, waitingPassenger, inProgress }

class ActiveRide {
  const ActiveRide({
    required this.id,
    required this.code,
    required this.phase,
    required this.passengerName,
    required this.driverName,
    required this.driverPlate,
    required this.passengerCoords,
    required this.driverCoords,
    required this.pickupAddress,
    required this.dropoffAddress,
    required this.fareCents,
    required this.startedAt,
    required this.polyline,
  });

  final String id;
  final String code;
  final RidePhase phase;
  final String passengerName;
  final String driverName;
  final String driverPlate;
  final Coords passengerCoords;
  final Coords driverCoords;
  final String pickupAddress;
  final String dropoffAddress;
  final int fareCents;
  final String startedAt;
  final List<Coords> polyline;

  String get phaseLabel => switch (phase) {
        RidePhase.toPickup => 'A caminho',
        RidePhase.waitingPassenger => 'Aguardando',
        RidePhase.inProgress => 'Em viagem',
      };

  ActiveRide copyWith({Coords? driverCoords}) => ActiveRide(
        id: id,
        code: code,
        phase: phase,
        passengerName: passengerName,
        driverName: driverName,
        driverPlate: driverPlate,
        passengerCoords: passengerCoords,
        driverCoords: driverCoords ?? this.driverCoords,
        pickupAddress: pickupAddress,
        dropoffAddress: dropoffAddress,
        fareCents: fareCents,
        startedAt: startedAt,
        polyline: polyline,
      );
}

/// Tarifas configuradas pelo administrador (valores em centavos).
class FareSettings {
  const FareSettings({
    required this.categorySlug,
    required this.baseFareCents,
    required this.perKmCents,
    required this.perMinuteCents,
    required this.minimumFareCents,
    required this.platformFeePercent,
  });

  final String categorySlug;
  final int baseFareCents;
  final int perKmCents;
  final int perMinuteCents;
  final int minimumFareCents;
  final double platformFeePercent;

  String get categoryName => switch (categorySlug) {
        'moto' => 'Moto',
        'comfort' => 'Viagem',
        'black' => 'Viagem',
        'van' => 'Van',
        _ => 'Viagem',
      };

  FareSettings copyWith({
    int? baseFareCents,
    int? perKmCents,
    int? perMinuteCents,
    int? minimumFareCents,
    double? platformFeePercent,
  }) =>
      FareSettings(
        categorySlug: categorySlug,
        baseFareCents: baseFareCents ?? this.baseFareCents,
        perKmCents: perKmCents ?? this.perKmCents,
        perMinuteCents: perMinuteCents ?? this.perMinuteCents,
        minimumFareCents: minimumFareCents ?? this.minimumFareCents,
        platformFeePercent: platformFeePercent ?? this.platformFeePercent,
      );
}

/// Metricas do painel financeiro.
class FinancialSummary {
  const FinancialSummary({
    required this.todayCents,
    required this.weekCents,
    required this.monthCents,
    required this.ridesToday,
    required this.ridesWeek,
    required this.commissionTodayCents,
    required this.driverPayoutsTodayCents,
    required this.activeDrivers,
    required this.onlineDrivers,
    required this.pendingApprovals,
    required this.averageTicketCents,
    required this.cancellationRate,
    required this.hourlyRevenue,
  });

  final int todayCents;
  final int weekCents;
  final int monthCents;
  final int ridesToday;
  final int ridesWeek;
  final int commissionTodayCents;
  final int driverPayoutsTodayCents;
  final int activeDrivers;
  final int onlineDrivers;
  final int pendingApprovals;
  final int averageTicketCents;
  final double cancellationRate;

  /// Faturamento por hora nas ultimas 12 horas (indice 0 = 11h atras).
  final List<int> hourlyRevenue;
}
