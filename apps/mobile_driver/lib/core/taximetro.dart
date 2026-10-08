import 'utils/geo.dart';

/// Tabela de preco da corrida, como o servidor manda em /driver/rides/current
/// (a mesma bandeira e categoria gravadas no pedido).
class TarifaDaCorrida {
  const TarifaDaCorrida({
    required this.baseCents,
    required this.porKmCents,
    required this.porMinutoCents,
    required this.esperaPorMinutoCents,
    required this.metrosInclusos,
    required this.esperaInclusaSegundos,
    required this.minimoCents,
    required this.multiplicador,
  });

  final int baseCents;
  final int porKmCents;
  final int porMinutoCents;
  final int esperaPorMinutoCents;
  final int metrosInclusos;
  final int esperaInclusaSegundos;
  final int minimoCents;
  final double multiplicador;

  static TarifaDaCorrida? doServidor(dynamic t) {
    if (t is! Map) return null;
    int i(String k, [int padrao = 0]) => (t[k] as num?)?.toInt() ?? padrao;
    return TarifaDaCorrida(
      baseCents: i('baseFareCents'),
      porKmCents: i('perKmCents'),
      porMinutoCents: i('perMinuteCents'),
      esperaPorMinutoCents: i('waitingPerMinuteCents'),
      metrosInclusos: i('freeDistanceMeters', 1500),
      esperaInclusaSegundos: i('freeWaitingSeconds', 180),
      minimoCents: i('minFareCents'),
      multiplicador: (t['multiplier'] as num?)?.toDouble() ?? 1,
    );
  }

  Map<String, dynamic> toJson() => {
        'baseFareCents': baseCents,
        'perKmCents': porKmCents,
        'perMinuteCents': porMinutoCents,
        'waitingPerMinuteCents': esperaPorMinutoCents,
        'freeDistanceMeters': metrosInclusos,
        'freeWaitingSeconds': esperaInclusaSegundos,
        'minFareCents': minimoCents,
        'multiplier': multiplicador,
      };

  /// A mesma conta do servidor (FareService.calcular): bandeirada + km alem
  /// do incluso + minutos de viagem + espera alem da inclusa; piso do minimo;
  /// vezes o multiplicador.
  int valorCents({required double metros, required int segundosViagem, required int segundosEspera}) {
    final metrosCobrados = (metros - metrosInclusos).clamp(0, double.infinity);
    final esperaCobrada = (segundosEspera - esperaInclusaSegundos).clamp(0, 1 << 30);
    final distancia = (metrosCobrados / 1000 * porKmCents).round();
    final espera = (esperaCobrada / 60 * esperaPorMinutoCents).round();
    final tempo = (segundosViagem.clamp(0, 1 << 30) / 60 * porMinutoCents).round();
    final subtotal = baseCents + distancia + espera + tempo;
    final comPiso = subtotal < minimoCents ? minimoCents : subtotal;
    return (comPiso * multiplicador).round();
  }
}

/// Mede o trajeto da viagem pelo GPS, como um taximetro.
///
/// Leituras ruins nao entram: precisao pior que 35 m, tremida parado (menos
/// de 8 m) e salto impossivel (mais de 200 km/h). Se o GPS insistir num
/// ponto "impossivel" (5 leituras seguidas), ele passa a valer como novo
/// ponto de partida, sem somar o salto.
class Taximetro {
  Taximetro({this.metros = 0, this.ultimo, this.ultimoEm});

  double metros;
  Coords? ultimo;
  DateTime? ultimoEm;
  int _recusadas = 0;

  static const double precisaoMaxima = 35;
  static const double tremidaMetros = 8;
  static const double velocidadeMaximaMs = 55;

  /// Soma um ponto do GPS. Devolve true se a distancia mudou.
  bool adicionar(Coords p, {double? precisao, DateTime? em}) {
    final agora = em ?? DateTime.now();
    if (precisao != null && precisao > precisaoMaxima) return false;
    final antes = ultimo;
    if (antes == null) {
      ultimo = p;
      ultimoEm = agora;
      return false;
    }
    final d = distanceKm(antes, p) * 1000;
    if (d < tremidaMetros) return false;
    final segundos = ultimoEm == null ? 0 : agora.difference(ultimoEm!).inMilliseconds / 1000;
    if (segundos > 0 && d / segundos > velocidadeMaximaMs) {
      _recusadas++;
      if (_recusadas >= 5) {
        ultimo = p;
        ultimoEm = agora;
        _recusadas = 0;
      }
      return false;
    }
    _recusadas = 0;
    metros += d;
    ultimo = p;
    ultimoEm = agora;
    return true;
  }

  Map<String, dynamic> toJson() => {
        'metros': metros,
        if (ultimo != null) 'lat': ultimo!.latitude,
        if (ultimo != null) 'lng': ultimo!.longitude,
        if (ultimoEm != null) 'em': ultimoEm!.toIso8601String(),
      };

  static Taximetro deJson(Map<String, dynamic> j) => Taximetro(
        metros: (j['metros'] as num?)?.toDouble() ?? 0,
        ultimo: j['lat'] is num && j['lng'] is num ? Coords((j['lat'] as num).toDouble(), (j['lng'] as num).toDouble()) : null,
        ultimoEm: DateTime.tryParse(j['em'] as String? ?? ''),
      );
}
