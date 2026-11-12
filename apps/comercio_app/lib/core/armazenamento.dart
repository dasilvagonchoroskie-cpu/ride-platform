import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Onde ficam a chave de acesso e a de renovacao. Em teste usa-se a versao
/// em memoria; no celular, o cofre (Android Keystore).
abstract class Armazenamento {
  Future<String?> ler(String chave);
  Future<void> gravar(String chave, String valor);
  Future<void> apagar(String chave);

  static const String acesso = 'comercio.acesso';
  static const String renovacao = 'comercio.renovacao';
  static const String aparelho = 'comercio.aparelho';
  static const String email = 'comercio.email';

  static Armazenamento atual = ArmazenamentoCofre();
}

class ArmazenamentoEmMemoria implements Armazenamento {
  final Map<String, String> _d = {};

  @override
  Future<String?> ler(String chave) async => _d[chave];

  @override
  Future<void> gravar(String chave, String valor) async => _d[chave] = valor;

  @override
  Future<void> apagar(String chave) async => _d.remove(chave);
}

/// Cofre do celular; se ele falhar (defeito conhecido em alguns aparelhos),
/// segue com o arquivo comum para nao deslogar a pessoa.
class ArmazenamentoCofre implements Armazenamento {
  static const FlutterSecureStorage _cofre = FlutterSecureStorage(aOptions: AndroidOptions(resetOnError: false));

  @override
  Future<String?> ler(String chave) async {
    try {
      final v = await _cofre.read(key: chave);
      if (v != null) return v;
    } catch (_) {}
    return (await SharedPreferences.getInstance()).getString(chave);
  }

  @override
  Future<void> gravar(String chave, String valor) async {
    final prefs = await SharedPreferences.getInstance();
    try {
      await _cofre.write(key: chave, value: valor);
      await prefs.remove(chave);
    } catch (_) {
      await prefs.setString(chave, valor);
    }
  }

  @override
  Future<void> apagar(String chave) async {
    try {
      await _cofre.delete(key: chave);
    } catch (_) {}
    await (await SharedPreferences.getInstance()).remove(chave);
  }
}
