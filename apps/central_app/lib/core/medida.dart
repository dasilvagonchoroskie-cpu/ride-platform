import 'dart:convert';

import 'package:flutter/widgets.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Medida do tempo de abertura do mapa (pedido do Evandro, 29/10/2026).
///
/// So funciona na MONTAGEM DE MEDICAO da esteira "Medir o mapa"
/// (--dart-define=MEDIR=true). No APK normal [ligada] e false e tudo aqui
/// some na compilacao: nao grava, nao imprime, nao muda nada.
///
/// Cada evento sai uma vez no registro do Android como
/// "MEDIDA <evento> <milissegundos desde o inicio do app>".
class Medida {
  const Medida._();

  static const bool ligada = bool.fromEnvironment('MEDIR');

  static final Stopwatch _relogio = Stopwatch();
  static final Set<String> _vistos = <String>{};

  static void iniciar() {
    if (!ligada) return;
    _relogio.start();
    marcar('inicio');
    WidgetsBinding.instance.addPostFrameCallback((_) => marcar('primeiro_quadro'));
  }

  static void marcar(String evento) {
    if (!ligada || !_vistos.add(evento)) return;
    // ignore: avoid_print
    print('MEDIDA $evento ${_relogio.elapsedMilliseconds}');
  }

  /// Tempo de cada pedido ao servidor (so o primeiro de cada caminho).
  static void servidor(String caminho, int ms, int status) {
    if (!ligada) return;
    final chave = 'api ${caminho.split('?').first}';
    if (!_vistos.add(chave)) return;
    // ignore: avoid_print
    print('MEDIDA_API ${caminho.split('?').first} ${ms}ms status=$status em=${_relogio.elapsedMilliseconds}');
  }

  /// Marca "ruas" quando a primeira imagem do mapa chega na tela.
  static Widget construtorDeImagem(BuildContext context, Widget imagem, TileImage tile) {
    if (tile.imageInfo != null && !tile.loadError) marcar('ruas');
    return imagem;
  }

  /// Sessao de teste da esteira (contas criadas para a medicao e apagadas
  /// no fim). Grava so na primeira abertura depois de instalar.
  static Future<void> semear() async {
    const semente = String.fromEnvironment('MEDIR_PREFS');
    if (!ligada || semente.isEmpty) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      if (prefs.getString('medir.semeado') == '1') return;
      final mapa = jsonDecode(utf8.decode(base64Decode(semente))) as Map<String, dynamic>;
      for (final e in mapa.entries) {
        await prefs.setString(e.key, e.value.toString());
      }
      await prefs.setString('medir.semeado', '1');
    } catch (e) {
      // ignore: avoid_print
      print('MEDIDA semente_falhou $e');
    }
  }
}
