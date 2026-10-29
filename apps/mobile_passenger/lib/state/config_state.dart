import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../core/api/api_client.dart';
import '../core/config/app_config.dart';
import '../core/mapa_config.dart';
import '../core/storage/app_storage.dart';
import '../core/utils/geo.dart';
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

  /// Cidades da operacao com o centro (para abrir o mapa na cidade do
  /// cadastro quando o celular ainda nao tem posicao nenhuma).
  List<({String nome, String uf, Coords centro})> pracas = const [];

  /// Formas de entrar que funcionam agora. Telefone so com SMS (ou em
  /// teste); e-mail quando o envio esta ligado no servidor.
  bool loginTelefone = true;
  bool loginEmail = false;

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
    final login = data['login'];
    if (login is Map<String, dynamic>) {
      loginTelefone = login['telefone'] as bool? ?? true;
      loginEmail = login['email'] as bool? ?? false;
    }
    final numero = data['whatsapp'];
    whatsapp = numero is String && numero.isNotEmpty ? numero : null;
    avisos = [
      for (final a in (data['avisos'] as List<dynamic>? ?? const []))
        if (a is Map<String, dynamic>) AvisoCentral.fromJson(a),
    ];
    pracas = [
      for (final p in (data['pracas'] as List<dynamic>? ?? const []))
        if (p is Map && p['latitude'] is num && p['longitude'] is num)
          (
            nome: p['nome']?.toString() ?? '',
            uf: p['uf']?.toString() ?? '',
            centro: Coords((p['latitude'] as num).toDouble(), (p['longitude'] as num).toDouble()),
          ),
    ];
    // Fornecedor e atribuicao do mapa (a chave so vem com login, /geo/mapa).
    MapaConfig.aplicar(data);
  }

  /// Centro da cidade do cadastro ("Goiatuba - GO"), se ela for uma praca.
  Coords? centroDaCidade(String? cidade) {
    if (cidade == null || cidade.trim().isEmpty) return null;
    String limpo(String t) => t
        .toLowerCase()
        .replaceAll(RegExp('[áàâã]'), 'a')
        .replaceAll(RegExp('[éê]'), 'e')
        .replaceAll('í', 'i')
        .replaceAll(RegExp('[óôõ]'), 'o')
        .replaceAll('ú', 'u')
        .replaceAll('ç', 'c')
        .replaceAll(RegExp(r'[^a-z]'), '');
    final alvo = limpo(cidade);
    for (final p in pracas) {
      if (limpo('${p.nome}${p.uf}') == alvo || limpo(p.nome) == alvo) return p.centro;
    }
    return null;
  }
}
