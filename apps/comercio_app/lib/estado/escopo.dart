import 'package:flutter/widgets.dart';

import 'sessao.dart';

/// Entrega a Sessao para qualquer tela (sem pacote extra).
class EscopoSessao extends InheritedNotifier<Sessao> {
  const EscopoSessao({super.key, required Sessao sessao, required super.child}) : super(notifier: sessao);

  static Sessao de(BuildContext context) {
    final e = context.dependOnInheritedWidgetOfExactType<EscopoSessao>();
    assert(e != null, 'EscopoSessao nao encontrado');
    return e!.notifier!;
  }

  /// Le sem ficar escutando mudancas (para usar em callbacks).
  static Sessao ler(BuildContext context) {
    final e = context.getInheritedWidgetOfExactType<EscopoSessao>();
    assert(e != null, 'EscopoSessao nao encontrado');
    return e!.notifier!;
  }
}
