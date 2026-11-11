import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Cofre do celular (Requisicao 1, 11/11/2026): as chaves de acesso e o
/// codigo deste aparelho ficam no `flutter_secure_storage` (cifrado com chave
/// do Android Keystore), e nao mais no arquivo comum do aplicativo.
///
/// - Quem ja estava logado NAO precisa entrar de novo: na primeira leitura,
///   o valor antigo do arquivo comum vai para o cofre e sai de la.
/// - Os servicos nativos (chamadas com o app fechado) leem e renovam o login
///   pelo MESMO cofre (CofreNativo.java, com as mesmas opcoes de baixo).
/// - Se o cofre do celular falhar (alguns aparelhos tem defeito no Keystore),
///   o app continua funcionando com o arquivo comum em vez de deslogar.
class Cofre {
  const Cofre._();

  /// IGUAIS as do CofreNativo.java. Mudar aqui exige mudar la.
  static const AndroidOptions opcoesAndroid = AndroidOptions(resetOnError: false);

  static FlutterSecureStorage _cofre = const FlutterSecureStorage(aOptions: opcoesAndroid);

  /// So para testes.
  @visibleForTesting
  static set cofreDeTeste(FlutterSecureStorage c) => _cofre = c;

  static Future<String?> ler(String chave) async {
    final prefs = await SharedPreferences.getInstance();
    String? guardado;
    try {
      guardado = await _cofre.read(key: chave);
    } catch (_) {
      return prefs.getString(chave); // cofre com defeito: segue com o comum
    }
    if (guardado != null) {
      if (prefs.containsKey(chave)) await prefs.remove(chave); // sobra antiga
      return guardado;
    }
    // Sessao de antes do cofre: leva para o cofre sem deslogar.
    final antigo = prefs.getString(chave);
    if (antigo != null) {
      try {
        await _cofre.write(key: chave, value: antigo);
        await prefs.remove(chave);
      } catch (_) {
        // Fica no comum ate o cofre voltar a funcionar.
      }
    }
    return antigo;
  }

  static Future<void> gravar(String chave, String valor) async {
    final prefs = await SharedPreferences.getInstance();
    try {
      await _cofre.write(key: chave, value: valor);
      await prefs.remove(chave);
    } catch (_) {
      await prefs.setString(chave, valor);
    }
  }

  static Future<void> apagar(String chave) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(chave);
    try {
      await _cofre.delete(key: chave);
    } catch (_) {}
  }
}
