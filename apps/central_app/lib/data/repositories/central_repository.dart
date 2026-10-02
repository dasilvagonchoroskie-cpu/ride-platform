import '../../core/api/api_client.dart';
import '../../core/config/app_config.dart';
import '../../core/utils/geo.dart';
import '../demo/central_demo.dart';
import '../models/central_models.dart';
import '../../core/storage/app_storage.dart';
import '../models/motorista_no_mapa.dart';

/// Acesso aos dados da Central.
///
/// Ordem de precedencia:
///   1. API REST do backend (AppConfig.apiUrl)
///   2. Firestore (AppConfig.firebaseProjectId) — ponto de extensao
///   3. Motor de demonstracao local (padrao quando nada esta configurado)
///
/// A Central **nao** acessa o Firebase diretamente por padrao: o caminho
/// recomendado e o backend, que guarda as credenciais de servico. O metodo
/// `updateDriverApproval` documenta exatamente onde plugar o Firestore caso
/// voce prefira a escrita direta pelo app.
class CentralRepository {
  CentralRepository({ApiClient? client}) : _client = client ?? ApiClient();

  final ApiClient _client;

  bool _useDemo = !AppConfig.hasApi && !AppConfig.hasFirebase;

  bool get isDemo => _useDemo;

  void forceDemo() => _useDemo = true;

  // ------------------------------------------------------------------
  // Motoristas
  // ------------------------------------------------------------------
  /// Motoristas online agora, na posicao REAL (mapa da operacao).
  Future<List<MotoristaNoMapa>> motoristasOnline() async {
    if (_useDemo) return const [];
    final data = await _client.request('GET', '/admin/drivers/active/map');
    final lista = data is List
        ? data
        : (data is Map && data['items'] is List ? data['items'] as List : const []);
    return [
      for (final m in lista.whereType<Map>())
        if (m['latitude'] is num && m['longitude'] is num)
          MotoristaNoMapa(
            id: m['driverId']?.toString() ?? '',
            nome: m['name']?.toString() ?? 'Motorista',
            coords: Coords((m['latitude'] as num).toDouble(), (m['longitude'] as num).toDouble()),
            livre: m['isAvailable'] == true,
          ),
    ];
  }

  /// Login real do administrador (e-mail e senha no servidor).
  Future<AdminUser> login(String email, String password) async {
    final data = await _client.request('POST', '/auth/password/login',
        body: {'email': email, 'password': password}) as Map<String, dynamic>;
    return _sessaoDaCentral(data, email);
  }

  /// Codigo de 6 numeros no e-mail do administrador.
  Future<void> pedirCodigo(String email) async {
    await _client.request('POST', '/auth/otp/request', body: {'email': email, 'purpose': 'LOGIN'});
  }

  Future<AdminUser> entrarComCodigo(String email, String codigo) async {
    final data = await _client.request('POST', '/auth/otp/verify', body: {
      'email': email,
      'code': codigo,
      'purpose': 'LOGIN',
      'role': 'PASSENGER',
      'device': {'deviceId': 'flutter-android-central', 'platform': 'ANDROID'},
    }) as Map<String, dynamic>;
    return _sessaoDaCentral(data, email);
  }

  /// O codigo pelo e-mail funciona para a Central? (So com envio de verdade.)
  Future<bool> codigoPorEmailLigado() async {
    try {
      final data = await _client.request('GET', '/app/config') as Map<String, dynamic>;
      final l = data['login'] as Map<String, dynamic>? ?? const {};
      return l['emailReal'] as bool? ?? false;
    } catch (_) {
      return false;
    }
  }

  Future<AdminUser> _sessaoDaCentral(Map<String, dynamic> data, String email) async {
    final u = data['user'] as Map<String, dynamic>? ?? const {};
    // So a conta da Central entra aqui. Antes, um passageiro com senha
    // entrava e o painel ficava sem dados (o servidor recusava tudo).
    if (u['role'] != 'ADMIN') {
      throw ApiException('CONTA_ERRADA', 'Esta conta não é da Central.', statusCode: 403);
    }
    await AppStorage.write(AppStorage.accessToken, data['accessToken'] as String? ?? '');
    return AdminUser(
      id: u['id'] as String? ?? '',
      name: u['name'] as String? ?? 'Administrador',
      email: u['email'] as String? ?? email,
      role: u['role'] as String? ?? 'ADMIN',
    );
  }

  Future<List<DriverApplication>> pendingApplications() async {
    if (_useDemo) return CentralDemo.applications();

    try {
      final data = await _client.request('GET', '/admin/drivers', query: {'status': 'PENDING'})
          as Map<String, dynamic>;
      final items = data['items'] as List<dynamic>? ?? const [];
      return items.map((item) => _fromApi(item as Map<String, dynamic>)).toList();
    } catch (_) {
      // Com servidor configurado, erro aparece como erro — nada de
      // dados de mentira no lugar sem avisar ninguem.
      if (AppConfig.hasApi) rethrow;
      _useDemo = true;
      return CentralDemo.applications();
    }
  }

  Future<List<DriverApplication>> approvedDrivers() async {
    if (_useDemo) return CentralDemo.approved();

    try {
      final data = await _client.request('GET', '/admin/drivers', query: {'status': 'APPROVED'})
          as Map<String, dynamic>;
      final items = data['items'] as List<dynamic>? ?? const [];
      return items.map((item) => _fromApi(item as Map<String, dynamic>)).toList();
    } catch (_) {
      // Antes devolvia motoristas aprovados DE MENTIRA quando o servidor
      // falhava. Com servidor configurado, erro aparece como erro.
      if (AppConfig.hasApi) rethrow;
      return CentralDemo.approved();
    }
  }

  /// Aprova ou rejeita o motorista.
  ///
  /// Backend:  PATCH /admin/drivers/:id/review { status, reason }
  /// Firestore: colecao `drivers`, documento `{id}`:
  ///   `{ "status": "approved", "approvedAt": timestamp, "reviewedBy": uid }`
  Future<bool> reviewDriver({
    required String driverId,
    required DriverApproval decision,
    String? reason,
    bool presencial = false,
  }) async {
    if (_useDemo) {
      await Future<void>.delayed(const Duration(milliseconds: 500));
      return true;
    }

    try {
      await _client.request('PATCH', '/admin/drivers/$driverId/review', body: {
        'status': decision.name.toUpperCase(),
        if (reason != null) 'reason': reason,
        if (presencial) 'presentialCheck': true,
      });
      return true;
    } on ApiException {
      // O motivo do servidor (ex.: falta item da conferencia) sobe para a tela.
      rethrow;
    } catch (_) {
      return false;
    }
  }

  // ------------------------------------------------------------------
  // Monitoramento
  // ------------------------------------------------------------------
  Future<List<ActiveRide>> activeRides() async {
    if (_useDemo) return CentralDemo.activeRides();

    try {
      final data = await _client.request('GET', '/admin/rides/active') as Map<String, dynamic>;
      final items = data['items'] as List<dynamic>? ?? const [];
      return items.map((item) => _activeRideFromApi(item as Map<String, dynamic>)).toList();
    } catch (_) {
      // Com servidor configurado, erro aparece como erro — nada de
      // dados de mentira no lugar sem avisar ninguem.
      if (AppConfig.hasApi) rethrow;
      _useDemo = true;
      return CentralDemo.activeRides();
    }
  }

  // ------------------------------------------------------------------
  // Tarifas
  // ------------------------------------------------------------------
  /// Le as duas bandeiras do servidor.
  Future<Tariffs> tariffs() async {
    if (_useDemo) return CentralDemo.tariffs();

    try {
      final data = await _client.request('GET', '/admin/tariffs') as Map<String, dynamic>;
      return Tariffs.fromJson(data);
    } catch (_) {
      // Com servidor configurado, erro aparece como erro — nada de
      // dados de mentira no lugar sem avisar ninguem.
      if (AppConfig.hasApi) rethrow;
      _useDemo = true;
      return CentralDemo.tariffs();
    }
  }

  /// Grava as duas bandeiras de uma vez.
  ///
  /// As duas juntas de proposito: salvar so uma abriria a chance de deixar
  /// um horario do dia sem tabela de preco. O servidor recusa se as faixas
  /// nao cobrirem as 24 horas.
  ///
  /// Backend: PUT /admin/tariffs
  Future<bool> saveTariffs(Tariffs tariffs) async {
    if (_useDemo) {
      await Future<void>.delayed(const Duration(milliseconds: 400));
      return true;
    }

    try {
      await _client.request('PUT', '/admin/tariffs', body: tariffs.toJson());
      return true;
    } on ApiException {
      rethrow;
    } catch (_) {
      return false;
    }
  }

  // ------------------------------------------------------------------
  // Financeiro
  // ------------------------------------------------------------------
  Future<FinancialSummary> financials() async {
    if (_useDemo) return CentralDemo.financials();

    try {
      final data = await _client.request('GET', '/admin/reports/summary') as Map<String, dynamic>;
      return FinancialSummary(
        todayCents: (data['todayCents'] as num?)?.toInt() ?? 0,
        weekCents: (data['weekCents'] as num?)?.toInt() ?? 0,
        monthCents: (data['monthCents'] as num?)?.toInt() ?? 0,
        ridesToday: (data['ridesToday'] as num?)?.toInt() ?? 0,
        ridesWeek: (data['ridesWeek'] as num?)?.toInt() ?? 0,
        commissionTodayCents: (data['commissionTodayCents'] as num?)?.toInt() ?? 0,
        driverPayoutsTodayCents: (data['driverPayoutsTodayCents'] as num?)?.toInt() ?? 0,
        activeDrivers: (data['activeDrivers'] as num?)?.toInt() ?? 0,
        onlineDrivers: (data['onlineDrivers'] as num?)?.toInt() ?? 0,
        pendingApprovals: (data['pendingApprovals'] as num?)?.toInt() ?? 0,
        averageTicketCents: (data['averageTicketCents'] as num?)?.toInt() ?? 0,
        cancellationRate: (data['cancellationRate'] as num?)?.toDouble() ?? 0,
        hourlyRevenue:
            (data['hourlyRevenue'] as List<dynamic>?)?.map((e) => (e as num).toInt()).toList() ?? const [],
      );
    } catch (_) {
      // Com servidor configurado, erro aparece como erro — nada de
      // dados de mentira no lugar sem avisar ninguem.
      if (AppConfig.hasApi) rethrow;
      _useDemo = true;
      return CentralDemo.financials();
    }
  }

  // ------------------------------------------------------------------
  DriverApplication _fromApi(Map<String, dynamic> json) {
    final user = json['user'] as Map<String, dynamic>? ?? const {};
    final vehicles = json['vehicles'] as List<dynamic>? ?? const [];
    final vehicleJson = vehicles.isEmpty ? const <String, dynamic>{} : vehicles.first as Map<String, dynamic>;
    final documentsJson = json['documents'] as List<dynamic>? ?? const [];

    return DriverApplication(
      id: json['id'] as String? ?? '',
      name: user['name'] as String? ?? '',
      phone: user['phone'] as String? ?? '',
      email: user['email'] as String? ?? '',
      cpf: json['cpf'] as String? ?? '',
      cnhNumber: json['cnhNumber'] as String? ?? '',
      cnhCategory: json['cnhCategory'] as String? ?? '',
      cnhExpiresAt: json['cnhExpiresAt'] as String? ?? '',
      city: json['city'] as String? ?? '',
      vehicle: VehicleSummary(
        brand: vehicleJson['brand'] as String? ?? '',
        model: vehicleJson['model'] as String? ?? '',
        year: (vehicleJson['year'] as num?)?.toInt() ?? DateTime.now().year,
        color: vehicleJson['color'] as String? ?? '',
        plate: vehicleJson['plate'] as String? ?? '',
      ),
      documents: documentsJson.map((doc) {
        final map = doc as Map<String, dynamic>;
        return DriverDocumentFile(
          type: _documentTypeFromApi(map['type'] as String?),
          status: _documentStatusFromApi(map['status'] as String?),
          rejectionReason: map['rejectionReason'] as String?,
        );
      }).toList(),
      approval: _approvalFromApi(json['status'] as String?),
      submittedAt: json['createdAt'] as String? ?? DateTime.now().toIso8601String(),
    );
  }

  ActiveRide _activeRideFromApi(Map<String, dynamic> json) {
    final pickup = json['pickup'] as Map<String, dynamic>? ?? const {};
    final dropoff = json['dropoff'] as Map<String, dynamic>? ?? const {};

    final pickupCoords = Coords(
      (pickup['latitude'] as num?)?.toDouble() ?? 0,
      (pickup['longitude'] as num?)?.toDouble() ?? 0,
    );
    final dropoffCoords = Coords(
      (dropoff['latitude'] as num?)?.toDouble() ?? 0,
      (dropoff['longitude'] as num?)?.toDouble() ?? 0,
    );

    // Posicao real do carro (antes a Central desenhava o motorista no
    // ponto de embarque).
    final pos = json['driverPosition'] as Map<String, dynamic>?;
    final carro = pos == null
        ? pickupCoords
        : Coords((pos['latitude'] as num?)?.toDouble() ?? 0, (pos['longitude'] as num?)?.toDouble() ?? 0);
    final fase = switch (json['status'] as String?) {
      'REQUESTED' || 'SEARCHING' => RidePhase.searching,
      'DRIVER_WAITING' => RidePhase.waitingPassenger,
      'IN_PROGRESS' => RidePhase.inProgress,
      _ => RidePhase.toPickup,
    };

    return ActiveRide(
      id: json['id'] as String? ?? '',
      code: json['code'] as String? ?? '',
      phase: fase,
      passengerName: json['passengerName'] as String? ?? 'Passageiro',
      driverName: json['driverName'] as String? ?? 'Motorista',
      driverPlate: json['driverPlate'] as String? ?? '',
      passengerCoords: pickupCoords,
      driverCoords: carro,
      pickupAddress: pickup['address'] as String? ?? '',
      dropoffAddress: dropoff['address'] as String? ?? '',
      fareCents: (json['estimatedFareCents'] as num?)?.toInt() ?? 0,
      startedAt: json['requestedAt'] as String? ?? DateTime.now().toIso8601String(),
      polyline: buildRoute(pickupCoords, dropoffCoords, steps: 24),
    );
  }

  DriverApproval _approvalFromApi(String? status) {
    switch ((status ?? '').toUpperCase()) {
      case 'APPROVED':
        return DriverApproval.approved;
      case 'REJECTED':
        return DriverApproval.rejected;
      case 'SUSPENDED':
        return DriverApproval.suspended;
      default:
        return DriverApproval.pending;
    }
  }

  DocumentStatus _documentStatusFromApi(String? status) {
    switch ((status ?? '').toUpperCase()) {
      case 'APPROVED':
        return DocumentStatus.approved;
      case 'REJECTED':
        return DocumentStatus.rejected;
      default:
        return DocumentStatus.pending;
    }
  }

  DocumentType _documentTypeFromApi(String? type) {
    final normalized = (type ?? '').toUpperCase();
    for (final value in DocumentType.values) {
      final snake = value.name.replaceAllMapped(
        RegExp(r'([A-Z])'),
        (m) => '_${m.group(1)}',
      ).toUpperCase();
      if (snake == normalized) return value;
    }
    return DocumentType.profilePhoto;
  }
}
