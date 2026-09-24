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

    // A primeira leitura do GPS costuma vir torta — as vezes com centenas
    // de metros de erro. Em vez de congelar nela, o aparelho segue
    // ouvindo e so troca quando chega leitura MELHOR. Assim o ponto de
    // embarque vai se acertando sozinho enquanto o passageiro digita o
    // destino.
    if (location.granted) _vigiarPosicao();

    if (!AppConfig.hasApi) {
      dataSource = DataSource.demo;
    } else {
      dataSource = await _client.healthCheck() ? DataSource.api : DataSource.demo;
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

  Future<LocationResult> _resolveLocation() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        return const LocationResult(coords: fallbackCoords, granted: false, mocked: true);
      }

      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        return const LocationResult(coords: fallbackCoords, granted: false, mocked: true);
      }

      final position = await Geolocator.getCurrentPosition();
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
