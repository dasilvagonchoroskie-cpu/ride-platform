import '../../core/api/api_client.dart';
import '../../core/config/app_config.dart';
import '../../core/utils/geo.dart';
import '../demo/central_demo.dart';
import '../models/central_models.dart';

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
  Future<List<DriverApplication>> pendingApplications() async {
    if (_useDemo) return CentralDemo.applications();

    try {
      final data = await _client.request('GET', '/admin/drivers', query: {'status': 'PENDING'})
          as Map<String, dynamic>;
      final items = data['items'] as List<dynamic>? ?? const [];
      return items.map((item) => _fromApi(item as Map<String, dynamic>)).toList();
    } catch (_) {
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
  }) async {
    if (_useDemo) {
      await Future<void>.delayed(const Duration(milliseconds: 500));
      return true;
    }

    try {
      await _client.request('PATCH', '/admin/drivers/$driverId/review', body: {
        'status': decision.name.toUpperCase(),
        if (reason != null) 'reason': reason,
      });
      return true;
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
      _useDemo = true;
      return CentralDemo.activeRides();
    }
  }

  // ------------------------------------------------------------------
  // Tarifas
  // ------------------------------------------------------------------
  Future<List<FareSettings>> fares() async {
    if (_useDemo) return CentralDemo.fares();

    try {
      final data = await _client.request('GET', '/admin/vehicle-categories') as List<dynamic>;
      return data.map((item) {
        final map = item as Map<String, dynamic>;
        final configs = map['fareConfigs'] as List<dynamic>? ?? const [];
        final active = configs.isEmpty ? const <String, dynamic>{} : configs.first as Map<String, dynamic>;
        return FareSettings(
          categorySlug: map['slug'] as String? ?? 'ride',
          baseFareCents: (active['baseFareCents'] as num?)?.toInt() ?? 0,
          perKmCents: (active['perKmCents'] as num?)?.toInt() ?? 0,
          perMinuteCents: (active['perMinuteCents'] as num?)?.toInt() ?? 0,
          minimumFareCents: (active['minFareCents'] as num?)?.toInt() ?? 0,
          platformFeePercent: (active['commissionPercent'] as num?)?.toDouble() ?? 20,
        );
      }).toList();
    } catch (_) {
      _useDemo = true;
      return CentralDemo.fares();
    }
  }

  /// Grava as tarifas da categoria.
  ///
  /// Backend:  PUT /admin/vehicle-categories/:id/fare
  /// Firestore: colecao `fare_configs`, documento `{slug}`:
  ///   { "baseFareCents": 500, "perKmCents": 180, "perMinuteCents": 30,
  ///     "minFareCents": 900, "commissionPercent": 20 }`
  Future<bool> saveFare(FareSettings fare) async {
    if (_useDemo) {
      await Future<void>.delayed(const Duration(milliseconds: 400));
      return true;
    }

    try {
      await _client.request('PUT', '/admin/vehicle-categories/${fare.categorySlug}/fare', body: {
        'baseFareCents': fare.baseFareCents,
        'perKmCents': fare.perKmCents,
        'perMinuteCents': fare.perMinuteCents,
        'minFareCents': fare.minimumFareCents,
        'commissionPercent': fare.platformFeePercent,
      });
      return true;
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
      _useDemo = true;
      return CentralDemo.financials();
    }
  }

  // ------------------------------------------------------------------
  DriverApplication _fromApi(Map<String, dynamic> json) {
    final user = json['user'] as Map<String, dynamic>? ?? const {};
    final vehicles = json['vehicles'] as List<dynamic>? ?? const [];
    final vehicleJson = vehicles.isEmpty ? const <String, dynamic>{} : vehicles.first as Map<String, dynamic>;
    final categoryJson = vehicleJson['category'] as Map<String, dynamic>? ?? const {};
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
        categorySlug: categoryJson['slug'] as String? ?? 'ride',
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

    return ActiveRide(
      id: json['id'] as String? ?? '',
      code: json['code'] as String? ?? '',
      phase: RidePhase.inProgress,
      passengerName: json['passengerName'] as String? ?? 'Passageiro',
      driverName: json['driverName'] as String? ?? 'Motorista',
      driverPlate: json['driverPlate'] as String? ?? '',
      passengerCoords: pickupCoords,
      driverCoords: pickupCoords,
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
