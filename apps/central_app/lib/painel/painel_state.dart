import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/alarme.dart';
import '../core/api/api_client.dart';
import '../core/posicao_aparelho.dart';
import '../core/utils/geo.dart';
import '../data/painel.dart';

/// Estado ao vivo do painel: mapa, fila de corridas e alertas de SOS.
/// Pergunta ao servidor a cada 5 segundos enquanto a Central esta aberta.
class PainelState extends ChangeNotifier {
  PainelState([PainelApi? api]) : api = api ?? PainelApi();

  final PainelApi api;

  Indicadores indicadores = const Indicadores();
  List<CorridaAtiva> corridas = const [];
  List<MotoristaOnline> motoristas = const [];
  List<AlertaSos> alertas = const [];

  /// Ultima falha ao falar com o servidor (mostrada no topo do mapa).
  String? erro;
  DateTime? atualizadoEm;

  /// Alertas que a pessoa ja viu e silenciou (o som para; o alerta fica).
  final Set<String> _silenciados = {};

  Timer? _vigia;
  bool _consultando = false;

  Coords get centro {
    if (PosicaoDoAparelho.atual != null) return PosicaoDoAparelho.atual!;
    if (motoristas.any((m) => m.posicao != null)) return motoristas.firstWhere((m) => m.posicao != null).posicao!;
    if (corridas.isNotEmpty) return corridas.first.embarque;
    return const Coords(-18.0125, -49.3547);
  }

  List<AlertaSos> get alertasNovos => alertas.where((a) => !_silenciados.contains(a.id)).toList();

  void iniciar() {
    _vigia?.cancel();
    atualizar();
    _vigia = Timer.periodic(const Duration(seconds: 5), (_) => atualizar());
  }

  void parar() {
    _vigia?.cancel();
    _vigia = null;
    Alarme.parar();
  }

  Future<void> atualizar() async {
    if (_consultando) return;
    _consultando = true;
    try {
      final r = await Future.wait([
        api.indicadores(),
        api.corridas(),
        api.motoristasOnline(centro),
        api.alertas(),
      ]);
      indicadores = r[0] as Indicadores;
      corridas = r[1] as List<CorridaAtiva>;
      motoristas = r[2] as List<MotoristaOnline>;
      alertas = r[3] as List<AlertaSos>;
      erro = null;
      atualizadoEm = DateTime.now();
      _silenciados.removeWhere((id) => !alertas.any((a) => a.id == id));
      if (alertasNovos.isNotEmpty) {
        Alarme.tocar();
      } else {
        Alarme.parar();
      }
    } on ApiException catch (e) {
      erro = e.message;
    } catch (e) {
      erro = 'Falha ao atualizar: $e';
    } finally {
      _consultando = false;
      notifyListeners();
    }
  }

  void silenciar(String alertaId) {
    _silenciados.add(alertaId);
    if (alertasNovos.isEmpty) Alarme.parar();
    notifyListeners();
  }

  Future<void> encerrarAlerta(String id, String nota) async {
    await api.encerrarAlerta(id, nota);
    _silenciados.add(id);
    await atualizar();
  }

  @override
  void dispose() {
    parar();
    super.dispose();
  }
}
