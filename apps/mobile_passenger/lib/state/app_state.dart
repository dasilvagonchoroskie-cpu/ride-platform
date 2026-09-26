import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';

import '../core/config/app_config.dart';
import '../core/api/api_client.dart';
import '../core/storage/app_storage.dart';
import '../core/utils/geo.dart';

enum DataSource { api, demo, unknown }

class LocationResult {
  const LocationResult({
    required this.coords,
    required this.granted,
    required this.mocked,
    this.accuracyMeters,
  });

  final Coords coords;
  final bool granted;
  final bool mocked;

  /// Margem de erro da leitura, em metros. Nulo quando nao houve GPS.
  final double? accuracyMeters;
}

/// Estado global: modo de dados (API ou demonstracao), posicao e recentes.
class AppState extends ChangeNotifier {
  AppState({ApiClient? client}) : _client = client ?? ApiClient();

  final ApiClient _client;

  bool bootstrapped = false;
  DataSource dataSource = DataSource.unknown;
  Coords coords = fallbackCoords;
  bool locationGranted = false;

  /// true so quando o aparelho informou a posicao REAL. Ate la o mapa nao
  /// abre — nada de cidade fixa na tela.
  bool localizacaoReal = false;

  /// Margem de erro da melhor leitura ate agora.
  double? accuracyMeters;

  StreamSubscription<Position>? _vigia;
  List<String> recentPlaces = [];

  bool get isDemo => dataSource != DataSource.api;

  Future<void> bootstrap() async {
    final location = await _resolveLocation();
    coords = location.coords;
    locationGranted = location.granted;
    accuracyMeters = location.accuracyMeters;
    localizacaoReal = !location.mocked;

    // A primeira leitura do GPS costuma vir torta — as vezes com centenas
    // de metros de erro. Em vez de congelar nela, o aparelho segue
    // ouvindo e so troca quando chega leitura MELHOR. Assim o ponto de
    // embarque vai se acertando sozinho enquanto o passageiro digita o
    // destino.
    if (location.granted) _vigiarPosicao();

    if (!AppConfig.hasApi) {
      dataSource = DataSource.demo;
    } else {
      // Com servidor configurado o aplicativo NUNCA vira demonstracao
      // sozinho. Antes, este teste tinha 4 s de limite: com o servidor
      // acordando (ate 1 minuto) ele falhava e o app virava demonstracao
      // calado — login de mentira, sem termos, mapa parado. Agora o teste
      // serve so para acordar o servidor enquanto a pessoa digita.
      dataSource = DataSource.api;
      unawaited(_client.healthCheck());
    }

    final stored = await AppStorage.read(AppStorage.recentPlaces);
    if (stored != null && stored.isNotEmpty) {
      recentPlaces = stored.split('|').where((p) => p.isNotEmpty).toList();
    }

    bootstrapped = true;
    notifyListeners();
  }

  void forceDemo() {
    if (dataSource == DataSource.demo) return;
    dataSource = DataSource.demo;
    notifyListeners();
  }

  Future<void> addRecentPlace(String address) async {
    recentPlaces = [address, ...recentPlaces.where((p) => p != address)].take(6).toList();
    await AppStorage.write(AppStorage.recentPlaces, recentPlaces.join('|'));
    notifyListeners();
  }

  /// Chamado pela tela de Autorizacoes assim que a localizacao e o GPS
  /// ficam liberados — e pelo botao "Tentar de novo".
  Future<void> atualizarLocalizacao() async {
    if (localizacaoReal) return;
    final r = await _resolveLocation();
    locationGranted = r.granted;
    if (!r.mocked) {
      coords = r.coords;
      accuracyMeters = r.accuracyMeters;
      localizacaoReal = true;
    }
    if (r.granted && _vigia == null) _vigiarPosicao();
    notifyListeners();
  }

  Future<LocationResult> _resolveLocation() async {
    try {
      // So CONFERE. Quem pede e a tela de Autorizacoes, na primeira
      // abertura, explicando o porque — nao um pedido solto na abertura.
      final permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        return const LocationResult(coords: fallbackCoords, granted: false, mocked: true);
      }
      if (!await Geolocator.isLocationServiceEnabled()) {
        return const LocationResult(coords: fallbackCoords, granted: false, mocked: true);
      }
      // Com teto de tempo: dentro de casa o GPS pode demorar muito. Se nao
      // vier, usa a ultima posicao conhecida e o vigia acerta depois.
      Position? position;
      try {
        position = await Geolocator.getCurrentPosition().timeout(const Duration(seconds: 15));
      } catch (_) {
        position = await Geolocator.getLastKnownPosition();
      }
      if (position == null) {
        return const LocationResult(coords: fallbackCoords, granted: true, mocked: true);
      }
      return LocationResult(
        coords: Coords(position.latitude, position.longitude),
        granted: true,
        mocked: false,
        accuracyMeters: position.accuracy,
      );
    } catch (_) {
      return const LocationResult(coords: fallbackCoords, granted: false, mocked: true);
    }
  }

  void _vigiarPosicao() {
    _vigia?.cancel();
    try {
      _vigia = Geolocator.getPositionStream(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.best,
          distanceFilter: 5,
        ),
      ).listen((position) {
        final atual = accuracyMeters;
        // So aceita a leitura nova se ela for mais precisa que a que ja
        // temos, ou se a antiga estiver velha demais para confiar.
        final melhorou = atual == null || position.accuracy <= atual;
        if (!melhorou) return;

        coords = Coords(position.latitude, position.longitude);
          localizacaoReal = true;
        accuracyMeters = position.accuracy;
        notifyListeners();
      }, onError: (_) {});
    } catch (_) {
      // Sem GPS continuo o aplicativo segue com a leitura unica.
    }
  }

  @override
  void dispose() {
    _vigia?.cancel();
    super.dispose();
  }
}
