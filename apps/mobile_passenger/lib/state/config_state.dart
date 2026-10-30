import 'dart:async';
import 'dart:convert';
import 'dart:ui' show Color;

import 'package:flutter/foundation.dart';


import '../core/api/api_client.dart';
import '../core/config/app_config.dart';
import '../core/marca.dart';
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

  /// Cor e nome da marca (a Central troca em Configuracoes > Aparencia).
  Color get corDaMarca => Marca.cor;
  String get nomeDoApp => Marca.nome;

  /// Ponto vermelho do sino: nao lidas contadas pelo SERVIDOR (so desta
  /// conta). Antes era "aviso mais novo que o ultimo aberto", guardado no
  /// celular: a Central apagar o aviso mais novo fazia o ponto voltar sozinho.
  /// Servidor antigo (sem a caixa): continua o jeito antigo.
  bool get temAvisoNovo => caixaAntiga ? (avisos.isNotEmpty && avisos.first.id != _ultimoVisto) : naoLidas > 0;

  // ===================== Sino (caixa do servidor) =====================

  /// Nao lidas desta conta (servidor).
  int naoLidas = 0;

  /// Lista do sino (null = ainda nao carregou).
  List<Notificacao>? notificacoes;
  bool falhouNotificacoes = false;

  /// O servidor respondeu "nao existe" (montagem antiga): usa os avisos do /app/config.
  bool caixaAntiga = false;

  int _numero(Object? r) => r is Map ? ((r['naoLidas'] as num?)?.toInt() ?? 0) : 0;

  Future<bool> _logado() async => ((await AppStorage.read(AppStorage.accessToken)) ?? '').isNotEmpty;

  Future<void> conferirNaoLidas() async {
    if (!AppConfig.hasApi || !await _logado()) return;
    try {
      final n = _numero(await _client.request('GET', '/notificacoes/nao-lidas'));
      caixaAntiga = false;
      if (n != naoLidas) naoLidas = n;
      notifyListeners();
    } on ApiException catch (e) {
      if (e.statusCode == 404) {
        caixaAntiga = true;
        notifyListeners();
      }
    } catch (_) {
      // Sem rede: fica como estava.
    }
  }

  Future<void> carregarNotificacoes() async {
    if (!AppConfig.hasApi || !await _logado()) return;
    try {
      final r = await _client.request('GET', '/notificacoes') as Map<String, dynamic>;
      notificacoes = [
        for (final n in (r['itens'] as List<dynamic>? ?? const [])) Notificacao.fromJson(n as Map<String, dynamic>),
      ];
      naoLidas = _numero(r);
      caixaAntiga = false;
      falhouNotificacoes = false;
    } on ApiException catch (e) {
      if (e.statusCode == 404) caixaAntiga = true;
      falhouNotificacoes = !caixaAntiga;
    } catch (_) {
      falhouNotificacoes = true;
    }
    notifyListeners();
  }

  /// Marca todas como lidas: o ponto some na hora (o servidor confirma).
  Future<void> marcarNotificacoesLidas() async {
    naoLidas = 0;
    notificacoes = notificacoes?.map((n) => n.comoLida()).toList();
    notifyListeners();
    if (!AppConfig.hasApi || caixaAntiga) return;
    try {
      naoLidas = _numero(await _client.request('POST', '/notificacoes/lidas', body: const {}));
      notifyListeners();
    } catch (_) {
      // Sem rede: marca de novo na proxima abertura.
    }
  }

  /// Apaga no servidor (so desta conta). Falhou: a lista volta.
  Future<bool> apagarNotificacoes(List<String> ids) async {
    if (ids.isEmpty) return true;
    notificacoes = notificacoes?.where((n) => !ids.contains(n.id)).toList();
    notifyListeners();
    if (!AppConfig.hasApi) return true;
    try {
      naoLidas = _numero(await _client.request('POST', '/notificacoes/apagar', body: {'ids': ids}));
      notifyListeners();
      return true;
    } catch (_) {
      await carregarNotificacoes();
      return false;
    }
  }

  /// Saiu da conta: o sino fica vazio (a proxima conta tem o seu).
  void esquecerNotificacoes() {
    naoLidas = 0;
    notificacoes = null;
    notifyListeners();
  }

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
      unawaited(conferirNaoLidas());
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
    // Etapa 6: nome, cor, logo e faixa do Inicio escolhidos na Central.
    Marca.aplicar(data['aparencia']);
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
