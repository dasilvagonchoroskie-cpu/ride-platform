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
import '../data/models/motorista_no_mapa.dart';

/// Estado da Central: sessao, fila de aprovacoes, monitoramento, tarifas
/// e metricas financeiras.
class CentralState extends ChangeNotifier {
  CentralState({CentralRepository? repository})
      : _repository = repository ?? CentralRepository() {
    // Login vencido de vez (refresh tambem venceu): volta para a tela de entrar.
    ApiClient.aoSessaoExpirar = () {
      if (admin == null) return;
      avisar('Sua sessão expirou. Entre de novo.');
      unawaited(logout());
    };
  }

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

  /// Motoristas online na posicao real (mapa da tela principal).
  List<MotoristaNoMapa> motoristasOnline = const [];

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

  /// O codigo pelo e-mail funciona (envio de verdade ligado no servidor).
  bool codigoPorEmail = false;

  Future<void> conferirFormasDeEntrar() async {
    if (!AppConfig.hasApi) return;
    codigoPorEmail = await _repository.codigoPorEmailLigado();
    notifyListeners();
  }

  /// Manda o codigo para o e-mail. Devolve o erro (ou nulo se foi).
  Future<String?> pedirCodigo(String email) async {
    try {
      await _repository.pedirCodigo(email.trim().toLowerCase());
      return null;
    } on ApiException catch (e) {
      return e.message;
    } catch (_) {
      return 'Sem conexão com o servidor. Confira a internet e tente de novo.';
    }
  }

  Future<void> entrarComCodigo(String email, String codigo) async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      admin = await _repository.entrarComCodigo(email.trim().toLowerCase(), codigo);
    } on ApiException catch (e) {
      error = e.message;
      loading = false;
      notifyListeners();
      return;
    } catch (_) {
      error = 'Sem conexão com o servidor. Confira a internet e tente de novo.';
      loading = false;
      notifyListeners();
      return;
    }
    await AppStorage.write(AppStorage.adminUser, jsonEncode(admin!.toJson()));
    loading = false;
    notifyListeners();
    await loadAll();
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
        error = 'Sem conexão com o servidor. Confira a internet e tente de novo.';
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
    await AppStorage.remove(AppStorage.refreshToken);
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
      parte('mapa da operação', () async {
        motoristasOnline = await _repository.motoristasOnline();
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
      error = 'Sua sessão expirou. Entre de novo.';
      notifyListeners();
    } else if (falhas.isNotEmpty) {
      avisar('Não foi possível carregar: ${falhas.join(', ')}. Tente de novo.');
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
    _monitorTimer = Timer.periodic(AppConfig.monitorInterval, (_) async {
      if (!AppConfig.hasApi) {
        if (rides.isEmpty) return;
        rides = CentralDemo.refreshPositions(rides);
        notifyListeners();
        return;
      }
      // Posicao de verdade, vinda do servidor (antes os carros eram
      // mexidos de mentira na tela).
      try {
        await refreshRides();
      } catch (_) {
        // Sem rede nesta volta: fica a ultima posicao conhecida.
      }
    });
  }

  void stopMonitoring() {
    _monitorTimer?.cancel();
    _monitorTimer = null;
  }

  Future<void> refreshRides() async {
    // O mapa da tela principal acompanha a operacao na mesma batida.
    try {
      motoristasOnline = await _repository.motoristasOnline();
      notifyListeners();
    } catch (_) {
      // Sem rede nesta volta: mantem a ultima posicao conhecida.
    }
    rides = await _repository.activeRides();
    notifyListeners();
  }

  // ------------------------------------------------------------------
  // Aprovacao de motoristas
  // ------------------------------------------------------------------
  /// Aprova o motorista. Atualiza o status e move da fila.
  /// [conferencia]: o que foi conferido pessoalmente (aprovacao presencial).
  Future<bool> approveDriver(DriverApplication application, {String? conferencia}) async {
    loading = true;
    error = null;
    notifyListeners();

    bool ok;
    try {
      ok = await _repository.reviewDriver(
        driverId: application.id,
        decision: DriverApproval.approved,
        reason: conferencia,
        presencial: conferencia != null,
      );
    } on ApiException catch (e) {
      loading = false;
      error = e.message;
      notifyListeners();
      return false;
    }

    loading = false;

    if (!ok) {
      error = 'Sem conexão com o servidor. Não foi aprovado; tente de novo.';
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
      error = 'Informe o motivo da rejeição.';
      notifyListeners();
      return false;
    }

    loading = true;
    error = null;
    notifyListeners();

    bool ok;
    try {
      ok = await _repository.reviewDriver(
        driverId: application.id,
        decision: DriverApproval.rejected,
        reason: reason.trim(),
      );
    } on ApiException catch (e) {
      loading = false;
      error = e.message;
      notifyListeners();
      return false;
    }

    loading = false;

    if (!ok) {
      error = 'Sem conexão com o servidor. Não foi rejeitado; tente de novo.';
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

    bool ok;
    try {
      ok = await _repository.saveTariffs(novas);
    } on ApiException catch (e) {
      loading = false;
      error = e.message;
      notifyListeners();
      return false;
    }
    loading = false;

    if (!ok) {
      error = 'Sem conexão com o servidor. As bandeiras não foram salvas.';
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
