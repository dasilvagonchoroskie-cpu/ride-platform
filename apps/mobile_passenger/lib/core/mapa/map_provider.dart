import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:http/http.dart' as http;
import 'package:http/retry.dart';

import '../mapa_config.dart';
import '../medida.dart';
import 'uso_local.dart';

/// Quem fornece o mapa do app (pedido do Evandro, 29/10/2026: "interface
/// MapProvider para eu trocar depois por Google Maps sem reescrever o app").
///
/// As telas so pedem `MapaConfig.atual.camadaDeRuas(...)`; a busca de
/// endereco e a rota ja passam pelo servidor (GET /geo/...), que escolhe o
/// fornecedor. Trocar de fornecedor = outra implementacao desta interface
/// (ex.: GoogleMapProvider, que ja tem o mapa nativo em widgets/mapa_google.dart).
abstract class MapProvider {
  /// 'tomtom', 'google'...
  String get id;

  /// Texto de atribuicao obrigatorio do fornecedor.
  String get atribuicao;

  /// Ja tem o endereco das imagens (com a chave, vindo do servidor).
  bool get pronto;

  /// Camada de ruas para o flutter_map. Mostra o aviso de contingencia quando
  /// o fornecedor responde limite (429/403).
  Widget camadaDeRuas({required String pacote, double maxZoom = 19});
}

/// Conta cada imagem que sai do celular para a TomTom (as do guardado nao
/// passam aqui) e percebe o limite (429/403).
class ContadorDeImagens extends http.BaseClient {
  ContadorDeImagens() : _interno = RetryClient(http.Client());

  final http.Client _interno;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    UsoLocal.contar('imagens');
    final r = await _interno.send(request);
    if (r.statusCode == 429 || r.statusCode == 403) MapaConfig.marcarLimite();
    return r;
  }
}

/// TomTom (desde 29/10/2026). Imagens de 512 px: 4 vezes menos pedidos que as
/// de 256 px para a mesma tela. Guardado no celular de ate 200 MB
/// (MapaConfig.limiteDoGuardado).
class TomTomMapProvider implements MapProvider {
  TomTomMapProvider._();

  static final TomTomMapProvider instancia = TomTomMapProvider._();

  static final ContadorDeImagens _cliente = ContadorDeImagens();

  @override
  String get id => 'tomtom';

  @override
  String get atribuicao => MapaConfig.atribuicao;

  @override
  bool get pronto => MapaConfig.tiles != null;

  @override
  Widget camadaDeRuas({required String pacote, double maxZoom = 19}) {
    return ValueListenableBuilder<int>(
      valueListenable: MapaConfig.mudou,
      builder: (context, mudancas, filho) {
        final tiles = MapaConfig.tiles;
        final economia = MapaConfig.economia;
        // No modo economia: sem as ruas mais de perto e sem buscar imagens
        // em volta da tela (so o que aparece).
        final teto = economia ? (maxZoom < 17 ? maxZoom : 17.0) : maxZoom;
        final camada = tiles == null
            ? const SizedBox.shrink()
            : TileLayer(
                urlTemplate: tiles,
                userAgentPackageName: pacote,
                tileDimension: MapaConfig.tamanho,
                zoomOffset: MapaConfig.tamanho >= 512 ? -1 : 0,
                maxZoom: teto,
                keepBuffer: economia ? 1 : 2,
                panBuffer: economia ? 0 : 1,
                tileProvider: NetworkTileProvider(httpClient: _cliente),
                tileBuilder: Medida.ligada ? Medida.construtorDeImagem : null,
                errorTileCallback: (tile, error, stackTrace) {
                  // Imagem que nao veio fica no fundo, sem quebrar o mapa.
                },
              );
        if (!MapaConfig.limiteDasImagens) return camada;
        return Stack(fit: StackFit.expand, children: [camada, const AvisoLimiteDoMapa()]);
      },
    );
  }
}

/// Contingencia do mapa (429/403): aviso fixo em cima do mapa com
/// "Abrir no Google Maps" no ponto do centro.
class AvisoLimiteDoMapa extends StatelessWidget {
  const AvisoLimiteDoMapa({super.key});

  @override
  Widget build(BuildContext context) {
    final centro = MapCamera.maybeOf(context)?.center;
    return Align(
      alignment: Alignment.topCenter,
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 64, 12, 0),
          child: Material(
            color: Colors.white,
            elevation: 3,
            borderRadius: BorderRadius.circular(14),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
              child: Row(
                children: [
                  const Icon(Icons.map_outlined, color: Color(0xFFB45309)),
                  const SizedBox(width: 10),
                  const Expanded(
                    child: Text(
                      'O mapa está no limite agora. As ruas podem não aparecer.',
                      style: TextStyle(fontSize: 14, color: Color(0xFF14181F)),
                    ),
                  ),
                  if (centro != null)
                    TextButton(
                      onPressed: () => abrirNoGoogleMaps(latitude: centro.latitude, longitude: centro.longitude),
                      child: const Text('Abrir no Google Maps'),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Abre o Google Maps (app ou site) num ponto ou num endereco escrito.
/// Cada app define [abrirLink] na abertura (a forma de abrir link do app).
Future<bool> Function(String url) abrirLink = (url) async => false;

Future<bool> abrirNoGoogleMaps({double? latitude, double? longitude, String? endereco}) {
  final busca = latitude != null && longitude != null
      ? '${latitude.toStringAsFixed(6)},${longitude.toStringAsFixed(6)}'
      : (endereco ?? '').trim();
  return abrirLink('https://www.google.com/maps/search/?api=1&query=${Uri.encodeComponent(busca)}');
}
