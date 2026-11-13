import 'package:central_app/painel/entregas.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Central: entrega única mostra 1 e varias entregas mostram quantas já foram concluídas', () {
    expect(PedidoDeEntrega({'id': 'a'}).totalDeEntregas, 1);
    final p = PedidoDeEntrega({
      'id': 'b',
      'progresso': {'total': 3, 'concluidas': 2},
    });
    expect(p.totalDeEntregas, 3);
    expect(p.entreguesJa, 2);
  });
}
