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
    // Mensagem longa (ex.: o motivo de uma recusa com a dica do que fazer)
    // fica mais tempo: uns 6 s mais 1 s a cada 15 letras, ate 14 s.
    ..showSnackBar(SnackBar(
      content: Text(mensagem),
      duration: Duration(seconds: (6 + mensagem.length ~/ 15).clamp(6, 14)),
      showCloseIcon: mensagem.length > 80,
    ));
}
