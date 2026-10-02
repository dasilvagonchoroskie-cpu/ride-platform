import 'dart:async';
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

  /// Sem servidor configurado: corrida de demonstracao no aparelho.
  bool get modoDemo => _repository.isDemo;

  /// Ao sair da conta: nada da corrida desta pessoa fica para a proxima.
  Future<void> limpar() async {
    _pararDeAcompanhar();
    activeRide = null;
    history = [];
    quote = null;
    driverRoute = [];
    tripRoute = [];
    await AppStorage.remove(AppStorage.activeRide);
    notifyListeners();
  }
  String? error;

  /// Popula os carros visiveis no mapa da tela inicial.
  Future<void> refreshNearby(Coords origin) async {
    nearbyDrivers = await _repository.nearbyDrivers(origin);
    notifyListeners();
  }

  Future<List<PlaceSuggestion>> searchPlaces(String texto, Coords origin) =>
      _repository.searchPlaces(texto, origin);

  Future<PlaceSuggestion?> addressOf(Coords point) => _repository.addressOf(point);

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
    String paymentType = 'CASH',
  }) async {
    final ride = await _repository.createRide(
      origin: origin,
      destination: destination,
      pickupAddress: pickupAddress,
      dropoffAddress: dropoffAddress,
      paymentMethod: paymentMethod,
      paymentType: paymentType,
    );

    activeRide = ride;
    driverRoute = [];
    tripRoute = [];
    await _persist();
    notifyListeners();
    _acompanhar();

    return ride;
  }

  // ------------------------------------------------------------------
  // Acompanhamento de verdade: o aplicativo pergunta ao servidor a cada
  // poucos segundos. Antes a corrida era SIMULADA no aparelho: um
  // motorista inventado "aceitava" em 3 segundos, o passageiro podia
  // "finalizar" a viagem sozinho e o cancelamento nao chegava ao servidor.
  // ------------------------------------------------------------------
  Timer? _vigia;
  bool _consultando = false;

  /// Aviso para a tela quando a corrida termina sem viagem.
  String? avisoEncerramento;

  void _acompanhar() {
    _vigia?.cancel();
    if (_repository.isDemo) return;
    _vigia = Timer.periodic(const Duration(seconds: 4), (_) => atualizarCorrida());
  }

  void _pararDeAcompanhar() {
    _vigia?.cancel();
    _vigia = null;
  }

  /// Uma consulta ao servidor sobre a corrida aberta.
  Future<void> atualizarCorrida() async {
    final atual = activeRide;
    if (atual == null || _consultando || _repository.isDemo) return;
    _consultando = true;
    try {
      final nova = await _repository.detalhe(atual.id);
      // Enquanto esperava a resposta, a pessoa pode ter cancelado.
      if (activeRide?.id != atual.id) return;
      if (nova.status.encerradaSemViagem) {
        await _encerrarSemViagem(nova);
        return;
      }
      activeRide = nova;
      final carro = nova.driver;
      driverRoute = carro != null && carro.posicaoReal && nova.status != RideStatus.inProgress
          ? [carro.position, nova.pickup.coords]
          : [];
      if (nova.status == RideStatus.completed) _pararDeAcompanhar();
      await _persist();
      notifyListeners();
    } on ApiException catch (e) {
      // Corrida apagada ou de outra conta: nao adianta insistir.
      if (e.statusCode == 404 || e.statusCode == 403) {
        _pararDeAcompanhar();
        activeRide = null;
        await AppStorage.remove(AppStorage.activeRide);
        notifyListeners();
      }
    } catch (_) {
      // Sem rede nesta volta: tenta de novo na proxima.
    } finally {
      _consultando = false;
    }
  }

  Future<void> _encerrarSemViagem(Ride ride) async {
    _pararDeAcompanhar();
    avisoEncerramento = switch (ride.status) {
      RideStatus.cancelledByDriver => 'O motorista cancelou a corrida. Você pode pedir outra.',
      RideStatus.cancelledBySystem => 'A Central cancelou a corrida.',
      RideStatus.expired => 'Nenhum motorista disponível agora. Tente de novo em alguns minutos.',
      _ => null,
    };
    if (avisoEncerramento != null) avisar(avisoEncerramento!);
    history = [ride, ...history.where((h) => h.id != ride.id)];
    activeRide = null;
    driverRoute = [];
    tripRoute = [];
    await AppStorage.remove(AppStorage.activeRide);
    notifyListeners();
  }

  /// So no modo demonstracao (sem servidor): avanca a corrida de mentira.
  void advanceRide() {
    final ride = activeRide;
    if (ride == null || !_repository.isDemo) return;

    switch (ride.status) {
      case RideStatus.searching:
        final driver = DemoEngine.assignDriver(ride);
        driverRoute = buildRoute(driver.position, ride.pickup.coords, steps: 30);
        activeRide = ride.copyWith(driver: driver, status: RideStatus.driverArriving);
        break;
      case RideStatus.driverAssigned:
      case RideStatus.driverArriving:
      case RideStatus.driverWaiting:
        tripRoute = buildRoute(ride.pickup.coords, ride.dropoff.coords, steps: 40);
        activeRide = ride.copyWith(status: RideStatus.inProgress);
        break;
      case RideStatus.inProgress:
        activeRide = ride.copyWith(
          status: RideStatus.completed,
          finishedAt: DateTime.now().toIso8601String(),
        );
        break;
      default:
        break;
    }

    notifyListeners();
  }

  /// Fecha o recibo. Com [rating], manda a avaliacao ao servidor.
  Future<void> completeRide(int? rating, {List<String> tags = const []}) async {
    final ride = activeRide;
    if (ride == null) return;

    if (rating != null && !_repository.isDemo) {
      try {
        await _repository.avaliar(ride.id, rating, tags);
      } on ApiException catch (e) {
        avisar(e.message);
      } catch (_) {
        avisar('Não foi possível enviar a avaliação agora.');
      }
    }

    final finished = ride.copyWith(
      status: RideStatus.completed,
      finishedAt: ride.finishedAt ?? DateTime.now().toIso8601String(),
      rating: rating,
    );

    _pararDeAcompanhar();
    history = [finished, ...history.where((item) => item.id != finished.id)];
    activeRide = null;
    driverRoute = [];
    tripRoute = [];
    await AppStorage.remove(AppStorage.activeRide);
    notifyListeners();
  }

  /// Cancela no servidor. Devolve falso se nao deu (a corrida continua).
  Future<bool> cancelRide({String motivo = 'Cancelada pelo passageiro'}) async {
    final ride = activeRide;
    if (ride == null) return true;

    if (!_repository.isDemo) {
      try {
        final taxa = await _repository.cancelar(ride.id, motivo);
        if (taxa > 0) {
          avisar('Corrida cancelada. Taxa de cancelamento de ${(taxa / 100).toStringAsFixed(2).replaceAll('.', ',')} reais, paga ao motorista.');
        }
      } on ApiException {
        // O motivo ja aparece na tela. Confere a situacao de verdade.
        await atualizarCorrida();
        return false;
      } catch (_) {
        avisar('Sem conexão com o servidor. A corrida NÃO foi cancelada.');
        return false;
      }
    }

    _pararDeAcompanhar();
    history = [ride.copyWith(status: RideStatus.cancelledByPassenger), ...history.where((h) => h.id != ride.id)];
    activeRide = null;
    driverRoute = [];
    tripRoute = [];
    await AppStorage.remove(AppStorage.activeRide);
    notifyListeners();
    return true;
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
    if (raw != null && raw.isNotEmpty) {
      try {
        activeRide = Ride.fromJson(jsonDecode(raw) as Map<String, dynamic>);
        notifyListeners();
      } catch (_) {
        await AppStorage.remove(AppStorage.activeRide);
      }
    }
    await sincronizarComServidor();
  }

  /// Ao abrir o aplicativo (ou depois do login): a corrida aberta e a do
  /// servidor. A guardada no aparelho pode estar velha.
  Future<void> sincronizarComServidor() async {
    if (_repository.isDemo) return;
    try {
      final r = await _repository.atual();
      if (r == null) {
        if (activeRide != null && activeRide!.status != RideStatus.completed) {
          // Terminou enquanto o aplicativo estava fechado: confere como.
          final antiga = activeRide!;
          try {
            final fim = await _repository.detalhe(antiga.id);
            if (fim.status == RideStatus.completed) {
              activeRide = fim;
              await _persist();
              notifyListeners();
              return;
            }
            if (fim.status.encerradaSemViagem) {
              await _encerrarSemViagem(fim);
              return;
            }
          } catch (_) {}
          activeRide = null;
          await AppStorage.remove(AppStorage.activeRide);
          notifyListeners();
        }
        return;
      }
      activeRide = r;
      await _persist();
      notifyListeners();
      _acompanhar();
    } catch (_) {
      // Sem rede ou sem login: segue com o que tem; tenta de novo depois.
      if (activeRide != null && activeRide!.status.isActive) _acompanhar();
    }
  }

  @override
  void dispose() {
    _pararDeAcompanhar();
    super.dispose();
  }

  Future<void> _persist() async {
    final ride = activeRide;
    if (ride == null) return;
    await AppStorage.write(AppStorage.activeRide, jsonEncode(ride.toJson()));
  }
}
