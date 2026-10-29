import 'dart:async';
import 'dart:convert';

import 'package:flutter_map/flutter_map.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

/// Endereco das imagens do mapa (auditoria de 23/10/2026).
///
/// Padrao: OpenStreetMap, gratis. O servidor manda o endereco em
/// GET /app/config -> "mapa"; se um dia o OSM limitar o uso, a troca e feita
/// no servidor e o aplicativo passa a usar sozinho, sem APK novo. Endereco
/// invalido e ignorado (fica o OpenStreetMap), entao o mapa nunca quebra.
class MapaConfig {
  const MapaConfig._();

  static const String padraoTiles = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  static const String padraoAtribuicao = '© OpenStreetMap contributors';
  static const int padraoMaxZoom = 19;

  /// Guardado do mapa no celular: 200 MB (o padrao do flutter_map e 1 GB).
  static const int limiteDoGuardado = 200 * 1000 * 1000;

  static const String _chave = 'ride.mapaConfig';

  static String tiles = padraoTiles;
  static String atribuicao = padraoAtribuicao;
  static int maxZoom = padraoMaxZoom;

  /// 'google' (padrao, quando o APK tem a chave) ou 'osm'.
  static String provedor = 'google';

  /// So https, com {z}, {x} e {y}, sem espacos e de tamanho razoavel.
  static bool enderecoValido(Object? url) {
    if (url is! String) return false;
    final u = url.trim();
    return u.length <= 300 &&
        u.startsWith('https://') &&
        !RegExp(r'\s').hasMatch(u) &&
        u.contains('{z}') &&
        u.contains('{x}') &&
        u.contains('{y}');
  }

  /// Volta para o OpenStreetMap (usado nos testes).
  static void padrao() {
    tiles = padraoTiles;
    atribuicao = padraoAtribuicao;
    maxZoom = padraoMaxZoom;
    provedor = 'google';
  }

  /// Na abertura do app: limita o guardado do mapa, le o endereco guardado e,
  /// se [apiUrl] vier, pergunta ao servidor o endereco atual.
  static Future<void> iniciar({String? apiUrl}) async {
    try {
      BuiltInMapCachingProvider.getOrCreateInstance(maxCacheSize: limiteDoGuardado);
    } catch (_) {
      // Sem guardado (ex.: armazenamento indisponivel): o mapa baixa normal.
    }
    try {
      final prefs = await SharedPreferences.getInstance();
      final guardado = prefs.getString(_chave);
      if (guardado != null && guardado.isNotEmpty) _usar(jsonDecode(guardado));
    } catch (_) {
      // Copia corrompida: fica o padrao ate a resposta do servidor.
    }
    if (apiUrl == null || apiUrl.isEmpty) return;
    try {
      final r = await http.get(Uri.parse('$apiUrl/api/app/config')).timeout(const Duration(seconds: 60));
      if (r.statusCode != 200) return;
      final corpo = jsonDecode(r.body);
      final data = corpo is Map && corpo['data'] is Map ? corpo['data'] : corpo;
      if (data is Map) aplicar(data);
    } catch (_) {
      // Sem rede: fica o guardado (ou o OpenStreetMap).
    }
  }

  /// Aplica o bloco "mapa" da resposta de /app/config e guarda para a
  /// proxima abertura. Servidor antigo (sem "mapa") nao muda nada.
  static void aplicar(Map<dynamic, dynamic> config) {
    final mapa = config['mapa'];
    if (mapa is! Map) return;
    _usar(mapa);
    unawaited(() async {
      try {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString(_chave, jsonEncode({'tiles': tiles, 'atribuicao': atribuicao, 'maxZoom': maxZoom, 'provedor': provedor}));
      } catch (_) {}
    }());
  }

  static void _usar(Object? mapa) {
    final p = mapa is Map ? mapa['provedor'] : null;
    final novoProvedor = p == 'osm' ? 'osm' : 'google';
    if (mapa is! Map || !enderecoValido(mapa['tiles'])) {
      padrao();
      provedor = novoProvedor;
      return;
    }
    provedor = novoProvedor;
    tiles = (mapa['tiles'] as String).trim();
    final a = mapa['atribuicao'];
    atribuicao = a is String && a.trim().isNotEmpty ? a.trim() : padraoAtribuicao;
    final z = mapa['maxZoom'];
    maxZoom = z is num && z >= 10 && z <= 22 ? z.toInt() : padraoMaxZoom;
  }
}
