import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../core/theme/app_theme.dart';
import '../core/utils/geo.dart';

enum MarkerKind { pickup, dropoff, driver, car }

class MapMarker {
  const MapMarker({required this.id, required this.coords, required this.kind, this.label});

  final String id;
  final Coords coords;
  final MarkerKind kind;
  final String? label;
}

/// Mapa do app, baseado em **OpenStreetMap** via `flutter_map`.
///
/// Usa o servidor padrao tile.openstreetmap.org: nao exige chave de API
/// e nao tem limite de uso para volumes normais de aplicativo. (O CARTO
/// Dark Matter foi usado antes para um visual escuro, mas passou a
/// recusar requisicoes sem chave — por isso a troca.) A atribuicao
/// exigida pela licenca ODbL fica visivel no canto inferior direito.
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
  });

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

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 850))
      ..addListener(() => setState(() {}));
    _syncTargets(initial: true);
  }

  @override
  void didUpdateWidget(covariant RideMap oldWidget) {
    super.didUpdateWidget(oldWidget);
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

    if (changed) _controller.forward(from: 0);
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
    super.dispose();
  }

  LatLng _latLng(Coords coords) => LatLng(coords.latitude, coords.longitude);

  double get _zoom {
    final span = widget.span;
    if (span <= 0.01) return 16;
    if (span <= 0.03) return 15;
    if (span <= 0.05) return 14.2;
    if (span <= 0.075) return 13.6;
    return 13;
  }

  @override
  Widget build(BuildContext context) {
    final map = Stack(
      fit: StackFit.expand,
      children: [
        FlutterMap(
          options: MapOptions(
            initialCenter: _latLng(widget.center),
            initialZoom: _zoom,
            interactionOptions: InteractionOptions(
              flags: widget.interactive ? InteractiveFlag.all : InteractiveFlag.none,
            ),
            backgroundColor: AppColors.mapBackground,
          ),
          children: [
            // Tiles padrao do OpenStreetMap — servidor oficial, sem chave
            // de API. O CARTO Dark Matter (tema escuro) exigia chave e
            // travava o mapa com "API KEY REQUIRED"; a troca perde o tema
            // escuro do mapa, mas garante que ele sempre carrega.
            TileLayer(
              urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              userAgentPackageName: 'com.rideplatform.mobile_driver',
              maxZoom: 19,
              tileProvider: NetworkTileProvider(),
              errorTileCallback: (tile, error, stackTrace) {
                // Tiles indisponiveis ficam no fundo escuro, sem quebrar o mapa.
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
        ),

        // Atribuicao obrigatoria: OpenStreetMap (ODbL) + CARTO.
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
