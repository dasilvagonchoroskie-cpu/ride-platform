import 'dart:math' as math;

import '../../core/utils/geo.dart';
import '../models/models.dart';

/// Motor de demonstracao: simula o backend inteiro no aparelho.
///
/// Usado quando a API nao esta configurada ou nao responde, garantindo que o
/// APK seja utilizavel de ponta a ponta sem servidor.
class DemoEngine {
  const DemoEngine._();

  static final math.Random _random = math.Random();

  static const List<Map<String, Object>> _categoryBase = [
    {'slug': 'moto', 'name': 'Moto', 'description': 'Rapido e economico', 'seats': 1, 'base': 300, 'perKm': 120, 'perMin': 20, 'min': 600, 'icon': 'bike'},
    {'slug': 'ride', 'name': 'Viagem', 'description': 'Carro popular, ate 4', 'seats': 4, 'base': 500, 'perKm': 180, 'perMin': 30, 'min': 900, 'icon': 'car'},
    {'slug': 'comfort', 'name': 'Viagem', 'description': 'Mais novo e espacoso', 'seats': 4, 'base': 700, 'perKm': 240, 'perMin': 40, 'min': 1200, 'icon': 'car'},
    {'slug': 'black', 'name': 'Viagem', 'description': 'Luxo com motorista', 'seats': 4, 'base': 1100, 'perKm': 380, 'perMin': 60, 'min': 2000, 'icon': 'car'},
    {'slug': 'van', 'name': 'Van', 'description': 'Ate 6 passageiros', 'seats': 6, 'base': 900, 'perKm': 300, 'perMin': 45, 'min': 1800, 'icon': 'bus'},
  ];

  static const List<List<String>> _driverPool = [
    ['d1', 'Carlos Mendes', '4.92', '3120', 'Toyota Corolla', 'FKR-2A18', 'Prata'],
    ['d2', 'Ana Paula Souza', '4.98', '1874', 'Hyundai HB20', 'GTP-7C42', 'Branco'],
    ['d3', 'Roberto Lima', '4.85', '5210', 'Chevrolet Onix', 'HJM-9D07', 'Cinza'],
    ['d4', 'Juliana Reis', '4.95', '962', 'Honda City', 'LQN-4B55', 'Preto'],
    ['d5', 'Marcos Oliveira', '4.79', '4410', 'Fiat Cronos', 'KDS-1E33', 'Vermelho'],
  ];

  static const List<String> _addresses = [
    'Av. Paulista, 1578 - Bela Vista, Sao Paulo',
    'Rua Augusta, 902 - Consolacao, Sao Paulo',
    'Av. Brigadeiro Faria Lima, 2232 - Jardim Paulistano',
    'Rua Oscar Freire, 585 - Jardins, Sao Paulo',
    'Av. Ibirapuera, 2033 - Moema, Sao Paulo',
    'Rua Vergueiro, 1470 - Liberdade, Sao Paulo',
    'Av. Reboucas, 3970 - Pinheiros, Sao Paulo',
    'Rua Teodoro Sampaio, 1200 - Pinheiros, Sao Paulo',
    'Av. Faria Lima, 3477 - Itaim Bibi, Sao Paulo',
    'Rua da Consolacao, 2416 - Consolacao, Sao Paulo',
    'Av. Sumare, 300 - Perdizes, Sao Paulo',
    'Rua Harmonia, 200 - Vila Madalena, Sao Paulo',
  ];

  static const List<String> paymentLabels = [
    'Pix',
    'Cartao de credito - 4291',
    'Dinheiro',
    'Carteira Ride',
  ];

  static int _rideCounter = 4820;

  static double _between(double min, double max) => min + _random.nextDouble() * (max - min);

  static List<PlaceSuggestion> suggestions(Coords origin) {
    final list = _addresses.map((address) {
      final coords = Coords(
        origin.latitude + _between(-0.045, 0.045),
        origin.longitude + _between(-0.045, 0.045),
      );
      return PlaceSuggestion(
        address: address,
        coords: coords,
        distanceKm: double.parse(distanceKm(origin, coords).toStringAsFixed(2)),
      );
    }).toList();

    list.sort((a, b) => a.distanceKm.compareTo(b.distanceKm));
    return list;
  }

  static EstimateResult estimate(Coords origin, Coords destination) {
    final km = math.max(0.8, distanceKm(origin, destination));
    final distanceMeters = (km * 1000).round();
    // Velocidade media urbana de ~24 km/h.
    final durationSeconds = ((km / 24) * 3600).round();

    final categories = _categoryBase.map((base) {
      final raw = (base['base'] as int) +
          (base['perKm'] as int) * km +
          (base['perMin'] as int) * (durationSeconds / 60);
      final min = base['min'] as int;
      final price = math.max(min, (raw / 10).round() * 10);
      final slug = base['slug'] as String;

      return RideCategory(
        id: slug,
        slug: slug,
        name: base['name'] as String,
        description: base['description'] as String,
        seats: base['seats'] as int,
        etaMinutes: math.max(1, 2 + _random.nextInt(6)),
        priceCents: price,
        priceRangeCents: [price, (price * 1.15).round()],
        icon: base['icon'] as String,
      );
    }).toList();

    return EstimateResult(
      categories: categories,
      distanceMeters: distanceMeters,
      durationSeconds: durationSeconds,
    );
  }

  static DriverInfo _driver(int index, Coords position) {
    final row = _driverPool[index % _driverPool.length];
    return DriverInfo(
      id: row[0],
      name: row[1],
      rating: double.parse(row[2]),
      totalRides: int.parse(row[3]),
      vehicle: row[4],
      plate: row[5],
      color: row[6],
      position: position,
    );
  }

  static List<DriverInfo> nearbyDrivers(Coords origin, {int count = 4}) {
    return List<DriverInfo>.generate(count, (i) {
      final coords = Coords(
        origin.latitude + _between(-0.012, 0.012),
        origin.longitude + _between(-0.012, 0.012),
      );
      return _driver(_random.nextInt(_driverPool.length), coords);
    });
  }

  static Ride createRide({
    required Coords origin,
    required Coords destination,
    required String pickupAddress,
    required String dropoffAddress,
    required RideCategory category,
    required String paymentMethod,
  }) {
    _rideCounter += 1;
    final km = math.max(0.8, distanceKm(origin, destination));

    return Ride(
      id: 'demo-ride-${DateTime.now().millisecondsSinceEpoch}',
      code: 'RD$_rideCounter',
      status: RideStatus.searching,
      pickup: RidePlace(address: pickupAddress, coords: origin),
      dropoff: RidePlace(address: dropoffAddress, coords: destination),
      category: category,
      distanceMeters: (km * 1000).round(),
      durationSeconds: ((km / 24) * 3600).round(),
      fareCents: category.priceCents,
      paymentMethod: paymentMethod,
      pin: '${1000 + _random.nextInt(8999)}',
      createdAt: DateTime.now().toIso8601String(),
    );
  }

  static DriverInfo assignDriver(Ride ride) {
    final position = Coords(
      ride.pickup.coords.latitude + _between(-0.008, 0.008),
      ride.pickup.coords.longitude + _between(-0.008, 0.008),
    );
    return _driver(_random.nextInt(_driverPool.length), position);
  }

  static List<Ride> history(Coords origin) {
    final places = suggestions(origin).take(6).toList();

    return List<Ride>.generate(places.length, (index) {
      final place = places[index];
      final result = estimate(origin, place.coords);
      final category = result.categories[index % result.categories.length];
      final finishedAt =
          DateTime.now().subtract(Duration(hours: (index + 1) * 26)).toIso8601String();

      return Ride(
        id: 'demo-history-$index',
        code: 'RD${4700 + index}',
        status: RideStatus.completed,
        pickup: RidePlace(address: _addresses.first, coords: origin),
        dropoff: RidePlace(address: place.address, coords: place.coords),
        category: category,
        driver: _driver(index, place.coords),
        distanceMeters: result.distanceMeters,
        durationSeconds: result.durationSeconds,
        fareCents: category.priceCents,
        paymentMethod: paymentLabels[index % paymentLabels.length],
        pin: '${1000 + index * 137}',
        createdAt: finishedAt,
        finishedAt: finishedAt,
        rating: index % 3 == 0 ? 5 : 4,
      );
    });
  }

  static List<PaymentOption> paymentMethods() => const [
        PaymentOption(id: 'pm1', label: 'Pix', detail: 'Aprovacao imediata', type: 'PIX'),
        PaymentOption(
          id: 'pm2',
          label: 'Cartao de credito',
          detail: 'Mastercard - 4291',
          type: 'CREDIT_CARD',
        ),
        PaymentOption(id: 'pm3', label: 'Dinheiro', detail: 'Pague ao motorista', type: 'CASH'),
        PaymentOption(
          id: 'pm4',
          label: 'Carteira Ride',
          detail: 'Saldo R\$ 42,50',
          type: 'WALLET',
        ),
      ];
}
