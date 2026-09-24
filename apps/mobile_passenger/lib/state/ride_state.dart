import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../core/storage/app_storage.dart';
import '../core/utils/geo.dart';
import '../data/demo/demo_engine.dart';
import '../data/models/models.dart';
import '../data/repositories/ride_repository.dart';

/// Ciclo de vida da corrida: estimativa, pareamento, viagem, recibo e historico.
class RideState extends ChangeNotifier {
  RideState({RideRepository? repository}) : _repository = repository ?? RideRepository();

  final RideRepository _repository;

  Ride? activeRide;
  List<Coords> driverRoute = [];
  List<Coords> tripRoute = [];
  List<Ride> history = [];
  List<RideCategory> categories = [];
  List<DriverInfo> nearbyDrivers = [];
  bool estimating = false;
  String? error;

  Future<List<RideCategory>> estimate(Coords origin, Coords destination) async {
    estimating = true;
    notifyListeners();

    final result = await _repository.estimate(origin, destination);
    categories = result.categories;
    nearbyDrivers = _repository.nearbyDrivers(origin);
    estimating = false;
    notifyListeners();

    return categories;
  }

  Future<Ride> requestRide({
    required Coords origin,
    required Coords destination,
    required String pickupAddress,
    required String dropoffAddress,
    required RideCategory category,
    required String paymentMethod,
  }) async {
    final ride = await _repository.createRide(
      origin: origin,
      destination: destination,
      pickupAddress: pickupAddress,
      dropoffAddress: dropoffAddress,
      category: category,
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
