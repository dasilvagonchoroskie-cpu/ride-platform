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
  static const String driverProfile = 'ride.driverProfile';
  static const String vehicle = 'ride.vehicle';
  /// Taximetro da viagem em andamento (sobrevive ao app fechar).
  static const String taximetro = 'ride.taximetro';

  /// Ultima posicao do GPS: o mapa abre nela na hora, enquanto o GPS acerta
  /// (pedido do Evandro, 29/10/2026).
  static const String ultimaPosicao = 'ride.ultimaPosicao';

  /// Quando o motorista fechou (X) o aviso "Saldo se esgotando" e em que
  /// nivel estava (1 se esgotando, 2 sem saldo).
  static const String avisoSaldoFechado = 'ride.avisoSaldoFechado';

  /// Escolha da bussola do mapa: '1' automatica, '0' norte travado para cima
  /// (Evandro, 05/11/2026: "travei no norte e quando saio volta").
  static const String bussolaAutomatica = 'ride.bussolaAutomatica';

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

  static Future<void> clearDriverSession() async {
    final prefs = await SharedPreferences.getInstance();
    await Cofre.apagar(accessToken);
    // Sem isto, depois de "Sair" o app podia renovar sozinho o login da
    // conta antiga no primeiro pedido recusado.
    await Cofre.apagar(refreshToken);
    await prefs.remove(driverProfile);
    await prefs.remove(vehicle);
    await prefs.remove(activeRide);
    await prefs.remove(taximetro);
    await prefs.remove(ultimaPosicao);
    await prefs.remove(avisoSaldoFechado);
  }

  static Future<void> clearSession() async {
    final prefs = await SharedPreferences.getInstance();
    await Cofre.apagar(accessToken);
    await Cofre.apagar(refreshToken);
    await prefs.remove(user);
    await prefs.remove(activeRide);
  }
}
