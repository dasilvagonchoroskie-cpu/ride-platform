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

  /// Tabela de bandeiras — a mesma do servidor, para que a demonstracao
  /// mostre o preco que o passageiro vai pagar de verdade.
  static const int _bandeiradaDiurnaCents = 1000;
  static const int _bandeiradaNoturnaCents = 2000;
  static const int _porKmCents = 250;
  static const int _franquiaMetros = 1500;

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

  /// Qual bandeira vale agora. Na demonstracao usa-se o relogio do
  /// aparelho; valendo, quem decide e o servidor.
  static FareFlag bandeiraAgora() {
    final h = DateTime.now().hour;
    return (h >= 22 || h < 6) ? FareFlag.noturna : FareFlag.diurna;
  }

  static RideQuote _orcar(Coords origin, Coords destination) {
    final km = math.max(0.8, distanceKm(origin, destination));
    final distanceMeters = (km * 1000).round();
    final durationSeconds = ((km / 24) * 3600).round();

    final flag = bandeiraAgora();
    final bandeirada =
        flag == FareFlag.noturna ? _bandeiradaNoturnaCents : _bandeiradaDiurnaCents;

    // A bandeirada ja cobre a franquia: so o excedente e somado.
    final metrosCobrados = math.max(0, distanceMeters - _franquiaMetros);
    final porDistancia = ((metrosCobrados / 1000) * _porKmCents).round();

    return RideQuote(
      flag: flag,
      priceCents: bandeirada + porDistancia,
      baseFareCents: bandeirada,
      distanceCents: porDistancia,
      chargedDistanceMeters: metrosCobrados,
      distanceMeters: distanceMeters,
      durationSeconds: durationSeconds,
      etaMinutes: math.max(1, 2 + _random.nextInt(6)),
    );
  }

  static EstimateResult estimate(Coords origin, Coords destination) =>
      EstimateResult(quote: _orcar(origin, destination));

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
    required String paymentMethod,
  }) {
    _rideCounter += 1;
    final orcamento = _orcar(origin, destination);
    final km = math.max(0.8, distanceKm(origin, destination));

    return Ride(
      id: 'demo-ride-${DateTime.now().millisecondsSinceEpoch}',
      code: 'RD$_rideCounter',
      status: RideStatus.searching,
      pickup: RidePlace(address: pickupAddress, coords: origin),
      dropoff: RidePlace(address: dropoffAddress, coords: destination),
      fareFlag: orcamento.flag,
      distanceMeters: (km * 1000).round(),
      durationSeconds: ((km / 24) * 3600).round(),
      fareCents: orcamento.priceCents,
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
      final finishedAt =
          DateTime.now().subtract(Duration(hours: (index + 1) * 26)).toIso8601String();

      return Ride(
        id: 'demo-history-$index',
        code: 'RD${4700 + index}',
        status: RideStatus.completed,
        pickup: RidePlace(address: _addresses.first, coords: origin),
        dropoff: RidePlace(address: place.address, coords: place.coords),
        fareFlag: result.quote.flag,
        driver: _driver(index, place.coords),
        distanceMeters: result.distanceMeters,
        durationSeconds: result.durationSeconds,
        fareCents: result.quote.priceCents,
        paymentMethod: paymentLabels[index % paymentLabels.length],
        pin: '${1000 + index * 137}',
        createdAt: finishedAt,
        finishedAt: finishedAt,
        rating: index % 3 == 0 ? 5 : 4,
      );
    });
  }

  static List<PaymentOption> paymentMethods() => kFormasDePagamento;
}
