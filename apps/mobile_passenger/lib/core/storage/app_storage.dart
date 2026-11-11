import 'package:shared_preferences/shared_preferences.dart';

import 'cofre.dart';

/// Persistencia local (sessao, corrida ativa, lugares recentes).
class AppStorage {
  const AppStorage._();

  static const String accessToken = 'ride.accessToken';
  static const String refreshToken = 'ride.refreshToken';
  static const String user = 'ride.user';
  static const String activeRide = 'ride.activeRide';
  static const String recentPlaces = 'ride.recentPlaces';
  static const String recentDestinations = 'ride.recentDestinations';
  static const String configApp = 'ride.configApp';
  static const String avisoVisto = 'ride.avisoVisto';

  /// Ultima posicao do GPS neste aparelho: o mapa abre nela na hora,
  /// enquanto o GPS acerta (pedido do Evandro, 29/10/2026).
  static const String ultimaPosicao = 'ride.ultimaPosicao';

  /// Conta dona dos dados guardados no aparelho (historico, destinos).
  static const String donoDosDados = 'ride.donoDosDados';

  /// Codigo unico desta instalacao (Requisicao 1, 11/11/2026): a Central
  /// separa cada celular da conta e pode desconectar um so.
  static const String idDoAparelho = 'ride.idDoAparelho';

  /// O que vai para o cofre do celular (flutter_secure_storage). O resto e
  /// dado comum (preferencias, ultima posicao) e fica no arquivo comum.
  static const Set<String> _noCofre = {accessToken, refreshToken, idDoAparelho};

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
    await prefs.remove(user);
    await prefs.remove(activeRide);
    // Destinos e lugares recentes sao da pessoa: a proxima conta comeca limpa.
    await prefs.remove(recentPlaces);
    await prefs.remove(recentDestinations);
    await prefs.remove(donoDosDados);
    await prefs.remove(ultimaPosicao);
  }
}
