import 'package:flutter_test/flutter_test.dart';
import 'package:taximetro/core/tarifador.dart';

/// Tarifa do Fabiano: R\$ 3,00/km, R\$ 0,55/min, 1,5 km e 5 min incluidos.
void main() {
  const t = Tarifador(
    taxaKm: 3.00,
    taxaEsperaPorMinuto: 0.55,
    kmIncluido: 1.5,
    minutosIncluido: 5,
  );

  group('Modo do trecho: o que der mais', () {
    test('devagar (3,6 km/h) vale o tempo', () {
      expect(t.trechoPorTempo(0.010, 10), isTrue);
    });
    test('andando normal (36 km/h) vale a distancia', () {
      expect(t.trechoPorTempo(0.100, 10), isFalse);
    });
    test('o cruzamento fica perto de 11 km/h', () {
      expect(t.trechoPorTempo(0.028, 10), isTrue); // ~10 km/h
      expect(t.trechoPorTempo(0.034, 10), isFalse); // ~12 km/h
    });
  });

  group('Franquia de 1,5 km', () {
    test('dentro da franquia nada e cobravel', () {
      expect(t.kmCobravelDoTrecho(0, 1.4), 0);
      expect(t.kmCobravelDoTrecho(1.0, 1.5), 0);
    });
    test('trecho que cruza a marca cobra so a parte de fora', () {
      expect(t.kmCobravelDoTrecho(1.4, 1.6), closeTo(0.1, 1e-9));
    });
    test('depois da franquia o trecho inteiro e cobravel', () {
      expect(t.kmCobravelDoTrecho(2.0, 2.5), closeTo(0.5, 1e-9));
    });
  });

  group('Franquia de 5 minutos de espera, em qualquer momento', () {
    test('ate 5 min de espera fica na bandeirada', () {
      expect(t.valorEspera(4 * 60), 0);
      expect(t.valorEspera(5 * 60), 0);
    });
    test('cobra so o que passar de 5 min', () {
      expect(t.valorEspera(7 * 60), closeTo(1.10, 1e-9));
    });
  });

  test('franquia usada nunca passa do limite', () {
    expect(t.kmFranquiaUsada(0.8), closeTo(0.8, 1e-9));
    expect(t.kmFranquiaUsada(9), 1.5);
    expect(t.minutosFranquiaUsados(10 * 60), 5);
  });
}
