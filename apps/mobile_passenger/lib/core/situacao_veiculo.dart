/// Cor do carro no mapa conforme a disponibilidade (Evandro, 30/10/2026: "ele
/// tem que mudar de cor conforme a disponibilidade"). As mesmas cores da
/// Central: livre = verde, ocupado (em corrida) = laranja, offline = cinza.
enum SituacaoVeiculo {
  livre,
  ocupado,
  offline;

  /// LIVRE / OCUPADO / OFFLINE, como o servidor manda.
  static SituacaoVeiculo ler(Object? v) => switch ('$v'.toUpperCase()) {
        'OCUPADO' => SituacaoVeiculo.ocupado,
        'OFFLINE' => SituacaoVeiculo.offline,
        _ => SituacaoVeiculo.livre,
      };
}
