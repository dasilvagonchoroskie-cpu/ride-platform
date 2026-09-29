import 'dart:math' as math;

/// Regra de cobranca do taximetro, isolada do GPS e da tela.
///
/// Portada da versao original (a que roda na rua desde setembro), com a
/// regra de franquia combinada em 26/09/2026:
///
/// * A bandeirada inclui 1,5 km RODADOS e 5 minutos de ESPERA, em qualquer
///   momento da corrida. Enquanto nenhum dos dois passar, fica na bandeirada.
/// * Cada trecho rodado e cobrado por distancia OU por tempo — o que der
///   mais, nunca os dois —, como taximetro de verdade: devagar (abaixo de
///   ~11 km/h com R\$ 3,00/km e R\$ 0,55/min) o trecho vira espera.
/// * A distancia sempre entra no odometro; a franquia de km conta pelo
///   odometro, e so os trechos cobrados por distancia pagam o que passar.
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

  /// O trecho vale mais por tempo do que por distancia (carro devagar)?
  /// Compara os valores CHEIOS, sem franquia: a franquia decide quanto se
  /// paga, nunca qual dos dois modos vale.
  bool trechoPorTempo(double km, double segundos) =>
      km * taxaKm < segundos / 60 * taxaEsperaPorMinuto;

  /// Quanto de um trecho (odometro de [antesKm] ate [depoisKm]) passou da
  /// franquia — certo mesmo quando o trecho cruza a marca no meio.
  double kmCobravelDoTrecho(double antesKm, double depoisKm) =>
      math.max(0.0, depoisKm - math.max(kmIncluido, antesKm));

  /// Espera cobrada: so o que passar dos minutos incluidos.
  double valorEspera(double paradoS) =>
      math.max(0.0, paradoS / 60 - minutosIncluido) * taxaEsperaPorMinuto;

  double kmFranquiaUsada(double distanciaKm) => math.min(distanciaKm, kmIncluido);

  double minutosFranquiaUsados(double paradoS) => math.min(paradoS / 60, minutosIncluido);
}
