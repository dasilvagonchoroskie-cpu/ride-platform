import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart' as gm;
import 'package:latlong2/latlong.dart';

import '../core/theme/app_theme.dart';
import '../core/utils/geo.dart';
import 'bussola.dart';
import 'mapa_google.dart';

enum MarkerKind { pickup, dropoff, driver, car }

class MapMarker {
  const MapMarker({required this.id, required this.coords, required this.kind, this.label});

  final String id;
  final Coords coords;
  final MarkerKind kind;
  final String? label;
}

/// Desenho das ruas. Os testes automaticos desligam (la nao ha internet) —
/// e com isso usam sempre o OpenStreetMap (o Google precisa do celular).
bool mostrarRuasNoMapa = true;

/// Mapa do app.
///
/// - Montagem com a chave do Google (esteira): mapa do **Google Maps**
///   (Maps SDK, gratuito no celular), o mesmo dos apps de corrida grandes.
/// - Sem a chave, ou nos testes automaticos: **OpenStreetMap** via
///   flutter_map (servidor tile.openstreetmap.org, sem chave), com a
///   atribuicao exigida pela licenca ODbL no canto.
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
    this.enquadrar = const [],
    this.enquadrarChave,
    this.enquadrarMargem = const EdgeInsets.fromLTRB(40, 72, 40, 40),
  });

  /// Mostra a bussola (Evandro, 08/10/2026: "nos tres aplicativos").
  final bool bussola;

  /// Com ela, aparece tambem o botao de centralizar (telas sem botao proprio).
  final Coords? minhaPosicao;

  /// A bussola ja comeca no automatico (o mapa gira com o celular e segue a posicao).
  final bool bussolaAutomatica;

  /// Onde ficam a bussola e o centralizar (fora do caminho dos paineis).
  final Alignment controlesAlinhamento;

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
  final MapController _mapa = MapController();
  late final ControleFlutterMap _controleOsm = ControleFlutterMap(_mapa);
  final ControleGoogle _controleGoogle = ControleGoogle();

  /// Icones dos marcadores no mapa do Google (carregados uma vez).
  static Future<Map<MarkerKind, gm.BitmapDescriptor>>? _icones;
  Map<MarkerKind, gm.BitmapDescriptor>? _bitmaps;

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
      _icones ??= () async => <MarkerKind, gm.BitmapDescriptor>{
            MarkerKind.pickup: await gm.BitmapDescriptor.asset(cfg, 'assets/markers/pin_pickup.png', width: 34, height: 34),
            MarkerKind.dropoff: await gm.BitmapDescriptor.asset(cfg, 'assets/markers/pin_dropoff.png', width: 34, height: 34),
            MarkerKind.car: await gm.BitmapDescriptor.asset(cfg, 'assets/markers/car_black.png', width: 40, height: 40),
          }();
      _icones!.then((m) {
        if (mounted) setState(() => _bitmaps = m);
      }).catchError((_) {});
    }
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

  /// Detecta mudanca de posicao dos veiculos e anima ate o novo ponto.
  void _syncTargets({bool initial = false}) {
    var changed = false;

    for (final marker in widget.markers) {
      if (marker.kind != MarkerKind.car && marker.kind != MarkerKind.driver) continue;

      final previousTarget = _targets[marker.id];
      final currentPosition = _animated[marker.id];

      if (initial || previousTarget == null) {
        _animated[marker.id] = marker.coords;
      } else if (previousTarget.latitude != marker.coords.latitude ||
          previousTarget.longitude != marker.coords.longitude) {
        _animated[marker.id] = currentPosition ?? previousTarget;
        changed = true;
      }

      _targets[marker.id] = marker.coords;
    }

    if (changed) {
      _ultimoQuadro = 0;
      _controller.forward(from: 0);
    }
  }

  /// Posicao interpolada do veiculo (movimento suave entre atualizacoes).
  Coords _positionFor(MapMarker marker) {
    if (marker.kind != MarkerKind.car && marker.kind != MarkerKind.driver) {
      return marker.coords;
    }

    final from = _animated[marker.id];
    final to = _targets[marker.id] ?? marker.coords;
    if (from == null) return to;

    final t = Curves.easeOut.transform(_controller.value);
    return Coords(
      from.latitude + (to.latitude - from.latitude) * t,
      from.longitude + (to.longitude - from.longitude) * t,
    );
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

  /// Enquadramento da viagem inteira no OpenStreetMap (null = centro e zoom fixos).
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
    final icones = _bitmaps;
    gm.BitmapDescriptor icone(MarkerKind k) {
      final i = icones?[k == MarkerKind.driver ? MarkerKind.car : k];
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
            icon: icone(m.kind),
            anchor: const Offset(0.5, 0.5),
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
  // OpenStreetMap
  // ------------------------------------------------------------------

  Widget _mapaOsm() {
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
          TileLayer(
            urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            userAgentPackageName: 'br.com.fortalezamov.passageiro',
            maxZoom: 19,
            tileProvider: NetworkTileProvider(),
            errorTileCallback: (tile, error, stackTrace) {
              // Tiles indisponiveis ficam no fundo, sem quebrar o mapa.
            },
          ),

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
                  padding: const EdgeInsets.all(Spacing.md),
                  child: Column(
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
                        const SizedBox(height: Spacing.sm),
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

          // Atribuicao obrigatoria do OpenStreetMap (ODbL). O Google poe o
          // logo dele sozinho.
          if (!_google)
            Positioned(
              right: 4,
              bottom: 2,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: AppColors.background.withValues(alpha: 0.72),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: const Text(
                  '© OpenStreetMap contributors',
                  style: TextStyle(
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
        MarkerKind.car || MarkerKind.driver => 40,
        MarkerKind.pickup => 34,
        MarkerKind.dropoff => 34,
      },
      height: switch (marker.kind) {
        MarkerKind.car || MarkerKind.driver => 40,
        MarkerKind.pickup => 34,
        MarkerKind.dropoff => 34,
      },
      alignment: Alignment.center,
      child: switch (marker.kind) {
        // Carro preto visto de cima, conforme a especificacao visual.
        MarkerKind.car || MarkerKind.driver => Image.asset(
            'assets/markers/car_black.png',
            fit: BoxFit.contain,
          ),
        MarkerKind.pickup => Image.asset('assets/markers/pin_pickup.png', fit: BoxFit.contain),
        MarkerKind.dropoff => Image.asset('assets/markers/pin_dropoff.png', fit: BoxFit.contain),
      },
    );
  }
}
