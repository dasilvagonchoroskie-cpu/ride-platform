import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../core/api/api_client.dart';
import '../core/config/app_config.dart';
import '../core/storage/app_storage.dart';
import '../data/models/models.dart';

/// Sessao do passageiro: OTP por SMS no modo API, login local no modo demo.
class AuthState extends ChangeNotifier {
  AuthState({ApiClient? client}) : _client = client ?? ApiClient();

  final ApiClient _client;

  UserProfile? user;
  String? accessToken;
  bool ready = false;
  bool loading = false;
  String? error;

  bool get isDemoSession => accessToken == 'demo-token';

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
  }

  Future<String?> requestOtp(String phone) async {
    loading = true;
    error = null;
    notifyListeners();

    try {
      final data = await _client.request('POST', '/auth/otp/request', body: {
        'phone': phone,
        'purpose': 'LOGIN',
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

  Future<void> verifyOtp(String phone, String code) async {
    loading = true;
    error = null;
    notifyListeners();

    try {
      final data = await _client.request('POST', '/auth/otp/verify', body: {
        'phone': phone,
        'code': code,
        'purpose': 'LOGIN',
        'role': 'PASSENGER',
        'device': {'deviceId': 'flutter-android', 'platform': 'ANDROID'},
      }) as Map<String, dynamic>;

      accessToken = data['accessToken'] as String?;
      final refreshToken = data['refreshToken'] as String?;
      final profile = UserProfile.fromJson(data['user'] as Map<String, dynamic>);

      await AppStorage.write(AppStorage.accessToken, accessToken ?? '');
      if (refreshToken != null) {
        await AppStorage.write(AppStorage.refreshToken, refreshToken);
      }
      await AppStorage.write(AppStorage.user, jsonEncode(profile.toJson()));

      user = profile;
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
    final profile = UserProfile(id: 'demo-$phone', name: name, phone: phone);

    await AppStorage.write(AppStorage.accessToken, 'demo-token');
    await AppStorage.write(AppStorage.user, jsonEncode(profile.toJson()));

    user = profile;
    accessToken = 'demo-token';
    notifyListeners();
  }

  Future<void> updateProfile(String name, String? email) async {
    final current = user;
    if (current == null) return;

    if (AppConfig.hasApi && !isDemoSession) {
      try {
        await _client.request('PATCH', '/users/me', body: {
          'name': name,
          if (email != null && email.isNotEmpty) 'email': email,
        });
      } catch (_) {
        // O perfil local segue atualizado mesmo se a API falhar.
      }
    }

    user = current.copyWith(name: name, email: email);
    await AppStorage.write(AppStorage.user, jsonEncode(user!.toJson()));
    notifyListeners();
  }

  Future<void> logout() async {
    await AppStorage.clearSession();
    user = null;
    accessToken = null;
    notifyListeners();
  }
}
