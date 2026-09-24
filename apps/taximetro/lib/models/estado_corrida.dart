/// Estado da corrida em andamento (equivalente ao `estado` do original).
class EstadoCorrida {
  double valorTotal = 0;
  double distanciaTotalKm = 0;
  int tempoTotalS = 0;
  double valorEspera = 0;
  int tempoParadoS = 0;

  /// Tempo parado acumulado antes de o carro sair do lugar.
  double esperaInicialS = 0;

  /// Marca se o carro ja saiu do lugar (encerra a franquia de espera).
  bool jaAndou = false;

  /// Distancia em que a franquia de km foi consumida.
  double kmIncluidoUsado = 0;

  /// Minutos de franquia usados.
  double minutosIncluidoUsado = 0;

  void reiniciar() {
    valorTotal = 0;
    distanciaTotalKm = 0;
    tempoTotalS = 0;
    valorEspera = 0;
    tempoParadoS = 0;
    esperaInicialS = 0;
    jaAndou = false;
    kmIncluidoUsado = 0;
    minutosIncluidoUsado = 0;
  }
}
