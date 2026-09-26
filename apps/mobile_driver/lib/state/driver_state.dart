import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

import 'package:geolocator/geolocator.dart';

import '../core/api/api_client.dart';
import '../core/config/app_config.dart';
import '../core/legal/legal_content.dart';
import '../core/native/corridas_nativo.dart';
import '../core/storage/app_storage.dart';
import '../core/utils/geo.dart';
import '../data/demo/driver_demo.dart';
import '../data/models/driver_models.dart';
import '../core/avisos.dart';

/// Estado do motorista: cadastro, documentos, status online, ofertas,
/// corrida em andamento e carteira.
class DriverState extends ChangeNotifier with WidgetsBindingObserver {
  final ApiClient _client = ApiClient();

  DriverProfile? profile;
  VehicleInfo? vehicle;
  List<DriverDocumentItem> documents = DriverDemo.initialDocuments();

  bool ready = false;
  bool loading = false;
  String? error;

  // ---- Online/offline e posicao ----
  Coords position = fallbackCoords;
  double? positionAccuracy;
  bool locationDenied = false;
  Timer? _heartbeat;
  Timer? _statusTimer;

  /// Autorizacoes do Android (localizacao, notificacao, sobrepor, bateria,
  /// tela cheia). null = ainda nao conferidas.
  Map<String, bool> permissoes = const {};
  bool? permissoesOk;

  /// true so quando o aparelho informou a posicao REAL.
  bool posicaoReal = false;
  int? _ganhoReal;
  StreamSubscription<Position>? _gps;

  // ---- Oferta recebida ----
  RideOffer? offer;
  int offerSecondsLeft = 0;
  Timer? _offerTimer;

  // ---- Corrida em andamento ----
  DriverRide? activeRide;
  List<Coords> routeToPickup = [];
  List<Coords> tripRoute = [];

  // ---- Painel (dados reais do servidor) ----
  /// Resumo de hoje: alimenta o valor no topo da tela inicial.
  ActivitySummary? hoje;

  /// Carteira pre-paga (comissao descontada a cada corrida).
  WalletInfo? carteira;

  /// Cadastro como esta no servidor (dados pessoais, CNH, Pix).
  Map<String, dynamic>? dadosCadastro;

  /// Veiculos cadastrados no servidor.
  List<Map<String, dynamic>> veiculos = const [];

  /// Olho na tela Atividades: esconde os valores de quem estiver do lado.
  bool ocultarValores = false;

  bool get isOnline => profile?.isOnline ?? false;
  bool get isApproved => profile?.approval == DriverApproval.approved;
  bool get isOnboarded => profile?.isOnboarded ?? false;

  int get documentsApproved => documents.where((d) => d.isApproved).length;
  int get documentsTotal => documents.length;
  bool get documentsComplete => documentsApproved == documentsTotal;
  bool get hasPendingDocuments => documents.any((d) => d.isPending);
  bool get hasRejectedDocuments => documents.any((d) => d.isRejected);

  int get ganhosHojeCents => hoje?.earningCents ?? 0;

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

    WidgetsBinding.instance.addObserver(this);
    await checarPermissoes();
    ready = true;
    notifyListeners();
    if (profile != null) _vigiarAprovacao();
    if (profile != null && isApproved) unawaited(atualizarPainel());
    // Reabriu o aplicativo ja disponivel: religa tudo, senao ele ficaria
    // "disponivel" sem estar ouvindo chamado nenhum.
    if (isOnline) {
      unawaited(_iniciarGps());
      _startHeartbeat();
      unawaited(_ligarServicoNativo());
    }
  }

  // ------------------------------------------------------------------
  // Autorizacoes do Android e servico nativo de alarme
  // ------------------------------------------------------------------

  Future<void> checarPermissoes() async {
    permissoes = await CorridasNativo.permissoes();
    permissoesOk = CorridasNativo.essenciaisOk(permissoes);
    notifyListeners();
    if (permissoes['localizacao'] == true) unawaited(lerPosicaoInicial());
  }

  /// Primeira posicao, antes mesmo de ficar disponivel: o mapa abre onde o
  /// motorista esta, nunca numa cidade fixa.
  Future<void> lerPosicaoInicial() async {
    if (posicaoReal) return;
    try {
      final p = await Geolocator.getLastKnownPosition() ??
          await Geolocator.getCurrentPosition().timeout(const Duration(seconds: 15));
      position = Coords(p.latitude, p.longitude);
        posicaoReal = true;
      posicaoReal = true;
      notifyListeners();
    } catch (_) {
      // Sem sinal agora; a tela "Localizando" oferece tentar de novo.
    }
  }

  /// Liga o vigia nativo: consulta chamados e toca o alarme mesmo com o
  /// aplicativo fechado e a tela apagada.
  Future<void> _ligarServicoNativo() async {
    if (!AppConfig.hasApi) return;
    final token = await AppStorage.read(AppStorage.accessToken);
    if (token == null || token.isEmpty) return;
    await CorridasNativo.iniciar(AppConfig.apiUrl, token);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) return;
    checarPermissoes();
    // Voltou por causa de um chamado (ou o motorista abriu o app): busca
    // na hora, sem esperar a proxima volta do relogio.
    if (isOnline && offer == null && activeRide == null && AppConfig.hasApi) {
      _buscarChamados();
    }
  }

  // ------------------------------------------------------------------
  // Login real por codigo (servidor)
  // ------------------------------------------------------------------

  /// Pede o codigo. Em ambiente de teste o servidor devolve o proprio
  /// codigo na resposta (debugCode) — assim da para entrar sem SMS.
  Future<String?> requestOtp(String phone) async {
    final data = await _client.request('POST', '/auth/otp/request', body: {
      'phone': phone,
      'purpose': 'LOGIN',
    }) as Map<String, dynamic>;
    return data['debugCode'] as String?;
  }

  Future<void> verifyOtp(String phone, String code) async {
    final data = await _client.request('POST', '/auth/otp/verify', body: {
      'phone': phone,
      'code': code,
      'purpose': 'LOGIN',
      'role': 'DRIVER',
      'device': {'deviceId': 'flutter-android-driver', 'platform': 'ANDROID'},
    }) as Map<String, dynamic>;

    await AppStorage.write(AppStorage.accessToken, data['accessToken'] as String? ?? '');
    final refresh = data['refreshToken'] as String?;
    if (refresh != null) await AppStorage.write(AppStorage.refreshToken, refresh);

    final u = data['user'] as Map<String, dynamic>;
    profile = DriverProfile(
      id: u['driverId'] as String? ?? u['id'] as String? ?? '',
      name: u['name'] as String? ?? 'Motorista',
      phone: u['phone'] as String? ?? phone,
    ).copyWith(
      approval: _aprovacao(u['driverStatus'] as String?),
      termsAccepted: u['termsAccepted'] as bool? ?? false,
    );
    await _persistProfile();
    notifyListeners();
    _vigiarAprovacao();
  }

  static DriverApproval _aprovacao(String? s) {
    switch (s) {
      case 'APPROVED':
        return DriverApproval.approved;
      case 'REJECTED':
      case 'SUSPENDED':
        return DriverApproval.rejected;
      default:
        return DriverApproval.pending;
    }
  }

  /// "25/09/1990" vira "1990-09-25", o formato que o servidor aceita.
  /// Se ja vier no formato ISO, passa direto.
  /// Mostra o motivo na tela e guarda em [error].
  void _avisar(String mensagem) {
    error = mensagem;
    avisar(mensagem);
    notifyListeners();
  }

  /// Confere o cadastro ANTES de enviar, com a mensagem certa para cada
  /// campo. Dados errados eram recusados pelo servidor sem explicacao.
  static String? _validarCadastro({
    required String cpf,
    required String nascimento,
    required String cnh,
    required String validade,
  }) {
    if (!_cpfValido(cpf)) return 'CPF invalido. Confira os 11 numeros.';
    final hoje = DateTime.now();
    final nasc = _lerData(nascimento);
    if (nasc == null || !nasc.isBefore(hoje)) return 'Data de nascimento invalida. Use DD/MM/AAAA.';
    if (hoje.difference(nasc).inDays < 18 * 365) return 'E preciso ter 18 anos ou mais.';
    if (cnh.replaceAll(RegExp(r'\D'), '').length != 11) return 'O numero da CNH tem 11 digitos.';
    final venc = _lerData(validade);
    if (venc == null) return 'Validade da CNH invalida. Use DD/MM/AAAA.';
    if (!venc.isAfter(hoje)) return 'A CNH esta vencida.';
    return null;
  }

  static DateTime? _lerData(String s) {
    final m = RegExp(r'^(\d{1,2})/(\d{1,2})/(\d{4})$').firstMatch(s.trim());
    if (m == null) return DateTime.tryParse(s.trim());
    final dia = int.parse(m.group(1)!);
    final mes = int.parse(m.group(2)!);
    final ano = int.parse(m.group(3)!);
    final data = DateTime(ano, mes, dia);
    // 31/02 "vira" marco no DateTime; aqui isso e data invalida.
    if (data.year != ano || data.month != mes || data.day != dia) return null;
    return data;
  }

  static bool _cpfValido(String entrada) {
    final c = entrada.replaceAll(RegExp(r'\D'), '');
    if (c.length != 11 || RegExp(r'^(\d)\1{10}$').hasMatch(c)) return false;
    int digito(int n) {
      var soma = 0;
      for (var i = 0; i < n; i++) {
        soma += int.parse(c[i]) * (n + 1 - i);
      }
      final r = (soma * 10) % 11;
      return r == 10 ? 0 : r;
    }

    return digito(9) == int.parse(c[9]) && digito(10) == int.parse(c[10]);
  }

  static String _paraIso(String data) {
    final p = data.trim().split('/');
    if (p.length == 3) {
      return '${p[2].padLeft(4, '0')}-${p[1].padLeft(2, '0')}-${p[0].padLeft(2, '0')}';
    }
    return data.trim();
  }

  /// Consulta o servidor para saber se o cadastro ja foi aprovado pela
  /// Central. Sem isto o motorista ficaria preso na tela "em analise"
  /// mesmo depois de aprovado.
  Future<void> refreshFromServer() async {
    if (!AppConfig.hasApi || profile == null) return;
    try {
      final u = await _client.request('GET', '/auth/me') as Map<String, dynamic>;
      final nova = _aprovacao(u['driverStatus'] as String?);
      if (profile!.approval != nova) {
        profile = profile!.copyWith(approval: nova);
        await _persistProfile();
        notifyListeners();
        if (nova == DriverApproval.approved) unawaited(atualizarPainel());
      }
    } catch (_) {
      // Sem rede agora; tenta de novo na proxima volta do relogio.
    }
  }

  void _vigiarAprovacao() {
    _statusTimer?.cancel();
    if (!AppConfig.hasApi) return;
    _statusTimer = Timer.periodic(const Duration(seconds: 20), (_) {
      if (profile != null && profile!.approval != DriverApproval.approved) {
        refreshFromServer();
      }
    });
  }

  Future<void> demoLogin(String name, String phone) async {
    profile = DriverProfile(id: 'demo-$phone', name: name, phone: phone);
    await _persistProfile();
    notifyListeners();
  }

  /// Registra o aceite dos Termos/Privacidade.
  ///
  /// Mesma receita do aplicativo do passageiro: tenta avisar o servidor
  /// quando ha rede, mas aceita localmente mesmo se a chamada falhar —
  /// o motorista nao pode ficar presos na tela de aceite so porque a
  /// internet caiu naquele instante.
  Future<void> acceptTerms() async {
    final current = profile;
    if (current == null) return;

    if (AppConfig.hasApi) {
      try {
        await _client.request('POST', '/auth/accept-terms', body: {'version': kTermsVersion});
      } catch (_) {
        // Segue aceitando localmente; sincroniza no proximo login.
      }
    }

    profile = current.copyWith(termsAccepted: true);
    await _persistProfile();
    notifyListeners();
  }

  Future<void> completeOnboarding({
    required String cpf,
    required String cnhNumber,
    required String cnhCategory,
    required String cnhExpiresAt,
    String? birthDate,
  }) async {
    final current = profile;
    if (current == null) return;

    if (AppConfig.hasApi) {
      final problema = _validarCadastro(
        cpf: cpf,
        nascimento: birthDate ?? '',
        cnh: cnhNumber,
        validade: cnhExpiresAt,
      );
      if (problema != null) {
        _avisar(problema);
        return;
      }
    }

    if (AppConfig.hasApi) {
      try {
        await _client.request('POST', '/drivers/onboarding', body: {
          'cpf': cpf.replaceAll(RegExp(r'\D'), ''),
          'birthDate': _paraIso(birthDate ?? ''),
          'cnhNumber': cnhNumber.replaceAll(RegExp(r'\D'), ''),
          'cnhCategory': cnhCategory,
          'cnhExpiresAt': _paraIso(cnhExpiresAt),
        });
      } on ApiException catch (e) {
        // Cadastro ja existente (reinstalou o app) nao e erro de verdade.
        if (e.statusCode != 409) {
          _avisar(e.message);
          return;
        }
      }
      // O veiculo so pode ir DEPOIS que o motorista existe no servidor.
      // Antes ele ia na etapa 2 e voltava "cadastro nao encontrado".
      final v = vehicle;
      if (v != null) {
        try {
          await _client.request('POST', '/vehicles', body: {
            'plate': v.plate.toUpperCase().replaceAll(RegExp(r'[^A-Z0-9]'), ''),
            'brand': v.brand,
            'model': v.model,
            'year': v.year,
            'color': v.color,
          });
        } on ApiException catch (e) {
          if (e.statusCode != 409) {
            _avisar(e.message);
            return;
          }
        }
      }
    }

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
    // No primeiro cadastro o veiculo fica guardado e segue junto com os
    // dados do motorista; depois disso, trocas de veiculo vao na hora.
    if (AppConfig.hasApi && isOnboarded) {
      try {
        await _client.request('POST', '/vehicles', body: {
          'plate': info.plate.toUpperCase().replaceAll(RegExp(r'[^A-Z0-9]'), ''),
          'brand': info.brand,
          'model': info.model,
          'year': info.year,
          'color': info.color,
        });
      } on ApiException catch (e) {
        if (e.statusCode != 409) {
          _avisar(e.message);
          return;
        }
      }
    }
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

    await refreshFromServer();
    if ((profile ?? current).approval != DriverApproval.approved) {
      _avisar('Sua conta ainda nao foi aprovada para ficar online.');
      return;
    }

    // Sem estas autorizacoes o alarme falha com o celular no bolso — e o
    // motorista perderia corrida achando que estava disponivel.
    await checarPermissoes();
    if (permissoesOk != true) {
      _avisar('Libere as autorizações do aplicativo antes de ficar disponível.');
      return;
    }

    // Documentos: a aprovacao e presencial, na Central. Quem decide se o
    // motorista pode rodar e o servidor (status APROVADO) — nao uma lista
    // de fotos guardada no aparelho, que some ao reinstalar.

    if (vehicle == null) await sincronizarCadastro();
    if (vehicle == null) {
      _avisar('Cadastre um veiculo antes de ficar online.');
      return;
    }

    error = null;
    profile = current.copyWith(isOnline: true);
    await _persistProfile();
    notifyListeners();

    if (AppConfig.hasApi) {
      try {
        await _client.request('PATCH', '/drivers/me/online', body: {'isOnline': true});
      } catch (_) {}
    }
    await _iniciarGps();
    _startHeartbeat();
    await _ligarServicoNativo();
  }

  Future<void> goOffline() async {
    final current = profile;
    if (current == null) return;

    profile = current.copyWith(isOnline: false);
    await CorridasNativo.parar();
    _stopHeartbeat();
    _pararGps();
    if (AppConfig.hasApi) {
      try {
        await _client.request('PATCH', '/drivers/me/online', body: {'isOnline': false});
      } catch (_) {}
    }
    await _persistProfile();
    notifyListeners();
  }

  /// Pede a permissao e comeca a ouvir o GPS de verdade.
  ///
  /// Diferente do passageiro (que fica parado esperando a MELHOR leitura),
  /// o motorista esta se movendo — por isso aqui aceita-se toda leitura
  /// razoavel (ate 60 m de erro) em vez de so a melhor de todas, senao a
  /// posicao no mapa ficaria presa no ponto onde ele ligou o aplicativo.
  Future<void> _iniciarGps() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        locationDenied = true;
        notifyListeners();
        return;
      }
      var permissao = await Geolocator.checkPermission();
      if (permissao == LocationPermission.denied) {
        permissao = await Geolocator.requestPermission();
      }
      if (permissao == LocationPermission.denied || permissao == LocationPermission.deniedForever) {
        locationDenied = true;
        notifyListeners();
        return;
      }
      locationDenied = false;

      _gps?.cancel();
      _gps = Geolocator.getPositionStream(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: 15),
      ).listen((p) {
        if (p.accuracy > 60) return; // leitura ruim demais: descarta
        position = Coords(p.latitude, p.longitude);
        posicaoReal = true;
        positionAccuracy = p.accuracy;
        notifyListeners();
        _mandarPosicao(p);
      }, onError: (_) {
        // Um erro isolado do stream nao para o motorista: o heartbeat
        // continua tentando enviar a ultima posicao boa conhecida.
      });
    } catch (_) {
      locationDenied = true;
      notifyListeners();
    }
  }

  void _pararGps() {
    _gps?.cancel();
    _gps = null;
  }

  /// Avisa o servidor da posicao atual.
  ///
  /// So em modo API real, e nunca deixa uma falha de rede derrubar o
  /// motorista da tela — o ApiClient ja tenta de novo sozinho uma vez;
  /// se ainda assim falhar, so registra e segue, porque a proxima leitura
  /// do GPS chega em poucos segundos de qualquer jeito.
  Future<void> _mandarPosicao(Position p) async {
    if (!AppConfig.hasApi) return;
    try {
      await _client.request('POST', '/drivers/me/location', body: {
        'latitude': p.latitude,
        'longitude': p.longitude,
        if (!p.heading.isNaN) 'heading': p.heading,
        if (!p.speed.isNaN) 'speed': p.speed,
        'accuracy': p.accuracy,
      });
    } catch (_) {
      // Sem sorte desta vez; a proxima leitura do GPS tenta de novo.
    }
  }

  /// Heartbeat: envia a posicao a cada poucos segundos e, estando online e
  /// livre, sorteia uma nova oferta (simulando o push do backend).
  void _startHeartbeat() {
    _heartbeat?.cancel();
    _heartbeat = Timer.periodic(AppConfig.locationInterval, (_) {
      if (!isOnline) return;

      // A posicao agora vem do GPS de verdade (_iniciarGps); em modo
      // demonstracao (sem GPS disponivel ou sem API), mantem o pequeno
      // passeio aleatorio para o mapa nao ficar parado na tela.
      if (!AppConfig.hasApi || locationDenied) {
        position = Coords(
          position.latitude + (DateTime.now().millisecond % 7 - 3) * 0.00008,
          position.longitude + (DateTime.now().microsecond % 7 - 3) * 0.00008,
        );
        notifyListeners();
      }

      if (activeRide == null && offer == null) {
        if (AppConfig.hasApi) {
          _buscarChamados();
        } else if (DateTime.now().second % 12 == 0) {
          receiveOffer();
        }
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

  /// Busca os chamados abertos para este motorista no servidor.
  Future<void> _buscarChamados() async {
    try {
      final lista = await _client.request('GET', '/driver/rides/offers') as List<dynamic>;
      if (lista.isEmpty || offer != null || activeRide != null) return;
      final o = lista.first as Map<String, dynamic>;
      final expira = DateTime.tryParse(o['expiresAt'] as String? ?? '');
      final restam = expira == null ? 30 : expira.difference(DateTime.now()).inSeconds;
      if (restam <= 1) return;

      final tarifa = (o['estimatedFareCents'] as num?)?.toInt() ?? 0;
      final comissao = (o['commissionPercent'] as num?)?.toDouble() ?? 20;
      offer = RideOffer(
        id: o['rideId'] as String,
        code: o['code'] as String? ?? '',
        passengerName: o['passengerName'] as String? ?? 'Passageiro',
        passengerRating: 5,
        pickupAddress: o['pickupAddress'] as String? ?? '',
        pickupCoords: Coords((o['pickupLat'] as num).toDouble(), (o['pickupLng'] as num).toDouble()),
        dropoffAddress: o['dropoffAddress'] as String? ?? '',
        dropoffCoords: Coords((o['dropoffLat'] as num).toDouble(), (o['dropoffLng'] as num).toDouble()),
        distanceToPickupMeters: (((o['distanceKm'] as num?)?.toDouble() ?? 0) * 1000).round(),
        tripDistanceMeters: (o['tripDistanceMeters'] as num?)?.toInt() ?? 0,
        durationSeconds: (o['tripDurationSeconds'] as num?)?.toInt() ?? 0,
        fareCents: tarifa,
        earningCents: (tarifa * (100 - comissao) / 100).round(),
        paymentMethod: 'Dinheiro',
        expiresInSeconds: restam,
      );
      offerSecondsLeft = restam;
      notifyListeners();

      _offerTimer?.cancel();
      _offerTimer = Timer.periodic(const Duration(seconds: 1), (_) {
        if (offer == null) return;
        offerSecondsLeft -= 1;
        if (offerSecondsLeft <= 0) {
          _clearOffer();
        }
        notifyListeners();
      });
    } catch (_) {
      // Rede instavel: a proxima volta do relogio tenta de novo.
    }
  }

  void _clearOffer() {
    CorridasNativo.pararAlarme();
    _offerTimer?.cancel();
    _offerTimer = null;
    offer = null;
    offerSecondsLeft = 0;
  }

  Future<void> acceptOffer() async {
    final current = offer;
    if (current == null) return;
    // Cala o alarme no toque, antes mesmo da resposta do servidor.
    CorridasNativo.pararAlarme();

    if (AppConfig.hasApi) {
      try {
        await _client.request('POST', '/driver/rides/${current.id}/accept');
        // O servidor so aceita "cheguei" depois de "a caminho". Como o app
        // nao tem um botao separado para isso, o aceite ja emenda os dois.
        await _client.request('POST', '/driver/rides/${current.id}/arriving',
            body: {'latitude': position.latitude, 'longitude': position.longitude});
      } on ApiException catch (e) {
        // Outro motorista levou, ou o prazo acabou.
        error = e.message;
        _clearOffer();
        notifyListeners();
        return;
      }
    }

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
    final atual = offer;
    if (AppConfig.hasApi && atual != null) {
      _client.request('POST', '/driver/rides/${atual.id}/decline').catchError((_) => null);
    }
    _clearOffer();
    notifyListeners();
  }

  // ------------------------------------------------------------------
  // Corrida
  // ------------------------------------------------------------------
  void markArrived() {
    final ride = activeRide;
    if (ride == null) return;
    if (AppConfig.hasApi) {
      _client.request('POST', '/driver/rides/${ride.offer.id}/arrived',
          body: {'latitude': position.latitude, 'longitude': position.longitude}).catchError((_) => null);
    }
    activeRide = ride.copyWith(phase: RidePhase.waitingPassenger);
    notifyListeners();
  }

  void startRide() {
    final ride = activeRide;
    if (ride == null) return;
    if (AppConfig.hasApi) {
      _client.request('POST', '/driver/rides/${ride.offer.id}/start',
          body: {'latitude': position.latitude, 'longitude': position.longitude}).catchError((_) => null);
    }
    activeRide = ride.copyWith(phase: RidePhase.inProgress);
    notifyListeners();
  }

  Future<void> finishRide() async {
    final ride = activeRide;
    if (ride == null) return;

    if (AppConfig.hasApi) {
      try {
        // Sem medicao propria, o servidor usa a estimativa do pedido e
        // calcula o valor pela bandeira gravada na corrida.
        final r = await _client.request('POST', '/driver/rides/${ride.offer.id}/finish', body: {})
            as Map<String, dynamic>;
        _ganhoReal = (r['driverEarningCents'] as num?)?.toInt();
      } on ApiException catch (e) {
        _avisar(e.message);
        return;
      }
    }
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

    _ganhoReal = null;

    activeRide = null;
    routeToPickup = [];
    tripRoute = [];
    await AppStorage.remove(AppStorage.activeRide);
    notifyListeners();
    // Ganho do dia e comissao descontada: busca do servidor, que e quem
    // fez a conta de verdade.
    unawaited(atualizarPainel());
  }

  // ------------------------------------------------------------------
  // Painel: atividades, carteira, historico, cadastro
  // ------------------------------------------------------------------

  /// Hoje + carteira + cadastro. Chamado ao abrir, ao voltar para a tela
  /// inicial e depois de cada corrida.
  Future<void> atualizarPainel() async {
    if (!AppConfig.hasApi || profile == null) return;
    await Future.wait([
      carregarHoje(),
      carregarCarteira(),
      sincronizarCadastro(),
    ]);
  }

  Future<ActivitySummary?> carregarAtividade(String periodo, int deslocamento) async {
    if (!AppConfig.hasApi) return null;
    try {
      final r = await _client.request('GET', '/driver/activity', query: {
        'period': periodo,
        'offset': '$deslocamento',
      }) as Map<String, dynamic>;
      final resumo = ActivitySummary.fromJson(r);
      if (periodo == 'day' && deslocamento == 0) {
        hoje = resumo;
        notifyListeners();
      }
      return resumo;
    } catch (_) {
      return null;
    }
  }

  Future<void> carregarHoje() async {
    await carregarAtividade('day', 0);
  }

  Future<void> carregarCarteira() async {
    if (!AppConfig.hasApi) return;
    try {
      final r = await _client.request('GET', '/driver/wallet') as Map<String, dynamic>;
      carteira = WalletInfo.fromJson(r);
      notifyListeners();
    } catch (_) {
      // Sem rede: fica o ultimo valor conhecido.
    }
  }

  /// Corridas do motorista, da mais nova para a mais antiga.
  Future<List<RideHistoryItem>?> carregarHistorico({int pagina = 1}) async {
    if (!AppConfig.hasApi) return const [];
    try {
      final r = await _client.request('GET', '/driver/rides/history', query: {
        'page': '$pagina',
        'pageSize': '30',
      }) as Map<String, dynamic>;
      return [
        for (final c in (r['items'] as List<dynamic>? ?? const []))
          RideHistoryItem.fromJson(c as Map<String, dynamic>),
      ];
    } catch (_) {
      return null;
    }
  }

  /// Traz do servidor o cadastro e o veiculo. Sem isto, quem reinstalava o
  /// aplicativo ficava sem veiculo no aparelho e nao conseguia se conectar.
  Future<void> sincronizarCadastro() async {
    if (!AppConfig.hasApi || profile == null) return;
    try {
      final d = await _client.request('GET', '/drivers/me') as Map<String, dynamic>;
      dadosCadastro = d;
      final nota = double.tryParse('${d['ratingAvg'] ?? ''}');
      final aceite = double.tryParse('${d['acceptanceRate'] ?? ''}');
      final u = d['user'] as Map<String, dynamic>?;
      profile = profile!.copyWith(
        name: (u?['name'] as String?)?.trim().isNotEmpty == true ? u!['name'] as String : null,
        cpf: d['cpf'] as String?,
        cnhNumber: d['cnhNumber'] as String?,
        cnhCategory: d['cnhCategory'] as String?,
        cnhExpiresAt: (d['cnhExpiresAt'] as String?)?.substring(0, 10),
        rating: nota,
        totalRides: (d['totalRides'] as num?)?.toInt(),
        acceptanceRate: aceite?.round(),
      );
      await _persistProfile();
    } catch (_) {
      // Ainda sem cadastro no servidor, ou sem rede.
    }
    try {
      final lista = await _client.request('GET', '/vehicles/me') as List<dynamic>;
      veiculos = [for (final v in lista) v as Map<String, dynamic>];
      final ativo = veiculos.where((v) => v['isActive'] != false).toList();
      if (ativo.isNotEmpty && vehicle == null) {
        final v = ativo.first;
        vehicle = VehicleInfo(
          brand: v['brand'] as String? ?? '',
          model: v['model'] as String? ?? '',
          year: (v['year'] as num?)?.toInt() ?? DateTime.now().year,
          color: v['color'] as String? ?? '',
          plate: v['plate'] as String? ?? '',
        );
      }
    } catch (_) {}
    notifyListeners();
  }

  /// WhatsApp e chave Pix da Central (vem junto da carteira; se ainda nao
  /// carregou, pergunta direto ao servidor).
  Future<CentralContact?> contatoCentral() async {
    final c = carteira?.central;
    if (c != null) return c;
    if (!AppConfig.hasApi) return null;
    try {
      final r = await _client.request('GET', '/driver/central') as Map<String, dynamic>;
      return CentralContact.fromJson(r);
    } catch (_) {
      return null;
    }
  }

  void alternarValores() {
    ocultarValores = !ocultarValores;
    notifyListeners();
  }

  Future<void> logout() async {
    _stopHeartbeat();
    _pararGps();
    _statusTimer?.cancel();
    await CorridasNativo.parar();
    await AppStorage.clearDriverSession();
    profile = null;
    vehicle = null;
    documents = DriverDemo.initialDocuments();
    activeRide = null;
    hoje = null;
    carteira = null;
    dadosCadastro = null;
    veiculos = const [];
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
    WidgetsBinding.instance.removeObserver(this);
    _heartbeat?.cancel();
    _offerTimer?.cancel();
    super.dispose();
  }
}
