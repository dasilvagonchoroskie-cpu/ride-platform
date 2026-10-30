import 'dart:math' as math;

import 'geo.dart';

/// Rumo de [a] para [b] em graus (0 = norte, 90 = leste, sentido horario).
double rumoEntre(Coords a, Coords b) {
  final lat1 = a.latitude * math.pi / 180;
  final lat2 = b.latitude * math.pi / 180;
  final dLon = (b.longitude - a.longitude) * math.pi / 180;
  final y = math.sin(dLon) * math.cos(lat2);
  final x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dLon);
  final graus = math.atan2(y, x) * 180 / math.pi;
  return (graus + 360) % 360;
}

/// Filtro das leituras do GPS (Evandro, 30/10/2026: "melhorar a precisao do
/// GPS" e "o carro tem que acompanhar o sentido da rua").
///
/// - Descarta leitura ruim (mais de [precisaoMaxima] m de erro). Se faz
///   [semLeituraBoa] sem nenhuma boa, aceita ate [precisaoSemNada] m para o
///   ponto nao ficar preso.
/// - Salto impossivel (mais rapido que [velocidadeMaxima]) e descartado; se
///   o GPS insistir 3 vezes no mesmo lugar, o lugar novo vale.
/// - Suaviza o zigue-zague (filtro de Kalman simples, pesando pela precisao
///   de cada leitura). Andando rapido, quase nao atrasa.
/// - Parado: a tremida dentro da margem do GPS nao mexe no ponto.
/// - Rumo: o do GPS andando a mais de 7 km/h; senao, a direcao dos ultimos
///   12 m; parado, fica o ultimo.
class FiltroGps {
  FiltroGps({
    this.precisaoMaxima = 40,
    this.precisaoSemNada = 80,
    this.semLeituraBoa = const Duration(seconds: 15),
    this.velocidadeBase = 3,
    this.velocidadeMaxima = 55,
  });

  final double precisaoMaxima;
  final double precisaoSemNada;
  final Duration semLeituraBoa;

  /// Quanto a posicao pode mudar por segundo entre leituras (m/s) quando o
  /// GPS nao informa a velocidade: carro 3, pessoa a pe 1,5.
  final double velocidadeBase;

  /// Acima disso (m/s; 55 = ~200 km/h) e salto do GPS.
  final double velocidadeMaxima;

  Coords? _posicao;
  double _variancia = -1;
  DateTime? _em;
  DateTime? _ultimaBoa;
  Coords? _ancoraDoRumo;
  Coords? _ultimoSalto;
  int _saltos = 0;

  /// Para onde aponta (graus, 0 = norte); null ate andar um pouco.
  double? rumo;

  /// Ultima leitura dizia que esta andando.
  bool andando = false;

  /// Posicao filtrada (null ate a primeira leitura aceita).
  Coords? get posicao => _posicao;

  /// Erro estimado da posicao filtrada, em metros.
  double? get precisao => _variancia < 0 ? null : math.sqrt(_variancia);

  /// Recomeca (ex.: o motorista ficou offline e voltou em outro lugar).
  void limpar() {
    _posicao = null;
    _variancia = -1;
    _em = null;
    _ultimaBoa = null;
    _ancoraDoRumo = null;
    _ultimoSalto = null;
    _saltos = 0;
    andando = false;
  }

  /// Junta uma leitura do GPS. Devolve true se a posicao mostrada mudou.
  bool adicionar(Coords p, {required double precisao, double? rumoDoGps, double? velocidade, DateTime? em}) {
    final agora = em ?? DateTime.now();
    final erro = precisao.isNaN ? 999.0 : math.max(precisao, 3.0);
    final semBoa = _ultimaBoa == null || agora.difference(_ultimaBoa!) > semLeituraBoa;
    if (erro > (semBoa ? precisaoSemNada : precisaoMaxima)) return false;
    if (erro <= precisaoMaxima) _ultimaBoa = agora;

    final vel = (velocidade != null && !velocidade.isNaN && velocidade >= 0) ? velocidade : null;
    final antes = _posicao;
    final antesEm = _em;
    if (antes == null || antesEm == null) {
      _posicao = p;
      _variancia = erro * erro;
      _em = agora;
      _ancoraDoRumo = p;
      return true;
    }

    final segundos = math.max(agora.difference(antesEm).inMilliseconds / 1000.0, 0.2);
    final d = distanceKm(antes, p) * 1000;

    // Salto impossivel.
    if ((d - erro) / segundos > velocidadeMaxima) {
      final ultimo = _ultimoSalto;
      _saltos = (ultimo != null && distanceKm(ultimo, p) * 1000 < math.max(erro, 30)) ? _saltos + 1 : 1;
      _ultimoSalto = p;
      if (_saltos < 3) return false;
      // O GPS insistiu no lugar novo: vale (ex.: saiu de um tunel).
      _posicao = p;
      _variancia = erro * erro;
      _em = agora;
      _saltos = 0;
      _ultimoSalto = null;
      _ancoraDoRumo = p;
      return true;
    }
    _saltos = 0;
    _ultimoSalto = null;

    // Kalman: quanto mais rapido, mais a leitura nova pesa (quase sem atraso).
    final ritmo = vel ?? math.min(d / segundos, velocidadeMaxima);
    final q = math.max(velocidadeBase, ritmo * 1.5);
    _variancia += segundos * q * q;
    final k = _variancia / (_variancia + erro * erro);
    _variancia = (1 - k) * _variancia;
    _em = agora;

    andando = vel != null ? vel >= 1.0 : d > math.max(erro, 10);
    final parado = (vel != null && vel < 0.8 && d < math.max(erro, 8)) || (vel == null && d < math.max(erro * 0.5, 4));
    if (parado) return false;

    final nova = Coords(
      antes.latitude + k * (p.latitude - antes.latitude),
      antes.longitude + k * (p.longitude - antes.longitude),
    );
    _posicao = nova;

    final r = rumoDoGps;
    if (vel != null && vel >= 2 && r != null && !r.isNaN && r > 0 && r <= 360) {
      rumo = r % 360;
      _ancoraDoRumo = nova;
    } else {
      final ancora = _ancoraDoRumo;
      if (ancora == null) {
        _ancoraDoRumo = nova;
      } else if (distanceKm(ancora, nova) * 1000 >= 12) {
        rumo = rumoEntre(ancora, nova);
        _ancoraDoRumo = nova;
      }
    }
    return true;
  }
}
