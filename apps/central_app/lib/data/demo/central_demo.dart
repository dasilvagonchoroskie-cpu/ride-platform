import 'dart:math' as math;

import '../../core/utils/geo.dart';
import '../models/central_models.dart';

/// Dados simulados da Central (modo demonstracao).
class CentralDemo {
  const CentralDemo._();

  static final math.Random _random = math.Random();

  static const List<List<String>> _applicants = [
    ['Carlos Mendes', '+5511988880001', 'carlos.mendes@email.com', 'Sao Paulo'],
    ['Ana Paula Souza', '+5511988880002', 'ana.souza@email.com', 'Sao Paulo'],
    ['Roberto Lima', '+5511988880003', 'roberto.lima@email.com', 'Guarulhos'],
    ['Juliana Reis', '+5511988880004', 'juliana.reis@email.com', 'Osasco'],
    ['Marcos Oliveira', '+5511988880005', 'marcos.oliveira@email.com', 'Sao Paulo'],
    ['Patricia Nunes', '+5511988880006', 'patricia.nunes@email.com', 'Diadema'],
    ['Eduardo Santos', '+5511988880007', 'eduardo.santos@email.com', 'Santo Andre'],
    ['Larissa Gomes', '+5511988880008', 'larissa.gomes@email.com', 'Sao Bernardo'],
  ];

  static const List<List<String>> _vehicles = [
    ['ride', 'Toyota', 'Corolla', '2021', 'Prata', 'FKR2A18'],
    ['ride', 'Hyundai', 'HB20', '2020', 'Branco', 'GTP7C42'],
    ['comfort', 'Honda', 'Civic', '2022', 'Cinza', 'HJM9D07'],
    ['black', 'BMW', '320i', '2023', 'Preto', 'LQN4B55'],
    ['moto', 'Honda', 'CG 160', '2022', 'Vermelha', 'KDS1E33'],
    ['van', 'Renault', 'Master', '2020', 'Branca', 'MRV5F77'],
    ['ride', 'Fiat', 'Cronos', '2021', 'Prata', 'PNT8G11'],
    ['comfort', 'Jeep', 'Compass', '2022', 'Azul', 'QRS3H29'],
  ];

  static const List<String> _passengers = [
    'Beatriz Almeida',
    'Thiago Ferreira',
    'Camila Rocha',
    'Rodrigo Alves',
    'Fernanda Costa',
    'Lucas Pereira',
  ];

  static const List<String> _places = [
    'Av. Paulista, 1578 - Bela Vista',
    'Rua Augusta, 902 - Consolacao',
    'Av. Faria Lima, 2232 - Itaim Bibi',
    'Rua Oscar Freire, 585 - Jardins',
    'Av. Ibirapuera, 2033 - Moema',
    'Rua Vergueiro, 1470 - Liberdade',
    'Av. Reboucas, 3970 - Pinheiros',
    'Av. Sumare, 300 - Perdizes',
  ];

  static double _between(double min, double max) => min + _random.nextDouble() * (max - min);

  /// Motoristas na fila de analise.
  static List<DriverApplication> applications() {
    return List<DriverApplication>.generate(_applicants.length, (index) {
      final applicant = _applicants[index];
      final vehicle = _vehicles[index % _vehicles.length];

      // Os 4 primeiros tem todos os documentos; o resto tem pendencias.
      final complete = index < 4;

      final documents = DocumentType.values.map((type) {
        if (complete) {
          return DriverDocumentFile(type: type, status: DocumentStatus.approved);
        }
        final missing = index % 3 == 0 && type == DocumentType.vehicleBack;
        final rejected = index % 3 == 1 && type == DocumentType.crlv;
        return DriverDocumentFile(
          type: type,
          status: missing
              ? DocumentStatus.pending
              : rejected
                  ? DocumentStatus.rejected
                  : DocumentStatus.approved,
          rejectionReason: rejected ? 'Documento ilegivel ou vencido.' : null,
        );
      }).toList();

      return DriverApplication(
        id: 'drv-${100 + index}',
        name: applicant[0],
        phone: applicant[1],
        email: applicant[2],
        cpf: '${100 + index}.${200 + index}.${300 + index}-0$index',
        cnhNumber: '${12345678901 + index * 137}',
        cnhCategory: index % 5 == 4 ? 'A' : 'B',
        cnhExpiresAt: '2030-12-31',
        city: applicant[3],
        vehicle: VehicleSummary(
          brand: vehicle[1],
          model: vehicle[2],
          year: int.parse(vehicle[3]),
          color: vehicle[4],
          plate: vehicle[5],
        ),
        documents: documents,
        approval: DriverApproval.pending,
        submittedAt: DateTime.now().subtract(Duration(hours: index * 3 + 1)).toIso8601String(),
      );
    });
  }

  /// Motoristas ja aprovados (historico).
  static List<DriverApplication> approved() {
    return applications().take(5).map((app) {
      return DriverApplication(
        id: 'appr-${app.id}',
        name: app.name,
        phone: app.phone,
        email: app.email,
        cpf: app.cpf,
        cnhNumber: app.cnhNumber,
        cnhCategory: app.cnhCategory,
        cnhExpiresAt: app.cnhExpiresAt,
        city: app.city,
        vehicle: app.vehicle,
        documents: app.documents
            .map((d) => DriverDocumentFile(type: d.type, status: DocumentStatus.approved))
            .toList(),
        approval: DriverApproval.approved,
        submittedAt: app.submittedAt,
        rating: 4.7 + (app.id.hashCode % 30) / 100,
        totalRides: 200 + (app.id.hashCode % 3000),
      );
    }).toList();
  }

  /// Corridas ativas no momento (mapa de monitoramento).
  static List<ActiveRide> activeRides() {
    final center = fallbackCoords;

    return List<ActiveRide>.generate(7, (index) {
      final pickup = Coords(
        center.latitude + _between(-0.05, 0.05),
        center.longitude + _between(-0.05, 0.05),
      );
      final dropoff = Coords(
        center.latitude + _between(-0.06, 0.06),
        center.longitude + _between(-0.06, 0.06),
      );
      final driver = Coords(
        pickup.latitude + _between(-0.012, 0.012),
        pickup.longitude + _between(-0.012, 0.012),
      );

      final phases = RidePhase.values;
      final phase = phases[index % phases.length];

      final km = math.max(1.0, distanceKm(pickup, dropoff));
      final fare = (600 + km * 220 + km / 24 * 60 * 32).round();

      return ActiveRide(
        id: 'ride-${500 + index}',
        code: 'RD${4800 + index}',
        phase: phase,
        passengerName: _passengers[index % _passengers.length],
        driverName: _applicants[index % _applicants.length][0],
        driverPlate: _vehicles[index % _vehicles.length][5],
        passengerCoords: phase == RidePhase.inProgress ? driver : pickup,
        driverCoords: driver,
        pickupAddress: _places[index % _places.length],
        dropoffAddress: _places[(index + 3) % _places.length],
        fareCents: fare,
        startedAt: DateTime.now().subtract(Duration(minutes: index * 7 + 2)).toIso8601String(),
        polyline: buildRoute(pickup, dropoff, steps: 24),
      );
    });
  }

  /// Tarifas iniciais por categoria (centavos).
  /// Bandeiras da demonstracao: os mesmos valores da semente do servidor.
  static Tariffs tariffs() => const Tariffs(
        diurna: TariffFlag(
          flag: FareFlag.diurna,
          startHour: 6,
          endHour: 22,
          baseFareCents: 1000,
          perKmCents: 250,
          waitingPerMinuteCents: 50,
          freeDistanceMeters: 1500,
          freeWaitingSeconds: 180,
          minFareCents: 1000,
          cancellationFeeCents: 500,
          commissionPercent: 20,
        ),
        noturna: TariffFlag(
          flag: FareFlag.noturna,
          startHour: 22,
          endHour: 6,
          baseFareCents: 2000,
          perKmCents: 250,
          waitingPerMinuteCents: 50,
          freeDistanceMeters: 1500,
          freeWaitingSeconds: 180,
          minFareCents: 2000,
          cancellationFeeCents: 500,
          commissionPercent: 20,
        ),
      );

  /// Metricas financeiras do painel.
  static FinancialSummary financials({int extraRides = 0, int extraRevenueCents = 0}) {
    final hourly = List<int>.generate(12, (i) {
      final base = 18000 + _random.nextInt(42000);
      // curva: movimento maior no fim da tarde
      final factor = 0.6 + (i / 11) * 0.9;
      return (base * factor).round();
    });

    final today = hourly.fold<int>(0, (a, b) => a + b) + extraRevenueCents;
    const commissionRate = 0.2;
    final commission = (today * commissionRate).round();
    final ridesToday = 42 + _random.nextInt(38) + extraRides;

    return FinancialSummary(
      todayCents: today,
      weekCents: (today * 6.4).round(),
      monthCents: (today * 26.2).round(),
      ridesToday: ridesToday,
      ridesWeek: (ridesToday * 6.4).round(),
      commissionTodayCents: commission,
      driverPayoutsTodayCents: today - commission,
      activeDrivers: 38 + _random.nextInt(24),
      onlineDrivers: 26 + _random.nextInt(18),
      pendingApprovals: 8,
      averageTicketCents: ridesToday == 0 ? 0 : (today / ridesToday).round(),
      cancellationRate: 0.043 + _random.nextDouble() * 0.02,
      hourlyRevenue: hourly,
    );
  }

  static List<ActiveRide> refreshPositions(List<ActiveRide> rides) {
    return rides.map((ride) {
      return ride.copyWith(
        driverCoords: Coords(
          ride.driverCoords.latitude + _between(-0.0025, 0.0025),
          ride.driverCoords.longitude + _between(-0.0025, 0.0025),
        ),
      );
    }).toList();
  }
}
