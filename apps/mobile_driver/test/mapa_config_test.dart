import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:mobile_driver/core/mapa_config.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    MapaConfig.padrao();
  });

  test('sem nada do servidor, o mapa e o OpenStreetMap', () {
    expect(MapaConfig.tiles, 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
    expect(MapaConfig.atribuicao, '© OpenStreetMap contributors');
    expect(MapaConfig.maxZoom, 19);
  });

  test('servidor antigo (sem "mapa") nao muda nada', () {
    MapaConfig.aplicar({'cidades': <String>[]});
    expect(MapaConfig.tiles, MapaConfig.padraoTiles);
  });

  test('usa o endereco que o servidor mandar quando ele e valido', () {
    MapaConfig.aplicar({
      'mapa': {'tiles': 'https://tiles.exemplo.com.br/{z}/{x}/{y}.png', 'atribuicao': '© Exemplo', 'maxZoom': 18},
    });
    expect(MapaConfig.tiles, 'https://tiles.exemplo.com.br/{z}/{x}/{y}.png');
    expect(MapaConfig.atribuicao, '© Exemplo');
    expect(MapaConfig.maxZoom, 18);
  });

  test('endereco errado volta para o OpenStreetMap (o mapa nunca quebra)', () {
    for (final ruim in ['http://t.exemplo.com/{z}/{x}/{y}.png', 'https://t.exemplo.com/mapa.png', '', 42]) {
      MapaConfig.aplicar({
        'mapa': {'tiles': 'https://tiles.exemplo.com.br/{z}/{x}/{y}.png'},
      });
      MapaConfig.aplicar({
        'mapa': {'tiles': ruim},
      });
      expect(MapaConfig.tiles, MapaConfig.padraoTiles, reason: '$ruim');
      expect(MapaConfig.atribuicao, MapaConfig.padraoAtribuicao);
    }
  });

  test('o servidor pode voltar todo mundo para o OpenStreetMap (mapa.provedor)', () {
    expect(MapaConfig.provedor, 'google');
    MapaConfig.aplicar({
      'mapa': {'tiles': MapaConfig.padraoTiles, 'provedor': 'osm'},
    });
    expect(MapaConfig.provedor, 'osm');
    MapaConfig.aplicar({
      'mapa': {'tiles': MapaConfig.padraoTiles},
    });
    expect(MapaConfig.provedor, 'google');
  });
}
