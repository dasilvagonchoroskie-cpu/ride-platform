import 'dart:async';

import 'package:flutter/widgets.dart';

/// Atualizacao periodica que respeita o ciclo de vida do app (auditoria 13/11/2026).
///
/// Enquanto o app esta em segundo plano (tela apagada, outro app na frente) nao
/// consulta o servidor: poupa bateria, dados e o proprio servidor. Ao voltar,
/// atualiza na hora e retoma o ritmo normal. Quem usa deve chamar [dispose].
class AtualizacaoPeriodica with WidgetsBindingObserver {
  AtualizacaoPeriodica({required this.intervalo, required this.aoAtualizar, this.ativa = _sempre}) {
    final estado = WidgetsBinding.instance.lifecycleState;
    _emPrimeiroPlano = estado == null || estado == AppLifecycleState.resumed;
    WidgetsBinding.instance.addObserver(this);
    if (_emPrimeiroPlano) _ligar();
  }

  final Duration intervalo;
  final void Function() aoAtualizar;

  /// Por exemplo: para de consultar quando a entrega ja terminou.
  final bool Function() ativa;

  Timer? _timer;
  late bool _emPrimeiroPlano;

  static bool _sempre() => true;

  void _ligar() {
    _timer?.cancel();
    _timer = Timer.periodic(intervalo, (_) {
      if (_emPrimeiroPlano && ativa()) aoAtualizar();
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState estado) {
    final voltou = estado == AppLifecycleState.resumed;
    if (voltou == _emPrimeiroPlano) return;
    _emPrimeiroPlano = voltou;
    if (voltou) {
      if (ativa()) aoAtualizar();
      _ligar();
    } else {
      _timer?.cancel();
      _timer = null;
    }
  }

  void dispose() {
    _timer?.cancel();
    _timer = null;
    WidgetsBinding.instance.removeObserver(this);
  }
}
