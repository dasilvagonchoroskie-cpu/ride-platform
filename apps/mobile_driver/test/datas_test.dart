import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_driver/core/utils/formatters.dart';

// Defeito visto no celular do Evandro (04/10/2026): digitando a validade
// da CNH sem barras ("18062031"), o app lia como ano 1806 e dizia
// "A CNH esta vencida".
void main() {
  test('Validade da CNH digitada sem barras e lida certo', () {
    expect(lerDataBr('18062031'), DateTime(2031, 6, 18));
    expect(lerDataBr('18/06/2031'), DateTime(2031, 6, 18));
    expect(lerDataBr('18-06-2031'), DateTime(2031, 6, 18));
    expect(lerDataBr(' 8/6/2031 '), DateTime(2031, 6, 8));
    expect(lerDataBr('2031-06-18'), DateTime(2031, 6, 18));
    expect(lerDataBr('2031-06-18T00:00:00.000Z'), DateTime(2031, 6, 18));
  });

  test('Data que nao existe ou incompleta e recusada', () {
    expect(lerDataBr('31/02/2030'), isNull);
    expect(lerDataBr('32132031'), isNull);
    expect(lerDataBr('1806203'), isNull);
    expect(lerDataBr(''), isNull);
    expect(lerDataBr('abc'), isNull);
  });

  test('Data vai para o servidor no formato AAAA-MM-DD', () {
    expect(dataBrParaIso('18062031'), '2031-06-18');
    expect(dataBrParaIso('10/05/1990'), '1990-05-10');
  });

  test('Mascara coloca as barras e os pontos sozinha', () {
    TextEditingValue digitar(TextInputFormatter f, String t) =>
        f.formatEditUpdate(TextEditingValue.empty, TextEditingValue(text: t));
    expect(digitar(MascaraData(), '18062031').text, '18/06/2031');
    expect(digitar(MascaraData(), '1806').text, '18/06');
    expect(digitar(MascaraData(), '180620319999').text, '18/06/2031');
    expect(digitar(MascaraCpf(), '02443156044').text, '024.431.560-44');
  });
}
