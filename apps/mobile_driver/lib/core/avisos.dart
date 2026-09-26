import 'package:flutter/material.dart';

/// Canal unico para mostrar avisos na tela de qualquer lugar do aplicativo.
///
/// Antes, quando o servidor recusava algo, o erro sumia calado e a pessoa
/// so via a tela parada — sem saber o que corrigir.
final GlobalKey<ScaffoldMessengerState> avisos = GlobalKey<ScaffoldMessengerState>();

void avisar(String mensagem) {
  final tela = avisos.currentState;
  if (tela == null) return;
  tela
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(mensagem), duration: const Duration(seconds: 6)));
}
