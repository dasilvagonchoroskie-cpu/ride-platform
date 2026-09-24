import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';

import '../core/config/app_config.dart';
import '../core/api/api_client.dart';
import '../core/storage/app_storage.dart';
import '../core/utils/geo.dart';

enum DataSource { api, demo, unknown }

class LocationResult {
  const LocationResult({required this.coords, required this.granted, required this.mocked});

  final Coords coords;
  final bool granted;
  final bool mocked;
}

/// Estado global: modo de dados (API ou demonstracao), posicao e recentes.
class AppState extends ChangeNotifier {
  AppState({ApiClient? client}) : _client = client ?? ApiClient();

  final ApiClient _client;

  bool bootstrapped = false;
  DataSource dataSource = DataSource.unknown;
  Coords coords = fallbackCoords;
  bool locationGranted = false;
  List<String> recentPlaces = [];

  bool get isDemo => dataSource != DataSource.api;

  Future<void> bootstrap() async {
    final location = await _resolveLocation();
    coords = location.coords;
    locationGranted = location.granted;

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
      );
    } catch (_) {
      return const LocationResult(coords: fallbackCoords, granted: false, mocked: true);
    }
  }
}
