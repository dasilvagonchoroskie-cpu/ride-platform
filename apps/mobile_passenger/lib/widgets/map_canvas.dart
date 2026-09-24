import 'package:flutter/material.dart';

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

/// Mapa renderizado com CustomPainter.
///
/// Nao depende do Google Maps, portanto funciona em qualquer APK sem chave de
/// API. Para usar o mapa real, troque este widget por um GoogleMap mantendo a
/// mesma interface de propriedades.
class MapCanvas extends StatelessWidget {
  const MapCanvas({
    super.key,
    required this.center,
    required this.markers,
    this.route = const [],
    this.driverRoute = const [],
    this.height = 280,
    this.span = 0.05,
  });

  final Coords center;
  final List<MapMarker> markers;
  final List<Coords> route;
  final List<Coords> driverRoute;
  final double height;
  final double span;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(Radii.lg),
      child: Container(
        height: height,
        width: double.infinity,
        decoration: BoxDecoration(
          color: AppColors.mapBackground,
          border: Border.all(color: AppColors.border),
          borderRadius: BorderRadius.circular(Radii.lg),
        ),
        child: Stack(
          children: [
            Positioned.fill(
              child: CustomPaint(
                painter: _MapPainter(
                  center: center,
                  markers: markers,
                  route: route,
                  driverRoute: driverRoute,
                  span: span,
                ),
              ),
            ),
            Positioned(
              right: Spacing.sm,
              bottom: Spacing.sm,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: Spacing.sm, vertical: 3),
                decoration: BoxDecoration(
                  color: const Color(0xD10B0B0F),
                  border: Border.all(color: AppColors.border),
                  borderRadius: BorderRadius.circular(Radii.sm),
                ),
                child: const Text(
                  'MAPA SIMULADO',
                  style: TextStyle(
                    color: AppColors.textFaint,
                    fontSize: 9,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.6,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MapPainter extends CustomPainter {
  _MapPainter({
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

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = AppColors.mapBackground);

    // Malha viaria estilizada
    final major = Paint()
      ..color = AppColors.mapRoad.withOpacity(0.55)
      ..strokeWidth = 5
      ..strokeCap = StrokeCap.round;
    final minor = Paint()
      ..color = AppColors.mapRoadLight.withOpacity(0.30)
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round;

    for (var i = 0; i <= 12; i++) {
      final t = i / 12;
      canvas.drawLine(
        Offset(0, t * size.height),
        Offset(size.width, t * size.height),
        i % 3 == 0 ? major : minor,
      );
      canvas.drawLine(
        Offset(t * size.width, 0),
        Offset(t * size.width, size.height),
        i % 4 == 0 ? major : minor,
      );
    }

    // Anel de referencia
    canvas.drawCircle(
      Offset(size.width / 2, size.height / 2),
      (size.shortestSide / 2) - 6,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1
        ..color = AppColors.border,
    );

    // Rotas
    if (driverRoute.length > 1) {
      canvas.drawPath(
        _pathFor(driverRoute, size),
        Paint()
          ..color = AppColors.info
          ..strokeWidth = 3
          ..style = PaintingStyle.stroke
          ..strokeCap = StrokeCap.round,
      );
    }
    if (route.length > 1) {
      canvas.drawPath(
        _pathFor(route, size),
        Paint()
          ..color = AppColors.primary
          ..strokeWidth = 4
          ..style = PaintingStyle.stroke
          ..strokeCap = StrokeCap.round,
      );
    }

    // Marcadores
    for (final marker in markers) {
      final offset = _project(marker.coords, size);
      final color = switch (marker.kind) {
        MarkerKind.pickup => AppColors.primary,
        MarkerKind.dropoff => AppColors.danger,
        MarkerKind.driver => AppColors.info,
        MarkerKind.car => AppColors.info,
      };
      final radius = marker.kind == MarkerKind.car ? 7.0 : 8.0;

      canvas.drawCircle(offset, radius + 7, Paint()..color = color.withOpacity(0.18));
      canvas.drawCircle(offset, radius, Paint()..color = color);
      canvas.drawCircle(
        offset,
        radius,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2
          ..color = AppColors.background,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _MapPainter oldDelegate) => true;
}
