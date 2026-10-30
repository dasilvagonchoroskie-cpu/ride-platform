// TomTom (29/10/2026): cota gratis POR MES (docs.tomtom.com/pricing); a
// Central avisa a partir de 70% e mostra as imagens que os celulares baixaram.

import 'package:central_app/screens/settings_screen.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('uso da TomTom: imagens, modo economia e alerta de 70%', () {
    final t = textoDoUsoDoMapa({
      'ligado': true,
      'economia': true,
      'parado': false,
      'alerta': true,
      'alertas': [
        {'servico': 'routing', 'porcento': 72},
      ],
      'servicos': [
        {'servico': 'routing', 'noMes': 14400, 'cotaDoMes': 20000},
        {'servico': 'tiles', 'noMes': 52000, 'cotaDoMes': 200000},
      ],
    });
    expect(t, contains('modo economia'));
    expect(t, contains('ATENÇÃO: passou de 70% da cota do mês (rotas 72%)'));
    expect(t, contains('imagens 52000/200000'));
    expect(textoDoUsoDoMapa({'ligado': false}), 'TomTom: chave não configurada no servidor');
  });
}
