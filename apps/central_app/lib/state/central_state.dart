import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../core/config/app_config.dart';
import '../core/storage/app_storage.dart';
import '../data/demo/central_demo.dart';
import '../data/models/central_models.dart';
import '../data/repositories/central_repository.dart';
import '../core/api/api_client.dart';
import '../core/avisos.dart';

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
  /// As duas bandeiras. Nulo enquanto nao carregou.
  Tariffs? tariffs;
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

    if (AppConfig.hasApi) {
      // Login DE VERDADE no servidor. A versao recebida entrava com
      // qualquer e-mail e senha e nunca se identificava — por isso nenhum
      // dado real carregava e o painel ficava girando.
      try {
        admin = await _repository.login(email.trim(), password);
      } on ApiException catch (e) {
        error = e.statusCode == 401 ? 'E-mail ou senha incorretos.' : e.message;
        loading = false;
        notifyListeners();
        return;
      } catch (_) {
        error = 'Sem conexao com o servidor. Confira a internet e tente de novo.';
        loading = false;
        notifyListeners();
        return;
      }
    } else {
      // Sem servidor configurado: demonstracao local.
      admin = AdminUser(
        id: 'admin-1',
        name: email.split('@').first.isEmpty ? 'Administrador' : _titleCase(email.split('@').first),
        email: email,
        role: 'ADMIN',
      );
    }

    await AppStorage.write(AppStorage.adminUser, jsonEncode(admin!.toJson()));
    loading = false;
    notifyListeners();

    await loadAll();
  }

  Future<void> logout() async {
    _monitorTimer?.cancel();
    await AppStorage.remove(AppStorage.adminUser);
    await AppStorage.remove(AppStorage.accessToken);
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

    // Cada parte carrega por conta propria: uma falha nao derruba as
    // outras, e o motivo aparece na tela em vez de um circulo girando.
    final falhas = <String>[];
    var sessaoExpirou = false;
    Future<void> parte(String nome, Future<void> Function() carregar) async {
      try {
        await carregar();
      } on ApiException catch (e) {
        if (e.statusCode == 401 || e.statusCode == 403) sessaoExpirou = true;
        falhas.add(nome);
      } catch (_) {
        falhas.add(nome);
      }
    }

    await Future.wait([
      parte('cadastros pendentes', () async {
        pending = await _repository.pendingApplications();
      }),
      parte('motoristas', () async {
        approved = await _repository.approvedDrivers();
      }),
      parte('corridas', () async {
        rides = await _repository.activeRides();
      }),
      parte('bandeiras', () async {
        tariffs = await _repository.tariffs();
      }),
      parte('financeiro', () async {
        financials = await _repository.financials();
      }),
    ]);

    loading = false;
    notifyListeners();

    if (sessaoExpirou) {
      await logout();
      error = 'Sua sessao expirou. Entre de novo.';
      notifyListeners();
    } else if (falhas.isNotEmpty) {
      avisar('Nao foi possivel carregar: ${falhas.join(', ')}. Tente de novo.');
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
  /// Grava as duas bandeiras.
  ///
  /// Guarda o novo valor na memoria so depois que o servidor confirmou.
  /// Se guardasse antes, a tela mostraria um preco que o banco nao tem.
  Future<bool> saveTariffs(Tariffs novas) async {
    loading = true;
    error = null;
    notifyListeners();

    final ok = await _repository.saveTariffs(novas);
    loading = false;

    if (!ok) {
      error = 'Falha ao salvar as bandeiras. Confira se uma termina onde a outra comeca.';
      notifyListeners();
      return false;
    }

    tariffs = novas;
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
