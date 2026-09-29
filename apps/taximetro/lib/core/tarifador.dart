import 'dart:math' as math;

/// Regra de cobranca do taximetro, isolada do GPS e da tela.
///
/// A bandeirada inclui uma FRANQUIA de distancia e uma FRANQUIA de tempo
/// parado. So o que passa de cada franquia e cobrado, cada uma por conta
/// propria: com 1,5 km e 5 min, a corrida fica na bandeirada ate rodar
/// 1,5 km e ate ficar 5 min parada — o limite que passar primeiro comeca a
/// somar. A parada vale no comeco ou no meio da corrida (semaforo, espera).
///
/// A conta e feita sempre a partir dos TOTAIS, nunca somando pedacinhos:
/// assim nenhum arredondamento acumula erro ao longo da corrida.
class Tarifador {
  const Tarifador({
    required this.taxaKm,
    required this.taxaEsperaPorMinuto,
    required this.kmIncluido,
    required this.minutosIncluido,
  });

  final double taxaKm;
  final double taxaEsperaPorMinuto;
  final double kmIncluido;
  final double minutosIncluido;

  double kmCobraveis(double distanciaKm) => math.max(0.0, distanciaKm - kmIncluido);

  double minutosCobraveis(double paradoS) => math.max(0.0, paradoS / 60 - minutosIncluido);

  double valorDistancia(double distanciaKm) => kmCobraveis(distanciaKm) * taxaKm;

  double valorEspera(double paradoS) => minutosCobraveis(paradoS) * taxaEsperaPorMinuto;

  /// Tudo o que passa da bandeirada.
  double adicional(double distanciaKm, double paradoS) =>
      valorDistancia(distanciaKm) + valorEspera(paradoS);

  double kmFranquiaUsada(double distanciaKm) => math.min(distanciaKm, kmIncluido);

  double minutosFranquiaUsados(double paradoS) => math.min(paradoS / 60, minutosIncluido);
}
