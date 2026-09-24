import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../core/config/app_config.dart';
import '../core/storage/app_storage.dart';
import '../data/demo/central_demo.dart';
import '../data/models/central_models.dart';
import '../data/repositories/central_repository.dart';

/// Estado da Central: sessao, fila de aprovacoes, monitoramento, tarifas
/// e metricas financeiras.
class CentralState extends ChangeNotifier {
  CentralState({CentralRepository? repository})
      : _repository = repository ?? CentralRepository();

  final CentralRepository _repository;

  AdminUser? admin;
  bool ready = false;
  bool loading = false;
  String? error;

  List<DriverApplication> pending = [];
  List<DriverApplication> approved = [];
  List<ActiveRide> rides = [];
  List<FareSettings> fares = [];
  FinancialSummary? financials;

  Timer? _monitorTimer;

  bool get isDemo => _repository.isDemo;
  int get pendingCount => pending.length;
  int get activeRidesCount => rides.length;

  // ------------------------------------------------------------------
  // Sessao
  // ------------------------------------------------------------------
  Future<void> restore() async {
    final raw = await AppStorage.read(AppStorage.adminUser);
    if (raw != null && raw.isNotEmpty) {
      try {
        admin = AdminUser.fromJson(jsonDecode(raw) as Map<String, dynamic>);
      } catch (_) {
        admin = null;
      }
    }

    ready = true;
    notifyListeners();
  }

  Future<void> login(String email, String password) async {
    loading = true;
    error = null;
    notifyListeners();

    // Modo demonstracao: qualquer e-mail/senha entra.
    await Future<void>.delayed(const Duration(milliseconds: 400));

    admin = AdminUser(
      id: 'admin-1',
      name: email.split('@').first.isEmpty ? 'Administrador' : _titleCase(email.split('@').first),
      email: email,
      role: 'ADMIN',
    );

    await AppStorage.write(AppStorage.adminUser, jsonEncode(admin!.toJson()));
    loading = false;
    notifyListeners();

    await loadAll();
  }

  Future<void> logout() async {
    _monitorTimer?.cancel();
    await AppStorage.remove(AppStorage.adminUser);
    admin = null;
    pending = [];
    approved = [];
    rides = [];
    notifyListeners();
  }

  // ------------------------------------------------------------------
  // Carregamento
  // ------------------------------------------------------------------
  Future<void> loadAll() async {
    loading = true;
    notifyListeners();

    try {
      final results = await Future.wait([
        _repository.pendingApplications(),
        _repository.approvedDrivers(),
        _repository.activeRides(),
        _repository.fares(),
        _repository.financials(),
      ]);

      pending = results[0] as List<DriverApplication>;
      approved = results[1] as List<DriverApplication>;
      rides = results[2] as List<ActiveRide>;
      fares = results[3] as List<FareSettings>;
      financials = results[4] as FinancialSummary;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> refreshFinancials() async {
    financials = await _repository.financials();
    notifyListeners();
  }

  Future<void> refreshPending() async {
    pending = await _repository.pendingApplications();
    notifyListeners();
  }

  /// Atualiza as posicoes no mapa a cada poucos segundos.
  void startMonitoring() {
    _monitorTimer?.cancel();
    _monitorTimer = Timer.periodic(AppConfig.monitorInterval, (_) {
      if (rides.isEmpty) return;
      rides = CentralDemo.refreshPositions(rides);
      notifyListeners();
    });
  }

  void stopMonitoring() {
    _monitorTimer?.cancel();
    _monitorTimer = null;
  }

  Future<void> refreshRides() async {
    rides = await _repository.activeRides();
    notifyListeners();
  }

  // ------------------------------------------------------------------
  // Aprovacao de motoristas
  // ------------------------------------------------------------------
  /// Aprova o motorista. Atualiza o status e move da fila.
  Future<bool> approveDriver(DriverApplication application) async {
    loading = true;
    error = null;
    notifyListeners();

    final ok = await _repository.reviewDriver(
      driverId: application.id,
      decision: DriverApproval.approved,
    );

    loading = false;

    if (!ok) {
      error = 'Nao foi possivel aprovar. Tente novamente.';
      notifyListeners();
      return false;
    }

    pending = pending.where((d) => d.id != application.id).toList();
    approved = [application.copyWith(approval: DriverApproval.approved), ...approved];
    await refreshFinancials();
    notifyListeners();
    return true;
  }

  /// Rejeita o motorista com o motivo informado.
  Future<bool> rejectDriver(DriverApplication application, String reason) async {
    if (reason.trim().length < 3) {
      error = 'Informe o motivo da rejeicao.';
      notifyListeners();
      return false;
    }

    loading = true;
    error = null;
    notifyListeners();

    final ok = await _repository.reviewDriver(
      driverId: application.id,
      decision: DriverApproval.rejected,
      reason: reason.trim(),
    );

    loading = false;

    if (!ok) {
      error = 'Nao foi possivel rejeitar. Tente novamente.';
      notifyListeners();
      return false;
    }

    pending = pending.where((d) => d.id != application.id).toList();
    notifyListeners();
    return true;
  }

  /// Aprova ou rejeita um documento individual do motorista.
  void reviewDocument(String driverId, DocumentType type, DocumentStatus status) {
    final index = pending.indexWhere((d) => d.id == driverId);
    if (index < 0) return;

    final application = pending[index];
    final documents = application.documents.map((doc) {
      return doc.type == type
          ? DriverDocumentFile(type: type, status: status, rejectionReason: doc.rejectionReason)
          : doc;
    }).toList();

    pending[index] = application.copyWith(documents: documents);
    notifyListeners();
  }

  // ------------------------------------------------------------------
  // Tarifas
  // ------------------------------------------------------------------
  /// Grava as tarifas alteradas e recarrega a lista.
  Future<bool> saveFare(FareSettings fare) async {
    loading = true;
    error = null;
    notifyListeners();

    final ok = await _repository.saveFare(fare);
    loading = false;

    if (!ok) {
      error = 'Falha ao salvar as tarifas.';
      notifyListeners();
      return false;
    }

    final index = fares.indexWhere((f) => f.categorySlug == fare.categorySlug);
    if (index >= 0) fares[index] = fare;
    notifyListeners();
    return true;
  }

  String _titleCase(String value) {
    if (value.isEmpty) return value;
    return value[0].toUpperCase() + value.substring(1);
  }

  @override
  void dispose() {
    _monitorTimer?.cancel();
    super.dispose();
  }
}
