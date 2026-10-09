import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/widgets.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart' as gm;

import '../core/utils/geo.dart';
import 'bussola.dart';

/// Mapa do Google ligado nesta montagem (Evandro, 09/10/2026: "se for de
/// graca, bota"). O Maps SDK no celular e gratuito sem limite; a chave fica
/// no manifesto (esteira, infra/mapas.b64) e e restrita aos 3 apps. Sem a
/// chave (montagem de teste), o app usa o OpenStreetMap.
const bool usarGoogleMaps = bool.fromEnvironment('MAPA_GOOGLE');

gm.LatLng paraGoogle(Coords c) => gm.LatLng(c.latitude, c.longitude);

Coords doGoogle(gm.LatLng l) => Coords(l.latitude, l.longitude);

/// Visual mais limpo, como nos apps de corrida: sem os pontos de comercio
/// e os icones de onibus por cima das ruas.
const String estiloGoogle = '[{"featureType":"poi.business","stylers":[{"visibility":"off"}]},'
    '{"featureType":"transit","elementType":"labels.icon","stylers":[{"visibility":"off"}]}]';

/// Controle do mapa do Google para a bussola e os botoes do app.
class ControleGoogle implements ControleDoMapa {
  gm.GoogleMapController? mapa;
  gm.CameraPosition? posicao;
  final StreamController<double> _rotacoes = StreamController<double>.broadcast();

  /// Chamado pelo GoogleMap a cada movimento da camera.
  void aoMover(gm.CameraPosition p) {
    final antes = posicao?.bearing;
    posicao = p;
    if (antes == null || (antes - p.bearing).abs() > 0.5) _rotacoes.add(-p.bearing);
  }

  double get zoom => posicao?.zoom ?? 15;

  @override
  double get rotacao => -(posicao?.bearing ?? 0);

  @override
  Stream<double> get rotacoes => _rotacoes.stream;

  @override
  void girar(double graus) {
    final m = mapa;
    final p = posicao;
    if (m == null || p == null) return;
    final rumo = ((-graus % 360) + 360) % 360;
    unawaited(m
        .moveCamera(gm.CameraUpdate.newCameraPosition(gm.CameraPosition(target: p.target, zoom: p.zoom, bearing: rumo)))
        .catchError((_) {}));
  }

  /// Leva a camera a um ponto, mantendo o giro da bussola.
  void mover(Coords alvo, {double? zoom, bool animar = true}) {
    final m = mapa;
    if (m == null) return;
    final p = posicao;
    final destino = gm.CameraUpdate.newCameraPosition(
      gm.CameraPosition(target: paraGoogle(alvo), zoom: zoom ?? p?.zoom ?? 15, bearing: p?.bearing ?? 0),
    );
    unawaited((animar ? m.animateCamera(destino) : m.moveCamera(destino)).catchError((_) {}));
  }

  /// Mostra todos os pontos inteiros (a folga das bordas vem do padding do
  /// GoogleMap). Com o mapa ainda sem tamanho, tenta de novo logo depois.
  Future<void> enquadrar(List<Coords> pontos, {bool animar = false, int tentativa = 0}) async {
    final m = mapa;
    final validos = [for (final c in pontos) if (c.latitude != 0 || c.longitude != 0) c];
    if (m == null || validos.length < 2) return;
    var sul = validos.first.latitude, norte = sul, oeste = validos.first.longitude, leste = oeste;
    for (final c in validos) {
      sul = math.min(sul, c.latitude);
      norte = math.max(norte, c.latitude);
      oeste = math.min(oeste, c.longitude);
      leste = math.max(leste, c.longitude);
    }
    final gm.CameraUpdate destino;
    if ((norte - sul).abs() < 1e-5 && (leste - oeste).abs() < 1e-5) {
      destino = gm.CameraUpdate.newLatLngZoom(gm.LatLng(sul, oeste), 16);
    } else {
      destino = gm.CameraUpdate.newLatLngBounds(
        gm.LatLngBounds(southwest: gm.LatLng(sul, oeste), northeast: gm.LatLng(norte, leste)),
        28,
      );
    }
    try {
      await (animar ? m.animateCamera(destino) : m.moveCamera(destino));
    } catch (_) {
      // "Map size can't be 0": o mapa ainda nao foi medido na tela.
      if (tentativa < 3) {
        await Future<void>.delayed(const Duration(milliseconds: 350));
        await enquadrar(pontos, animar: animar, tentativa: tentativa + 1);
      }
    }
  }

  void fechar() => _rotacoes.close();
}

/// Camera inicial aproximada para os pontos caberem (evita o "pulo" entre o
/// centro padrao e o enquadramento certo, feito logo que o mapa abre).
gm.CameraPosition cameraInicial({
  required Coords centro,
  required double zoomPadrao,
  required List<Coords> pontos,
  required Size? tamanho,
  required EdgeInsets folga,
}) {
  final validos = [for (final c in pontos) if (c.latitude != 0 || c.longitude != 0) c];
  if (validos.length < 2 || tamanho == null || !tamanho.isFinite || tamanho.width <= 0 || tamanho.height <= 0) {
    return gm.CameraPosition(target: paraGoogle(centro), zoom: zoomPadrao);
  }
  var sul = validos.first.latitude, norte = sul, oeste = validos.first.longitude, leste = oeste;
  for (final c in validos) {
    sul = math.min(sul, c.latitude);
    norte = math.max(norte, c.latitude);
    oeste = math.min(oeste, c.longitude);
    leste = math.max(leste, c.longitude);
  }
  double y(double lat) {
    final s = math.sin(lat * math.pi / 180);
    return math.log((1 + s) / (1 - s)) / 2;
  }

  final largura = math.max(40.0, tamanho.width - folga.horizontal - 56);
  final altura = math.max(40.0, tamanho.height - folga.vertical - 56);
  final fracLng = math.max(1e-6, (leste - oeste) / 360);
  final fracLat = math.max(1e-6, (y(norte) - y(sul)) / (2 * math.pi));
  final zLng = math.log(largura / 256 / fracLng) / math.ln2;
  final zLat = math.log(altura / 256 / fracLat) / math.ln2;
  final zoom = math.min(zLng, zLat).clamp(3.0, 16.5);
  return gm.CameraPosition(target: gm.LatLng((sul + norte) / 2, (oeste + leste) / 2), zoom: zoom.toDouble());
}
