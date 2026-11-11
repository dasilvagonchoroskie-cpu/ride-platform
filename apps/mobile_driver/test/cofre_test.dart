import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:mobile_driver/core/storage/app_storage.dart';
import 'package:mobile_driver/core/storage/identidade_aparelho.dart';

/// Requisicao 1 (11/11/2026): login no cofre do celular sem deslogar quem
/// ja estava dentro, e um codigo unico por instalacao.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const canal = MethodChannel('plugins.it_nomads.com/flutter_secure_storage');
  late Map<String, String> cofre;
  late bool cofreQuebrado;

  setUp(() {
    cofre = {};
    cofreQuebrado = false;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(canal, (call) async {
      if (cofreQuebrado) throw PlatformException(code: 'Keystore', message: 'defeito');
      final a = (call.arguments as Map).cast<String, dynamic>();
      final k = a['key'] as String?;
      switch (call.method) {
        case 'read':
          return cofre[k];
        case 'write':
          cofre[k!] = a['value'] as String;
          return null;
        case 'delete':
          cofre.remove(k);
          return null;
        case 'containsKey':
          return cofre.containsKey(k);
      }
      return null;
    });
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(canal, null);
  });

  test('sessao antiga do arquivo comum vai para o cofre sem deslogar', () async {
    SharedPreferences.setMockInitialValues({AppStorage.accessToken: 'acesso-antigo', AppStorage.refreshToken: 'renova-antigo'});
    expect(await AppStorage.read(AppStorage.accessToken), 'acesso-antigo');
    expect(await AppStorage.read(AppStorage.refreshToken), 'renova-antigo');
    expect(cofre[AppStorage.accessToken], 'acesso-antigo');
    expect(cofre[AppStorage.refreshToken], 'renova-antigo');
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.containsKey(AppStorage.accessToken), isFalse);
    expect(prefs.containsKey(AppStorage.refreshToken), isFalse);
  });

  test('login novo vai direto para o cofre; dado comum continua no arquivo comum', () async {
    SharedPreferences.setMockInitialValues({});
    await AppStorage.write(AppStorage.accessToken, 'novo');
    await AppStorage.write(AppStorage.ultimaPosicao, '1,2');
    final prefs = await SharedPreferences.getInstance();
    expect(cofre[AppStorage.accessToken], 'novo');
    expect(prefs.getString(AppStorage.accessToken), isNull);
    expect(prefs.getString(AppStorage.ultimaPosicao), '1,2');
    await AppStorage.remove(AppStorage.accessToken);
    expect(cofre.containsKey(AppStorage.accessToken), isFalse);
  });

  test('cofre com defeito no aparelho: continua logado pelo arquivo comum', () async {
    SharedPreferences.setMockInitialValues({AppStorage.accessToken: 'acesso-antigo'});
    cofreQuebrado = true;
    expect(await AppStorage.read(AppStorage.accessToken), 'acesso-antigo');
    await AppStorage.write(AppStorage.refreshToken, 'r2');
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString(AppStorage.refreshToken), 'r2');
  });

  test('codigo da instalacao: sorteado uma vez, guardado no cofre e unico', () async {
    SharedPreferences.setMockInitialValues({});
    final a = await IdentidadeDoAparelho.dados();
    expect(a['deviceId'], startsWith('and-'));
    expect((a['deviceId'] as String).length, 4 + 32);
    expect(a['platform'], 'ANDROID');
    expect(cofre[AppStorage.idDoAparelho], (a['deviceId'] as String).substring(4));
    expect(IdentidadeDoAparelho.sortear(), isNot(IdentidadeDoAparelho.sortear()));
  });
}
