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

/// Normaliza a placa: maiuscula, sem separadores.
String normalizePlate(String value) =>
    value.toUpperCase().replaceAll(RegExp(r'[^A-Z0-9]'), '');

/// Valida a placa no padrao antigo (ABC1234) ou Mercosul (ABC1D23).
bool isValidPlate(String value) {
  final plate = normalizePlate(value);
  return RegExp(r'^[A-Z]{3}[0-9]{4}$').hasMatch(plate) ||
      RegExp(r'^[A-Z]{3}[0-9][A-Z][0-9]{2}$').hasMatch(plate);
}

/// Formata a placa para exibicao: ABC-1234 ou ABC1D23.
String formatPlate(String value) {
  final plate = normalizePlate(value);
  if (RegExp(r'^[A-Z]{3}[0-9]{4}$').hasMatch(plate)) {
    return '${plate.substring(0, 3)}-${plate.substring(3)}';
  }
  return plate;
}

// ---------------------------------------------------------------------------
// Rota pelas ruas (Evandro, 08/10/2026: "tem que mostrar a rota pela estrada
// certa, nao aquele risco verde que parece rota de aviao").
// ---------------------------------------------------------------------------

/// Pontos do caminho que o servidor devolve em /geo/rota: [[lat, lng], ...].
List<Coords> pontosDaRota(dynamic dados) {
  final lista = dados is Map ? dados['pontos'] : null;
  if (lista is! List) return const [];
  final pontos = <Coords>[];
  for (final p in lista) {
    if (p is List && p.length >= 2 && p[0] is num && p[1] is num) {
      pontos.add(Coords((p[0] as num).toDouble(), (p[1] as num).toDouble()));
    }
  }
  return pontos;
}

/// Projecao plana local (metros) — boa para distancias de cidade.
(double, double) _metros(Coords p, double latRef) {
  const m = 111320.0;
  return (p.longitude * m * math.cos(_toRad(latRef)), p.latitude * m);
}

/// Distancia (m) do ponto ao trecho a-b.
double _ateTrecho(Coords p, Coords a, Coords b) {
  final ref = p.latitude;
  final (px, py) = _metros(p, ref);
  final (ax, ay) = _metros(a, ref);
  final (bx, by) = _metros(b, ref);
  final dx = bx - ax;
  final dy = by - ay;
  final l2 = dx * dx + dy * dy;
  var t = l2 == 0 ? 0.0 : ((px - ax) * dx + (py - ay) * dy) / l2;
  t = t.clamp(0.0, 1.0);
  final cx = ax + t * dx;
  final cy = ay + t * dy;
  return math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
}

/// Trecho da rota mais perto do ponto: (indice do trecho, distancia em m).
(int, double) trechoMaisPerto(Coords p, List<Coords> rota) {
  if (rota.length < 2) return (0, rota.isEmpty ? double.infinity : distanceKm(p, rota.first) * 1000);
  var melhor = 0;
  var menor = double.infinity;
  for (var i = 0; i < rota.length - 1; i++) {
    final d = _ateTrecho(p, rota[i], rota[i + 1]);
    if (d < menor) {
      menor = d;
      melhor = i;
    }
  }
  return (melhor, menor);
}

/// O que falta da rota a partir de onde o carro esta (o traco vai sumindo
/// atras do carro, como no Waze).
List<Coords> restanteDaRota(Coords p, List<Coords> rota) {
  if (rota.length < 2) return rota;
  final (i, d) = trechoMaisPerto(p, rota);
  if (d > 80) return rota;
  return [p, ...rota.sublist(i + 1)];
}
