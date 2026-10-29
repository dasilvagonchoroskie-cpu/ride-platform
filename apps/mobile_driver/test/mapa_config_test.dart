import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:mobile_driver/core/mapa/busca.dart';
import 'package:mobile_driver/core/mapa/map_provider.dart';
import 'package:mobile_driver/core/mapa/uso_local.dart';
import 'package:mobile_driver/core/mapa_config.dart';
import 'package:mobile_driver/widgets/contingencia_mapa.dart';

/// Endereco de imagens de mentira (NUNCA a chave de verdade).
const _falso = 'https://api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png?tileSize=512&key=CHAVEDETESTE0000000000';

void main() {
  late List<String> abertos;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    MapaConfig.padrao();
    await MapaConfig.esquecer();
    UsoLocal.zerar();
    abertos = [];
    abrirLink = (url) async {
      abertos.add(url);
      return true;
    };
  });

  group('MapaConfig (TomTom)', () {
    test('sem login o mapa nao tem endereco de imagens; fornecedor TomTom', () {
      expect(MapaConfig.tiles, isNull);
      expect(MapaConfig.provedor, 'tomtom');
      expect(MapaConfig.atribuicao, '© TomTom');
      expect(MapaConfig.tamanho, 512);
      expect(MapaConfig.atual.id, 'tomtom');
      expect(MapaConfig.atual.pronto, isFalse);
    });

    test('a configuracao publica nunca entrega a chave (tiles ignorado)', () {
      MapaConfig.aplicar({
        'mapa': {'provedor': 'tomtom', 'atribuicao': '© TomTom', 'tiles': _falso},
      });
      expect(MapaConfig.tiles, isNull);
      MapaConfig.aplicar({'cidades': <String>[]});
      expect(MapaConfig.provedor, 'tomtom');
    });

    test('com login usa o endereco do servidor, guarda e esquece ao sair', () async {
      var pedidos = 0;
      await MapaConfig.atualizarComLogin((caminho) async {
        expect(caminho, '/geo/mapa');
        pedidos++;
        return {'provedor': 'tomtom', 'tiles': _falso, 'atribuicao': '© TomTom', 'maxZoom': 20, 'tamanho': 512};
      });
      expect(pedidos, 1);
      expect(MapaConfig.tiles, _falso);
      expect(MapaConfig.atual.pronto, isTrue);
      await Future<void>.delayed(const Duration(milliseconds: 20));
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString('ride.mapaConfig'), contains('tomtom'));

      await MapaConfig.esquecer();
      expect(MapaConfig.tiles, isNull);
      expect(prefs.getString('ride.mapaConfig'), isNull);
    });

    test('pergunta ao servidor no maximo a cada 10 minutos (salvo depois de um limite)', () async {
      var pedidos = 0;
      Future<dynamic> pedir(String _) async {
        pedidos++;
        return {'tiles': _falso};
      }

      await MapaConfig.atualizarComLogin(pedir);
      await MapaConfig.atualizarComLogin(pedir);
      expect(pedidos, 1);
      MapaConfig.marcarLimite();
      await MapaConfig.atualizarComLogin(pedir);
      expect(pedidos, 2);
    });

    test('endereco ruim do servidor e ignorado (o mapa nunca quebra)', () async {
      for (final ruim in ['http://t.exemplo.com/{z}/{x}/{y}.png', 'https://t.exemplo.com/mapa.png', '', 42, 'https://t.exemplo.com/{z}/{x}/{y}.png?${'a' * 400}']) {
        MapaConfig.padrao();
        await MapaConfig.esquecer();
        await MapaConfig.atualizarComLogin((_) async => {'tiles': ruim});
        expect(MapaConfig.tiles, isNull, reason: '$ruim');
      }
    });

    test('o servidor liga o modo economia', () async {
      expect(MapaConfig.economia, isFalse);
      await MapaConfig.atualizarComLogin((_) async => {'tiles': _falso, 'economia': true});
      expect(MapaConfig.economia, isTrue);
    });
  });

  group('Contador local do dia', () {
    test('perto do teto (80%) entra no modo economia; no teto, acabou', () {
      final teto = UsoLocal.tetoDoDia['rotas']!;
      for (var i = 0; i < (teto * 0.8).ceil() - 1; i++) {
        UsoLocal.contar('rotas');
      }
      expect(UsoLocal.economia, isFalse);
      UsoLocal.contar('rotas');
      expect(UsoLocal.economia, isTrue);
      expect(MapaConfig.economia, isTrue);
      expect(UsoLocal.acabou('rotas'), isFalse);
      while (UsoLocal.hoje('rotas') < teto) {
        UsoLocal.contar('rotas');
      }
      expect(UsoLocal.acabou('rotas'), isTrue);
      UsoLocal.zerar();
      expect(UsoLocal.economia, isFalse);
    });
  });

  group('Regras da busca', () {
    test('so busca com 3 letras uteis ("rua", "av." nao contam)', () {
      expect(RegrasDaBusca.podeBuscar('Ru'), isFalse);
      expect(RegrasDaBusca.podeBuscar('Rua A'), isFalse);
      expect(RegrasDaBusca.podeBuscar('Av. Br'), isFalse);
      expect(RegrasDaBusca.podeBuscar('Av. Bra'), isTrue);
      expect(RegrasDaBusca.podeBuscar('Rua 13 de Maio'), isTrue);
      expect(RegrasDaBusca.letrasUteis('Avenida Goiás'), 5);
    });

    test('espera 500 ms depois da ultima tecla (900 ms no modo economia)', () async {
      expect(RegrasDaBusca.espera, const Duration(milliseconds: 500));
      await MapaConfig.atualizarComLogin((_) async => {'tiles': _falso, 'economia': true});
      expect(RegrasDaBusca.espera, const Duration(milliseconds: 900));
    });

    test('buscas guardadas: mesma busca nao vai ao servidor de novo', () {
      final g = BuscasGuardadas<String>(maximo: 2);
      final a = BuscasGuardadas.chave('  Rua  Goias ', -18.0101, -49.3502);
      expect(a, BuscasGuardadas.chave('rua goias', -18.0099, -49.3498));
      g.gravar(a, ['x']);
      expect(g.ler(a), ['x']);
      g.gravar('b', ['y']);
      g.gravar('c', ['z']);
      expect(g.ler(a), isNull);
      expect(g.ler('c'), ['z']);
    });
  });

  group('Contingencia (429/403)', () {
    testWidgets('mostra o endereco em texto e abre o Google Maps', (tester) async {
      await tester.pumpWidget(const MaterialApp(
        home: Scaffold(body: ContingenciaDoMapa(endereco: 'Rua Goiás, 100 - Centro, Itumbiara')),
      ));
      expect(find.text('Rua Goiás, 100 - Centro, Itumbiara'), findsOneWidget);
      await tester.tap(find.text('Abrir no Google Maps'));
      await tester.pump();
      expect(abertos.single, startsWith('https://www.google.com/maps/search/?api=1&query='));
      expect(Uri.parse(abertos.single).queryParameters['query'], 'Rua Goiás, 100 - Centro, Itumbiara');
    });

    testWidgets('sem chave nao desenha ruas; no limite mostra o aviso com o Google Maps', (tester) async {
      Widget mapa() => MaterialApp(
            home: SizedBox(
              width: 400,
              height: 600,
              child: FlutterMap(
                options: const MapOptions(initialCenter: LatLng(-18.4193, -49.2155), initialZoom: 14),
                children: [MapaConfig.atual.camadaDeRuas(pacote: 'teste')],
              ),
            ),
          );
      await tester.pumpWidget(mapa());
      expect(find.byType(TileLayer), findsNothing);
      expect(find.byType(AvisoLimiteDoMapa), findsNothing);

      MapaConfig.marcarLimite();
      await tester.pump();
      expect(find.byType(AvisoLimiteDoMapa), findsOneWidget);
      await tester.tap(find.text('Abrir no Google Maps'));
      await tester.pump();
      final ponto = Uri.parse(abertos.single).queryParameters['query']!.split(',').map(double.parse).toList();
      expect(ponto[0], closeTo(-18.4193, 0.0001));
      expect(ponto[1], closeTo(-49.2155, 0.0001));
    });
  });
}
