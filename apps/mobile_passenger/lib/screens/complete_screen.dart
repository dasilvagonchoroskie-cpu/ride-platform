import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../core/utils/geo.dart';
import '../state/ride_state.dart';
import '../widgets/corrida_ui.dart';
import '../widgets/form_ui.dart';

/// Fim da corrida: valor final (calculado pelo servidor), como pagar e a
/// avaliacao do motorista.
class CompleteScreen extends StatefulWidget {
  const CompleteScreen({super.key});

  @override
  State<CompleteScreen> createState() => _CompleteScreenState();
}

class _CompleteScreenState extends State<CompleteScreen> {
  static const List<String> _elogios = [
    'Motorista educado',
    'Carro limpo',
    'Direção segura',
    'Chegou rápido',
    'Ótimo trajeto',
  ];

  int _nota = 0;
  final Set<String> _escolhidos = {};
  bool _enviando = false;

  Future<void> _fechar({required bool avaliar}) async {
    if (_enviando) return;
    setState(() => _enviando = true);
    await context.read<RideState>().completeRide(
          avaliar && _nota > 0 ? _nota : null,
          tags: _escolhidos.toList(),
        );
    if (mounted) setState(() => _enviando = false);
  }

  @override
  Widget build(BuildContext context) {
    final corrida = context.watch<RideState>().activeRide;
    if (corrida == null) return const SizedBox.shrink();
    final jaAvaliou = corrida.rating != null;

    return Scaffold(
      backgroundColor: AppColors.surface,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(Spacing.xl, Spacing.xxl, Spacing.xl, Spacing.xl),
          children: [
            const Center(child: Icon(Icons.check_circle, color: AppColors.primary, size: 64)),
            const SizedBox(height: Spacing.md),
            Text(
              'Corrida concluída',
              textAlign: TextAlign.center,
              style: AppText.title.copyWith(color: AppColors.text),
            ),
            const SizedBox(height: Spacing.xs),
            Text(
              'Pague direto ao motorista: ${corrida.paymentMethod.toLowerCase()}.',
              textAlign: TextAlign.center,
              style: AppText.body.copyWith(color: AppColors.textMuted),
            ),
            const SizedBox(height: Spacing.xl),
            LinhaValor(rotulo: 'Valor da corrida', valor: formatMoney(corrida.fareCents), destaque: true),
            LinhaValor(rotulo: 'Distância', valor: formatDistance(corrida.distanceMeters.toDouble())),
            LinhaValor(rotulo: 'Bandeira', valor: corrida.fareFlag.label),
            if (corrida.driver != null) LinhaValor(rotulo: 'Motorista', valor: corrida.driver!.name),
            const SizedBox(height: Spacing.lg),
            const Divider(height: 1, color: AppColors.border),
            const SizedBox(height: Spacing.lg),
            if (jaAvaliou)
              Text(
                'Você avaliou com ${corrida.rating} estrela(s). Obrigado!',
                textAlign: TextAlign.center,
                style: AppText.bodyStrong.copyWith(color: AppColors.text),
              )
            else ...[
              Text(
                'Como foi a corrida?',
                textAlign: TextAlign.center,
                style: AppText.heading.copyWith(color: AppColors.text),
              ),
              const SizedBox(height: Spacing.sm),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  for (var i = 1; i <= 5; i++)
                    IconButton(
                      iconSize: 40,
                      tooltip: '$i estrela(s)',
                      onPressed: () => setState(() => _nota = i),
                      icon: Icon(i <= _nota ? Icons.star : Icons.star_border, color: AppColors.gold),
                    ),
                ],
              ),
              if (_nota >= 4) ...[
                const SizedBox(height: Spacing.sm),
                Wrap(
                  spacing: Spacing.sm,
                  runSpacing: Spacing.sm,
                  alignment: WrapAlignment.center,
                  children: [
                    for (final e in _elogios)
                      FilterChip(
                        label: Text(e),
                        selected: _escolhidos.contains(e),
                        onSelected: (v) => setState(() => v ? _escolhidos.add(e) : _escolhidos.remove(e)),
                      ),
                  ],
                ),
              ],
            ],
            const SizedBox(height: Spacing.xl),
            BotaoPrincipal(
              texto: jaAvaliou ? 'Fechar' : 'Enviar avaliação',
              ativo: jaAvaliou || _nota > 0,
              carregando: _enviando,
              aoTocar: () => _fechar(avaliar: !jaAvaliou),
            ),
            if (!jaAvaliou)
              TextButton(
                onPressed: _enviando ? null : () => _fechar(avaliar: false),
                child: Text('Agora não', style: AppText.bodyStrong.copyWith(color: AppColors.textMuted)),
              ),
          ],
        ),
      ),
    );
  }
}
