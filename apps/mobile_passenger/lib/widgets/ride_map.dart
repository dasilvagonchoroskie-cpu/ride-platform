import 'dart:async';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/painting.dart' as painting;
import 'package:flutter/services.dart' show rootBundle;
import 'package:google_maps_flutter/google_maps_flutter.dart' as gmaps;

import '../core/config/app_config.dart';
import '../core/theme/uber_theme.dart';
import '../core/utils/geo.dart';

enum MarkerKind { pickup, dropoff, driver, car }

class MapMarker {
  const MapMarker({required this.id, required this.coords, required this.kind, this.label});

  final String id;
  final Coords coords;
  final MarkerKind kind;
  final String? label;
}

/// Mapa do app.
///
/// Quando uma chave do Google Maps esta configurada
/// (`--dart-define=MAPS_API_KEY=...`), usa o **Google Maps SDK** com o estilo
/// Aubergine carregado de `assets/map_styles/aubergine.json` e marcadores de
/// carro personalizados.
///
/// Sem a chave, renderiza um mapa estilizado proprio com o mesmo visual — assim
/// o APK nunca exibe o retangulo cinza do SDK sem credencial.
class RideMap extends StatelessWidget {
  const RideMap({
    super.key,
    required this.center,
    required this.markers,
    this.route = const [],
    this.driverRoute = const [],
    this.height,
    this.span = 0.05,
    this.rounded = true,
    this.driverHeading,
  });

  final Coords center;
  final List<MapMarker> markers;
  final List<Coords> route;
  final List<Coords> driverRoute;
  final double? height;
  final double span;
  final bool rounded;
  final double? driverHeading;

  @override
  Widget build(BuildContext context) {
    final map = AppConfig.hasMaps
        ? _GoogleRideMap(
            center: center,
            markers: markers,
            route: route,
            driverRoute: driverRoute,
            span: span,
          )
        : _FallbackRideMap(
            center: center,
            markers: markers,
            route: route,
            driverRoute: driverRoute,
            span: span,
          );

    final content = height == null
        ? map
        : SizedBox(height: height, width: double.infinity, child: map);

    if (!rounded) return content;

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
}

// =====================================================================
// Google Maps SDK
// =====================================================================
class _GoogleRideMap extends StatefulWidget {
  const _GoogleRideMap({
    required this.center,
    required this.markers,
    required this.route,
    required this.driverRoute,
    required this.span,
  });

  final Coords center;
  final List<MapMarker> markers;
  final List<Coords> route;
  final List<Coords> driverRoute;
  final double span;

  @override
  State<_GoogleRideMap> createState() => _GoogleRideMapState();
}

class _GoogleRideMapState extends State<_GoogleRideMap> with SingleTickerProviderStateMixin {
  gmaps.GoogleMapController? _controller;
  String? _styleJson;

  gmaps.BitmapDescriptor? _carIcon;
  gmaps.BitmapDescriptor? _pickupIcon;
  gmaps.BitmapDescriptor? _dropoffIcon;

  Coords? _driverFrom;
  late final AnimationController _driverAnim;

  @override
  void initState() {
    super.initState();

    _driverAnim = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..addListener(() => setState(() {}));

    _loadAssets();
  }

  @override
  void didUpdateWidget(covariant _GoogleRideMap oldWidget) {
    super.didUpdateWidget(oldWidget);

    // Movimento suave do carro: interpola da posicao anterior para a nova.
    final previous = oldWidget.markers.where((m) => m.kind == MarkerKind.car).toList();
    final current = widget.markers.where((m) => m.kind == MarkerKind.car).toList();

    if (previous.isNotEmpty && current.isNotEmpty) {
      final from = previous.first.coords;
      final to = current.first.coords;
      if (from.latitude != to.latitude || from.longitude != to.longitude) {
        _driverFrom = from;
        _driverAnim.forward(from: 0);
      }
    }
  }

  Future<void> _loadAssets() async {
    try {
      final style = await rootBundle.loadString('assets/map_styles/aubergine.json');
      final car = await gmaps.BitmapDescriptor.asset(
        const painting.ImageConfiguration(size: ui.Size(38, 38)),
        'assets/markers/car_black.png',
      );
      final pickup = await gmaps.BitmapDescriptor.asset(
        const painting.ImageConfiguration(size: ui.Size(26, 26)),
        'assets/markers/pin_pickup.png',
      );
      final dropoff = await gmaps.BitmapDescriptor.asset(
        const painting.ImageConfiguration(size: ui.Size(26, 26)),
        'assets/markers/pin_dropoff.png',
      );

      if (!mounted) return;
      setState(() {
        _styleJson = style;
        _carIcon = car;
        _pickupIcon = pickup;
        _dropoffIcon = dropoff;
      });
    } catch (_) {
      // Sem os assets o mapa segue funcionando com os marcadores padrao.
    }
  }

  @override
  void dispose() {
    _driverAnim.dispose();
    _controller?.dispose();
    super.dispose();
  }

  gmaps.LatLng _latLng(Coords coords) => gmaps.LatLng(coords.latitude, coords.longitude);

  Coords _interpolatedDriver(Coords to) {
    final from = _driverFrom;
    if (from == null || _driverAnim.isDismissed) return to;
    final t = Curves.easeOut.transform(_driverAnim.value);
    return Coords(
      from.latitude + (to.latitude - from.latitude) * t,
      from.longitude + (to.longitude - from.longitude) * t,
    );
  }

  Set<gmaps.Marker> _buildMarkers() {
    final result = <gmaps.Marker>{};

    for (final marker in widget.markers) {
      final icon = switch (marker.kind) {
        MarkerKind.pickup => _pickupIcon,
        MarkerKind.dropoff => _dropoffIcon,
        MarkerKind.car || MarkerKind.driver => _carIcon,
      };

      final coords = marker.kind == MarkerKind.car
          ? _interpolatedDriver(marker.coords)
          : marker.coords;

      result.add(
        gmaps.Marker(
          markerId: gmaps.MarkerId(marker.id),
          position: _latLng(coords),
          icon: icon ?? gmaps.BitmapDescriptor.defaultMarker,
          anchor: const Offset(0.5, 0.5),
          flat: true,
          rotation: 0,
          zIndexInt: marker.kind == MarkerKind.car ? 3 : 2,
          infoWindow: marker.label == null
              ? gmaps.InfoWindow.noText
              : gmaps.InfoWindow(title: marker.label),
        ),
      );

    }

    return result;
  }

  Set<gmaps.Polyline> _buildPolylines() {
    final result = <gmaps.Polyline>{};

    if (widget.driverRoute.length > 1) {
      result.add(
        gmaps.Polyline(
          polylineId: const gmaps.PolylineId('driver-route'),
          points: widget.driverRoute.map(_latLng).toList(),
          color: AppColors.accent,
          width: 4,
        ),
      );
    }

    if (widget.route.length > 1) {
      result.add(
        gmaps.Polyline(
          polylineId: const gmaps.PolylineId('route'),
          points: widget.route.map(_latLng).toList(),
          color: AppColors.primary,
          width: 5,
        ),
      );
    }

    return result;
  }

  @override
  Widget build(BuildContext context) {
    return gmaps.GoogleMap(
      initialCameraPosition: gmaps.CameraPosition(
        target: _latLng(widget.center),
        zoom: _zoomForSpan(widget.span),
      ),
      style: _styleJson,
      markers: _buildMarkers(),
      polylines: _buildPolylines(),
      myLocationButtonEnabled: false,
      myLocationEnabled: false,
      zoomControlsEnabled: false,
      compassEnabled: false,
      mapToolbarEnabled: false,
      buildingsEnabled: false,
      indoorViewEnabled: false,
      trafficEnabled: false,
      onMapCreated: (controller) {
        _controller = controller;
        if (_styleJson != null) controller.setMapStyle(_styleJson);
      },
    );
  }

  double _zoomForSpan(double span) {
    // Aproximacao: span menor => mais zoom.
    if (span <= 0.01) return 15.5;
    if (span <= 0.03) return 14.2;
    if (span <= 0.06) return 13.2;
    if (span <= 0.09) return 12.6;
    return 12;
  }
}

// =====================================================================
// Fallback estilizado (sem chave do Google Maps)
// =====================================================================
class _FallbackRideMap extends StatelessWidget {
  const _FallbackRideMap({
    required this.center,
    required this.markers,
    required this.route,
    required this.driverRoute,
    required this.span,
  });

  final Coords center;
  final List<MapMarker> markers;
  final List<Coords> route;
  final List<Coords> driverRoute;
  final double span;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _FallbackPainter(
        center: center,
        markers: markers,
        route: route,
        driverRoute: driverRoute,
        span: span,
      ),
      child: const SizedBox.expand(),
    );
  }
}

class _FallbackPainter extends CustomPainter {
  _FallbackPainter({
    required this.center,
    required this.markers,
    required this.route,
    required this.driverRoute,
    required this.span,
  });

  final Coords center;
  final List<MapMarker> markers;
  final List<Coords> route;
  final List<Coords> driverRoute;
  final double span;

  Offset _project(Coords coords, Size size) {
    final x = size.width / 2 + ((coords.longitude - center.longitude) / span) * size.width;
    final y = size.height / 2 - ((coords.latitude - center.latitude) / span) * size.width;
    return Offset(x, y);
  }

  Path _pathFor(List<Coords> points, Size size) {
    final path = Path();
    for (var i = 0; i < points.length; i++) {
      final offset = _project(points[i], size);
      if (i == 0) {
        path.moveTo(offset.dx, offset.dy);
      } else {
        path.lineTo(offset.dx, offset.dy);
      }
    }
    return path;
  }

  /// Carro visto de cima, no padrao Uber (preto, com teto destacado).
  void _paintCar(Canvas canvas, Offset center, Color body) {
    canvas.save();
    canvas.translate(center.dx, center.dy);

    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: Offset.zero, width: 15, height: 27),
        const Radius.circular(6),
      ),
      Paint()..color = body,
    );

    final glass = Paint()..color = const Color(0xFF3A3A3A);
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: const Offset(0, -5), width: 10, height: 8),
        const Radius.circular(3),
      ),
      glass,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: const Offset(0, 6), width: 10, height: 7),
        const Radius.circular(3),
      ),
      glass,
    );

    final wheel = Paint()..color = const Color(0xFF111111);
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: const Offset(-8, -6), width: 3.5, height: 7),
        const Radius.circular(1.5),
      ),
      wheel,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: const Offset(8, -6), width: 3.5, height: 7),
        const Radius.circular(1.5),
      ),
      wheel,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: const Offset(-8, 7), width: 3.5, height: 7),
        const Radius.circular(1.5),
      ),
      wheel,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: const Offset(8, 7), width: 3.5, height: 7),
        const Radius.circular(1.5),
      ),
      wheel,
    );

    final light = Paint()..color = AppColors.primary;
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: const Offset(-3.5, -12), width: 4, height: 2.5),
        const Radius.circular(1),
      ),
      light,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: const Offset(3.5, -12), width: 4, height: 2.5),
        const Radius.circular(1),
      ),
      light,
    );

    canvas.restore();
  }

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = AppColors.mapBackground);

    // Malha viaria (estilo Aubergine)
    final major = Paint()
      ..color = AppColors.mapRoad.withValues(alpha: 0.85)
      ..strokeWidth = 6
      ..strokeCap = StrokeCap.round;
    final minor = Paint()
      ..color = AppColors.mapRoadLight.withValues(alpha: 0.45)
      ..strokeWidth = 2.5
      ..strokeCap = StrokeCap.round;

    for (var i = 0; i <= 14; i++) {
      final t = i / 14;
      canvas.drawLine(Offset(0, t * size.height), Offset(size.width, t * size.height), i % 3 == 0 ? major : minor);
      canvas.drawLine(Offset(t * size.width, 0), Offset(t * size.width, size.height), i % 4 == 0 ? major : minor);
    }

    if (driverRoute.length > 1) {
      canvas.drawPath(
        _pathFor(driverRoute, size),
        Paint()
          ..color = AppColors.accent
          ..strokeWidth = 4
          ..style = PaintingStyle.stroke
          ..strokeCap = StrokeCap.round,
      );
    }

    if (route.length > 1) {
      canvas.drawPath(
        _pathFor(route, size),
        Paint()
          ..color = AppColors.primary
          ..strokeWidth = 5
          ..style = PaintingStyle.stroke
          ..strokeCap = StrokeCap.round,
      );
    }

    for (final marker in markers) {
      final offset = _project(marker.coords, size);

      switch (marker.kind) {
        case MarkerKind.pickup:
          canvas.drawCircle(offset, 16, Paint()..color = AppColors.primary.withValues(alpha: 0.22));
          canvas.drawCircle(offset, 8, Paint()..color = AppColors.primary);
          canvas.drawCircle(offset, 3.5, Paint()..color = AppColors.text);
          break;
        case MarkerKind.dropoff:
          canvas.drawRRect(
            RRect.fromRectAndRadius(
              Rect.fromCenter(center: offset, width: 17, height: 17),
              const Radius.circular(4),
            ),
            Paint()..color = AppColors.text,
          );
          canvas.drawRRect(
            RRect.fromRectAndRadius(
              Rect.fromCenter(center: offset, width: 9, height: 9),
              const Radius.circular(2),
            ),
            Paint()..color = AppColors.background,
          );
          break;
        case MarkerKind.car:
        case MarkerKind.driver:
          _paintCar(canvas, offset, AppColors.text);
          break;
      }
    }
  }

  @override
  bool shouldRepaint(covariant _FallbackPainter oldDelegate) => true;
}
