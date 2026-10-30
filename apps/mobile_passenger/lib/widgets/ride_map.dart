import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart' as gm;
import 'package:latlong2/latlong.dart';

import '../core/theme/app_theme.dart';
import '../core/utils/geo.dart';
import '../core/utils/filtro_gps.dart';
import '../core/situacao_veiculo.dart';
import 'bussola.dart';
import 'mapa_google.dart';
import '../core/mapa_config.dart';
import '../core/medida.dart';

export '../core/situacao_veiculo.dart';

/// [moto]: mototaxi (Evandro, 10/10/2026), desenhado como moto no mapa.
enum MarkerKind { pickup, dropoff, driver, car, moto }

class MapMarker {
  const MapMarker({
    required this.id,
    required this.coords,
    required this.kind,
    this.label,
    this.rumo,
    this.situacao = SituacaoVeiculo.livre,
  });

  final String id;
  final Coords coords;
  final MarkerKind kind;
  final String? label;

  /// Para onde o veiculo aponta (graus, 0 = norte). Sem ele, o mapa usa a
  /// direcao do caminho entre uma posicao e a seguinte (Evandro, 30/10/2026:
  /// "o carro nao acompanha o sentido da rua").
  final double? rumo;

  /// Cor do veiculo: livre (verde), ocupado (laranja), offline (cinza).
  final SituacaoVeiculo situacao;
}

bool _ehVeiculo(MarkerKind k) => k == MarkerKind.car || k == MarkerKind.driver || k == MarkerKind.moto;

/// Figura do veiculo (vista de cima, frente para o norte) na cor da situacao.
String nomeDoVeiculo(MapMarker m) => '${m.kind == MarkerKind.moto ? 'moto' : 'carro'}_${m.situacao.name}';

/// Desenho das ruas. Os testes automaticos desligam (la nao ha internet) —
/// e com isso usam sempre o flutter_map (o Google precisa do celular).
bool mostrarRuasNoMapa = true;

/// Mapa do app.
///
/// - Montagem com a chave do Google (esteira): mapa do **Google Maps**
///   (Maps SDK, gratuito no celular), o mesmo dos apps de corrida grandes.
/// - Sem a chave, ou nos testes automaticos: **TomTom** via flutter_map
///   (MapaConfig.atual; a chave vem do servidor so com login), com a
///   atribuicao exigida pela TomTom no canto.
class RideMap extends StatefulWidget {
  const RideMap({
    super.key,
    required this.center,
    required this.markers,
    this.route = const [],
    this.driverRoute = const [],
    this.height,
    this.span = 0.05,
    this.rounded = true,
    this.interactive = true,
    this.recentrar = 0,
    this.bussola = false,
    this.minhaPosicao,
    this.bussolaAutomatica = false,
    this.controlesAlinhamento = const Alignment(1, -0.45),
    this.controlesEmLinha = false,
    this.controlesMargem = const EdgeInsets.all(Spacing.md),
    this.enquadrar = const [],
    this.enquadrarChave,
    this.enquadrarMargem = const EdgeInsets.fromLTRB(40, 72, 40, 40),
    this.atribuicaoTopo = 72,
  });

  /// Mapa de tela cheia: distancia da atribuicao "© TomTom" ate o alto da
  /// tela (abaixo da barra de cima; telas com o taximetro no alto usam mais).
  final double atribuicaoTopo;

  /// Mostra a bussola (Evandro, 08/10/2026: "nos tres aplicativos").
  final bool bussola;

  /// Com ela, aparece tambem o botao de centralizar (telas sem botao proprio).
  final Coords? minhaPosicao;

  /// A bussola ja comeca no automatico (o mapa gira com o celular e segue a posicao).
  final bool bussolaAutomatica;

  /// Onde ficam a bussola e o centralizar (fora do caminho dos paineis).
  final Alignment controlesAlinhamento;

  /// Bussola e centralizar lado a lado (em vez de um embaixo do outro).
  final bool controlesEmLinha;

  /// Distancia dos botoes do mapa ate a borda (ex.: para ficar abaixo do SOS).
  final EdgeInsets controlesMargem;

  /// Mude o numero para o mapa voltar a [center] (botao "minha localizacao").
  final int recentrar;

  /// Pontos que tem que caber INTEIROS na tela (embarque, destino, carro,
  /// rota). Com eles o mapa abre o suficiente para mostrar a viagem toda —
  /// antes o zoom era fixo e uma corrida longa (Goiatuba → Rio Verde, 193 km)
  /// mostrava so um pedaco vazio no meio do caminho (Evandro, 09/10/2026).
  final List<Coords> enquadrar;

  /// Mude para o mapa enquadrar de novo (ex.: chegou a rota, mudou a etapa).
  final Object? enquadrarChave;

  /// Espaco livre nas bordas (botoes em cima, painel embaixo).
  final EdgeInsets enquadrarMargem;

  final Coords center;
  final List<MapMarker> markers;
  final List<Coords> route;
  final List<Coords> driverRoute;
  final double? height;
  final double span;
  final bool rounded;
  final bool interactive;

  @override
  State<RideMap> createState() => _RideMapState();
}

class _RideMapState extends State<RideMap> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  final Map<String, Coords> _animated = {};
  final Map<String, Coords> _targets = {};

  /// Rumo de cada veiculo: de onde a animacao parte e onde chega (graus).
  final Map<String, double> _rumoDe = {};
  final Map<String, double> _rumoAlvo = {};
  final MapController _mapa = MapController();
  late final ControleFlutterMap _controleOsm = ControleFlutterMap(_mapa);
  final ControleGoogle _controleGoogle = ControleGoogle();

  /// Icones dos marcadores no mapa do Google (carregados uma vez).
  static Future<Map<String, gm.BitmapDescriptor>>? _icones;
  Map<String, gm.BitmapDescriptor>? _bitmaps;

  /// Ultimo tamanho do mapa na tela (para a folga caber).
  Size? _tamanho;

  /// Bussola no automatico: o mapa acompanha a posicao.
  bool _seguir = false;

  /// No Google, o carro anda em passos (cada quadro iria ao mapa nativo).
  double _ultimoQuadro = 0;

  bool get _google => usarGoogleMaps && mostrarRuasNoMapa;

  ControleDoMapa get _controle => _google ? _controleGoogle : _controleOsm;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 850))..addListener(_aoAnimar);
    _syncTargets(initial: true);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_google && _bitmaps == null) {
      final cfg = createLocalImageConfiguration(context);
      _icones ??= _carregarIcones(cfg);
      _icones!.then((m) {
        if (mounted) setState(() => _bitmaps = m);
      }).catchError((_) {});
    }
  }

  static const _veiculos = ['carro_livre', 'carro_ocupado', 'carro_offline', 'moto_livre', 'moto_ocupado', 'moto_offline'];

  static Future<Map<String, gm.BitmapDescriptor>> _carregarIcones(ImageConfiguration cfg) async {
    final icones = <String, gm.BitmapDescriptor>{
      'pickup': await gm.BitmapDescriptor.asset(cfg, 'assets/markers/pin_pickup.png', width: 34, height: 34),
      'dropoff': await gm.BitmapDescriptor.asset(cfg, 'assets/markers/pin_dropoff.png', width: 34, height: 34),
    };
    for (final v in _veiculos) {
      icones[v] = await gm.BitmapDescriptor.asset(cfg, 'assets/markers/$v.png', width: 44, height: 44);
    }
    return icones;
  }

  void _aoAnimar() {
    if (_google) {
      final v = _controller.value;
      if (v < 1 && (v - _ultimoQuadro).abs() < 0.12) return;
      _ultimoQuadro = v;
    }
    setState(() {});
  }

  double get _zoomAtual {
    if (_google) return _controleGoogle.zoom;
    try {
      return _mapa.camera.zoom;
    } catch (_) {
      return _zoom;
    }
  }

  void _mover(Coords alvo, double zoom) {
    if (_google) {
      _controleGoogle.mover(alvo, zoom: zoom);
      return;
    }
    try {
      _mapa.move(_latLng(alvo), zoom);
    } catch (_) {
      // Mapa ainda nao desenhado: o centro inicial ja e este.
    }
  }

  void _centralizar() => _mover(widget.minhaPosicao ?? widget.center, math.max(_zoomAtual, 15));

  @override
  void didUpdateWidget(covariant RideMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.enquadrarChave != oldWidget.enquadrarChave) _enquadrarDeNovo();
    if (widget.recentrar != oldWidget.recentrar) _mover(widget.center, _zoom);
    final antes = oldWidget.minhaPosicao;
    final agora = widget.minhaPosicao;
    if (_seguir && agora != null && (antes == null || antes.latitude != agora.latitude || antes.longitude != agora.longitude)) {
      _mover(agora, _zoomAtual);
    }
    _syncTargets();
  }

  /// Detecta mudanca de posicao (e de rumo) dos veiculos e anima ate o novo
  /// ponto, girando pelo lado mais curto. A animacao recomeca de onde cada
  /// veiculo esta AGORA (antes voltava ao ponto anterior e dava um pulo).
  void _syncTargets({bool initial = false}) {
    final agora = <String, Coords>{};
    final rumoAgora = <String, double>{};
    for (final id in _targets.keys) {
      final p = _posicaoAgora(id);
      if (p != null) agora[id] = p;
      final r = _rumoAgora(id);
      if (r != null) rumoAgora[id] = r;
    }
    final vivos = <String>{
      for (final m in widget.markers)
        if (_ehVeiculo(m.kind)) m.id,
    };
    _targets.removeWhere((id, _) => !vivos.contains(id));
    _animated.removeWhere((id, _) => !vivos.contains(id));
    _rumoAlvo.removeWhere((id, _) => !vivos.contains(id));
    _rumoDe.removeWhere((id, _) => !vivos.contains(id));

    var changed = false;
    for (final marker in widget.markers) {
      if (!_ehVeiculo(marker.kind)) continue;
      final id = marker.id;
      final anterior = _targets[id];
      if (initial || anterior == null) {
        _animated[id] = marker.coords;
        _targets[id] = marker.coords;
        final r = marker.rumo;
        if (r != null) {
          _rumoDe[id] = r;
          _rumoAlvo[id] = r;
        }
        continue;
      }
      final moveu = anterior.latitude != marker.coords.latitude || anterior.longitude != marker.coords.longitude;
      var alvoRumo = marker.rumo;
      if (alvoRumo == null && moveu && distanceKm(anterior, marker.coords) * 1000 >= 8) {
        alvoRumo = rumoEntre(anterior, marker.coords);
      }
      if (moveu) {
        _targets[id] = marker.coords;
        changed = true;
      }
      if (alvoRumo != null && alvoRumo != _rumoAlvo[id]) {
        _rumoAlvo[id] = alvoRumo;
        changed = true;
      }
    }
    if (!changed) return;
    for (final id in _targets.keys) {
      _animated[id] = agora[id] ?? _targets[id]!;
      final r = rumoAgora[id] ?? _rumoAlvo[id];
      if (r != null) _rumoDe[id] = r;
    }
    _ultimoQuadro = 0;
    _controller.forward(from: 0);
  }

  double get _passo => Curves.easeOut.transform(_controller.value);

  /// Posicao do veiculo neste quadro (movimento suave entre atualizacoes).
  Coords? _posicaoAgora(String id) {
    final to = _targets[id];
    if (to == null) return null;
    final from = _animated[id];
    if (from == null) return to;
    final t = _passo;
    return Coords(
      from.latitude + (to.latitude - from.latitude) * t,
      from.longitude + (to.longitude - from.longitude) * t,
    );
  }

  /// Rumo do veiculo neste quadro (gira pelo lado mais curto).
  double? _rumoAgora(String id) {
    final alvo = _rumoAlvo[id];
    if (alvo == null) return null;
    final de = _rumoDe[id] ?? alvo;
    final diferenca = ((alvo - de + 540) % 360) - 180;
    return (de + diferenca * _passo + 360) % 360;
  }

  Coords _positionFor(MapMarker marker) {
    if (!_ehVeiculo(marker.kind)) return marker.coords;
    return _posicaoAgora(marker.id) ?? marker.coords;
  }

  @override
  void dispose() {
    _controller.dispose();
    _controleGoogle.fechar();
    super.dispose();
  }

  LatLng _latLng(Coords coords) => LatLng(coords.latitude, coords.longitude);

  /// Folga das bordas, nunca maior que 70% do mapa (tela pequena, celular
  /// deitado) — senao a conta do zoom quebra.
  EdgeInsets get _folga {
    var folga = widget.enquadrarMargem;
    final t = _tamanho;
    if (t != null && t.isFinite && t.width > 0 && t.height > 0) {
      final fx = (folga.horizontal > t.width * 0.7) ? t.width * 0.7 / folga.horizontal : 1.0;
      final fy = (folga.vertical > t.height * 0.7) ? t.height * 0.7 / folga.vertical : 1.0;
      if (fx < 1 || fy < 1) {
        folga = EdgeInsets.fromLTRB(folga.left * fx, folga.top * fy, folga.right * fx, folga.bottom * fy);
      }
    }
    return folga;
  }

  bool get _temEnquadramento =>
      widget.enquadrar.where((c) => c.latitude != 0 || c.longitude != 0).length >= 2;

  /// Enquadramento da viagem inteira no flutter_map (null = centro e zoom fixos).
  CameraFit? _ajuste() {
    if (!_temEnquadramento) return null;
    return CameraFit.coordinates(
      coordinates: [
        for (final c in widget.enquadrar)
          if (c.latitude != 0 || c.longitude != 0) _latLng(c),
      ],
      padding: _folga,
      maxZoom: 16.5,
      minZoom: 3,
    );
  }

  void _enquadrarDeNovo() {
    if (!_temEnquadramento) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (_google) {
        _controleGoogle.enquadrar(widget.enquadrar, animar: true);
        return;
      }
      final ajuste = _ajuste();
      if (ajuste == null) return;
      try {
        _mapa.fitCamera(ajuste);
      } catch (_) {
        // Mapa ainda nao desenhado: o enquadramento inicial ja cuida.
      }
    });
  }

  double get _zoom {
    final span = widget.span;
    if (span <= 0.01) return 16;
    if (span <= 0.03) return 15;
    if (span <= 0.05) return 14.2;
    if (span <= 0.075) return 13.6;
    return 13;
  }

  // ------------------------------------------------------------------
  // Google Maps
  // ------------------------------------------------------------------

  Widget _mapaGoogle() {
    Medida.marcar('mapa');
    final icones = _bitmaps;
    gm.BitmapDescriptor icone(MapMarker m) {
      final k = m.kind;
      final i = icones?[switch (k) {
        MarkerKind.pickup => 'pickup',
        MarkerKind.dropoff => 'dropoff',
        _ => nomeDoVeiculo(m),
      }];
      if (i != null) return i;
      return switch (k) {
        MarkerKind.pickup => gm.BitmapDescriptor.defaultMarkerWithHue(gm.BitmapDescriptor.hueGreen),
        MarkerKind.dropoff => gm.BitmapDescriptor.defaultMarkerWithHue(gm.BitmapDescriptor.hueRed),
        _ => gm.BitmapDescriptor.defaultMarkerWithHue(gm.BitmapDescriptor.hueAzure),
      };
    }

    return gm.GoogleMap(
      initialCameraPosition: cameraInicial(
        centro: widget.center,
        zoomPadrao: _zoom,
        pontos: widget.enquadrar,
        tamanho: _tamanho,
        folga: _folga,
      ),
      style: estiloGoogle,
      // A folga das bordas (botoes e paineis por cima do mapa): o Google
      // enquadra e centraliza so na parte livre.
      padding: _temEnquadramento ? _folga : EdgeInsets.zero,
      onMapCreated: (c) {
        Medida.marcar('mapa_pronto');
        _controleGoogle.mapa = c;
        if (_temEnquadramento) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) _controleGoogle.enquadrar(widget.enquadrar);
          });
        }
      },
      onCameraMove: _controleGoogle.aoMover,
      compassEnabled: false,
      mapToolbarEnabled: false,
      zoomControlsEnabled: false,
      myLocationButtonEnabled: false,
      myLocationEnabled: false,
      tiltGesturesEnabled: false,
      rotateGesturesEnabled: widget.interactive,
      scrollGesturesEnabled: widget.interactive,
      zoomGesturesEnabled: widget.interactive,
      indoorViewEnabled: false,
      buildingsEnabled: true,
      markers: {
        for (final m in widget.markers)
          gm.Marker(
            markerId: gm.MarkerId(m.id),
            position: paraGoogle(_positionFor(m)),
            icon: icone(m),
            anchor: const Offset(0.5, 0.5),
            // Veiculo deitado no mapa, girado para o lado em que anda.
            flat: _ehVeiculo(m.kind),
            rotation: _ehVeiculo(m.kind) ? (_rumoAgora(m.id) ?? 0) : 0,
            consumeTapEvents: true,
          ),
      },
      polylines: {
        // Rota ate o passageiro (azul).
        if (widget.driverRoute.length > 1)
          gm.Polyline(
            polylineId: const gm.PolylineId('ate-embarque'),
            points: [for (final c in widget.driverRoute) paraGoogle(c)],
            color: AppColors.accent,
            width: 5,
            jointType: gm.JointType.round,
            startCap: gm.Cap.roundCap,
            endCap: gm.Cap.roundCap,
          ),
        // Rota da viagem (verde).
        if (widget.route.length > 1)
          gm.Polyline(
            polylineId: const gm.PolylineId('viagem'),
            points: [for (final c in widget.route) paraGoogle(c)],
            color: AppColors.primary,
            width: 6,
            jointType: gm.JointType.round,
            startCap: gm.Cap.roundCap,
            endCap: gm.Cap.roundCap,
          ),
      },
    );
  }

  // ------------------------------------------------------------------
  // flutter_map (ruas da TomTom)
  // ------------------------------------------------------------------

  Widget _mapaOsm() {
    Medida.marcar('mapa');
    return FlutterMap(
      mapController: _mapa,
      options: MapOptions(
        initialCenter: _latLng(widget.center),
        initialZoom: _zoom,
        initialCameraFit: _ajuste(),
        interactionOptions: InteractionOptions(
          flags: widget.interactive ? InteractiveFlag.all : InteractiveFlag.none,
        ),
        backgroundColor: AppColors.mapBackground,
      ),
      children: [
        if (mostrarRuasNoMapa)
          MapaConfig.atual.camadaDeRuas(pacote: 'br.com.fortalezamov.passageiro', maxZoom: MapaConfig.maxZoom.toDouble()),

        // Rota ate o passageiro (azul)
        if (widget.driverRoute.length > 1)
          PolylineLayer(
            polylines: [
              Polyline(
                points: widget.driverRoute.map(_latLng).toList(),
                color: AppColors.accent,
                strokeWidth: 4,
              ),
            ],
          ),

        // Rota da viagem (verde)
        if (widget.route.length > 1)
          PolylineLayer(
            polylines: [
              Polyline(
                points: widget.route.map(_latLng).toList(),
                color: AppColors.primary,
                strokeWidth: 5,
              ),
            ],
          ),

        MarkerLayer(markers: widget.markers.map(_buildMarker).toList()),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    // Tamanho do mapa: a folga do enquadramento nunca passa dele.
    final map = LayoutBuilder(builder: (context, limites) {
      _tamanho = limites.biggest;
      return Stack(
        fit: StackFit.expand,
        children: [
          if (_google) _mapaGoogle() else _mapaOsm(),

          if ((widget.bussola || widget.minhaPosicao != null) && widget.interactive)
            SafeArea(
              child: Align(
                alignment: widget.controlesAlinhamento,
                child: Padding(
                  padding: widget.controlesMargem,
                  child: Flex(
                    direction: widget.controlesEmLinha ? Axis.horizontal : Axis.vertical,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      BotaoBussola(
                        controle: _controle,
                        automatico: widget.bussolaAutomatica,
                        aoMudarModo: (ligado) {
                          _seguir = ligado;
                          if (ligado) _centralizar();
                        },
                      ),
                      if (widget.minhaPosicao != null) ...[
                        const SizedBox(width: Spacing.sm, height: Spacing.sm),
                        BotaoDoMapa(
                          dica: 'Centralizar na minha localização',
                          aoTocar: _centralizar,
                          child: const Icon(Icons.my_location, color: Color(0xFF1A73E8)),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ),

          // Atribuicao obrigatoria da TomTom. O Google poe o logo dele sozinho.
          // Mapa de tela cheia (sem altura fixa): o canto de baixo fica atras
          // do painel da tela, entao a atribuicao vai no alto, a esquerda,
          // abaixo da barra de cima; mapa pequeno: canto de baixo.
          if (!_google)
            Positioned(
              right: widget.height == null ? null : 4,
              bottom: widget.height == null ? null : 2,
              left: widget.height == null ? 6 : null,
              top: widget.height == null ? MediaQuery.paddingOf(context).top + widget.atribuicaoTopo : null,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: AppColors.background.withValues(alpha: 0.72),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  MapaConfig.atribuicao,
                  style: const TextStyle(
                    fontFamily: AppText.family,
                    color: AppColors.textFaint,
                    fontSize: 9,
                  ),
                ),
              ),
            ),
        ],
      );
    });

    final content = widget.height == null
        ? map
        : SizedBox(height: widget.height, width: double.infinity, child: map);

    if (!widget.rounded) return content;

    return ClipRRect(
      borderRadius: BorderRadius.circular(Radii.lg),
      child: DecoratedBox(
        decoration: BoxDecoration(
          border: Border.all(color: AppColors.border),
          borderRadius: BorderRadius.circular(Radii.lg),
        ),
        child: content,
      ),
    );
  }

  Marker _buildMarker(MapMarker marker) {
    final position = _positionFor(marker);

    return Marker(
      point: _latLng(position),
      width: switch (marker.kind) {
        MarkerKind.car || MarkerKind.driver || MarkerKind.moto => 44,
        MarkerKind.pickup => 34,
        MarkerKind.dropoff => 34,
      },
      height: switch (marker.kind) {
        MarkerKind.car || MarkerKind.driver || MarkerKind.moto => 44,
        MarkerKind.pickup => 34,
        MarkerKind.dropoff => 34,
      },
      alignment: Alignment.center,
      child: switch (marker.kind) {
        // Carro (ou moto) visto de cima, na cor da situacao e girado para o
        // lado em que anda (o mapa gira junto; 0 = norte).
        MarkerKind.car || MarkerKind.driver || MarkerKind.moto => Transform.rotate(
            key: ValueKey('rumo-${marker.id}'),
            angle: (_rumoAgora(marker.id) ?? 0) * math.pi / 180,
            child: Image.asset(
              'assets/markers/${nomeDoVeiculo(marker)}.png',
              key: ValueKey('veiculo-${marker.id}-${nomeDoVeiculo(marker)}'),
              fit: BoxFit.contain,
            ),
          ),
        MarkerKind.pickup => Image.asset('assets/markers/pin_pickup.png', fit: BoxFit.contain),
        MarkerKind.dropoff => Image.asset('assets/markers/pin_dropoff.png', fit: BoxFit.contain),
      },
    );
  }
}
