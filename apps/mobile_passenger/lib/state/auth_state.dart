import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../core/api/api_client.dart';
import '../core/avisos.dart';
import '../core/config/app_config.dart';
import '../core/storage/app_storage.dart';
import '../core/legal/legal_content.dart';
import '../data/models/models.dart';

/// Sessao do passageiro.
///
/// Entra pelo codigo do telefone ou pelo e-mail e senha. Logo depois do
/// primeiro login vem a escolha da cidade e o cadastro (nome, e-mail,
/// genero, CPF e senha), uma vez so.
class AuthState extends ChangeNotifier {
  AuthState({ApiClient? client}) : _client = client ?? ApiClient() {
    // Login vencido de vez (refresh tambem venceu): volta para a tela de entrar.
    ApiClient.aoSessaoExpirar = () {
      if (user == null) return;
      avisar('Sua sessão expirou. Entre de novo.');
      unawaited(logout());
    };
  }

  final ApiClient _client;

  UserProfile? user;
  String? accessToken;
  bool ready = false;
  bool loading = false;
  String? error;

  /// Cidade escolhida na tela Cidade, antes de o cadastro ser enviado.
  String? cidadeEscolhida;

  static const Map<String, dynamic> _aparelho = {'deviceId': 'flutter-android', 'platform': 'ANDROID'};

  bool get isDemoSession => accessToken == 'demo-token';

  /// Cadastro ainda por fazer (o modo demonstracao nao tem cadastro).
  bool get precisaCadastro => user != null && !isDemoSession && !user!.cadastroCompleto;

  Future<void> restore() async {
    final token = await AppStorage.read(AppStorage.accessToken);
    final rawUser = await AppStorage.read(AppStorage.user);

    if (rawUser != null && rawUser.isNotEmpty) {
      try {
        user = UserProfile.fromJson(jsonDecode(rawUser) as Map<String, dynamic>);
      } catch (_) {
        user = null;
      }
    }

    accessToken = token;
    ready = true;
    notifyListeners();

    // Os dados guardados no aparelho podem estar velhos (cadastro feito em
    // outro celular, termos aceitos, nome trocado). Confere com o servidor.
    if (user != null && AppConfig.hasApi && !isDemoSession) await sincronizar();
  }

  /// Busca o retrato atual do usuario no servidor.
  Future<void> sincronizar() async {
    try {
      final data = await _client.request('GET', '/auth/me') as Map<String, dynamic>;
      await _guardarUsuario(UserProfile.fromJson(data));
    } on ApiException catch (e) {
      // Login vencido ou conta removida: volta para a entrada. Sem rede,
      // segue com o que tem guardado.
      if (e.statusCode == 401 || e.statusCode == 403 || e.statusCode == 404) await logout();
    } catch (_) {}
  }

  /// Pede o codigo. [destino] e o telefone (+55...) ou o e-mail.
  Future<String?> requestOtp(String destino) => _pedirCodigo(destino, 'LOGIN');

  /// Codigo para criar uma senha nova ("Esqueci minha senha").
  Future<String?> pedirCodigoSenha(String destino) => _pedirCodigo(destino, 'PASSWORD_RESET');

  static bool _ehEmail(String destino) => destino.contains('@');

  static Map<String, dynamic> _alvo(String destino) =>
      _ehEmail(destino) ? {'email': destino.trim().toLowerCase()} : {'phone': destino};

  Future<String?> _pedirCodigo(String destino, String finalidade) async {
    loading = true;
    error = null;
    notifyListeners();

    try {
      final data = await _client.request('POST', '/auth/otp/request', body: {
        ..._alvo(destino),
        'purpose': finalidade,
      }) as Map<String, dynamic>;

      return data['debugCode'] as String?;
    } on ApiException catch (exception) {
      error = exception.message;
      rethrow;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> verifyOtp(String destino, String code) => _entrar('/auth/otp/verify', {
        ..._alvo(destino),
        'code': code,
        'purpose': 'LOGIN',
        'role': 'PASSENGER',
        'device': _aparelho,
      });

  Future<void> entrarComEmail(String email, String senha) => _entrar('/auth/password/login', {
        'email': email.trim().toLowerCase(),
        'password': senha,
        'device': _aparelho,
      });

  /// Codigo (telefone ou e-mail) + senha nova. Ja deixa a pessoa conectada.
  Future<void> redefinirSenha(String destino, String code, String novaSenha) => _entrar('/auth/password/reset', {
        ..._alvo(destino),
        'code': code,
        'newPassword': novaSenha,
        'device': _aparelho,
      });

  Future<void> _entrar(String caminho, Map<String, dynamic> corpo) async {
    loading = true;
    error = null;
    notifyListeners();

    try {
      final data = await _client.request('POST', caminho, body: corpo) as Map<String, dynamic>;
      final profile = UserProfile.fromJson(data['user'] as Map<String, dynamic>);

      // Motorista tambem pede corrida (mesma conta). So a conta da Central
      // fica de fora deste aplicativo.
      if (profile.role == 'ADMIN') {
        throw ApiException('CONTA_ERRADA', 'Esta conta é da Central. Use o aplicativo da Central.');
      }

      accessToken = data['accessToken'] as String?;
      final refreshToken = data['refreshToken'] as String?;
      await AppStorage.write(AppStorage.accessToken, accessToken ?? '');
      if (refreshToken != null) {
        await AppStorage.write(AppStorage.refreshToken, refreshToken);
      }
      cidadeEscolhida = null;
      await _guardarUsuario(profile);
    } on ApiException catch (exception) {
      error = exception.message;
      rethrow;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  /// Login local (modo demonstracao): nenhuma chamada de rede.
  Future<void> demoLogin(String name, String phone) async {
    final profile = UserProfile(id: 'demo-$phone', name: name, phone: phone, cadastroCompleto: true);

    await AppStorage.write(AppStorage.accessToken, 'demo-token');
    await AppStorage.write(AppStorage.user, jsonEncode(profile.toJson()));

    user = profile;
    accessToken = 'demo-token';
    notifyListeners();
  }

  void escolherCidade(String? cidade) {
    cidadeEscolhida = cidade;
    notifyListeners();
  }

  /// Envia o cadastro do passageiro (uma vez so).
  Future<void> concluirCadastro({
    required String nome,
    required String email,
    required String genero,
    required String cpf,
    required String senha,
    String? cidade,
    String? telefone,
  }) async {
    final data = await _client.request('POST', '/auth/cadastro', body: {
      if (telefone != null) 'phone': telefone,
      'name': nome,
      'email': email.trim().toLowerCase(),
      'gender': genero,
      'cpf': cpf,
      'password': senha,
      if (cidade != null) 'city': cidade,
    }) as Map<String, dynamic>;
    cidadeEscolhida = null;
    await _guardarUsuario(UserProfile.fromJson(data));
  }

  /// Meus dados. Manda so o que mudou.
  Future<void> atualizarPerfil({String? nome, String? email, String? genero, String? cidade, String? cpf}) async {
    final corpo = <String, dynamic>{
      if (nome != null) 'name': nome,
      if (email != null) 'email': email.trim().toLowerCase(),
      if (genero != null) 'gender': genero,
      if (cidade != null) 'city': cidade,
      if (cpf != null) 'cpf': cpf,
    };
    if (corpo.isEmpty) return;
    final data = await _client.request('PATCH', '/auth/perfil', body: corpo) as Map<String, dynamic>;
    await _guardarUsuario(UserProfile.fromJson(data));
  }

  /// Troca a foto de perfil (Conta > toque na foto).
  Future<bool> trocarFoto(String mime, String base64) async {
    final atual = user;
    if (atual == null) return false;
    try {
      final r = await _client.request('POST', '/auth/foto', body: {'mime': mime, 'dados': base64}) as Map<String, dynamic>;
      final url = r['avatarUrl'] as String?;
      if (url == null) return false;
      await _guardarUsuario(atual.copyWith(avatarUrl: url));
      return true;
    } on ApiException {
      return false; // o motivo ja apareceu na tela
    } catch (_) {
      avisar('Sem conexão. A foto não foi trocada.');
      return false;
    }
  }

  Future<void> trocarSenha(String atual, String nova) async {
    await _client.request('PATCH', '/auth/password', body: {'currentPassword': atual, 'newPassword': nova});
  }

  /// Registra o aceite dos Termos/Privacidade.
  ///
  /// Chama o servidor quando ha rede; se falhar (ou em modo
  /// demonstracao), aceita mesmo assim localmente — a pessoa nao pode
  /// ficar presa na tela de aceite so porque a internet caiu bem
  /// naquele instante. Na proxima vez que houver rede, o proximo login
  /// sincroniza de novo.
  Future<void> acceptTerms() async {
    final current = user;
    if (current == null) return;

    if (AppConfig.hasApi && !isDemoSession) {
      try {
        await _client.request('POST', '/auth/accept-terms', body: {'version': kTermsVersion});
      } catch (_) {
        // Segue aceitando localmente; sincroniza no proximo login.
      }
    }

    await _guardarUsuario(current.copyWith(termsAccepted: true));
  }

  Future<void> logout() async {
    await AppStorage.clearSession();
    user = null;
    accessToken = null;
    cidadeEscolhida = null;
    notifyListeners();
  }

  Future<void> _guardarUsuario(UserProfile profile) async {
    user = profile;
    await AppStorage.write(AppStorage.user, jsonEncode(profile.toJson()));
    notifyListeners();
  }
}
