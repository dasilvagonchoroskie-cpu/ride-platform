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

/// Divergencias que merecem alerta em vermelho na Central.
///
/// So compara o que ja esta no cadastro — nada de OCR ou adivinhacao.
/// A ideia e pegar erro de digitacao e prazo vencido antes que virem
/// problema na rua, nao auditar o motorista.
extension DriverApplicationAlerts on DriverApplication {
  List<String> get divergencias {
    final alertas = <String>[];

    final validade = DateTime.tryParse(cnhExpiresAt);
    if (validade == null) {
      alertas.add('Validade da CNH em formato invalido.');
    } else {
      final dias = validade.difference(DateTime.now()).inDays;
      if (dias < 0) {
        alertas.add('CNH vencida.');
      } else if (dias <= 30) {
        alertas.add('CNH vence em $dias dia${dias == 1 ? '' : 's'}.');
      }
    }

    if (!_placaValida(vehicle.plate)) {
      alertas.add('Placa "${vehicle.plate}" fora do padrao (nem antigo, nem Mercosul).');
    }

    final anoAtual = DateTime.now().year;
    if (vehicle.year < 1990 || vehicle.year > anoAtual + 1) {
      alertas.add('Ano do veiculo (${vehicle.year}) parece errado.');
    }

    final reprovados = documents.where((d) => d.isRejected).length;
    if (reprovados > 0) {
      alertas.add('$reprovados documento${reprovados == 1 ? '' : 's'} reprovado${reprovados == 1 ? '' : 's'} — precisa reenvio.');
    }

    return alertas;
  }

  bool get temAlerta => divergencias.isNotEmpty;

  static bool _placaValida(String placa) {
    final p = placa.toUpperCase().replaceAll('-', '').replaceAll(' ', '');
    final antiga = RegExp(r'^[A-Z]{3}[0-9]{4}$');
    final mercosul = RegExp(r'^[A-Z]{3}[0-9][A-Z][0-9]{2}$');
    return antiga.hasMatch(p) || mercosul.hasMatch(p);
  }
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

/// Qual bandeira. Modalidade unica: o que muda o preco e a HORA.
enum FareFlag { diurna, noturna }

extension FareFlagLabel on FareFlag {
  String get chave => this == FareFlag.noturna ? 'noturna' : 'diurna';
  String get titulo =>
      this == FareFlag.noturna ? 'BANDEIRA 2 - Noturna' : 'BANDEIRA 1 - Diurna';
}

/// Uma bandeira, como o administrador ve e edita (valores em centavos).
///
/// A bandeirada ja inclui a franquia: so o que passa dela e cobrado a
/// mais. Por isso "valor por km" aqui e sempre por km EXCEDENTE.
class TariffFlag {
  const TariffFlag({
    required this.flag,
    required this.startHour,
    required this.endHour,
    required this.baseFareCents,
    required this.perKmCents,
    required this.waitingPerMinuteCents,
    required this.freeDistanceMeters,
    required this.freeWaitingSeconds,
    required this.minFareCents,
    required this.cancellationFeeCents,
    required this.commissionPercent,
  });

  final FareFlag flag;
  final int startHour;
  final int endHour;
  final int baseFareCents;
  final int perKmCents;
  final int waitingPerMinuteCents;
  final int freeDistanceMeters;
  final int freeWaitingSeconds;
  final int minFareCents;
  final int cancellationFeeCents;
  final double commissionPercent;

  String get faixa => '${startHour}h as ${endHour}h';

  factory TariffFlag.fromJson(FareFlag flag, Map<String, dynamic> json) => TariffFlag(
        flag: flag,
        startHour: (json['startHour'] as num?)?.toInt() ?? (flag == FareFlag.noturna ? 22 : 6),
        endHour: (json['endHour'] as num?)?.toInt() ?? (flag == FareFlag.noturna ? 6 : 22),
        baseFareCents: (json['baseFareCents'] as num?)?.toInt() ?? 0,
        perKmCents: (json['perKmCents'] as num?)?.toInt() ?? 0,
        waitingPerMinuteCents: (json['waitingPerMinuteCents'] as num?)?.toInt() ?? 0,
        freeDistanceMeters: (json['freeDistanceMeters'] as num?)?.toInt() ?? 1500,
        freeWaitingSeconds: (json['freeWaitingSeconds'] as num?)?.toInt() ?? 180,
        minFareCents: (json['minFareCents'] as num?)?.toInt() ?? 0,
        cancellationFeeCents: (json['cancellationFeeCents'] as num?)?.toInt() ?? 0,
        commissionPercent: (json['commissionPercent'] as num?)?.toDouble() ?? 20,
      );

  Map<String, dynamic> toJson() => {
        'startHour': startHour,
        'endHour': endHour,
        'baseFareCents': baseFareCents,
        'perKmCents': perKmCents,
        'waitingPerMinuteCents': waitingPerMinuteCents,
        'freeDistanceMeters': freeDistanceMeters,
        'freeWaitingSeconds': freeWaitingSeconds,
        'minFareCents': minFareCents,
        'cancellationFeeCents': cancellationFeeCents,
        'commissionPercent': commissionPercent,
      };

  TariffFlag copyWith({
    int? startHour,
    int? endHour,
    int? baseFareCents,
    int? perKmCents,
    int? waitingPerMinuteCents,
    int? freeDistanceMeters,
    int? freeWaitingSeconds,
    int? minFareCents,
    int? cancellationFeeCents,
    double? commissionPercent,
  }) =>
      TariffFlag(
        flag: flag,
        startHour: startHour ?? this.startHour,
        endHour: endHour ?? this.endHour,
        baseFareCents: baseFareCents ?? this.baseFareCents,
        perKmCents: perKmCents ?? this.perKmCents,
        waitingPerMinuteCents: waitingPerMinuteCents ?? this.waitingPerMinuteCents,
        freeDistanceMeters: freeDistanceMeters ?? this.freeDistanceMeters,
        freeWaitingSeconds: freeWaitingSeconds ?? this.freeWaitingSeconds,
        minFareCents: minFareCents ?? this.minFareCents,
        cancellationFeeCents: cancellationFeeCents ?? this.cancellationFeeCents,
        commissionPercent: commissionPercent ?? this.commissionPercent,
      );
}

/// As duas bandeiras juntas. Andam em par: salvar uma so deixaria um
/// horario do dia sem tabela de preco.
class Tariffs {
  const Tariffs({required this.diurna, required this.noturna});

  final TariffFlag diurna;
  final TariffFlag noturna;

  factory Tariffs.fromJson(Map<String, dynamic> json) => Tariffs(
        diurna: TariffFlag.fromJson(
          FareFlag.diurna,
          json['diurna'] as Map<String, dynamic>? ?? const {},
        ),
        noturna: TariffFlag.fromJson(
          FareFlag.noturna,
          json['noturna'] as Map<String, dynamic>? ?? const {},
        ),
      );

  Map<String, dynamic> toJson() => {
        'diurna': diurna.toJson(),
        'noturna': noturna.toJson(),
      };
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
