import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:central_app/core/storage/app_storage.dart';
import 'package:central_app/core/storage/cofre.dart';
import 'package:central_app/core/storage/identidade_aparelho.dart';

/// Login da Central no cofre do celular (13/11/2026): sem deslogar quem ja
/// estava dentro, com plano B se o cofre do aparelho falhar, e sem mexer no
/// armazenamento do navegador (Central na web).
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const canal = MethodChannel('plugins.it_nomads.com/flutter_secure_storage');
  late Map<String, String> cofre;
  late bool cofreQuebrado;

  setUp(() {
    cofre = {};
    cofreQuebrado = false;
    Cofre.webDeTeste = null;
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
    Cofre.webDeTeste = null;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(canal, null);
  });

  test('sessao antiga do arquivo comum vai para o cofre sem deslogar', () async {
    SharedPreferences.setMockInitialValues({
      AppStorage.accessToken: 'acesso-antigo',
      AppStorage.refreshToken: 'renova-antigo',
      AppStorage.adminUser: '{"id":"1"}',
    });
    expect(await AppStorage.read(AppStorage.accessToken), 'acesso-antigo');
    expect(await AppStorage.read(AppStorage.refreshToken), 'renova-antigo');
    expect(await AppStorage.read(AppStorage.adminUser), '{"id":"1"}');
    expect(cofre[AppStorage.accessToken], 'acesso-antigo');
    expect(cofre[AppStorage.refreshToken], 'renova-antigo');
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.containsKey(AppStorage.accessToken), isFalse);
    expect(prefs.containsKey(AppStorage.refreshToken), isFalse);
    expect(prefs.containsKey(AppStorage.adminUser), isFalse);
  });

  test('login novo vai direto para o cofre; dado comum continua no arquivo comum', () async {
    SharedPreferences.setMockInitialValues({});
    await AppStorage.write(AppStorage.accessToken, 'novo');
    await AppStorage.write(AppStorage.refreshToken, 'r');
    await AppStorage.write('central.pendenteVisto', 'abc');
    final prefs = await SharedPreferences.getInstance();
    expect(cofre[AppStorage.accessToken], 'novo');
    expect(prefs.getString(AppStorage.accessToken), isNull);
    expect(prefs.getString(AppStorage.refreshToken), isNull);
    expect(prefs.getString('central.pendenteVisto'), 'abc');
    await AppStorage.remove(AppStorage.accessToken);
    expect(cofre.containsKey(AppStorage.accessToken), isFalse);
  });

  test('sair apaga login e dados da conta do cofre e do arquivo comum', () async {
    SharedPreferences.setMockInitialValues({AppStorage.refreshToken: 'sobra-antiga'});
    await AppStorage.write(AppStorage.accessToken, 'a');
    await AppStorage.write(AppStorage.refreshToken, 'r');
    await AppStorage.write(AppStorage.adminUser, '{}');
    await AppStorage.clearSession();
    expect(cofre, isEmpty);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getKeys().where((k) => k.startsWith('ride.')), isEmpty);
    expect(await AppStorage.read(AppStorage.refreshToken), isNull);
  });

  test('cofre com defeito no aparelho: continua logado pelo arquivo comum', () async {
    SharedPreferences.setMockInitialValues({AppStorage.accessToken: 'acesso-antigo'});
    cofreQuebrado = true;
    expect(await AppStorage.read(AppStorage.accessToken), 'acesso-antigo');
    await AppStorage.write(AppStorage.refreshToken, 'r2');
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString(AppStorage.refreshToken), 'r2');
    // Cofre volta a funcionar: o valor do comum sobe para o cofre na proxima leitura.
    cofreQuebrado = false;
    expect(await AppStorage.read(AppStorage.refreshToken), 'r2');
    expect(cofre[AppStorage.refreshToken], 'r2');
    expect(prefs.containsKey(AppStorage.refreshToken), isFalse);
  });

  test('Central no navegador: o cofre do celular nao e usado', () async {
    SharedPreferences.setMockInitialValues({});
    Cofre.webDeTeste = true;
    await AppStorage.write(AppStorage.accessToken, 'web');
    expect(cofre, isEmpty);
    expect(await AppStorage.read(AppStorage.accessToken), 'web');
    await AppStorage.remove(AppStorage.accessToken);
    expect(await AppStorage.read(AppStorage.accessToken), isNull);
  });

  test('codigo do aparelho da Central: sorteado uma vez e guardado no cofre', () async {
    SharedPreferences.setMockInitialValues({});
    final a = await IdentidadeDoAparelho.dados();
    expect(a['deviceId'], startsWith('and-'));
    expect((a['deviceId'] as String).length, 4 + 32);
    expect(cofre[AppStorage.idDoAparelho], (a['deviceId'] as String).substring(4));
  });
}
