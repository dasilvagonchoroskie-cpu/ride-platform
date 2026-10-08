import 'dart:async';
import 'dart:io' show Platform;
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_map/flutter_map.dart';

import '../core/theme/app_theme.dart';

/// Para onde o celular aponta (graus, 0 = norte, sentido horario), lido do
/// sensor de rotacao do Android (bussola). Codigo nativo: MainActivity.kt.
class SensorDeDirecao {
  SensorDeDirecao._();

  static const EventChannel _canal = EventChannel('fortaleza/bussola');
  static Stream<double>? _fluxo;

  /// Fora do Android (testes automaticos no computador) nao ha sensor.
  static Stream<double> get direcao => _fluxo ??= Platform.isAndroid
      ? _canal.receiveBroadcastStream().map((e) => (e as num).toDouble()).asBroadcastStream()
      : const Stream<double>.empty();
}

/// Botao redondo branco dos mapas (bussola e centralizar).
class BotaoDoMapa extends StatelessWidget {
  const BotaoDoMapa({super.key, required this.dica, required this.aoTocar, required this.child, this.ativo = false});

  final String dica;
  final VoidCallback aoTocar;
  final Widget child;

  /// Destacado (ex.: bussola no modo automatico).
  final bool ativo;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: dica,
      child: Material(
        color: ativo ? AppColors.primary : Colors.white,
        shape: const CircleBorder(),
        elevation: 4,
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: aoTocar,
          child: SizedBox(width: 48, height: 48, child: Center(child: child)),
        ),
      ),
    );
  }
}

/// Bussola do mapa, como no Google Maps (Evandro, 08/10/2026):
/// - a agulha vermelha aponta para o norte do mapa;
/// - toque: liga o modo AUTOMATICO, em que o mapa gira para onde o celular
///   aponta (o que esta na frente fica para cima); toque de novo: desliga e
///   o norte volta para cima. Com o mapa girado com os dedos, o toque so
///   volta o norte para cima.
class BotaoBussola extends StatefulWidget {
  const BotaoBussola({super.key, required this.mapa, this.automatico = false, this.aoMudarModo});

  final MapController mapa;

  /// Ja comeca no modo automatico.
  final bool automatico;

  /// Avisa quem usa o mapa (ex.: para seguir a posicao no automatico).
  final ValueChanged<bool>? aoMudarModo;

  @override
  State<BotaoBussola> createState() => _BotaoBussolaState();
}

class _BotaoBussolaState extends State<BotaoBussola> {
  StreamSubscription<MapEvent>? _eventos;
  StreamSubscription<double>? _sensor;
  double _rotacao = 0;
  bool _auto = false;
  double? _suave;
  DateTime _ultimoGiro = DateTime.fromMillisecondsSinceEpoch(0);

  @override
  void initState() {
    super.initState();
    _eventos = widget.mapa.mapEventStream.listen((e) {
      if (mounted && (e.camera.rotation - _rotacao).abs() > 0.5) setState(() => _rotacao = e.camera.rotation);
    });
    if (widget.automatico) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _ligar();
      });
    }
  }

  @override
  void dispose() {
    _eventos?.cancel();
    _sensor?.cancel();
    super.dispose();
  }

  void _girar(double graus) {
    try {
      widget.mapa.rotate(graus);
    } catch (_) {
      // Mapa ainda nao desenhado.
    }
  }

  void _ligar() {
    _sensor?.cancel();
    _suave = null;
    _sensor = SensorDeDirecao.direcao.listen(
      (h) {
        // Media suave (sem tremer), cuidando da virada 359 -> 0 grau.
        final s = _suave;
        if (s == null) {
          _suave = h;
        } else {
          final delta = ((h - s + 540) % 360) - 180;
          _suave = (s + delta * 0.25 + 360) % 360;
        }
        final agora = DateTime.now();
        if (agora.difference(_ultimoGiro).inMilliseconds < 120) return;
        final alvo = -_suave!;
        final diferenca = (((alvo - _rotacao) + 540) % 360) - 180;
        if (diferenca.abs() < 2) return;
        _ultimoGiro = agora;
        _girar(alvo);
      },
      onError: (_) => _desligar(),
      cancelOnError: true,
    );
    setState(() => _auto = true);
    widget.aoMudarModo?.call(true);
  }

  void _desligar() {
    _sensor?.cancel();
    _sensor = null;
    _girar(0);
    if (mounted) setState(() => _auto = false);
    widget.aoMudarModo?.call(false);
  }

  void _tocar() {
    if (_auto) {
      _desligar();
    } else if (_rotacao.abs() > 1) {
      _girar(0);
    } else {
      _ligar();
    }
  }

  @override
  Widget build(BuildContext context) {
    return BotaoDoMapa(
      dica: _auto ? 'Bússola automática ligada (toque para desligar)' : 'Bússola',
      ativo: _auto,
      aoTocar: _tocar,
      child: Transform.rotate(
        angle: _rotacao * math.pi / 180,
        child: CustomPaint(size: const Size(22, 30), painter: _Agulha(branca: _auto)),
      ),
    );
  }
}

/// Agulha da bussola: ponta vermelha = norte.
class _Agulha extends CustomPainter {
  const _Agulha({required this.branca});

  final bool branca;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final norte = Path()
      ..moveTo(w / 2, 0)
      ..lineTo(w, h / 2)
      ..lineTo(0, h / 2)
      ..close();
    final sul = Path()
      ..moveTo(0, h / 2)
      ..lineTo(w, h / 2)
      ..lineTo(w / 2, h)
      ..close();
    canvas.drawPath(norte, Paint()..color = const Color(0xFFE53935));
    canvas.drawPath(sul, Paint()..color = branca ? Colors.white : const Color(0xFF9AA0A6));
  }

  @override
  bool shouldRepaint(covariant _Agulha old) => old.branca != branca;
}
