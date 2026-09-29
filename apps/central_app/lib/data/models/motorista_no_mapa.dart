import '../../core/utils/geo.dart';

/// Motorista online, na posicao REAL informada pelo aplicativo dele.
class MotoristaNoMapa {
  const MotoristaNoMapa({
    required this.id,
    required this.nome,
    required this.coords,
    required this.livre,
  });

  final String id;
  final String nome;
  final Coords coords;

  /// true = disponivel; false = em corrida.
  final bool livre;
}
