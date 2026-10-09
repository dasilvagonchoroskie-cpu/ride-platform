// Evandro (09/10/2026): o valor real e o do taximetro — distancia e tempo
// parado ("as vezes o passageiro quis que aguardasse um pouquinho para pegar
// alguma coisa e depois seguir"). Parada de 1 minuto ou mais entra na conta;
// sinal fechado e transito lento nao.

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_driver/core/taximetro.dart';
import 'package:mobile_driver/core/utils/geo.dart';

/// Ponto [metros] ao norte da Praca da Matriz de Goiatuba.
Coords _ponto(double metros) => Coords(-18.0125 + metros / 111320, -49.3547);

void main() {
  final t0 = DateTime(2026, 10, 9, 18);

  test('parada de 5 minutos no meio da viagem entra no tempo parado', () {
    final t = Taximetro();
    t.adicionar(_ponto(0), em: t0);
    t.adicionar(_ponto(200), em: t0.add(const Duration(seconds: 20)));
    // Ficou 5 min parado (o GPS so tremeu) e saiu andando.
    t.adicionar(_ponto(203), em: t0.add(const Duration(seconds: 200)));
    t.adicionar(_ponto(212), em: t0.add(const Duration(seconds: 320)));
    expect(t.segundosParado, 300);
    expect(t.metros, closeTo(212, 1));
  });

  test('sinal fechado (40 s) e transito lento nao contam como parada', () {
    final t = Taximetro();
    t.adicionar(_ponto(0), em: t0);
    t.adicionar(_ponto(150), em: t0.add(const Duration(seconds: 15)));
    t.adicionar(_ponto(160), em: t0.add(const Duration(seconds: 55)));
    // Transito andando devagar: 10 m a cada 6 s (6 km/h).
    var s = 55;
    for (var m = 170; m <= 260; m += 10) {
      s += 6;
      t.adicionar(_ponto(m.toDouble()), em: t0.add(Duration(seconds: s)));
    }
    expect(t.segundosParado, 0);
  });

  test('parada acontecendo agora ja aparece (o valor corre enquanto espera)', () {
    final t = Taximetro();
    t.adicionar(_ponto(0), em: t0);
    t.adicionar(_ponto(300), em: t0.add(const Duration(seconds: 30)));
    expect(t.paradoAgora(t0.add(const Duration(seconds: 60))), 0);
    expect(t.paradoAgora(t0.add(const Duration(seconds: 150))), 120);
    expect(t.paradasAte(t0.add(const Duration(seconds: 150))), 120);
  });

  test('tempo parado guardado volta igual depois de fechar o app', () {
    final t = Taximetro(segundosParado: 240, metros: 1500);
    final volta = Taximetro.deJson(t.toJson());
    expect(volta.segundosParado, 240);
    expect(volta.metros, 1500);
  });

  test('parada vale na conta como espera (sem passar o tempo de franquia duas vezes)', () {
    const tabela = TarifaDaCorrida(
      baseCents: 1000,
      porKmCents: 285,
      porMinutoCents: 0,
      esperaPorMinutoCents: 60,
      metrosInclusos: 1500,
      esperaInclusaSegundos: 180,
      minimoCents: 1000,
      multiplicador: 1,
    );
    // 1 min de espera no embarque + 5 min de parada = 6 min; 3 min inclusos.
    final v = tabela.valorCents(metros: 1500, segundosViagem: 900, segundosEspera: 60 + 300);
    expect(v, 1000 + 180);
  });
}
