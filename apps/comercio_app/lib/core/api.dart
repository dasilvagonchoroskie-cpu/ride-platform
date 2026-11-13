import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'armazenamento.dart';
import 'config.dart';

class ApiException implements Exception {
  ApiException(this.code, this.message, {this.statusCode});

  final String code;
  final String message;
  final int? statusCode;

  bool get semRede => code == 'NETWORK_ERROR';

  @override
  String toString() => '$code: $message';
}

/// Cliente da API. O servidor responde `{ success, data }` ou
/// `{ success: false, error: { code, message } }`.
///
/// Regra do Comercio: uma queda de rede NUNCA e tratada como pedido feito.
/// Quem chama decide o que fazer; o app so confirma uma entrega quando o
/// servidor respondeu que ela existe.
class ApiClient {
  ApiClient({http.Client? cliente}) : _http = cliente ?? http.Client();

  final http.Client _http;

  /// Chamado quando o login venceu de vez.
  void Function()? aoSessaoExpirar;

  Future<bool>? _renovando;

  static bool _semRenovar(String caminho) =>
      caminho.startsWith('/auth/otp') || caminho.startsWith('/auth/refresh') || caminho.startsWith('/auth/password');

  Future<dynamic> get(String caminho, {Map<String, String>? query}) => pedir('GET', caminho, query: query);
  Future<dynamic> post(String caminho, [Map<String, dynamic>? corpo]) => pedir('POST', caminho, corpo: corpo ?? const {});
  Future<dynamic> patch(String caminho, Map<String, dynamic> corpo) => pedir('PATCH', caminho, corpo: corpo);

  Future<dynamic> pedir(String metodo, String caminho, {Map<String, dynamic>? corpo, Map<String, String>? query}) async {
    try {
      return await _enviar(metodo, caminho, corpo: corpo, query: query);
    } on ApiException catch (e) {
      if (e.statusCode == 401 && !_semRenovar(caminho)) {
        if (await _renovar()) return _enviar(metodo, caminho, corpo: corpo, query: query);
        aoSessaoExpirar?.call();
        throw ApiException('SESSION_EXPIRED', 'Sua sessão expirou. Entre de novo.', statusCode: 401);
      }
      rethrow;
    }
  }

  Future<bool> _renovar() => _renovando ??= _fazerRenovacao().whenComplete(() => _renovando = null);

  Future<bool> _fazerRenovacao() async {
    final refresh = await Armazenamento.atual.ler(Armazenamento.renovacao);
    if (refresh == null || refresh.isEmpty) return false;
    try {
      final r = await _http
          .post(
            Uri.parse('${AppConfig.apiUrl}/api/auth/refresh'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'refreshToken': refresh}),
          )
          .timeout(AppConfig.apiTimeout);
      if (r.statusCode >= 500) throw ApiException('NETWORK_ERROR', 'Servidor indisponível agora. Tente de novo.');
      final d = jsonDecode(r.body) as Map<String, dynamic>;
      final dados = d['data'] as Map<String, dynamic>?;
      final acesso = dados?['accessToken'] as String?;
      if (d['success'] != true || acesso == null || acesso.isEmpty) return false;
      await Armazenamento.atual.gravar(Armazenamento.acesso, acesso);
      final novo = dados?['refreshToken'] as String?;
      if (novo != null && novo.isNotEmpty) await Armazenamento.atual.gravar(Armazenamento.renovacao, novo);
      return true;
    } on ApiException {
      rethrow;
    } catch (_) {
      throw ApiException('NETWORK_ERROR', 'Sem conexão com o servidor.');
    }
  }

  Future<dynamic> _enviar(String metodo, String caminho, {Map<String, dynamic>? corpo, Map<String, String>? query}) async {
    final base = Uri.parse('${AppConfig.apiUrl}/api$caminho');
    final uri = query == null || query.isEmpty ? base : base.replace(queryParameters: query);
    final cab = <String, String>{'Content-Type': 'application/json'};
    final token = await Armazenamento.atual.ler(Armazenamento.acesso);
    if (token != null && token.isNotEmpty) cab['Authorization'] = 'Bearer $token';

    http.Response r;
    try {
      final payload = corpo == null ? null : jsonEncode(corpo);
      switch (metodo) {
        case 'GET':
          r = await _http.get(uri, headers: cab).timeout(AppConfig.apiTimeout);
          break;
        case 'POST':
          r = await _http.post(uri, headers: cab, body: payload).timeout(AppConfig.apiTimeout);
          break;
        case 'PATCH':
          r = await _http.patch(uri, headers: cab, body: payload).timeout(AppConfig.apiTimeout);
          break;
        default:
          throw ApiException('METHOD_NOT_ALLOWED', 'Método $metodo não suportado.');
      }
    } on TimeoutException {
      throw ApiException('NETWORK_ERROR', 'Tempo esgotado ao falar com o servidor.');
    } on ApiException {
      rethrow;
    } catch (_) {
      throw ApiException('NETWORK_ERROR', 'Sem conexão com o servidor.');
    }

    if (r.statusCode >= 200 && r.statusCode < 300 && r.body.trim().isEmpty) return null;

    Map<String, dynamic> d;
    try {
      d = jsonDecode(r.body) as Map<String, dynamic>;
    } catch (_) {
      // Servidor acordando / erro de proxy: nao e resposta de verdade.
      throw ApiException(r.statusCode >= 500 ? 'NETWORK_ERROR' : 'INVALID_RESPONSE',
          r.statusCode >= 500 ? 'Servidor indisponível agora. Tente de novo.' : 'Resposta inválida do servidor.',
          statusCode: r.statusCode);
    }
    if (d['success'] == true && d.containsKey('data')) return d['data'];

    final erro = d['error'] as Map<String, dynamic>?;
    var msg = erro?['message'] as String? ?? 'Falha na requisição.';
    final det = erro?['details'];
    if (det is List && det.isNotEmpty) {
      final p = det.first;
      final t = p is Map ? p['message']?.toString() : p.toString();
      if (t != null && t.isNotEmpty) msg = t;
    }
    throw ApiException(erro?['code'] as String? ?? 'HTTP_${r.statusCode}', msg, statusCode: r.statusCode);
  }
}
