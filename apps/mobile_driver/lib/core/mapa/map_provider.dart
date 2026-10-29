import 'dart:async';
import 'dart:collection';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:http/http.dart' as http;

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

/// Cliente das imagens do mapa (TomTom). Conta cada imagem que sai do
/// celular (as do guardado nao passam aqui) e respeita o ritmo da TomTom.
///
/// Por que (Evandro, 29/10/2026: "tá demorando demais para carregar"): a
/// chave da TomTom aceita uns 10 pedidos de imagem POR SEGUNDO para a
/// plataforma inteira. O mapa pedia ~20 imagens de uma vez na abertura; as
/// que passavam do limite voltavam 429 ("devagar") e ficavam EM BRANCO ate o
/// mapa mexer. Agora:
/// - no maximo [maximoJuntas] imagens baixando ao mesmo tempo (as do meio da
///   tela primeiro — o flutter_map pede nessa ordem) e no maximo
///   [maximoPorSegundo] novas por segundo;
/// - 429/502/503/504: espera um pouco e tenta de novo (ate 4 vezes);
/// - 403 (chave recusada ou cota acabada): aviso de contingencia no mapa.
class ContadorDeImagens extends http.BaseClient {
  ContadorDeImagens({http.Client? interno}) : _interno = interno ?? http.Client();

  static const int maximoJuntas = 6;
  static const int maximoPorSegundo = 8;

  final http.Client _interno;
  final math.Random _sorte = math.Random();
  final Queue<Completer<void>> _fila = Queue<Completer<void>>();
  final Queue<DateTime> _saidas = Queue<DateTime>();
  int _baixando = 0;

  Future<void> _vez() async {
    if (_baixando < maximoJuntas) {
      _baixando++;
    } else {
      final c = Completer<void>();
      _fila.add(c);
      await c.future; // a vaga passa direto de quem terminou para este
    }
    // Ritmo: no maximo [maximoPorSegundo] saidas em 1 segundo.
    for (;;) {
      final agora = DateTime.now();
      while (_saidas.isNotEmpty && agora.difference(_saidas.first) >= const Duration(seconds: 1)) {
        _saidas.removeFirst();
      }
      if (_saidas.length < maximoPorSegundo) {
        _saidas.add(agora);
        return;
      }
      await Future<void>.delayed(const Duration(seconds: 1) - agora.difference(_saidas.first) + const Duration(milliseconds: 5));
    }
  }

  void _liberar() {
    if (_fila.isNotEmpty) {
      _fila.removeFirst().complete();
    } else if (_baixando > 0) {
      _baixando--;
    }
  }

  static bool _tentarDeNovo(int status) => status == 429 || status == 502 || status == 503 || status == 504;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    await _vez();
    var liberado = false;
    void liberar() {
      if (liberado) return;
      liberado = true;
      _liberar();
    }

    try {
      final inicio = DateTime.now();
      var pedido = request;
      for (var tentativa = 0;; tentativa++) {
        UsoLocal.contar('imagens');
        final r = await _interno.send(pedido);
        if (_tentarDeNovo(r.statusCode) && tentativa < 4) {
          await r.stream.drain<void>().catchError((_) {});
          Medida.imagem(r.statusCode, 0, DateTime.now().difference(inicio).inMilliseconds);
          await Future<void>.delayed(Duration(milliseconds: 500 * (1 << tentativa) + _sorte.nextInt(400)));
          // Um pedido HTTP so sai uma vez: copia para a nova tentativa.
          pedido = http.Request(request.method, request.url)..headers.addAll(request.headers);
          continue;
        }
        if (r.statusCode == 403) MapaConfig.marcarLimite();
        // O corpo da imagem ainda vai chegar: a vaga so libera no fim dele.
        var bytes = 0;
        final corpo = r.stream.transform(
          StreamTransformer<List<int>, List<int>>.fromHandlers(
            handleData: (dados, saida) {
              bytes += dados.length;
              saida.add(dados);
            },
            handleError: (erro, pilha, saida) {
              liberar();
              saida.addError(erro, pilha);
            },
            handleDone: (saida) {
              liberar();
              Medida.imagem(r.statusCode, bytes, DateTime.now().difference(inicio).inMilliseconds);
              saida.close();
            },
          ),
        );
        // Se ninguem ler o corpo (imagem que saiu da tela), libera em 20 s.
        Timer(const Duration(seconds: 20), liberar);
        return http.StreamedResponse(
          corpo,
          r.statusCode,
          contentLength: r.contentLength,
          request: r.request,
          headers: r.headers,
          isRedirect: r.isRedirect,
          persistentConnection: r.persistentConnection,
          reasonPhrase: r.reasonPhrase,
        );
      }
    } catch (e) {
      liberar();
      rethrow;
    }
  }
}

/// TomTom (desde 29/10/2026). Imagens de 512 px: 4 vezes menos pedidos que as
/// de 256 px para a mesma tela. Guardado no celular de ate 200 MB
/// (MapaConfig.limiteDoGuardado).
class TomTomMapProvider implements MapProvider {
  TomTomMapProvider._();

  static final TomTomMapProvider instancia = TomTomMapProvider._();

  static final ContadorDeImagens _cliente = ContadorDeImagens();

  /// Um so fornecedor de imagens para todos os mapas (criado uma vez).
  static final NetworkTileProvider _imagens = NetworkTileProvider(httpClient: _cliente);

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
                // So as imagens que aparecem na tela (antes: mais uma volta
                // em cada lado, ~3 vezes mais imagens na abertura).
                panBuffer: 0,
                tileProvider: _imagens,
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
