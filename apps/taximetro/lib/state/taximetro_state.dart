import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/constantes.dart';
import '../core/licenca.dart';
import '../models/aparencia.dart';
import '../models/config.dart';
import '../models/estado_corrida.dart';
import '../models/registro_corrida.dart';

enum FiltroPeriodo { hoje, semana, mes, personalizado }

const Map<FiltroPeriodo, String> rotuloPeriodo = {
  FiltroPeriodo.hoje: 'hoje',
  FiltroPeriodo.semana: 'ultimos 7 dias',
  FiltroPeriodo.mes: 'este mes',
  FiltroPeriodo.personalizado: 'periodo escolhido',
};

const Map<String, String> rotuloPagamento = {
  'dinheiro': 'Dinheiro',
  'pix': 'Pix',
  'cartao': 'Cartao',
  'outro': 'Outro',
};

/// Estado central do taximetro: portado das funcoes do aplicativo original.
class TaximetroState extends ChangeNotifier {
  // ---- Configuracao e aparencia ----
  ConfigTaxi config = ConfigTaxi();
  Aparencia aparencia = Aparencia();

  // ---- Corrida ----
  EstadoCorrida estado = EstadoCorrida();
  bool corridaAtiva = false;
  bool licenciado = false;
  String? codigoAparelho;
  String? erroLicenca;

  // ---- Historico ----
  List<RegistroCorrida> historico = [];
  FiltroPeriodo filtroPeriodoAtual = FiltroPeriodo.hoje;
  DateTime? filtroDe;
  DateTime? filtroAte;

  // ---- GPS ----
  double? velocidadeAtualKmh;
  Position? ultimaPosicao;
  String statusTexto = 'Localizando...';
  String statusClasse = 'aguardando';
  String? avisoGps;
  bool pronto = false;

  // ---- Internos do calculo (identicos ao original) ----
  int? _ultimoInstanteMs;
  Timer? _relogioCorrida;
  StreamSubscription<Position>? _posicaoSub;

  double _bufferDistanciaM = 0;

  /// Ancora: ponto de referencia do trecho acumulado.
  Position? _ancora;

  bool get emHorarioNoturno => config.emHorarioNoturno;
  double get bandeiradaAtual => config.bandeiradaAtual;

  // ==================================================================
  // Ciclo de vida
  // ==================================================================
  Future<void> iniciar() async {
    final prefs = await SharedPreferences.getInstance();

    final rawConfig = prefs.getString(Constantes.chaveConfig);
    if (rawConfig != null && rawConfig.isNotEmpty) {
      try {
        config = ConfigTaxi.fromJson(jsonDecode(rawConfig) as Map<String, dynamic>);
      } catch (_) {
        config = ConfigTaxi();
      }
    }

    final rawAparencia = prefs.getString(Constantes.chaveAparencia);
    if (rawAparencia != null && rawAparencia.isNotEmpty) {
      try {
        aparencia = Aparencia.fromJson(jsonDecode(rawAparencia) as Map<String, dynamic>);
      } catch (_) {
        aparencia = Aparencia();
      }
    }

    final rawHistorico = prefs.getString(Constantes.chaveHistorico);
    if (rawHistorico != null && rawHistorico.isNotEmpty) {
      try {
        historico = (jsonDecode(rawHistorico) as List<dynamic>)
            .map((item) => RegistroCorrida.fromJson(item as Map<String, dynamic>))
            .toList();
      } catch (_) {
        historico = [];
      }
    }

    licenciado = prefs.getBool('${Constantes.chaveLicenca}.ativa') ?? false;

    await _carregarCodigoAparelho();
    pronto = true;
    notifyListeners();
  }

  Future<void> _carregarCodigoAparelho() async {
    final prefs = await SharedPreferences.getInstance();
    var bruto = prefs.getString('${Constantes.chaveLicenca}.aparelho');
    if (bruto == null || bruto.isEmpty) {
      bruto = _idBrutoDoAparelho();
      await prefs.setString('${Constantes.chaveLicenca}.aparelho', bruto);
    }
    codigoAparelho = Licenca.codigoDoAparelho(bruto);
  }

  /// Identificador bruto e estavel do aparelho.
  String _idBrutoDoAparelho() {
    final partes = <String>[
      Platform.operatingSystem,
      Platform.operatingSystemVersion,
      Platform.localHostname,
      DateTime.now().microsecondsSinceEpoch.toString(),
    ];
    return partes.join('|');
  }

  // ==================================================================
  // Persistencia
  // ==================================================================
  Future<void> gravarConfig() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(Constantes.chaveConfig, jsonEncode(config.toJson()));
  }

  Future<void> gravarAparencia() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(Constantes.chaveAparencia, jsonEncode(aparencia.toJson()));
    notifyListeners();
  }

  Future<void> _gravarHistorico() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      Constantes.chaveHistorico,
      jsonEncode(historico.map((r) => r.toJson()).toList()),
    );
  }

  // ==================================================================
  // Licenca
  // ==================================================================
  Future<bool> ativarLicenca(String chave) async {
    final codigo = codigoAparelho;
    if (codigo == null) return false;

    if (!Licenca.conferir(codigo, chave)) {
      erroLicenca = 'Chave invalida para este aparelho.';
      notifyListeners();
      return false;
    }

    erroLicenca = null;
    licenciado = true;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('${Constantes.chaveLicenca}.ativa', true);
    notifyListeners();
    return true;
  }

  Future<void> desativarEsteAparelho() async {
    licenciado = false;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('${Constantes.chaveLicenca}.ativa', false);
    notifyListeners();
  }

  // ==================================================================
  // Corrida
  // ==================================================================
  Future<bool> iniciarCorrida() async {
    final permissao = await _garantirPermissao();
    if (!permissao) {
      statusTexto = 'Permissao de localizacao negada';
      statusClasse = 'erro';
      notifyListeners();
      return false;
    }

    estado.reiniciar();
    _bufferDistanciaM = 0;
    _ultimoInstanteMs = null;
    _ancora = null;
    corridaAtiva = true;
    velocidadeAtualKmh = null;
    avisoGps = null;
    statusTexto = 'Corrida iniciada - aguardando GPS';
    statusClasse = 'ativo';

    ligarRelogioDaCorrida();
    await _iniciarRastreamento();
    notifyListeners();
    return true;
  }

  Future<void> cancelarCorrida() async {
    corridaAtiva = false;
    desligarRelogioDaCorrida();
    await _pararRastreamento();
    estado.reiniciar();
    velocidadeAtualKmh = null;
    statusTexto = 'Corrida cancelada';
    statusClasse = 'aguardando';
    notifyListeners();
  }

  Future<void> reiniciarCorrida() async {
    estado.reiniciar();
    _bufferDistanciaM = 0;
    _ultimoInstanteMs = null;
    _ancora = null;
    velocidadeAtualKmh = null;
    statusTexto = corridaAtiva ? 'Corrida reiniciada' : 'Pronto para iniciar';
    statusClasse = corridaAtiva ? 'ativo' : 'aguardando';
    notifyListeners();
  }

  /// Finaliza a corrida e grava no historico. Devolve o registro criado.
  Future<RegistroCorrida> finalizarCorrida({String formaPagamento = ''}) async {
    final registro = RegistroCorrida(
      data: DateTime.now(),
      valor: estado.valorTotal,
      distanciaKm: estado.distanciaTotalKm,
      tempoS: estado.tempoTotalS,
      bandeirada: bandeiradaAtual,
      valorDistancia: estado.distanciaTotalKm > estado.kmIncluidoUsado
          ? (estado.distanciaTotalKm - estado.kmIncluidoUsado) * config.taxaKm
          : 0,
      valorEspera: estado.valorEspera,
      tempoParadoS: estado.tempoParadoS,
      esperaInicialS: estado.esperaInicialS,
      kmIncluidoUsado: estado.kmIncluidoUsado,
      minutosIncluidoUsado: estado.minutosIncluidoUsado,
      trajeto: [trajetoOrigem, trajetoDestino].where((p) => p.trim().isNotEmpty).join(' -> '),
      formaPagamento: formaPagamento,
    );

    corridaAtiva = false;
    desligarRelogioDaCorrida();
    await _pararRastreamento();

    historico = [registro, ...historico];
    await _gravarHistorico();

    estado.reiniciar();
    _ultimoInstanteMs = null;
    _ancora = null;
    velocidadeAtualKmh = null;
    statusTexto = 'Corrida finalizada';
    statusClasse = 'aguardando';
    notifyListeners();

    return registro;
  }

  String trajetoAtual = '';
  String trajetoOrigem = '';
  String trajetoDestino = '';

  // ==================================================================
  // GPS
  // ==================================================================
  Future<bool> _garantirPermissao() async {
    if (!await Geolocator.isLocationServiceEnabled()) return false;

    var permissao = await Geolocator.checkPermission();
    if (permissao == LocationPermission.denied) {
      permissao = await Geolocator.requestPermission();
    }
    return permissao == LocationPermission.whileInUse ||
        permissao == LocationPermission.always;
  }

  Future<void> _iniciarRastreamento() async {
    await _pararRastreamento();

    const settings = LocationSettings(
      accuracy: LocationAccuracy.bestForNavigation,
      distanceFilter: 0,
    );

    _posicaoSub = Geolocator.getPositionStream(locationSettings: settings).listen(
      (posicao) {
        try {
          _medirPosicao(posicao);
        } catch (erro) {
          avisarFalhaNoGps(erro);
        }
      },
      onError: (Object erro) => avisarFalhaNoGps(erro),
    );
  }

  Future<void> _pararRastreamento() async {
    await _posicaoSub?.cancel();
    _posicaoSub = null;
  }

  void avisarFalhaNoGps(Object erro) {
    avisoGps = 'Deu problema ao ler a localizacao: '
        '${erro is Error ? erro.toString() : erro.toString()}. '
        'O tempo continua contando. Tire um print desta tela.';
    notifyListeners();
  }

  /// Processa uma nova posicao: aplica todos os filtros do original.
  void _medirPosicao(Position pos) {
    velocidadeAtualKmh = pos.speed >= 0 ? pos.speed * 3.6 : null;
    ultimaPosicao = pos;

    if (!corridaAtiva) {
      notifyListeners();
      return;
    }

    // Leitura com margem de erro ruim nao mede distancia.
    if (pos.accuracy > Constantes.precisaoMaximaM) {
      _contarTempoApenas();
      notifyListeners();
      return;
    }

    final anterior = _ancora;
    if (anterior == null) {
      _ancora = pos;
      _ultimoInstanteMs = DateTime.now().millisecondsSinceEpoch;
      statusTexto = 'Corrida em andamento';
      statusClasse = 'ativo';
      notifyListeners();
      return;
    }

    final metros = _haversineMetros(
      anterior.latitude,
      anterior.longitude,
      pos.latitude,
      pos.longitude,
    );

    final agoraMs = DateTime.now().millisecondsSinceEpoch;
    final segundos = _tempoDesdeAUltimaContagem(agoraMs);

    // Velocidade impossivel: descarta o trecho.
    if (segundos != null && segundos > 0) {
      final velocidadeMs = metros / segundos;
      if (velocidadeMs > Constantes.velocidadeImpossivelMs) {
        _ancora = pos;
        notifyListeners();
        return;
      }
    }

    final velocidadeKmh = pos.speed >= 0 ? pos.speed * 3.6 : null;
    final parado = velocidadeKmh != null
        ? velocidadeKmh < Constantes.velocidadeParadoKmh
        : metros < Constantes.distanciaMinimaRuidoM;

    if (parado) {
      if (segundos != null) {
        estado.tempoTotalS += segundos.toInt();
        cobrarComoParado(segundos);
      }
      _ancora = pos;
      _bufferDistanciaM = 0;
        statusTexto = 'Parado - cobrando espera';
      statusClasse = 'espera';
      notifyListeners();
      return;
    }

    // Acumula o trecho ate dar distancia confiavel.
    _bufferDistanciaM += metros;

    if (_bufferDistanciaM >= Constantes.distanciaMinimaRuidoM) {
      final km = _bufferDistanciaM / 1000;
      estado.distanciaTotalKm += km;
      if (segundos != null) estado.tempoTotalS += segundos.toInt();

      // Encerra a franquia quando o carro realmente sai do lugar.
      if (!estado.jaAndou && _bufferDistanciaM >= Constantes.distanciaSaiuDoLugarM) {
        estado.jaAndou = true;
      }

      // Cobra distancia somente acima da franquia de km.
      if (estado.jaAndou) {
        final jaCobrado = estado.kmIncluidoUsado;
        final disponivel = estado.distanciaTotalKm - jaCobrado;
        if (disponivel > 0) {
          final aCobrar = disponivel < km ? disponivel : km;
          estado.kmIncluidoUsado += aCobrar;
          estado.valorTotal += aCobrar * config.taxaKm;
        }
      }

      _bufferDistanciaM = 0;
        _ancora = pos;
      statusTexto = 'Corrida em andamento';
      statusClasse = 'ativo';
    } else {
      // Ainda nao deu distancia confiavel: mantem a ancora anterior e nao
      // joga o pedacinho fora (era o bug do original).
      _ancora = anterior;
    }

    notifyListeners();
  }

  /// Conta apenas o tempo (quando o GPS esta impreciso).
  void _contarTempoApenas() {
    final agoraMs = DateTime.now().millisecondsSinceEpoch;
    final segundos = _tempoDesdeAUltimaContagem(agoraMs);
    if (segundos == null) return;
    estado.tempoTotalS += segundos.toInt();
    cobrarComoParado(segundos);
  }

  /// Tempo desde a ultima contagem, com teto para buracos longos.
  double? _tempoDesdeAUltimaContagem(int agoraMs) {
    if (_ultimoInstanteMs == null) {
      _ultimoInstanteMs = agoraMs;
      return null;
    }
    final segundos = (agoraMs - _ultimoInstanteMs!) / 1000;
    _ultimoInstanteMs = agoraMs;
    if (segundos <= 0) return null;
    return segundos > Constantes.tetoDoBuracoS
        ? Constantes.tetoDoBuracoS.toDouble()
        : segundos;
  }

  // ==================================================================
  // Cobranca
  // ==================================================================
  /// Cobranca do tempo parado (logica identica ao original).
  double cobrancaDoTempoParado(double segundosNovos) {
    if (estado.jaAndou) {
      return (segundosNovos / 60) * config.taxaEspera;
    }
    final incluidoS = config.minutosIncluidoNaBandeirada * 60;
    final antes = estado.esperaInicialS;
    final depois = antes + segundosNovos;
    final cobraveis = (depois - (incluidoS > antes ? incluidoS : antes));
    return (cobraveis < 0 ? 0 : cobraveis) / 60 * config.taxaEspera;
  }

  void cobrarComoParado(double segundosParado) {
    final cobranca = cobrancaDoTempoParado(segundosParado);
    if (!estado.jaAndou) {
      estado.esperaInicialS += segundosParado;
      estado.minutosIncluidoUsado = estado.esperaInicialS / 60;
    }
    estado.valorEspera += cobranca;
    estado.tempoParadoS += segundosParado.toInt();
    estado.valorTotal += cobranca;
  }

  // ==================================================================
  // Relogio da corrida (independente do GPS)
  // ==================================================================
  void ligarRelogioDaCorrida() {
    desligarRelogioDaCorrida();
    _relogioCorrida = Timer.periodic(
      const Duration(milliseconds: Constantes.relogioCorridaMs),
      (_) {
        if (!corridaAtiva) return;
        final agoraMs = DateTime.now().millisecondsSinceEpoch;

        // Se o GPS acabou de contar, deixa com ele.
        if (_ultimoInstanteMs != null &&
            (agoraMs - _ultimoInstanteMs!) < Constantes.janelaGpsRecenteMs) {
          return;
        }

        final segundos = _tempoDesdeAUltimaContagem(agoraMs);
        if (segundos == null) return;

        estado.tempoTotalS += segundos.toInt();
        cobrarComoParado(segundos);
        _bufferDistanciaM = 0;
        notifyListeners();
      },
    );
  }

  void desligarRelogioDaCorrida() {
    _relogioCorrida?.cancel();
    _relogioCorrida = null;
  }

  // ==================================================================
  // Historico
  // ==================================================================
  List<RegistroCorrida> historicoFiltrado() {
    final agora = DateTime.now();
    DateTime? de;
    DateTime? ate;

    switch (filtroPeriodoAtual) {
      case FiltroPeriodo.hoje:
        de = DateTime(agora.year, agora.month, agora.day);
        break;
      case FiltroPeriodo.semana:
        de = agora.subtract(const Duration(days: 7));
        break;
      case FiltroPeriodo.mes:
        de = DateTime(agora.year, agora.month, 1);
        break;
      case FiltroPeriodo.personalizado:
        de = filtroDe;
        ate = filtroAte;
        break;
    }

    return historico.where((item) {
      if (de != null && item.data.isBefore(de)) return false;
      if (ate != null) {
        final fim = DateTime(ate.year, ate.month, ate.day, 23, 59, 59);
        if (item.data.isAfter(fim)) return false;
      }
      return true;
    }).toList();
  }

  double totalDoFiltro() =>
      historicoFiltrado().fold(0, (soma, item) => soma + item.valor);

  Future<void> limparHistorico() async {
    historico = [];
    await _gravarHistorico();
    notifyListeners();
  }

  void definirFiltro(FiltroPeriodo periodo) {
    filtroPeriodoAtual = periodo;
    notifyListeners();
  }

  void definirPeriodoPersonalizado(DateTime? de, DateTime? ate) {
    filtroDe = de;
    filtroAte = ate;
    filtroPeriodoAtual = FiltroPeriodo.personalizado;
    notifyListeners();
  }

  // ==================================================================
  // Utilidades
  // ==================================================================
  static double _haversineMetros(double lat1, double lon1, double lat2, double lon2) {
    const r = 6371000.0;
    double toRad(double g) => g * math.pi / 180;
    final dLat = toRad(lat2 - lat1);
    final dLon = toRad(lon2 - lon1);
    final a = math.pow(math.sin(dLat / 2), 2) +
        math.cos(toRad(lat1)) * math.cos(toRad(lat2)) * math.pow(math.sin(dLon / 2), 2);
    final c = 2 * math.atan2(math.sqrt(a.toDouble()), math.sqrt(1 - a));
    return r * c;
  }

  /// Aviso de validade da CNH (mesma regra do original).
  String? avisoValidadeCnh() {
    if (config.cnhValidade.trim().isEmpty) return null;
    final fim = DateTime.tryParse(config.cnhValidade);
    if (fim == null) return null;

    final dias = fim.difference(DateTime.now()).inDays;
    if (dias < 0) return 'CNH VENCIDA ha ${-dias} dia(s). Providencie a renovacao.';
    if (dias <= 30) return 'CNH vence em $dias dia(s).';
    return null;
  }

  bool get cnhVencida {
    if (config.cnhValidade.trim().isEmpty) return false;
    final fim = DateTime.tryParse(config.cnhValidade);
    if (fim == null) return false;
    return fim.isBefore(DateTime.now());
  }

  @override
  void dispose() {
    desligarRelogioDaCorrida();
    _posicaoSub?.cancel();
    super.dispose();
  }
}

