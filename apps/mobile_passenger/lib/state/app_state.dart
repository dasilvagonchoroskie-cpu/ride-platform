import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';

import '../core/config/app_config.dart';
import '../core/api/api_client.dart';
import '../core/storage/app_storage.dart';
import '../core/utils/geo.dart';
import 'auth_state.dart';
import '../data/models/models.dart';
import '../core/medida.dart';

enum DataSource { api, demo, unknown }

class LocationResult {
  const LocationResult({
    required this.coords,
    required this.granted,
    required this.mocked,
    this.accuracyMeters,
  });

  final Coords coords;
  final bool granted;
  final bool mocked;

  /// Margem de erro da leitura, em metros. Nulo quando nao houve GPS.
  final double? accuracyMeters;
}

/// Estado global: modo de dados (API ou demonstracao), posicao e recentes.
class AppState extends ChangeNotifier {
  AppState({ApiClient? client}) : _client = client ?? ApiClient() {
    AuthState.aoTrocarDeConta.add(limparDaConta);
  }

  final ApiClient _client;

  bool bootstrapped = false;
  DataSource dataSource = DataSource.unknown;
  Coords coords = fallbackCoords;
  bool locationGranted = false;

  /// true quando o GPS deu a posicao AGORA (nesta abertura do app).
  bool localizacaoReal = false;

  /// Mapa primeiro (pedido do Evandro, 29/10/2026: "o mapa deve aparecer
  /// primeiro, com a ultima localizacao conhecida"). Enquanto o GPS acerta:
  /// [posicaoGuardada] = a ultima posicao deste aparelho (guardada aqui ou
  /// a do Android); [centroDaCidade] = so o centro da cidade do cadastro
  /// (primeira vez, GPS sem sinal): o mapa abre, mas o embarque espera o GPS.
  bool posicaoGuardada = false;
  bool centroDaCidade = false;

  /// Ja da para abrir o mapa.
  bool get temPosicao => localizacaoReal || posicaoGuardada || centroDaCidade;

  /// Margem de erro da melhor leitura ate agora.
  double? accuracyMeters;

  StreamSubscription<Position>? _vigia;
  List<String> recentPlaces = [];

  /// Destinos usados antes, com as coordenadas (para ir direto, sem buscar).
  List<PlaceSuggestion> destinosRecentes = [];

  bool get isDemo => dataSource != DataSource.api;

  Future<void> bootstrap() async {
    // 1) Abre na hora com a ultima posicao conhecida. Antes o app esperava
    //    o GPS (ate 15 s dentro de casa) com a tela "Localizando voce".
    final ultima = await _ultimaPosicaoConhecida();
    if (ultima != null) {
      coords = ultima;
      posicaoGuardada = true;
    }

    if (!AppConfig.hasApi) {
      dataSource = DataSource.demo;
    } else {
      // Com servidor configurado o aplicativo NUNCA vira demonstracao
      // sozinho. Antes, este teste tinha 4 s de limite: com o servidor
      // acordando (ate 1 minuto) ele falhava e o app virava demonstracao
      // calado — login de mentira, sem termos, mapa parado. Agora o teste
      // serve so para acordar o servidor enquanto a pessoa digita.
      dataSource = DataSource.api;
      unawaited(_client.healthCheck());
    }

    final stored = await AppStorage.read(AppStorage.recentPlaces);
    if (stored != null && stored.isNotEmpty) {
      recentPlaces = stored.split('|').where((p) => p.isNotEmpty).toList();
    }
    final destinos = await AppStorage.read(AppStorage.recentDestinations);
    if (destinos != null && destinos.isNotEmpty) {
      try {
        destinosRecentes = [
          for (final d in jsonDecode(destinos) as List<dynamic>)
            PlaceSuggestion.fromJson(d as Map<String, dynamic>),
        ];
      } catch (_) {
        destinosRecentes = [];
      }
    }

    bootstrapped = true;
    notifyListeners();

    // 2) O GPS acerta em segundo plano. A primeira leitura costuma vir torta
    //    (centenas de metros): o aparelho segue ouvindo e so troca quando
    //    chega leitura MELHOR — o embarque vai se acertando sozinho.
    unawaited(_lerGps());
  }

  /// Sem posicao nenhuma ainda (primeira vez no aparelho e GPS sem sinal):
  /// abre o mapa no centro da cidade do cadastro (vem do servidor).
  void usarCentroDaCidade(Coords centro) {
    if (temPosicao) return;
    coords = centro;
    centroDaCidade = true;
    notifyListeners();
  }

  /// Espera a posicao do GPS (antes de calcular a corrida) ate [limite].
  Future<bool> esperarGps(Duration limite) async {
    final fim = DateTime.now().add(limite);
    while (!localizacaoReal && DateTime.now().isBefore(fim)) {
      await Future<void>.delayed(const Duration(milliseconds: 300));
    }
    return localizacaoReal;
  }

  /// Ultima posicao conhecida: a guardada pelo app ou a do Android, a mais
  /// nova das duas. Nao liga o GPS (e instantaneo).
  Future<Coords?> _ultimaPosicaoConhecida() async {
    Coords? daqui;
    DateTime? quando;
    try {
      final raw = await AppStorage.read(AppStorage.ultimaPosicao);
      if (raw != null && raw.isNotEmpty) {
        final m = jsonDecode(raw) as Map<String, dynamic>;
        daqui = Coords((m['lat'] as num).toDouble(), (m['lng'] as num).toDouble());
        quando = DateTime.tryParse(m['em'] as String? ?? '');
      }
    } catch (_) {
      daqui = null;
    }
    try {
      final permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.whileInUse || permission == LocationPermission.always) {
        final p = await Geolocator.getLastKnownPosition().timeout(const Duration(seconds: 2));
        if (p != null && (daqui == null || quando == null || p.timestamp.isAfter(quando))) {
          return Coords(p.latitude, p.longitude);
        }
      }
    } catch (_) {
      // Sem a do Android: fica a guardada (ou nenhuma).
    }
    return daqui;
  }

  Future<void> _lerGps() async {
    final r = await _resolveLocation();
    locationGranted = r.granted;
    if (!r.mocked) _usarLeitura(r.coords, r.accuracyMeters);
    if (r.granted && _vigia == null) _vigiarPosicao();
    notifyListeners();
  }

  void _usarLeitura(Coords c, double? precisao) {
    coords = c;
    accuracyMeters = precisao;
    localizacaoReal = true;
    centroDaCidade = false;
    Medida.marcar('gps');
    _guardarPosicao(c);
  }

  DateTime? _guardadaEm;

  /// Guarda a posicao para a proxima abertura (no maximo 1 vez por minuto).
  void _guardarPosicao(Coords c) {
    final agora = DateTime.now();
    final antes = _guardadaEm;
    if (antes != null && agora.difference(antes) < const Duration(minutes: 1)) return;
    _guardadaEm = agora;
    unawaited(AppStorage.write(
      AppStorage.ultimaPosicao,
      jsonEncode({'lat': c.latitude, 'lng': c.longitude, 'em': agora.toIso8601String()}),
    ));
  }

  void forceDemo() {
    if (dataSource == DataSource.demo) return;
    dataSource = DataSource.demo;
    notifyListeners();
  }

  /// Saiu da conta (ou entrou com outra): destinos recentes sao da pessoa.
  Future<void> limparDaConta() async {
    recentPlaces = [];
    destinosRecentes = [];
    await AppStorage.remove(AppStorage.recentPlaces);
    await AppStorage.remove(AppStorage.recentDestinations);
    // A posicao guardada e da pessoa que estava usando o celular.
    await AppStorage.remove(AppStorage.ultimaPosicao);
    _guardadaEm = null;
    notifyListeners();
  }

  Future<void> addDestinoRecente(PlaceSuggestion lugar) async {
    destinosRecentes = [
      lugar,
      ...destinosRecentes.where((d) => d.address != lugar.address || d.detail != lugar.detail),
    ].take(8).toList();
    await AppStorage.write(
      AppStorage.recentDestinations,
      jsonEncode([for (final d in destinosRecentes) d.toJson()]),
    );
    notifyListeners();
  }

  Future<void> addRecentPlace(String address) async {
    recentPlaces = [address, ...recentPlaces.where((p) => p != address)].take(6).toList();
    await AppStorage.write(AppStorage.recentPlaces, recentPlaces.join('|'));
    notifyListeners();
  }

  /// Chamado pela tela de Autorizacoes assim que a localizacao e o GPS
  /// ficam liberados — e pelo botao "Tentar de novo".
  Future<void> atualizarLocalizacao() async {
    if (localizacaoReal) return;
    // Acabou de liberar a localizacao: a ultima posicao do Android ja abre o mapa.
    if (!posicaoGuardada) {
      final ultima = await _ultimaPosicaoConhecida();
      if (ultima != null && !localizacaoReal) {
        coords = ultima;
        posicaoGuardada = true;
        notifyListeners();
      }
    }
    await _lerGps();
  }

  Future<LocationResult> _resolveLocation() async {
    try {
      // So CONFERE. Quem pede e a tela de Autorizacoes, na primeira
      // abertura, explicando o porque — nao um pedido solto na abertura.
      final permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        return const LocationResult(coords: fallbackCoords, granted: false, mocked: true);
      }
      if (!await Geolocator.isLocationServiceEnabled()) {
        return const LocationResult(coords: fallbackCoords, granted: false, mocked: true);
      }
      // Com teto de tempo: dentro de casa o GPS pode demorar muito. A ultima
      // posicao conhecida ja abriu o mapa; aqui so vale leitura nova. Sem
      // sinal em 15 s, o vigia continua ouvindo e acerta depois.
      Position? position;
      try {
        position = await Geolocator.getCurrentPosition().timeout(const Duration(seconds: 15));
      } catch (_) {
        position = null;
      }
      if (position == null) {
        return const LocationResult(coords: fallbackCoords, granted: true, mocked: true);
      }
      return LocationResult(
        coords: Coords(position.latitude, position.longitude),
        granted: true,
        mocked: false,
        accuracyMeters: position.accuracy,
      );
    } catch (_) {
      return const LocationResult(coords: fallbackCoords, granted: false, mocked: true);
    }
  }

  void _vigiarPosicao() {
    _vigia?.cancel();
    try {
      _vigia = Geolocator.getPositionStream(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.best,
          distanceFilter: 5,
        ),
      ).listen((position) {
        final atual = accuracyMeters;
        // So aceita a leitura nova se ela for mais precisa que a que ja
        // temos (a primeira do GPS sempre entra).
        final melhorou = !localizacaoReal || atual == null || position.accuracy <= atual;
        if (!melhorou) return;

        _usarLeitura(Coords(position.latitude, position.longitude), position.accuracy);
        notifyListeners();
      }, onError: (_) {});
    } catch (_) {
      // Sem GPS continuo o aplicativo segue com a leitura unica.
    }
  }

  @override
  void dispose() {
    AuthState.aoTrocarDeConta.remove(limparDaConta);
    _vigia?.cancel();
    super.dispose();
  }
}
