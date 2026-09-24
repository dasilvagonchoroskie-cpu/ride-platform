import 'dart:math' as math;

import '../../core/utils/geo.dart';
import '../models/driver_models.dart';

/// Simula o backend para o app do motorista (modo demonstracao).
class DriverDemo {
  const DriverDemo._();

  static final math.Random _random = math.Random();

  static const List<List<String>> _passengers = [
    ['Ana Beatriz', '4.91'],
    ['Rodrigo Alves', '4.87'],
    ['Fernanda Costa', '4.96'],
    ['Lucas Pereira', '4.75'],
    ['Camila Rocha', '4.99'],
    ['Thiago Nunes', '4.82'],
  ];

  static const List<String> _places = [
    'Av. Paulista, 1578 - Bela Vista',
    'Rua Augusta, 902 - Consolacao',
    'Av. Faria Lima, 2232 - Jardim Paulistano',
    'Rua Oscar Freire, 585 - Jardins',
    'Av. Ibirapuera, 2033 - Moema',
    'Rua Vergueiro, 1470 - Liberdade',
    'Av. Reboucas, 3970 - Pinheiros',
    'Av. Sumare, 300 - Perdizes',
  ];

  static const List<String> _payments = ['Pix', 'Cartao de credito', 'Dinheiro'];

  static double _between(double min, double max) => min + _random.nextDouble() * (max - min);

  static Coords _near(Coords origin, double radius) => Coords(
        origin.latitude + _between(-radius, radius),
        origin.longitude + _between(-radius, radius),
      );

  /// Gera uma oferta de corrida proxima ao motorista.
  static RideOffer offer(Coords driverPosition) {
    final passenger = _passengers[_random.nextInt(_passengers.length)];
    final pickup = _near(driverPosition, 0.012);
    final dropoff = _near(driverPosition, 0.05);

    final pickupKm = math.max(0.4, distanceKm(driverPosition, pickup));
    final tripKm = math.max(1.2, distanceKm(pickup, dropoff));
    final durationSeconds = ((tripKm / 24) * 3600).round();

    final fare = (600 + tripKm * 220 + durationSeconds / 60 * 32).round();
    // Comissao da plataforma de 20%.
    final earning = (fare * 0.8).round();

    return RideOffer(
      id: 'offer-${DateTime.now().millisecondsSinceEpoch}',
      code: 'RD${4800 + _random.nextInt(180)}',
      passengerName: passenger[0],
      passengerRating: double.parse(passenger[1]),
      pickupAddress: _places[_random.nextInt(_places.length)],
      pickupCoords: pickup,
      dropoffAddress: _places[_random.nextInt(_places.length)],
      dropoffCoords: dropoff,
      distanceToPickupMeters: (pickupKm * 1000).round(),
      tripDistanceMeters: (tripKm * 1000).round(),
      durationSeconds: durationSeconds,
      fareCents: fare,
      earningCents: earning,
      paymentMethod: _payments[_random.nextInt(_payments.length)],
    );
  }

  static List<EarningEntry> statement() {
    final now = DateTime.now();
    final entries = <EarningEntry>[];

    for (var i = 0; i < 18; i++) {
      final createdAt = now.subtract(Duration(hours: i * 5 + 1)).toIso8601String();
      final fare = 900 + _random.nextInt(3200);
      final earning = (fare * 0.8).round();
      final commission = fare - earning;

      entries.add(EarningEntry(
        id: 'ride-$i',
        code: 'RD${4800 + i}',
        description: 'Corrida concluida',
        amountCents: earning,
        kind: EarningKind.ride,
        createdAt: createdAt,
      ));
      entries.add(EarningEntry(
        id: 'commission-$i',
        code: 'RD${4800 + i}',
        description: 'Comissao da plataforma (20%)',
        amountCents: -commission,
        kind: EarningKind.commission,
        createdAt: createdAt,
      ));
    }

    entries.add(EarningEntry(
      id: 'bonus-1',
      code: 'BONUS',
      description: 'Bonus por 20 corridas na semana',
      amountCents: 5000,
      kind: EarningKind.bonus,
      createdAt: now.subtract(const Duration(days: 1)).toIso8601String(),
    ));

    entries.add(EarningEntry(
      id: 'payout-1',
      code: 'SAQUE',
      description: 'Saque via Pix',
      amountCents: -18000,
      kind: EarningKind.payout,
      createdAt: now.subtract(const Duration(days: 2)).toIso8601String(),
    ));

    entries.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return entries;
  }

  static WalletSummary wallet({required int extraEarningsCents, required int extraRides}) {
    final entries = statement();
    final credits = entries
        .where((e) => e.isCredit)
        .fold<int>(0, (sum, e) => sum + e.amountCents);
    final debits = entries
        .where((e) => !e.isCredit)
        .fold<int>(0, (sum, e) => sum + e.amountCents);

    final today = entries
        .where((e) => e.kind == EarningKind.ride && _isToday(e.createdAt))
        .fold<int>(0, (sum, e) => sum + e.amountCents);

    return WalletSummary(
      balanceCents: credits + debits + extraEarningsCents,
      todayCents: today + extraEarningsCents,
      weekCents: (credits * 0.55).round() + extraEarningsCents,
      monthCents: credits + extraEarningsCents,
      ridesToday: entries.where((e) => e.kind == EarningKind.ride && _isToday(e.createdAt)).length + extraRides,
      hoursOnlineToday: 4.5 + extraRides * 0.4,
      acceptanceRate: 92,
      minPayoutCents: 5000,
    );
  }

  static bool _isToday(String iso) {
    final date = DateTime.tryParse(iso);
    if (date == null) return false;
    final now = DateTime.now();
    return date.year == now.year && date.month == now.month && date.day == now.day;
  }

  static List<DriverDocumentItem> initialDocuments() => DocumentType.values
      .map((type) => DriverDocumentItem(type: type, status: DocumentStatus.pending))
      .toList();
}
