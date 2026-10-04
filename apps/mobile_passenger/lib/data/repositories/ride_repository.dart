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
  Future<EstimateResult> estimate(
    Coords origin,
    Coords destination, {
    String pickupAddress = 'Minha localização atual',
    String dropoffAddress = 'Destino escolhido',
    String? couponCode,
    DateTime? agendadaPara,
  }) async {
    if (_useDemo) return DemoEngine.estimate(origin, destination);

    try {
      final data = await _client.request('POST', '/rides/estimate', body: {
        // O servidor exige o endereco escrito em cada ponto. Sem ele,
        // TODO pedido de preco voltava "Dados invalidos".
        'pickup': {'address': pickupAddress, ...origin.toJson()},
        'dropoff': {'address': dropoffAddress, ...destination.toJson()},
        if (couponCode != null && couponCode.isNotEmpty) 'couponCode': couponCode,
        if (agendadaPara != null) 'scheduledFor': agendadaPara.toUtc().toIso8601String(),
      }) as Map<String, dynamic>;

      return EstimateResult(quote: RideQuote.fromJson(data));
    } catch (_) {
      // Com servidor configurado, erro aparece como erro — nada de
      // dados de mentira no lugar sem avisar ninguem.
      if (AppConfig.hasApi) rethrow;
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
    String paymentType = 'CASH',
    String? couponCode,
    DateTime? agendadaPara,
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
        'paymentMethodType': paymentType,
        if (couponCode != null && couponCode.isNotEmpty) 'couponCode': couponCode,
        if (agendadaPara != null) 'scheduledFor': agendadaPara.toUtc().toIso8601String(),
      }) as Map<String, dynamic>;

      return Ride.fromServer(data['ride'] as Map<String, dynamic>);
    } catch (_) {
      // Com servidor configurado, erro aparece como erro — nada de
      // dados de mentira no lugar sem avisar ninguem.
      if (AppConfig.hasApi) rethrow;
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
      final data = await _client.request('GET', '/rides/history', query: {'page': '1', 'pageSize': '30'})
          as Map<String, dynamic>;
      final items = data['items'] as List<dynamic>? ?? const [];
      return items.map((item) => Ride.fromServer(item as Map<String, dynamic>)).toList();
    } catch (_) {
      // Com servidor configurado, erro aparece como erro — nada de
      // dados de mentira no lugar sem avisar ninguem.
      if (AppConfig.hasApi) rethrow;
      _useDemo = true;
      return DemoEngine.history(origin);
    }
  }

  /// Situacao atual da corrida no servidor (o aplicativo pergunta a cada
  /// poucos segundos enquanto ela esta aberta).
  Future<Ride> detalhe(String id) async {
    final data = await _client.request('GET', '/rides/$id') as Map<String, dynamic>;
    return Ride.fromServer(data['ride'] as Map<String, dynamic>);
  }

  /// Corrida aberta do passageiro, se houver (ao abrir o aplicativo).
  Future<Ride?> atual() async {
    final data = await _client.request('GET', '/rides/current') as Map<String, dynamic>;
    final r = data['ride'];
    return r is Map<String, dynamic> ? Ride.fromServer(r) : null;
  }

  /// Cancela no servidor. Devolve a taxa cobrada (0 enquanto procura).
  Future<int> cancelar(String id, String motivo) async {
    final data = await _client.request('POST', '/rides/$id/cancel', body: {'reason': motivo}) as Map<String, dynamic>;
    return (data['cancellationFeeCents'] as num?)?.toInt() ?? 0;
  }

  Future<void> avaliar(String id, int nota, List<String> tags) async {
    await _client.request('POST', '/rides/$id/rate', body: {'score': nota, if (tags.isNotEmpty) 'tags': tags});
  }

  Future<List<Ride>> agendadas() async {
    final data = await _client.request('GET', '/rides/scheduled') as Map<String, dynamic>;
    return [for (final i in (data['items'] as List<dynamic>? ?? const [])) Ride.fromServer(i as Map<String, dynamic>)];
  }

  Future<List<CupomDisponivel>> cupons() async {
    final data = await _client.request('GET', '/rides/coupons') as List<dynamic>;
    return [for (final c in data) CupomDisponivel.fromJson(c as Map<String, dynamic>)];
  }

  Future<List<MotoristaFavorito>> favoritos() async {
    final data = await _client.request('GET', '/rides/favoritos') as Map<String, dynamic>;
    return [for (final f in (data['items'] as List<dynamic>? ?? const [])) MotoristaFavorito.fromJson(f as Map<String, dynamic>)];
  }

  /// Para a tela de conversa (chat) usar o mesmo login.
  ApiClient get api => _client;

  Future<List<MotoristaBloqueado>> bloqueados() async {
    final data = await _client.request('GET', '/rides/bloqueados') as Map<String, dynamic>;
    return [
      for (final m in (data['items'] as List? ?? const []))
        MotoristaBloqueado.fromJson(m as Map<String, dynamic>),
    ];
  }

  Future<void> bloquear(String driverId, {required bool sim}) async {
    await _client.request(sim ? 'POST' : 'DELETE', '/rides/bloqueados/$driverId', body: sim ? const {} : null);
  }

  Future<void> favoritar(String driverId, {required bool sim}) async {
    await _client.request(sim ? 'POST' : 'DELETE', '/rides/favoritos/$driverId', body: sim ? const {} : null);
  }

  /// Carros disponiveis por perto (posicao aproximada, vinda do servidor).
  /// Antes eram carros INVENTADOS pelo motor de demonstracao, mesmo com o
  /// servidor ligado.
  Future<List<DriverInfo>> nearbyDrivers(Coords origin) async {
    if (_useDemo) return DemoEngine.nearbyDrivers(origin);
    try {
      final data = await _client.request('GET', '/rides/nearby-drivers', query: {
        'lat': '${origin.latitude}',
        'lng': '${origin.longitude}',
      }) as List<dynamic>;
      return [
        for (final c in data)
          DriverInfo(
            id: (c as Map<String, dynamic>)['id'] as String? ?? '',
            name: 'Motorista',
            rating: 5,
            totalRides: 0,
            vehicle: '',
            plate: '',
            color: '',
            position: Coords((c['latitude'] as num).toDouble(), (c['longitude'] as num).toDouble()),
          ),
      ];
    } catch (_) {
      return const [];
    }
  }

  /// Busca de endereco (OpenStreetMap, pelo servidor).
  Future<List<PlaceSuggestion>> searchPlaces(String texto, Coords origin) async {
    if (_useDemo) {
      return DemoEngine.suggestions(origin)
          .where((s) => s.address.toLowerCase().contains(texto.toLowerCase()))
          .toList();
    }
    final data = await _client.request('GET', '/geo/search', query: {
      'q': texto,
      'lat': '${origin.latitude}',
      'lng': '${origin.longitude}',
    }) as List<dynamic>;
    return [for (final j in data) PlaceSuggestion.fromGeo(j as Map<String, dynamic>)];
  }

  /// Endereco escrito de um ponto (embarque pelo GPS, ponto escolhido no mapa).
  Future<PlaceSuggestion?> addressOf(Coords point) async {
    if (_useDemo) return null;
    try {
      final data = await _client.request('GET', '/geo/reverse', query: {
        'lat': '${point.latitude}',
        'lng': '${point.longitude}',
      }) as Map<String, dynamic>;
      return PlaceSuggestion.fromGeo(data);
    } catch (_) {
      return null;
    }
  }
}
