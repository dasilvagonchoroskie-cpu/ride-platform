import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config/app_config.dart';
import '../storage/app_storage.dart';
import '../avisos.dart';

class ApiException implements Exception {
  ApiException(this.code, this.message, {this.statusCode});

  final String code;
  final String message;
  final int? statusCode;

  bool get isNetworkError => code == 'NETWORK_ERROR';

  @override
  String toString() => '$code: $message';
}

/// Cliente HTTP da API Ride.
///
/// A API sempre responde no envelope `{ success, data }` ou
/// `{ success: false, error: { code, message } }`.
class ApiClient {
  ApiClient({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;

  // ------------------------------------------------------------------
  // Renovacao do login. O acesso vale 7 dias; depois disso o servidor
  // responde 401 ("Token de acesso ausente ou invalido") e antes o app
  // ficava travado ate a pessoa sair e entrar de novo (o Evandro nao
  // conseguia concluir o cadastro de motorista em 05/10/2026). Agora, no
  // primeiro 401, o app troca o refresh token (vale 30 dias) por um acesso
  // novo e repete o pedido, sem a pessoa perceber.
  // ------------------------------------------------------------------

  /// Chamado quando o login venceu de vez (precisa entrar de novo).
  static void Function()? aoSessaoExpirar;

  /// Chamado com o acesso novo depois de renovar.
  static void Function(String token)? aoRenovarToken;

  static Future<bool>? _renovacao;

  /// Pedidos que nao usam o login (ou que sao o proprio login).
  static bool _semRenovar(String caminho) =>
      caminho.startsWith('/auth/otp') ||
      caminho.startsWith('/auth/refresh') ||
      caminho.startsWith('/auth/password') ||
      caminho.startsWith('/auth/login');

  /// Uma renovacao por vez: varios pedidos com 401 ao mesmo tempo esperam a mesma.
  Future<bool> _renovarLogin() => _renovacao ??= _fazerRenovacao().whenComplete(() => _renovacao = null);

  Future<bool> _fazerRenovacao() async {
    final prefs = await SharedPreferences.getInstance();
    final acessoAntes = prefs.getString(AppStorage.accessToken);
    await prefs.reload();
    // O vigia nativo (avisos com o app fechado) pode ter renovado o login
    // por conta propria: usa o acesso novo que ele gravou.
    final acessoGravado = prefs.getString(AppStorage.accessToken);
    if (acessoGravado != null && acessoGravado.isNotEmpty && acessoGravado != acessoAntes) {
      aoRenovarToken?.call(acessoGravado);
      return true;
    }
    final refresh = prefs.getString(AppStorage.refreshToken);
    if (refresh == null || refresh.isEmpty) return false;
    try {
      final r = await _client
          .post(
            Uri.parse('${AppConfig.apiUrl}/api/auth/refresh'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'refreshToken': refresh}),
          )
          .timeout(AppConfig.apiTimeout);
      // Servidor acordando ou fora do ar nao e login vencido: nao desloga.
      if (r.statusCode >= 500) throw ApiException('NETWORK_ERROR', 'Servidor indisponível agora. Tente de novo.');
      final d = jsonDecode(r.body) as Map<String, dynamic>;
      final dados = d['data'] as Map<String, dynamic>?;
      final acesso = dados?['accessToken'] as String?;
      if (d['success'] != true || acesso == null || acesso.isEmpty) {
        // Recusado: o vigia nativo pode ter trocado o refresh agora mesmo.
        await prefs.reload();
        final outro = prefs.getString(AppStorage.refreshToken);
        return outro != null && outro.isNotEmpty && outro != refresh;
      }
      await AppStorage.write(AppStorage.accessToken, acesso);
      final novoRefresh = dados?['refreshToken'] as String?;
      if (novoRefresh != null && novoRefresh.isNotEmpty) await AppStorage.write(AppStorage.refreshToken, novoRefresh);
      aoRenovarToken?.call(acesso);
      return true;
    } on ApiException {
      rethrow;
    } catch (_) {
      // Sem rede (ou resposta truncada): tenta de novo depois, sem deslogar.
      throw ApiException('NETWORK_ERROR', 'Sem conexão com o servidor.');
    }
  }

  Future<dynamic> request(
    String method,
    String path, {
    Map<String, dynamic>? body,
    Map<String, String>? query,
  }) async {
    try {
      return await _enviar(method, path, body: body, query: query);
    } on ApiException catch (e) {
      if (e.statusCode == 401 && !_semRenovar(path)) {
        if (await _renovarLogin()) {
          final repetido = await _enviar(method, path, body: body, query: query, ultimaVez: true);
          return repetido;
        }
        aoSessaoExpirar?.call();
        throw ApiException('SESSION_EXPIRED', 'Sua sessão expirou. Entre de novo na sua conta.', statusCode: 401);
      }
      rethrow;
    }
  }

  Future<dynamic> _enviar(
    String method,
    String path, {
    Map<String, dynamic>? body,
    Map<String, String>? query,
    bool ultimaVez = false,
  }) async {
    final base = Uri.parse('${AppConfig.apiUrl}/api$path');
    final uri = query == null ? base : base.replace(queryParameters: query);

    final headers = <String, String>{'Content-Type': 'application/json'};
    final token = await AppStorage.read(AppStorage.accessToken);
    if (token != null && token.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
    }

    http.Response response;
    try {
      final payload = body == null ? null : jsonEncode(body);
      switch (method) {
        case 'GET':
          response = await _client.get(uri, headers: headers).timeout(AppConfig.apiTimeout);
          break;
        case 'POST':
          response = await _client.post(uri, headers: headers, body: payload).timeout(AppConfig.apiTimeout);
          break;
        case 'PATCH':
          response = await _client.patch(uri, headers: headers, body: payload).timeout(AppConfig.apiTimeout);
          break;
        case 'PUT':
          response = await _client.put(uri, headers: headers, body: payload).timeout(AppConfig.apiTimeout);
          break;
        case 'DELETE':
          response = await _client.delete(uri, headers: headers, body: payload).timeout(AppConfig.apiTimeout);
          break;
        default:
          throw ApiException('METHOD_NOT_ALLOWED', 'Método $method não suportado.');
      }
    } on TimeoutException {
      throw ApiException('NETWORK_ERROR', 'Tempo esgotado ao falar com o servidor.');
    } on ApiException {
      rethrow;
    } catch (error) {
      throw ApiException('NETWORK_ERROR', 'Sem conexão com o servidor. ($error)');
    }

    Map<String, dynamic> decoded;
    try {
      decoded = jsonDecode(response.body) as Map<String, dynamic>;
    } catch (_) {
      throw ApiException('INVALID_RESPONSE', 'Resposta inválida do servidor.', statusCode: response.statusCode);
    }

    if (decoded['success'] == true && decoded.containsKey('data')) {
      return decoded['data'];
    }

    final error = decoded['error'] as Map<String, dynamic>?;
    // O servidor diz QUAL campo esta errado em "details" ("CPF invalido.",
    // "CNH vencida..."). Antes isso era jogado fora e so aparecia "Dados
    // invalidos" — ninguem sabia o que corrigir.
    var mensagem = error?['message'] as String? ?? 'Falha na requisicao.';
    final detalhes = error?['details'];
    if (detalhes is List && detalhes.isNotEmpty) {
      final primeiro = detalhes.first;
      final texto = primeiro is Map ? primeiro['message']?.toString() : primeiro.toString();
      if (texto != null && texto.isNotEmpty) mensagem = texto;
    }
    final falha = ApiException(
      error?['code'] as String? ?? 'HTTP_${response.statusCode}',
      mensagem,
      statusCode: response.statusCode,
    );
    // Acao da pessoa (enviar, salvar, aceitar) mostra o motivo na tela.
    // Consulta em segundo plano nao, para nao encher a tela de avisos.
    final metodo = response.request?.method ?? 'GET';
    final caminho = response.request?.url.path ?? '';
    // 401: antes de avisar, o app tenta renovar o login sozinho.
    final renovavel = response.statusCode == 401 && !ultimaVez && !_semRenovar(path);
    if (metodo != 'GET' && response.statusCode != 409 && !caminho.contains('/location') && !renovavel) {
      avisar(falha.message);
    }
    throw falha;
  }

  /// Verifica se a API esta acessivel (decide entre modo API e demonstracao).
  Future<bool> healthCheck() async {
    if (!AppConfig.hasApi) return false;
    try {
      final response = await _client
          .get(Uri.parse('${AppConfig.apiUrl}/api/health'))
          .timeout(const Duration(seconds: 4));
      return response.statusCode == 200;
    } catch (_) {
      return false;
    }
  }
}
