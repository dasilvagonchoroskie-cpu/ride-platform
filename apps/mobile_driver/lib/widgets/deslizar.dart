import 'package:flutter/material.dart';

import '../core/theme/app_theme.dart';

/// Botao de deslizar ("arraste para iniciar"): evita toque sem querer nas
/// etapas importantes da corrida (INICIAR VIAGEM e FINALIZAR VIAGEM).
class Deslizar extends StatefulWidget {
  const Deslizar({super.key, required this.texto, required this.aoConfirmar, this.cor = AppColors.primary, this.ocupado = false});

  final String texto;
  final Future<void> Function() aoConfirmar;
  final Color cor;
  final bool ocupado;

  @override
  State<Deslizar> createState() => _DeslizarState();
}

class _DeslizarState extends State<Deslizar> {
  static const _altura = 60.0;
  double _posicao = 0;
  bool _enviando = false;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, c) {
        final limite = c.maxWidth - _altura;
        final ocupado = widget.ocupado || _enviando;
        return Container(
          height: _altura,
          decoration: BoxDecoration(color: widget.cor.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(_altura / 2)),
          child: Stack(
            children: [
              Center(
                child: Padding(
                  padding: const EdgeInsets.only(left: _altura),
                  child: Text(
                    ocupado ? 'Enviando...' : widget.texto,
                    style: AppText.button.copyWith(color: widget.cor, letterSpacing: 0.5),
                  ),
                ),
              ),
              Positioned(
                left: _posicao,
                top: 0,
                bottom: 0,
                child: GestureDetector(
                  onHorizontalDragUpdate: ocupado
                      ? null
                      : (d) => setState(() => _posicao = (_posicao + d.delta.dx).clamp(0, limite).toDouble()),
                  onHorizontalDragEnd: ocupado
                      ? null
                      : (_) async {
                          if (_posicao >= limite * 0.85) {
                            setState(() {
                              _posicao = limite;
                              _enviando = true;
                            });
                            try {
                              await widget.aoConfirmar();
                            } finally {
                              if (mounted) {
                                setState(() {
                                  _enviando = false;
                                  _posicao = 0;
                                });
                              }
                            }
                          } else {
                            setState(() => _posicao = 0);
                          }
                        },
                  child: Container(
                    width: _altura,
                    height: _altura,
                    decoration: BoxDecoration(color: widget.cor, shape: BoxShape.circle),
                    child: ocupado
                        ? const Padding(padding: EdgeInsets.all(18), child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
                        : const Icon(Icons.double_arrow, color: Colors.white),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
