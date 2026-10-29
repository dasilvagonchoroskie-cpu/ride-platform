// Medicao no 4G (29/10/2026): na primeira abertura, sem GPS e sem posicao
// guardada, o app do motorista ficava em "Localizando voce" (20 s ou mais).
// Agora o mapa abre na ultima posicao que o servidor conhece, ou no centro
// da cidade do motorista, e vai para a posicao certa quando o GPS chega.

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_driver/core/api/api_client.dart';
import 'package:mobile_driver/state/driver_state.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  DriverState novo() => DriverState(client: ApiClient(client: MockClient((r) async => http.Response('{}', 200))));

  test('sem posicao nenhuma: usa a ultima posicao do servidor', () {
    SharedPreferences.setMockInitialValues({});
    final d = novo();
    expect(d.temPosicao, isFalse);
    d.usarPosicaoDoServidor({
      'ultimaPosicao': {'latitude': -18.0101, 'longitude': -49.3501, 'em': '2026-10-29T10:00:00Z'},
      'praca': {'id': 'goiatuba', 'nome': 'Goiatuba', 'uf': 'GO', 'latitude': -18.0125, 'longitude': -49.3547},
    });
    expect(d.temPosicao, isTrue);
    expect(d.posicaoReal, isFalse, reason: 'o GPS ainda nao respondeu');
    expect(d.position.latitude, -18.0101);
  });

  test('sem ultima posicao: centro da cidade do motorista', () {
    SharedPreferences.setMockInitialValues({});
    final d = novo();
    d.usarPosicaoDoServidor({
      'ultimaPosicao': null,
      'praca': {'id': 'itumbiara-go', 'nome': 'Itumbiara', 'uf': 'GO', 'latitude': -18.42, 'longitude': -49.22},
    });
    expect(d.temPosicao, isTrue);
    expect(d.position.latitude, -18.42);
  });

  test('ja com posicao (guardada ou GPS): nao mexe; sem dados: continua esperando', () {
    SharedPreferences.setMockInitialValues({});
    final d = novo();
    d.usarPosicaoDoServidor({'ultimaPosicao': null, 'praca': null});
    expect(d.temPosicao, isFalse);
    d.usarPosicaoDoServidor({'praca': {'latitude': -18.42, 'longitude': -49.22}});
    d.usarPosicaoDoServidor({'ultimaPosicao': {'latitude': -1.0, 'longitude': -2.0}});
    expect(d.position.latitude, -18.42, reason: 'a primeira que abriu o mapa fica ate o GPS chegar');
  });
}
