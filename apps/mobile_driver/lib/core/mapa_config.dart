import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'mapa/map_provider.dart';
import 'mapa/uso_local.dart';

/// Mapa do app (desde 29/10/2026: TomTom; o servidor publico do
/// OpenStreetMap saiu).
///
/// - A chave da TomTom nunca esta no codigo nem no APK: o servidor manda o
///   endereco das imagens (com a chave) so para quem entrou na conta, em
///   GET /geo/mapa. Fica guardado no celular para o mapa abrir na hora da
///   proxima vez; trocar a chave no servidor troca nos apps, sem APK novo.
/// - A busca de endereco e a rota passam pelo servidor (GET /geo/...).
/// - Guardado de imagens do mapa no celular: ate 200 MB.
class MapaConfig {
  const MapaConfig._();

  static const String padraoAtribuicao = '© TomTom';
  static const int padraoMaxZoom = 20;
  static const int padraoTamanho = 512;

  /// Guardado do mapa no celular: 200 MB (o padrao do flutter_map e 1 GB).
  static const int limiteDoGuardado = 200 * 1000 * 1000;

  static const String _chave = 'ride.mapaConfig';

  /// Endereco das imagens COM a chave (null = ainda nao veio do servidor).
  static String? tiles;
  static String atribuicao = padraoAtribuicao;
  static int maxZoom = padraoMaxZoom;
  static int tamanho = padraoTamanho;

  /// 'tomtom' (padrao) ou 'google' (so nos APKs montados com a chave do Google).
  static String provedor = 'tomtom';

  /// O servidor esta no modo economia (cota da chave perto do limite).
  static bool economiaDoServidor = false;

  /// A TomTom respondeu limite (429/403) para as imagens: aviso no mapa.
  static bool limiteDasImagens = false;

  /// Avisa os mapas da tela quando algo acima muda.
  static final ValueNotifier<int> mudou = ValueNotifier<int>(0);

  /// O fornecedor do mapa em uso (ver MapProvider).
  static MapProvider get atual => TomTomMapProvider.instancia;

  /// Modo economia: o do servidor ou o deste celular (UsoLocal).
  static bool get economia => economiaDoServidor || UsoLocal.economia;

  /// So https, com {z}, {x} e {y}, sem espacos e de tamanho razoavel.
  static bool enderecoValido(Object? url) {
    if (url is! String) return false;
    final u = url.trim();
    return u.length <= 400 &&
        u.startsWith('https://') &&
        !RegExp(r'\s').hasMatch(u) &&
        u.contains('{z}') &&
        u.contains('{x}') &&
        u.contains('{y}');
  }

  static void _avisar() => mudou.value++;

  /// Volta ao estado inicial (usado nos testes).
  static void padrao() {
    tiles = null;
    atribuicao = padraoAtribuicao;
    maxZoom = padraoMaxZoom;
    tamanho = padraoTamanho;
    provedor = 'tomtom';
    economiaDoServidor = false;
    limiteDasImagens = false;
    _avisar();
  }

  /// Na abertura do app: limita o guardado do mapa, le o contador do dia e o
  /// endereco das imagens guardado da ultima vez.
  static Future<void> iniciar() async {
    try {
      BuiltInMapCachingProvider.getOrCreateInstance(maxCacheSize: limiteDoGuardado);
    } catch (_) {
      // Sem guardado (ex.: armazenamento indisponivel): o mapa baixa normal.
    }
    await UsoLocal.carregar();
    try {
      final prefs = await SharedPreferences.getInstance();
      final guardado = prefs.getString(_chave);
      if (guardado != null && guardado.isNotEmpty) {
        final m = jsonDecode(guardado);
        if (m is Map) _usarComChave(m);
      }
    } catch (_) {
      // Copia corrompida: espera a do servidor.
    }
  }

  /// Bloco "mapa" do /app/config publico (sem chave): provedor e atribuicao.
  /// Servidor antigo (sem "mapa") nao muda nada.
  static void aplicar(Map<dynamic, dynamic> config) {
    final mapa = config['mapa'];
    if (mapa is! Map) return;
    provedor = mapa['provedor'] == 'google' ? 'google' : 'tomtom';
    final a = mapa['atribuicao'];
    if (a is String && a.trim().isNotEmpty) atribuicao = a.trim();
    _avisar();
  }

  static bool _pedindo = false;
  static DateTime? _pedidoEm;

  /// Pede ao servidor o endereco das imagens (com login). No maximo uma vez a
  /// cada 10 minutos (ou de novo depois de um limite).
  static Future<void> atualizarComLogin(Future<dynamic> Function(String caminho) pedir) async {
    final ultimo = _pedidoEm;
    if (_pedindo || (ultimo != null && DateTime.now().difference(ultimo) < const Duration(minutes: 10) && !limiteDasImagens)) {
      return;
    }
    _pedindo = true;
    _pedidoEm = DateTime.now();
    try {
      final d = await pedir('/geo/mapa');
      if (d is Map) {
        _usarComChave(d);
        limiteDasImagens = d['parado'] == true && limiteDasImagens;
        _avisar();
        unawaited(_guardar());
      }
    } catch (_) {
      // Sem rede ou servidor antigo: fica o guardado.
    } finally {
      _pedindo = false;
    }
  }

  static void _usarComChave(Map<dynamic, dynamic> d) {
    final t = d['tiles'];
    if (enderecoValido(t)) tiles = (t as String).trim();
    final a = d['atribuicao'];
    if (a is String && a.trim().isNotEmpty) atribuicao = a.trim();
    final z = d['maxZoom'];
    if (z is num && z >= 10 && z <= 22) maxZoom = z.toInt();
    final tam = d['tamanho'];
    if (tam == 256 || tam == 512) tamanho = tam as int;
    provedor = d['provedor'] == 'google' ? 'google' : 'tomtom';
    economiaDoServidor = d['economia'] == true;
    _avisar();
  }

  static Future<void> _guardar() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
        _chave,
        jsonEncode({'tiles': tiles, 'atribuicao': atribuicao, 'maxZoom': maxZoom, 'tamanho': tamanho, 'provedor': provedor}),
      );
    } catch (_) {}
  }

  /// A TomTom disse "limite" numa imagem: aviso no mapa e pergunta de novo
  /// ao servidor na proxima abertura de tela.
  static void marcarLimite() {
    if (limiteDasImagens) return;
    limiteDasImagens = true;
    _avisar();
  }

  /// Saiu da conta: o endereco das imagens (com a chave) sai do celular.
  static Future<void> esquecer() async {
    tiles = null;
    _pedidoEm = null;
    _avisar();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_chave);
    } catch (_) {}
  }
}
