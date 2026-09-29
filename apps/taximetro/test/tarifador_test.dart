import 'package:flutter_test/flutter_test.dart';
import 'package:taximetro/core/tarifador.dart';

/// Regra combinada com o dono: bandeirada inclui 1,5 km rodados e 5 min
/// parados; so o que passar de cada franquia e cobrado.
void main() {
  const t = Tarifador(
    taxaKm: 3.0,
    taxaEsperaPorMinuto: 0.5,
    kmIncluido: 1.5,
    minutosIncluido: 5,
  );

  group('Franquia de distancia (1,5 km)', () {
    test('ate 1,5 km fica so na bandeirada', () {
      expect(t.adicional(0, 0), 0);
      expect(t.adicional(0.05, 0), 0);
      expect(t.adicional(1.4, 0), 0);
      expect(t.adicional(1.5, 0), 0);
    });
    test('cobra so o que passa de 1,5 km', () {
      expect(t.adicional(1.6, 0), closeTo(0.3, 1e-9));
      expect(t.adicional(2.5, 0), closeTo(3.0, 1e-9));
    });
  });

  group('Franquia de tempo parado (5 min)', () {
    test('ate 5 min parado fica so na bandeirada', () {
      expect(t.adicional(0, 4 * 60), 0);
      expect(t.adicional(0, 5 * 60), 0);
    });
    test('cobra so o que passa de 5 min', () {
      expect(t.adicional(0, 7 * 60), closeTo(1.0, 1e-9));
    });
    test('parada no meio da corrida tambem usa a franquia', () {
      expect(t.adicional(3.0, 4 * 60), closeTo(4.5, 1e-9));
    });
  });

  test('as duas franquias sao independentes', () {
    expect(t.adicional(2.5, 7 * 60), closeTo(4.0, 1e-9));
  });

  test('franquia usada nunca passa do limite', () {
    expect(t.kmFranquiaUsada(0.8), closeTo(0.8, 1e-9));
    expect(t.kmFranquiaUsada(9), 1.5);
    expect(t.minutosFranquiaUsados(10 * 60), 5);
  });
}
