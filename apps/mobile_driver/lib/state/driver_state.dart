import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../core/config/app_config.dart';
import '../core/storage/app_storage.dart';
import '../core/utils/geo.dart';
import '../data/demo/driver_demo.dart';
import '../data/models/driver_models.dart';

/// Estado do motorista: cadastro, documentos, status online, ofertas,
/// corrida em andamento e carteira.
class DriverState extends ChangeNotifier {
  DriverProfile? profile;
  VehicleInfo? vehicle;
  List<DriverDocumentItem> documents = DriverDemo.initialDocuments();

  bool ready = false;
  bool loading = false;
  String? error;

  // ---- Online/offline e posicao ----
  Coords position = fallbackCoords;
  Timer? _heartbeat;

  // ---- Oferta recebida ----
  RideOffer? offer;
  int offerSecondsLeft = 0;
  Timer? _offerTimer;

  // ---- Corrida em andamento ----
  DriverRide? activeRide;
  List<Coords> routeToPickup = [];
  List<Coords> tripRoute = [];

  // ---- Carteira ----
  int extraEarningsCents = 0;
  int extraRides = 0;

  bool get isOnline => profile?.isOnline ?? false;
  bool get isApproved => profile?.approval == DriverApproval.approved;
  bool get isOnboarded => profile?.isOnboarded ?? false;

  int get documentsApproved => documents.where((d) => d.isApproved).length;
  int get documentsTotal => documents.length;
  bool get documentsComplete => documentsApproved == documentsTotal;
  bool get hasPendingDocuments => documents.any((d) => d.isPending);
  bool get hasRejectedDocuments => documents.any((d) => d.isRejected);

  WalletSummary get wallet => DriverDemo.wallet(
        extraEarningsCents: extraEarningsCents,
        extraRides: extraRides,
      );

  List<EarningEntry> get statement => DriverDemo.statement();

  // ------------------------------------------------------------------
  // Ciclo de vida
  // ------------------------------------------------------------------
  Future<void> restore() async {
    final raw = await AppStorage.read(AppStorage.driverProfile);
    if (raw != null && raw.isNotEmpty) {
      try {
        profile = DriverProfile.fromJson(jsonDecode(raw) as Map<String, dynamic>);
      } catch (_) {
        profile = null;
      }
    }

    final rawRide = await AppStorage.read(AppStorage.activeRide);
    if (rawRide != null && rawRide.isNotEmpty) {
      try {
        activeRide = DriverRide.fromJson(jsonDecode(rawRide) as Map<String, dynamic>);
      } catch (_) {
        activeRide = null;
      }
    }

    ready = true;
    notifyListeners();
  }

  Future<void> demoLogin(String name, String phone) async {
    profile = DriverProfile(id: 'demo-$phone', name: name, phone: phone);
    await _persistProfile();
    notifyListeners();
  }

  Future<void> completeOnboarding({
    required String cpf,
    required String cnhNumber,
    required String cnhCategory,
    required String cnhExpiresAt,
  }) async {
    final current = profile;
    if (current == null) return;

    profile = current.copyWith(
      cpf: cpf,
      cnhNumber: cnhNumber,
      cnhCategory: cnhCategory,
      cnhExpiresAt: cnhExpiresAt,
    );
    await _persistProfile();
    notifyListeners();
  }

  Future<void> registerVehicle(VehicleInfo info) async {
    vehicle = info;
    await AppStorage.write(AppStorage.vehicle, jsonEncode({
      'brand': info.brand,
      'model': info.model,
      'year': info.year,
      'color': info.color,
      'plate': info.plate,
    }));
    notifyListeners();
  }

  /// Envia (simula) um documento. O backend real usaria URL pre-assinada.
  Future<void> uploadDocument(DocumentType type) async {
    final index = documents.indexWhere((d) => d.type == type);
    if (index < 0) return;

    documents[index] = documents[index].copyWith(status: DocumentStatus.pending);
    notifyListeners();

    await Future<void>.delayed(const Duration(milliseconds: 600));
    documents[index] = documents[index].copyWith(status: DocumentStatus.approved);
    notifyListeners();

    // Com todos os documentos aprovados, o cadastro entra em analise.
    if (documentsComplete && profile != null && profile!.approval == DriverApproval.rejected) {
      profile = profile!.copyWith(approval: DriverApproval.pending);
      await _persistProfile();
      notifyListeners();
    }
  }

  Future<void> loadVehicle() async {
    final raw = await AppStorage.read(AppStorage.vehicle);
    if (raw == null || raw.isEmpty) return;
    try {
      final json = jsonDecode(raw) as Map<String, dynamic>;
      vehicle = VehicleInfo(
        brand: json['brand'] as String? ?? '',
        model: json['model'] as String? ?? '',
        year: (json['year'] as num?)?.toInt() ?? DateTime.now().year,
        color: json['color'] as String? ?? '',
        plate: json['plate'] as String? ?? '',
      );
    } catch (_) {
      vehicle = null;
    }
    notifyListeners();
  }

  // ------------------------------------------------------------------
  // Online / Offline
  // ------------------------------------------------------------------
  Future<void> goOnline() async {
    final current = profile;
    if (current == null) return;

    if (current.approval != DriverApproval.approved) {
      error = 'Sua conta ainda nao foi aprovada para ficar online.';
      notifyListeners();
      return;
    }

    if (!documentsComplete) {
      error = 'Envie todos os documentos antes de ficar online.';
      notifyListeners();
      return;
    }

    if (vehicle == null) {
      error = 'Cadastre um veiculo antes de ficar online.';
      notifyListeners();
      return;
    }

    error = null;
    profile = current.copyWith(isOnline: true);
    await _persistProfile();
    notifyListeners();

    _startHeartbeat();
  }

  Future<void> goOffline() async {
    final current = profile;
    if (current == null) return;

    profile = current.copyWith(isOnline: false);
    _stopHeartbeat();
    await _persistProfile();
    notifyListeners();
  }

  /// Heartbeat: envia a posicao a cada poucos segundos e, estando online e
  /// livre, sorteia uma nova oferta (simulando o push do backend).
  void _startHeartbeat() {
    _heartbeat?.cancel();
    _heartbeat = Timer.periodic(AppConfig.locationInterval, (_) {
      if (!isOnline) return;

      position = Coords(
        position.latitude + (DateTime.now().millisecond % 7 - 3) * 0.00008,
        position.longitude + (DateTime.now().microsecond % 7 - 3) * 0.00008,
      );
      notifyListeners();

      if (activeRide == null && offer == null && DateTime.now().second % 12 == 0) {
        receiveOffer();
      }
    });
  }

  void _stopHeartbeat() {
    _heartbeat?.cancel();
    _heartbeat = null;
    _clearOffer();
  }

  void setPosition(Coords coords) {
    position = coords;
    notifyListeners();
  }

  // ------------------------------------------------------------------
  // Ofertas
  // ------------------------------------------------------------------
  /// Recebe uma oferta com contador de expiracao (15s por padrao).
  void receiveOffer() {
    if (activeRide != null || offer != null) return;

    offer = DriverDemo.offer(position);
    offerSecondsLeft = offer!.expiresInSeconds;
    notifyListeners();

    _offerTimer?.cancel();
    _offerTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (offer == null) return;

      offerSecondsLeft -= 1;
      if (offerSecondsLeft <= 0) {
        declineOffer();
      } else {
        notifyListeners();
      }
    });
  }

  void _clearOffer() {
    _offerTimer?.cancel();
    _offerTimer = null;
    offer = null;
    offerSecondsLeft = 0;
  }

  Future<void> acceptOffer() async {
    final current = offer;
    if (current == null) return;

    activeRide = DriverRide(
      offer: current,
      phase: RidePhase.toPickup,
      pin: '${1000 + DateTime.now().millisecond % 9000}',
      startedAt: DateTime.now().toIso8601String(),
    );

    routeToPickup = buildRoute(position, current.pickupCoords, steps: 30);
    tripRoute = buildRoute(current.pickupCoords, current.dropoffCoords, steps: 40);

    _clearOffer();
    await _persistRide();
    notifyListeners();
  }

  void declineOffer() {
    _clearOffer();
    notifyListeners();
  }

  // ------------------------------------------------------------------
  // Corrida
  // ------------------------------------------------------------------
  void markArrived() {
    final ride = activeRide;
    if (ride == null) return;
    activeRide = ride.copyWith(phase: RidePhase.waitingPassenger);
    notifyListeners();
  }

  void startRide() {
    final ride = activeRide;
    if (ride == null) return;
    activeRide = ride.copyWith(phase: RidePhase.inProgress);
    notifyListeners();
  }

  Future<void> finishRide() async {
    final ride = activeRide;
    if (ride == null) return;

    activeRide = ride.copyWith(
      phase: RidePhase.completed,
      finishedAt: DateTime.now().toIso8601String(),
    );
    notifyListeners();
  }

  /// Confirma o recebimento e libera o motorista para a proxima oferta.
  Future<void> closeRide() async {
    final ride = activeRide;
    if (ride == null) return;

    extraEarningsCents += ride.offer.earningCents;
    extraRides += 1;

    activeRide = null;
    routeToPickup = [];
    tripRoute = [];
    await AppStorage.remove(AppStorage.activeRide);
    notifyListeners();
  }

  Future<void> requestPayout(int amountCents) async {
    if (amountCents < wallet.minPayoutCents) {
      error = 'O valor minimo de saque nao foi atingido.';
      notifyListeners();
      return;
    }

    extraEarningsCents -= amountCents;
    error = null;
    notifyListeners();
  }

  Future<void> logout() async {
    _stopHeartbeat();
    await AppStorage.clearDriverSession();
    profile = null;
    vehicle = null;
    documents = DriverDemo.initialDocuments();
    activeRide = null;
    notifyListeners();
  }

  // ------------------------------------------------------------------
  Future<void> _persistProfile() async {
    final current = profile;
    if (current == null) return;
    await AppStorage.write(AppStorage.driverProfile, jsonEncode(current.toJson()));
  }

  Future<void> _persistRide() async {
    final ride = activeRide;
    if (ride == null) return;
    await AppStorage.write(AppStorage.activeRide, jsonEncode(ride.toJson()));
  }

  @override
  void dispose() {
    _heartbeat?.cancel();
    _offerTimer?.cancel();
    super.dispose();
  }
}
