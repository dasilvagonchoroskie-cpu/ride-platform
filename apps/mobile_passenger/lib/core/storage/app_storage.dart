import 'package:shared_preferences/shared_preferences.dart';

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

  /// Conta dona dos dados guardados no aparelho (historico, destinos).
  static const String donoDosDados = 'ride.donoDosDados';

  static Future<void> write(String key, String value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(key, value);
  }

  static Future<String?> read(String key) async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(key);
  }

  static Future<void> remove(String key) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(key);
  }

  static Future<void> clearSession() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(accessToken);
    await prefs.remove(refreshToken);
    await prefs.remove(user);
    await prefs.remove(activeRide);
    // Destinos e lugares recentes sao da pessoa: a proxima conta comeca limpa.
    await prefs.remove(recentPlaces);
    await prefs.remove(recentDestinations);
    await prefs.remove(donoDosDados);
  }
}
