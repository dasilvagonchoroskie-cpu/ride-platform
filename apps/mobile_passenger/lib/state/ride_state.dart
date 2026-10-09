import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import '../core/storage/app_storage.dart';
import '../core/vigia_corrida.dart';
import '../core/utils/geo.dart';
import '../data/demo/demo_engine.dart';
import '../data/models/models.dart';
import '../data/repositories/ride_repository.dart';
import '../core/api/api_client.dart';
import '../core/avisos.dart';
import 'auth_state.dart';

/// Ciclo de vida da corrida: estimativa, pareamento, viagem, recibo e historico.
class RideState extends ChangeNotifier {
  RideState({RideRepository? repository}) : _repository = repository ?? RideRepository() {
    AuthState.aoTrocarDeConta.add(limpar);
  }

  final RideRepository _repository;

  Ride? activeRide;
  List<Coords> driverRoute = [];
  List<Coords> tripRoute = [];

  /// Caminho pelas ruas na tela de confirmar (embarque -> destino).
  List<Coords> rotaPrevia = [];
  List<Ride> history = [];
  /// O orcamento da viagem. Um so, porque a modalidade e unica.
  RideQuote? quote;
  List<DriverInfo> nearbyDrivers = [];
  bool estimating = false;

  /// Sem servidor configurado: corrida de demonstracao no aparelho.
  bool get modoDemo => _repository.isDemo;

  // ------------------------------------------------------------------
  // Corrida agendada (botao do calendario ao lado de "Buscar destino",
  // modelo Du Goias). De 30 minutos a 7 dias a frente; ate 3 por pessoa.
  // O servidor comeca a procurar motorista 10 minutos antes.
  // ------------------------------------------------------------------

  /// Horario escolhido para a proxima corrida. Nulo = chamar agora.
  DateTime? agendarPara;

  /// Corridas agendadas que ainda nao comecaram.
  List<Ride> agendadas = [];

  /// Escolhe (ou tira, com null) o horario da proxima corrida.
  void escolherHorario(DateTime? quando) {
    agendarPara = quando;
    notifyListeners();
  }

  /// Motivo para nao aceitar o horario (ou null se esta bom).
  static String? horarioInvalido(DateTime quando, [DateTime? agora]) {
    final minutos = quando.difference(agora ?? DateTime.now()).inMinutes;
    if (minutos < 30) return 'Agende com pelo menos 30 minutos de antecedência.';
    if (minutos > 7 * 24 * 60) return 'Dá para agendar até 7 dias à frente.';
    return null;
  }

  Future<void> carregarAgendadas() async {
    if (_repository.isDemo) return;
    try {
      agendadas = await _repository.agendadas();
      notifyListeners();
    } catch (_) {
      // Sem rede: fica a lista que ja tinha.
    }
  }

  /// Cancela a agendada (antes de comecar a procurar, sem multa).
  Future<bool> cancelarAgendada(Ride r) async {
    try {
      await _repository.cancelar(r.id, 'Agendamento cancelado pelo passageiro');
      agendadas = agendadas.where((a) => a.id != r.id).toList();
      notifyListeners();
      avisar('Agendamento cancelado.');
      return true;
    } on ApiException catch (e) {
      avisar(e.message);
      return false;
    } catch (_) {
      avisar('Sem conexão. O agendamento não foi cancelado.');
      return false;
    }
  }

  /// Chamado de tempos em tempos na tela Inicio: perto do horario de uma
  /// agendada, pergunta ao servidor se ela ja virou corrida (procurando ou
  /// com motorista) para o aplicativo abrir a tela da corrida sozinho.
  Future<void> conferirAgendadas([DateTime? agora]) async {
    if (activeRide != null || agendadas.isEmpty) return;
    final limite = (agora ?? DateTime.now()).add(const Duration(minutes: 15));
    final perto = agendadas.any((a) {
      final q = DateTime.tryParse(a.agendadaPara ?? '');
      return q != null && q.isBefore(limite);
    });
    if (!perto) return;
    await sincronizarComServidor();
    if (activeRide != null) await carregarAgendadas();
  }

  /// Ao sair da conta: nada da corrida desta pessoa fica para a proxima.
  Future<void> limpar() async {
    _pararDeAcompanhar();
    unawaited(VigiaCorrida.parar());
    pararSos();
    agendadas = [];
    agendarPara = null;
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

  /// Cupom escolhido para a proxima corrida (tela de cupons ou confirmacao).
  String? cupomCodigo;

  /// Ultimo pedido de preco, para refazer quando o cupom muda.
  (Coords, Coords, String, String)? _ultimaCotacao;

  /// Login do passageiro para a tela de conversa (chat).
  ApiClient get api => _repository.api;

  Future<RideQuote?> estimate(
    Coords origin,
    Coords destination, {
    String pickupAddress = 'Minha localização atual',
    String dropoffAddress = 'Destino escolhido',
  }) async {
    _ultimaCotacao = (origin, destination, pickupAddress, dropoffAddress);
    estimating = true;
    notifyListeners();
    try {
      final result = await _repository.estimate(origin, destination,
          pickupAddress: pickupAddress,
          dropoffAddress: dropoffAddress,
          couponCode: cupomCodigo,
          // Agendada paga a bandeira do horario da viagem (23h = noturna).
          agendadaPara: agendarPara);
      quote = result.quote;
      unawaited(_buscarRotaPrevia(origin, destination));
      return result.quote;
    } on ApiException catch (e) {
      avisar(e.message);
      if (cupomCodigo != null) {
        // Cupom recusado (vencido, valor minimo...): tira e mostra o preco normal.
        cupomCodigo = null;
        estimating = false;
        return estimate(origin, destination, pickupAddress: pickupAddress, dropoffAddress: dropoffAddress);
      }
      return null;
    } catch (_) {
      avisar('Sem conexão com o servidor. Confira a internet e tente de novo.');
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
      couponCode: cupomCodigo,
      agendadaPara: agendarPara,
    );

    cupomCodigo = null;
    if (ride.status == RideStatus.scheduled) {
      // Agendada nao abre a tela de procura: fica na lista ate o horario.
      agendarPara = null;
      agendadas = [...agendadas, ride];
      notifyListeners();
      return ride;
    }
    activeRide = ride;
    driverRoute = [];
    tripRoute = [];
    await _persist();
    notifyListeners();
    _acompanhar();
    unawaited(VigiaCorrida.iniciar(ride.id));

    return ride;
  }

  /// Escolhe (ou tira, com null) o cupom. Na tela de confirmacao o preco
  /// e refeito na hora ([refazerPreco]); na tela de cupons fica guardado
  /// para a proxima corrida.
  Future<void> aplicarCupom(String? codigo, {bool refazerPreco = false}) async {
    final c = codigo?.trim().toUpperCase();
    cupomCodigo = (c == null || c.isEmpty) ? null : c;
    notifyListeners();
    final u = _ultimaCotacao;
    if (refazerPreco && u != null) await estimate(u.$1, u.$2, pickupAddress: u.$3, dropoffAddress: u.$4);
  }

  /// Cupons que o passageiro ainda pode usar.
  Future<List<CupomDisponivel>> cupons() => _repository.cupons();

  Future<List<MotoristaFavorito>> favoritos() => _repository.favoritos();
  Future<List<MotoristaBloqueado>> bloqueados() => _repository.bloqueados();
  Future<void> favoritarPorId(String driverId, {required bool sim}) => _repository.favoritar(driverId, sim: sim);
  Future<void> bloquearPorId(String driverId, {required bool sim}) => _repository.bloquear(driverId, sim: sim);

  /// Favorita (ou tira) o motorista da corrida atual.
  Future<void> favoritarMotorista({required bool sim}) async {
    final r = activeRide;
    final d = r?.driver;
    if (r == null || d == null) return;
    try {
      await _repository.favoritar(d.id, sim: sim);
      activeRide = r.copyWith(favorito: sim, bloqueado: sim ? false : r.bloqueado);
      notifyListeners();
      avisar(sim ? '${d.name.split(' ').first} está nos seus favoritos: ele recebe suas corridas primeiro.' : 'Motorista tirado dos favoritos.');
    } on ApiException catch (e) {
      avisar(e.message);
    } catch (_) {
      avisar('Sem conexão. Tente de novo.');
    }
  }

  /// Bloqueia o motorista da corrida atual: ele nao recebe mais suas corridas.
  Future<void> bloquearMotorista({required bool sim}) async {
    final r = activeRide;
    final d = r?.driver;
    if (r == null || d == null) return;
    try {
      await _repository.bloquear(d.id, sim: sim);
      activeRide = r.copyWith(bloqueado: sim, favorito: sim ? false : r.favorito);
      notifyListeners();
      avisar(sim
          ? 'Motorista bloqueado: ele não recebe mais suas corridas. Esta corrida continua; se quiser, cancele.'
          : 'Motorista desbloqueado.');
    } on ApiException catch (e) {
      avisar(e.message);
    } catch (_) {
      avisar('Sem conexão. Tente de novo.');
    }
  }

  /// Abriu a conversa: as mensagens ficam lidas.
  void mensagensLidas() {
    final r = activeRide;
    if (r == null || r.mensagensNaoLidas == 0) return;
    activeRide = r.copyWith(mensagensNaoLidas: 0);
    notifyListeners();
  }

  // ------------------------------------------------------------------
  // Rota pelas ruas (Evandro, 08/10/2026: "tem que mostrar a rota pela
  // estrada certa, nao aquele risco que parece rota de aviao").
  // ------------------------------------------------------------------

  /// Caminho pelas ruas (servidor -> OpenStreetMap). null = sem rota agora.
  Future<List<Coords>?> rotaPelaRua(Coords de, Coords para) async {
    if (_repository.isDemo) return buildRoute(de, para, steps: 30);
    try {
      final r = await _repository.api.request('GET', '/geo/rota', query: {
        'deLat': de.latitude.toStringAsFixed(6),
        'deLng': de.longitude.toStringAsFixed(6),
        'paraLat': para.latitude.toStringAsFixed(6),
        'paraLng': para.longitude.toStringAsFixed(6),
      });
      if (r is Map && r['porRua'] != true) return null;
      final pontos = pontosDaRota(r);
      return pontos.length >= 2 ? pontos : null;
    } catch (_) {
      return null;
    }
  }

  Future<void> _buscarRotaPrevia(Coords de, Coords para) async {
    rotaPrevia = [];
    final r = await rotaPelaRua(de, para);
    final u = _ultimaCotacao;
    if (r == null || u == null || u.$1 != de || u.$2 != para) return;
    rotaPrevia = r;
    notifyListeners();
  }

  DateTime _rotaEm = DateTime.fromMillisecondsSinceEpoch(0);
  String? _rotaFase;

  /// Carro vindo: rota do carro ao embarque. Em viagem: do carro ao destino.
  /// Refaz quando o carro sai do caminho (ou a cada 90 s).
  Future<void> _atualizarRotas(Ride r) async {
    final carro = r.driver;
    final emViagem = r.status == RideStatus.inProgress;
    final vindo = r.status == RideStatus.driverAssigned || r.status == RideStatus.driverArriving;
    if (carro == null || !carro.posicaoReal || (!emViagem && !vindo)) {
      if (!emViagem && driverRoute.isNotEmpty) {
        driverRoute = [];
        notifyListeners();
      }
      return;
    }
    final fase = emViagem ? 'viagem' : 'vindo';
    final rota = emViagem ? tripRoute : driverRoute;
    final agora = DateTime.now();
    final segundos = agora.difference(_rotaEm).inSeconds;
    final saiu = rota.length < 2 || trechoMaisPerto(carro.position, rota).$2 > 150;
    if (fase == _rotaFase && (segundos < 20 || (!saiu && segundos < 90))) return;
    _rotaEm = agora;
    _rotaFase = fase;
    final pontos = await rotaPelaRua(carro.position, emViagem ? r.dropoff.coords : r.pickup.coords);
    if (pontos == null || activeRide?.id != r.id) return;
    if (emViagem) {
      tripRoute = pontos;
      driverRoute = [];
    } else {
      driverRoute = pontos;
    }
    notifyListeners();
  }

  // ------------------------------------------------------------------
  // SOS do passageiro: manda a posicao para a Central (alarme la) e repete
  // a cada 10 s ate a Central encerrar o alerta.
  // ------------------------------------------------------------------

  String? sosId;
  Timer? _sosTimer;
  Coords Function()? _posicaoSos;

  Future<bool> acionarSos(Coords Function() posicao) async {
    if (_repository.isDemo) {
      avisar('Modo demonstração: o SOS não foi enviado.');
      return false;
    }
    _posicaoSos = posicao;
    final p = posicao();
    try {
      final r = await _repository.api.request('POST', '/safety/sos', body: {
        'latitude': p.latitude,
        'longitude': p.longitude,
        if (activeRide != null) 'rideId': activeRide!.id,
      }) as Map<String, dynamic>;
      sosId = r['id'] as String?;
      _sosTimer?.cancel();
      _sosTimer = Timer.periodic(const Duration(seconds: 10), (_) => _enviarPosicaoSos());
      unawaited(HapticFeedback.heavyImpact());
      notifyListeners();
      return sosId != null;
    } on ApiException catch (e) {
      avisar(e.message);
      return false;
    } catch (_) {
      avisar('Sem conexão. O SOS não foi enviado: ligue 190.');
      return false;
    }
  }

  Future<void> _enviarPosicaoSos() async {
    final id = sosId;
    final posicao = _posicaoSos;
    if (id == null || posicao == null) return;
    final p = posicao();
    try {
      final r = await _repository.api.request('POST', '/safety/sos/$id/location', body: {
        'latitude': p.latitude,
        'longitude': p.longitude,
      }) as Map<String, dynamic>?;
      if (r?['resolved'] == true) {
        pararSos();
        avisar('A Central encerrou o alerta de SOS.');
      }
    } catch (_) {
      // Sem rede agora: tenta de novo em 10 s.
    }
  }

  void pararSos() {
    _sosTimer?.cancel();
    _sosTimer = null;
    sosId = null;
    notifyListeners();
  }

  // ------------------------------------------------------------------
  // Contatos de emergencia (ate 3). Aparecem para a Central no alerta de
  // SOS, e a tela de SOS tem um botao para avisar cada um pelo WhatsApp.
  // ------------------------------------------------------------------

  Future<List<ContatoEmergencia>> contatosEmergencia() async {
    final d = await _repository.api.request('GET', '/users/me/contatos-emergencia') as Map<String, dynamic>;
    return [
      for (final c in (d['items'] as List? ?? const []))
        ContatoEmergencia.fromJson(c as Map<String, dynamic>),
    ];
  }

  Future<List<ContatoEmergencia>> gravarContatos(List<ContatoEmergencia> contatos) async {
    final d = await _repository.api.request('PUT', '/users/me/contatos-emergencia', body: {
      'contatos': [for (final c in contatos) c.toJson()],
    }) as Map<String, dynamic>;
    return [
      for (final c in (d['items'] as List? ?? const []))
        ContatoEmergencia.fromJson(c as Map<String, dynamic>),
    ];
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
      if (nova.mensagensNaoLidas > atual.mensagensNaoLidas) {
        unawaited(HapticFeedback.heavyImpact());
        avisar('Nova mensagem do motorista. Toque em "chat" para ler.');
      }
      activeRide = nova;
      unawaited(_atualizarRotas(nova));
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
    unawaited(VigiaCorrida.parar());
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
    unawaited(VigiaCorrida.parar());
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
    unawaited(VigiaCorrida.parar());
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
    // O servidor e quem sabe as corridas DESTA conta: a lista e a dele (antes
    // misturava com o que ja estava na memoria — inclusive de outra conta).
    history = loaded;
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
      if (r.status.isActive) unawaited(VigiaCorrida.iniciar(r.id));
    } catch (_) {
      // Sem rede ou sem login: segue com o que tem; tenta de novo depois.
      if (activeRide != null && activeRide!.status.isActive) _acompanhar();
    }
  }

  @override
  void dispose() {
    AuthState.aoTrocarDeConta.remove(limpar);
    _pararDeAcompanhar();
    super.dispose();
  }

  Future<void> _persist() async {
    final ride = activeRide;
    if (ride == null) return;
    await AppStorage.write(AppStorage.activeRide, jsonEncode(ride.toJson()));
  }
}
