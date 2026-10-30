import 'dart:async';
import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// Contador LOCAL dos pedidos de mapa deste celular, por dia (pedido do
/// Evandro, 29/10/2026). A cota da TomTom e da chave (de todos juntos): o
/// servidor tem o contador da plataforma inteira; este aqui so impede que um
/// celular sozinho gaste demais. Perto do limite (80%), o app entra no modo
/// economia e corta os pedidos que nao sao essenciais.
class UsoLocal {
  const UsoLocal._();

  /// Teto por celular por dia (bem acima do uso normal de um dia de corridas).
  static const Map<String, int> tetoDoDia = {
    'imagens': 1500,
    'buscas': 80,
    'enderecos': 80,
    'rotas': 40,
  };

  static const String _chave = 'ride.usoMapa';

  static String _dia = _hoje();
  static Map<String, int> _contas = {};

  /// Imagens baixadas da TomTom que o servidor ainda nao sabe (29/10/2026:
  /// a cota de imagens e da chave inteira; vai junto do /geo/mapa).
  static int _imagensParaAvisar = 0;
  static int get imagensParaAvisar => _imagensParaAvisar;
  static bool _carregado = false;
  static Timer? _gravar;

  static String _hoje() {
    final d = DateTime.now();
    return '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  }

  /// Le o que ja foi contado hoje (na abertura do app).
  static Future<void> carregar() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_chave);
      if (raw != null && raw.isNotEmpty) {
        final m = jsonDecode(raw) as Map<String, dynamic>;
        final pendentes = m['pendentes'];
        if (pendentes is num && pendentes > 0) _imagensParaAvisar += pendentes.toInt();
        if (m['dia'] == _hoje()) {
          _dia = m['dia'] as String;
          _contas = {
            for (final e in (m['contas'] as Map<String, dynamic>? ?? const {}).entries)
              if (e.value is num) e.key: (e.value as num).toInt(),
          };
        }
      }
    } catch (_) {
      // Guardado ruim: comeca do zero hoje.
    }
    _carregado = true;
  }

  static void _virarDia() {
    final hoje = _hoje();
    if (hoje != _dia) {
      _dia = hoje;
      _contas = {};
    }
  }

  static int hoje(String tipo) {
    _virarDia();
    return _contas[tipo] ?? 0;
  }

  static void contar(String tipo) {
    _virarDia();
    _contas[tipo] = (_contas[tipo] ?? 0) + 1;
    if (tipo == 'imagens') _imagensParaAvisar++;
    if (!_carregado) return;
    _gravar ??= Timer(const Duration(seconds: 20), () {
      _gravar = null;
      unawaited(_salvar());
    });
  }

  static Future<void> _salvar() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_chave, jsonEncode({'dia': _dia, 'contas': _contas, 'pendentes': _imagensParaAvisar}));
    } catch (_) {}
  }

  /// Passou de 80% do teto do dia em algum tipo.
  static bool get economia {
    _virarDia();
    return tetoDoDia.entries.any((e) => (_contas[e.key] ?? 0) >= e.value * 0.8);
  }

  /// Passou do teto do dia daquele tipo (so os essenciais continuam).
  static bool acabou(String tipo) => hoje(tipo) >= (tetoDoDia[tipo] ?? 1 << 30);

  /// O servidor recebeu [n] imagens (desconta das pendentes).
  static void avisouImagens(int n) {
    _imagensParaAvisar = (_imagensParaAvisar - n).clamp(0, 1 << 30);
    if (_carregado) unawaited(_salvar());
  }

  /// Zera tudo (testes).
  static void zerar() {
    _gravar?.cancel();
    _gravar = null;
    _dia = _hoje();
    _contas = {};
    _imagensParaAvisar = 0;
  }
}
