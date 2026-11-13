import 'package:shared_preferences/shared_preferences.dart';

import 'cofre.dart';

/// Persistencia local (sessao, corrida ativa, lugares recentes).
///
/// Login, codigo do aparelho e dados da conta ficam no cofre do celular
/// (flutter_secure_storage, 13/11/2026); o resto e dado comum.
class AppStorage {
  const AppStorage._();

  static const String accessToken = 'ride.accessToken';
  static const String refreshToken = 'ride.refreshToken';
  static const String user = 'ride.user';
  static const String activeRide = 'ride.activeRide';
  static const String recentPlaces = 'ride.recentPlaces';
  static const String adminUser = 'ride.adminUser';
  static const String idDoAparelho = 'ride.idDoAparelho';

  /// O que vai para o cofre. `idDoAparelho` e o de identidade_aparelho.dart.
  /// `adminUser` e nome/e-mail da conta (dado pessoal).
  static const Set<String> _noCofre = {accessToken, refreshToken, idDoAparelho, adminUser};

  static Future<void> write(String key, String value) async {
    if (_noCofre.contains(key)) return Cofre.gravar(key, value);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(key, value);
  }

  static Future<String?> read(String key) async {
    if (_noCofre.contains(key)) return Cofre.ler(key);
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(key);
  }

  static Future<void> remove(String key) async {
    if (_noCofre.contains(key)) return Cofre.apagar(key);
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(key);
  }

  static Future<void> clearSession() async {
    final prefs = await SharedPreferences.getInstance();
    await Cofre.apagar(accessToken);
    await Cofre.apagar(refreshToken);
    await Cofre.apagar(adminUser);
    await prefs.remove(user);
    await prefs.remove(activeRide);
  }
}
