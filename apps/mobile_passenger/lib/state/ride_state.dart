import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../core/storage/app_storage.dart';
import '../core/utils/geo.dart';
import '../data/demo/demo_engine.dart';
import '../data/models/models.dart';
import '../data/repositories/ride_repository.dart';
import '../core/api/api_client.dart';
import '../core/avisos.dart';

/// Ciclo de vida da corrida: estimativa, pareamento, viagem, recibo e historico.
class RideState extends ChangeNotifier {
  RideState({RideRepository? repository}) : _repository = repository ?? RideRepository();

  final RideRepository _repository;

  Ride? activeRide;
  List<Coords> driverRoute = [];
  List<Coords> tripRoute = [];
  List<Ride> history = [];
  /// O orcamento da viagem. Um so, porque a modalidade e unica.
  RideQuote? quote;
  List<DriverInfo> nearbyDrivers = [];
  bool estimating = false;
  String? error;

  /// Popula os carros visiveis no mapa da tela inicial.
  void refreshNearby(Coords origin) {
    if (nearbyDrivers.isNotEmpty) return;
    nearbyDrivers = _repository.nearbyDrivers(origin);
    notifyListeners();
  }

  Future<RideQuote?> estimate(
    Coords origin,
    Coords destination, {
    String pickupAddress = 'Minha localizacao atual',
    String dropoffAddress = 'Destino escolhido',
  }) async {
    estimating = true;
    notifyListeners();
    try {
      final result = await _repository.estimate(origin, destination,
          pickupAddress: pickupAddress, dropoffAddress: dropoffAddress);
      quote = result.quote;
      nearbyDrivers = _repository.nearbyDrivers(origin);
      return result.quote;
    } on ApiException catch (e) {
      avisar(e.message);
      return null;
    } catch (_) {
      avisar('Sem conexao com o servidor. Confira a internet e tente de novo.');
      return null;
    } finally {
      // Antes, qualquer falha deixava a tela girando para sempre.
      estimating = false;
      notifyListeners();
    }
  }

  Future<Ride> requestRide({
    required Coords origin,
    required Coords destination,
    required String pickupAddress,
    required String dropoffAddress,
    required String paymentMethod,
  }) async {
    final ride = await _repository.createRide(
      origin: origin,
      destination: destination,
      pickupAddress: pickupAddress,
      dropoffAddress: dropoffAddress,
      paymentMethod: paymentMethod,
    );

    activeRide = ride;
    driverRoute = [];
    tripRoute = [];
    await _persist();
    notifyListeners();

    return ride;
  }

  /// Avanca a maquina de estados da corrida.
  void advanceRide() {
    final ride = activeRide;
    if (ride == null) return;

    switch (ride.status) {
      case RideStatus.searching:
        final driver = DemoEngine.assignDriver(ride);
        driverRoute = buildRoute(driver.position, ride.pickup.coords, steps: 30);
        activeRide = ride.copyWith(driver: driver, status: RideStatus.driverArriving);
        break;
      case RideStatus.driverAssigned:
      case RideStatus.driverArriving:
        tripRoute = buildRoute(ride.pickup.coords, ride.dropoff.coords, steps: 40);
        activeRide = ride.copyWith(status: RideStatus.inProgress);
        break;
      case RideStatus.inProgress:
        activeRide = ride.copyWith(
          status: RideStatus.completed,
          finishedAt: DateTime.now().toIso8601String(),
        );
        break;
      case RideStatus.completed:
      case RideStatus.cancelledByPassenger:
        break;
    }

    notifyListeners();
  }

  Future<void> completeRide(int? rating) async {
    final ride = activeRide;
    if (ride == null) return;

    final finished = ride.copyWith(
      status: RideStatus.completed,
      finishedAt: ride.finishedAt ?? DateTime.now().toIso8601String(),
      rating: rating,
    );

    history = [finished, ...history.where((item) => item.id != finished.id)];
    activeRide = null;
    driverRoute = [];
    tripRoute = [];
    await AppStorage.remove(AppStorage.activeRide);
    notifyListeners();
  }

  Future<void> cancelRide() async {
    final ride = activeRide;
    if (ride != null) {
      history = [ride.copyWith(status: RideStatus.cancelledByPassenger), ...history];
    }
    activeRide = null;
    driverRoute = [];
    tripRoute = [];
    await AppStorage.remove(AppStorage.activeRide);
    notifyListeners();
  }

  Future<void> loadHistory(Coords origin) async {
    final loaded = await _repository.history(origin);

    final merged = <Ride>[...history];
    for (final item in loaded) {
      if (!merged.any((entry) => entry.id == item.id)) merged.add(item);
    }

    history = merged;
    notifyListeners();
  }

  Future<void> restore() async {
    final raw = await AppStorage.read(AppStorage.activeRide);
    if (raw == null || raw.isEmpty) return;

    try {
      activeRide = Ride.fromJson(jsonDecode(raw) as Map<String, dynamic>);
      notifyListeners();
    } catch (_) {
      await AppStorage.remove(AppStorage.activeRide);
    }
  }

  Future<void> _persist() async {
    final ride = activeRide;
    if (ride == null) return;
    await AppStorage.write(AppStorage.activeRide, jsonEncode(ride.toJson()));
  }
}
