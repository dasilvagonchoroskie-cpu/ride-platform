import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../core/api/api_client.dart';
import '../core/config/app_config.dart';
import '../core/storage/app_storage.dart';
import '../data/models/models.dart';

/// O que a Central configura e o aplicativo le do servidor: cidades
/// atendidas, WhatsApp do "Fale conosco" e avisos para os passageiros.
///
/// Guarda a ultima resposta no aparelho para funcionar sem rede.
class ConfigState extends ChangeNotifier {
  ConfigState({ApiClient? client}) : _client = client ?? ApiClient();

  final ApiClient _client;

  List<String> cidades = const [];
  String? whatsapp;
  List<AvisoCentral> avisos = const [];

  /// Ja tem uma resposta (do servidor agora ou guardada de antes).
  bool carregado = false;
  bool carregando = false;

  /// A ultima tentativa de falar com o servidor falhou.
  bool falhou = false;

  String? _ultimoVisto;

  /// Ha aviso mais novo do que o ultimo que a pessoa abriu.
  bool get temAvisoNovo => avisos.isNotEmpty && avisos.first.id != _ultimoVisto;

  Future<void> iniciar() async {
    _ultimoVisto = await AppStorage.read(AppStorage.avisoVisto);
    final guardado = await AppStorage.read(AppStorage.configApp);
    if (guardado != null && guardado.isNotEmpty) {
      try {
        _aplicar(jsonDecode(guardado) as Map<String, dynamic>);
        carregado = true;
      } catch (_) {
        // Copia velha corrompida: espera a do servidor.
      }
    }
    notifyListeners();
    await carregar();
  }

  Future<void> carregar() async {
    if (!AppConfig.hasApi || carregando) return;
    carregando = true;
    notifyListeners();
    try {
      final data = await _client.request('GET', '/app/config') as Map<String, dynamic>;
      _aplicar(data);
      carregado = true;
      falhou = false;
      await AppStorage.write(AppStorage.configApp, jsonEncode(data));
    } catch (_) {
      falhou = true;
    } finally {
      carregando = false;
      notifyListeners();
    }
  }

  Future<void> marcarAvisosVistos() async {
    if (avisos.isEmpty) return;
    _ultimoVisto = avisos.first.id;
    await AppStorage.write(AppStorage.avisoVisto, _ultimoVisto!);
    notifyListeners();
  }

  void _aplicar(Map<String, dynamic> data) {
    cidades = [
      for (final c in (data['cidades'] as List<dynamic>? ?? const [])) c.toString(),
    ];
    final numero = data['whatsapp'];
    whatsapp = numero is String && numero.isNotEmpty ? numero : null;
    avisos = [
      for (final a in (data['avisos'] as List<dynamic>? ?? const []))
        if (a is Map<String, dynamic>) AvisoCentral.fromJson(a),
    ];
  }
}
