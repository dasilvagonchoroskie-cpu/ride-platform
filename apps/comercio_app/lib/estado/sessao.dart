import 'dart:async';
import 'dart:math';

import 'package:flutter/foundation.dart';

import '../core/api.dart';
import '../core/armazenamento.dart';
import '../core/config.dart';
import '../dados/comercio_api.dart';
import '../dados/modelos.dart';

/// Quem esta usando o app e em que ponto do caminho esta:
/// entrar -> cadastrar o estabelecimento -> esperar aprovacao -> usar.
class Sessao extends ChangeNotifier {
  Sessao({ApiClient? api, ComercioApi? servidor}) : this._(api ?? ApiClient(), servidor);

  Sessao._(ApiClient cliente, ComercioApi? servidor)
      : api = cliente,
        servidor = servidor ?? ComercioApi(cliente) {
    cliente.aoSessaoExpirar = _sessaoVenceu;
  }

  final ApiClient api;
  final ComercioApi servidor;

  bool iniciando = true;
  bool logado = false;

  /// Termos de uso e politica de privacidade: aceitos na primeira abertura, ANTES de entrar ou criar a conta.
  /// null = ainda nao aceitou (ou os termos mudaram de versao).
  String? termosAceitosVersao;
  bool get aceitouTermos => termosAceitosVersao != null;

  Future<void> aceitarTermos(String versao) async {
    await Armazenamento.atual.gravar(Armazenamento.termosAceitos, versao);
    termosAceitosVersao = versao;
    notifyListeners();
  }

  /// Abre o app: se ja ha login guardado, confere com o servidor.
  Future<void> iniciar() async {
    termosAceitosVersao = await Armazenamento.atual.ler(Armazenamento.termosAceitos);
    final token = await Armazenamento.atual.ler(Armazenamento.acesso);
    logado = token != null && token.isNotEmpty;
    if (logado) {
      email = await Armazenamento.atual.ler(Armazenamento.email);
      await atualizar(silencioso: true);
    }
    iniciando = false;
    notifyListeners();
  }

  void _sessaoVenceu() {
    // O login que venceu nao fica guardado no celular (a proxima abertura pede para entrar de novo).
    unawaited(Armazenamento.atual.apagar(Armazenamento.acesso));
    unawaited(Armazenamento.atual.apagar(Armazenamento.renovacao));
    logado = false;
    estabelecimento = null;
    _mapa = null;
    _mapaEm = null;
    notifyListeners();
  }

  /// Le de novo o estabelecimento no servidor (situacao do cadastro).
  Future<void> atualizar({bool silencioso = false}) async {
    falha = null;
    try {
      estabelecimento = await servidor.meu();
    } on ApiException catch (e) {
      if (e.code != 'SESSION_EXPIRED') falha = e.message;
    }
    if (!silencioso) notifyListeners();
  }

  Future<Map<String, dynamic>> _aparelho() async {
    var id = await Armazenamento.atual.ler(Armazenamento.aparelho);
    if (id == null || id.length < 16) {
      final r = Random.secure();
      id = List<String>.generate(16, (_) => r.nextInt(256).toRadixString(16).padLeft(2, '0')).join();
      await Armazenamento.atual.gravar(Armazenamento.aparelho, id);
    }
    return {'deviceId': 'and-com-$id', 'platform': 'ANDROID', 'appVersion': AppConfig.appVersion};
  }

  Future<void> pedirCodigo(String email) => servidor.pedirCodigo(email);

  Future<void> entrarComCodigo(String email, String codigo) async {
    final r = await servidor.entrarComCodigo(email, codigo, await _aparelho());
    await _guardar(r, email);
  }

  Future<void> entrarComSenha(String email, String senha) async {
    final r = await servidor.entrarComSenha(email, senha, await _aparelho());
    await _guardar(r, email);
  }

  Future<void> _guardar(Map<String, dynamic> r, String mail) async {
    if (r['precisa2fa'] == true) {
      throw ApiException('DOIS_FATORES', 'Esta conta exige verificação em duas etapas e não pode entrar no app Comércio.');
    }
    final acesso = r['accessToken'] as String?;
    final renovacao = r['refreshToken'] as String?;
    if (acesso == null || acesso.isEmpty || renovacao == null || renovacao.isEmpty) {
      throw ApiException('INVALID_RESPONSE', 'Resposta inválida do servidor.');
    }
    final user = r['user'];
    // Conta de motorista ou da Central nao entra aqui.
    if (user is Map && user['role'] != null && user['role'] != 'PASSENGER') {
      throw ApiException('PAPEL_INVALIDO', 'Esta conta não é de estabelecimento. Use outro e-mail.');
    }
    await Armazenamento.atual.gravar(Armazenamento.acesso, acesso);
    await Armazenamento.atual.gravar(Armazenamento.renovacao, renovacao);
    email = mail.trim().toLowerCase();
    await Armazenamento.atual.gravar(Armazenamento.email, email!);
    logado = true;
    await atualizar(silencioso: true);
    notifyListeners();
  }

  Future<void> cadastrar(DadosDoCadastro dados) async {
    estabelecimento = await servidor.cadastrar(dados);
    notifyListeners();
  }

  Future<void> salvarEstabelecimento(Estabelecimento novo) async {
    estabelecimento = novo;
    notifyListeners();
  }

  Future<void> sair() async {
    final renovacao = await Armazenamento.atual.ler(Armazenamento.renovacao);
    await servidor.sair(renovacao);
    await Armazenamento.atual.apagar(Armazenamento.acesso);
    await Armazenamento.atual.apagar(Armazenamento.renovacao);
    await Armazenamento.atual.apagar(Armazenamento.email);
    logado = false;
    estabelecimento = null;
    email = null;
    _mapa = null; // o endereco das imagens (com a chave) sai do app junto com o login
    _mapaEm = null;
    notifyListeners();
  }
}

/// Chave do pedido (idempotencia): 32 letras/numeros ao acaso. O mesmo toque
/// repetido manda a MESMA chave e o servidor devolve a entrega que ja criou.
String novaChaveDePedido() {
  final r = Random.secure();
  return List<String>.generate(16, (_) => r.nextInt(256).toRadixString(16).padLeft(2, '0')).join();
}
