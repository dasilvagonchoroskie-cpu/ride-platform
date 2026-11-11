import 'dart:math';

import '../permissoes_nativas.dart';
import 'app_storage.dart';

/// Quem e este celular para o servidor (Requisicao 1, 11/11/2026).
///
/// Antes todo celular mandava o mesmo nome no login, e a Central via dois
/// celulares da mesma pessoa como um aparelho so. Agora cada instalacao tem
/// um codigo proprio, sorteado na primeira vez e guardado no cofre; vai no
/// login junto com marca/modelo e a versao do Android (so para a Central
/// reconhecer o celular na lista). Reinstalar o app gera um codigo novo.
class IdentidadeDoAparelho {
  const IdentidadeDoAparelho._();

  static Map<String, dynamic>? _dados;

  static Future<Map<String, dynamic>> dados() async {
    final pronto = _dados;
    if (pronto != null) return pronto;
    var id = await AppStorage.read(AppStorage.idDoAparelho);
    if (id == null || id.length < 16) {
      id = sortear();
      await AppStorage.write(AppStorage.idDoAparelho, id);
    }
    final perfil = await PermissoesNativas.aparelho();
    final marca = (perfil['marca'] ?? '').toString().trim();
    final modelo = (perfil['modelo'] ?? '').toString().trim();
    final android = (perfil['android'] ?? '').toString().trim();
    final nome = [marca, modelo].where((s) => s.isNotEmpty).join(' ');
    final dados = <String, dynamic>{
      'deviceId': 'and-$id',
      'platform': 'ANDROID',
      if (nome.isNotEmpty) 'model': nome.length > 120 ? nome.substring(0, 120) : nome,
      if (android.isNotEmpty) 'osVersion': 'Android $android',
    };
    // Sem o perfil (canal nativo ainda nao respondeu), tenta de novo depois.
    if (nome.isNotEmpty) _dados = dados;
    return dados;
  }

  /// 32 letras hexadecimais aleatorias (128 bits).
  static String sortear() {
    final r = Random.secure();
    return List<String>.generate(16, (_) => r.nextInt(256).toRadixString(16).padLeft(2, '0')).join();
  }
}
