import 'package:comercio_app/core/atualizacao.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('em segundo plano não consulta o servidor; ao voltar consulta na hora e retoma o ritmo', (tester) async {
    var n = 0;
    final a = AtualizacaoPeriodica(intervalo: const Duration(seconds: 10), aoAtualizar: () => n++);
    await tester.pump(const Duration(seconds: 25));
    expect(n, 2);

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    await tester.pump(const Duration(seconds: 120));
    expect(n, 2, reason: 'app em segundo plano: nenhuma consulta');

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    expect(n, 3, reason: 'ao voltar, atualiza na hora');
    await tester.pump(const Duration(seconds: 10));
    expect(n, 4, reason: 'e retoma o ritmo normal');
    a.dispose();
  });

  testWidgets('quando "ativa" diz que não precisa (entrega terminou), não consulta', (tester) async {
    var n = 0;
    var terminou = false;
    final a = AtualizacaoPeriodica(intervalo: const Duration(seconds: 10), ativa: () => !terminou, aoAtualizar: () => n++);
    await tester.pump(const Duration(seconds: 10));
    expect(n, 1);
    terminou = true;
    await tester.pump(const Duration(seconds: 60));
    expect(n, 1);
    a.dispose();
    await tester.pump(const Duration(seconds: 30));
    expect(n, 1);
  });
}
