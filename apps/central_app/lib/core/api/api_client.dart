import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

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

  Future<dynamic> request(
    String method,
    String path, {
    Map<String, dynamic>? body,
    Map<String, String>? query,
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
        case 'DELETE':
          response = await _client.delete(uri, headers: headers, body: payload).timeout(AppConfig.apiTimeout);
          break;
        default:
          throw ApiException('METHOD_NOT_ALLOWED', 'Metodo $method nao suportado.');
      }
    } on TimeoutException {
      throw ApiException('NETWORK_ERROR', 'Tempo esgotado ao falar com o servidor.');
    } catch (error) {
      throw ApiException('NETWORK_ERROR', 'Sem conexao com o servidor. ($error)');
    }

    Map<String, dynamic> decoded;
    try {
      decoded = jsonDecode(response.body) as Map<String, dynamic>;
    } catch (_) {
      throw ApiException('INVALID_RESPONSE', 'Resposta invalida do servidor.', statusCode: response.statusCode);
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
    if (metodo != 'GET' && response.statusCode != 409 && !caminho.contains('/location')) {
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
