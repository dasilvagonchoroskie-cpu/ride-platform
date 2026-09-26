import 'dart:math' as math;

/// Coordenada geografica simples (evita acoplar o dominio ao plugin de GPS).
class Coords {
  const Coords(this.latitude, this.longitude);

  final double latitude;
  final double longitude;

  @override
  String toString() => '${latitude.toStringAsFixed(5)}, ${longitude.toStringAsFixed(5)}';

  Map<String, double> toJson() => {'latitude': latitude, 'longitude': longitude};
}

/// Centro inicial do mapa (Sao Paulo), usado enquanto o GPS nao responde.
// Valor TECNICO inicial, nunca mostrado: os mapas so abrem com a posicao
// real do aparelho (tela "Localizando voce"). Nada de cidade fixa na tela.
const Coords fallbackCoords = Coords(-18.0125, -49.3547);

const double _earthRadiusKm = 6371;

double _toRad(double deg) => deg * math.pi / 180;

/// Distancia em km entre dois pontos (Haversine).
double distanceKm(Coords a, Coords b) {
  final dLat = _toRad(b.latitude - a.latitude);
  final dLon = _toRad(b.longitude - a.longitude);
  final lat1 = _toRad(a.latitude);
  final lat2 = _toRad(b.latitude);
  final h = math.pow(math.sin(dLat / 2), 2) +
      math.cos(lat1) * math.cos(lat2) * math.pow(math.sin(dLon / 2), 2);
  return 2 * _earthRadiusKm * math.asin(math.sqrt(h.toDouble()));
}

/// Ponto intermediario com leve curva (para uma rota visualmente natural).
Coords interpolate(Coords a, Coords b, double t) {
  final mid = Coords(
    (a.latitude + b.latitude) / 2 + (b.longitude - a.longitude) * 0.12,
    (a.longitude + b.longitude) / 2 - (b.latitude - a.latitude) * 0.12,
  );
  final ab = math.pow(1 - t, 2).toDouble();
  final mb = 2 * (1 - t) * t;
  final bb = math.pow(t, 2).toDouble();
  return Coords(
    ab * a.latitude + mb * mid.latitude + bb * b.latitude,
    ab * a.longitude + mb * mid.longitude + bb * b.longitude,
  );
}

/// Gera os pontos de uma rota simulada entre origem e destino.
List<Coords> buildRoute(Coords from, Coords to, {int steps = 40}) {
  return List<Coords>.generate(steps + 1, (i) => interpolate(from, to, i / steps));
}

/// "820 m" ou "4,3 km".
String formatDistance(double meters) {
  if (meters < 1000) return '${meters.round()} m';
  final km = meters / 1000;
  return '${km.toStringAsFixed(1).replaceAll('.', ',')} km';
}

/// "12 min".
String formatDuration(int seconds) {
  final minutes = math.max(1, (seconds / 60).round());
  return '$minutes min';
}
