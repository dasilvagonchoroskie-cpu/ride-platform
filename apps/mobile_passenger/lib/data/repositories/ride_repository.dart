import '../../core/api/api_client.dart';
import '../../core/config/app_config.dart';
import '../../core/utils/geo.dart';
import '../demo/demo_engine.dart';
import '../models/models.dart';

/// Acesso aos dados de corrida.
///
/// Quando a API esta configurada, fala com o backend; caso contrario (ou em
/// caso de falha), delega para o motor de demonstracao local.
class RideRepository {
  RideRepository({ApiClient? client}) : _client = client ?? ApiClient();

  final ApiClient _client;

  bool _useDemo = !AppConfig.hasApi;

  bool get isDemo => _useDemo;

  void forceDemo() => _useDemo = true;

  /// Orcamento da viagem: so origem e destino.
  ///
  /// Nao ha categoria a enviar — a plataforma opera modalidade unica, e a
  /// bandeira quem decide e o relogio do servidor.
  Future<EstimateResult> estimate(Coords origin, Coords destination) async {
    if (_useDemo) return DemoEngine.estimate(origin, destination);

    try {
      final data = await _client.request('POST', '/rides/estimate', body: {
        'pickup': origin.toJson(),
        'dropoff': destination.toJson(),
      }) as Map<String, dynamic>;

      return EstimateResult(quote: RideQuote.fromJson(data));
    } catch (_) {
      _useDemo = true;
      return DemoEngine.estimate(origin, destination);
    }
  }

  Future<Ride> createRide({
    required Coords origin,
    required Coords destination,
    required String pickupAddress,
    required String dropoffAddress,
    required String paymentMethod,
  }) async {
    if (_useDemo) {
      return DemoEngine.createRide(
        origin: origin,
        destination: destination,
        pickupAddress: pickupAddress,
        dropoffAddress: dropoffAddress,
        paymentMethod: paymentMethod,
      );
    }

    try {
      final data = await _client.request('POST', '/rides', body: {
        'pickup': {'address': pickupAddress, ...origin.toJson()},
        'dropoff': {'address': dropoffAddress, ...destination.toJson()},
        'paymentMethodType': 'CASH',
      }) as Map<String, dynamic>;

      return Ride.fromJson(data['ride'] as Map<String, dynamic>);
    } catch (_) {
      _useDemo = true;
      return DemoEngine.createRide(
        origin: origin,
        destination: destination,
        pickupAddress: pickupAddress,
        dropoffAddress: dropoffAddress,
        paymentMethod: paymentMethod,
      );
    }
  }

  Future<List<Ride>> history(Coords origin) async {
    if (_useDemo) return DemoEngine.history(origin);

    try {
      final data = await _client.request('GET', '/rides/history', query: {'limit': '30'})
          as Map<String, dynamic>;
      final items = data['items'] as List<dynamic>? ?? const [];
      return items.map((item) => Ride.fromJson(item as Map<String, dynamic>)).toList();
    } catch (_) {
      _useDemo = true;
      return DemoEngine.history(origin);
    }
  }

  List<DriverInfo> nearbyDrivers(Coords origin) => DemoEngine.nearbyDrivers(origin);
}
