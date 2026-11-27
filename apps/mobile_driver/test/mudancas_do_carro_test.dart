import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_driver/core/mudancas_do_carro.dart';

// Evandro (27/11/2026): mudanca nos dados do carro volta para a Central.
void main() {
  const carro = {'brand': 'Fiat', 'model': 'Argo', 'year': 2021, 'color': 'Branco'};

  test('lista so o que mudou de verdade', () {
    expect(mudancasDoCarro(carro, {...carro, 'color': 'Preto'}), ['Cor: Branco → Preto']);
    expect(mudancasDoCarro(carro, {...carro, 'year': 2022, 'model': 'Mobi'}), ['Modelo: Argo → Mobi', 'Ano: 2021 → 2022']);
  });

  test('maiuscula e espaco sobrando nao contam', () {
    expect(mudancasDoCarro(carro, {...carro, 'brand': ' FIAT ', 'color': 'branco'}), isEmpty);
  });

  test('campo que nao veio nao conta como mudanca', () {
    expect(mudancasDoCarro(carro, const {'color': 'Branco'}), isEmpty);
  });
}
