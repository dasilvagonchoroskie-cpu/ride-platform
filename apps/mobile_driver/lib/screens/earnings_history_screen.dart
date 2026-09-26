import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../data/models/driver_models.dart';
import '../state/driver_state.dart';

/// Historico de ganhos do periodo aberto em Atividades: corrida por
/// corrida, com o valor cobrado, a comissao e o que ficou para o motorista.
class EarningsHistoryScreen extends StatelessWidget {
  const EarningsHistoryScreen({super.key, required this.resumo});

  final ActivitySummary resumo;

  @override
  Widget build(BuildContext context) {
    final oculto = context.watch<DriverState>().ocultarValores;
    final itens = resumo.items;
    final titulo = switch (resumo.period) {
      'day' => 'Ganhos de hoje',
      'week' => 'Ganhos da semana',
      _ => 'Ganhos do mês',
    };

    return Scaffold(
      appBar: AppBar(title: const Text('Histórico de ganhos')),
      body: ListView(
        padding: const EdgeInsets.all(Spacing.lg),
        children: [
          Container(
            padding: const EdgeInsets.all(Spacing.xl),
            decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(Radii.sm)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(titulo, style: AppText.body.copyWith(color: AppColors.textMuted, fontSize: 17)),
                Text(dinheiro(resumo.earningCents, oculto: oculto), style: AppText.display.copyWith(fontSize: 32)),
                const SizedBox(height: Spacing.xs),
                Text(corridas(resumo.rides), style: AppText.body.copyWith(color: AppColors.textMuted)),
              ],
            ),
          ),
          const SizedBox(height: Spacing.md),
          if (itens.isEmpty)
            Padding(
              padding: const EdgeInsets.all(Spacing.xl),
              child: Text(
                'Nenhuma corrida concluída neste período.',
                textAlign: TextAlign.center,
                style: AppText.body.copyWith(color: AppColors.textMuted),
              ),
            )
          else
            for (final c in itens) ...[
              _ItemGanho(corrida: c, oculto: oculto),
              const SizedBox(height: Spacing.sm),
            ],
        ],
      ),
    );
  }
}

class _ItemGanho extends StatelessWidget {
  const _ItemGanho({required this.corrida, required this.oculto});

  final EarningRide corrida;
  final bool oculto;

  @override
  Widget build(BuildContext context) {
    final c = corrida;
    return Container(
      padding: const EdgeInsets.all(Spacing.lg),
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(Radii.sm)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${diaMesHora(c.finishedAt)}  •  Corrida ${c.code}',
                  style: AppText.body.copyWith(color: AppColors.textMuted),
                ),
              ),
              Text(dinheiro(c.earningCents, oculto: oculto), style: AppText.heading.copyWith(color: AppColors.primary)),
            ],
          ),
          const SizedBox(height: Spacing.sm),
          _Endereco(cor: AppColors.primary, texto: c.pickupAddress),
          const SizedBox(height: 4),
          _Endereco(cor: AppColors.danger, texto: c.dropoffAddress),
          const SizedBox(height: Spacing.sm),
          Text(
            'Cobrado ${dinheiro(c.fareCents, oculto: oculto)}  •  comissão ${dinheiro(c.commissionCents, oculto: oculto)}'
            '  •  ${(c.distanceMeters / 1000).toStringAsFixed(1).replaceAll('.', ',')} km',
            style: AppText.caption.copyWith(color: AppColors.textMuted),
          ),
        ],
      ),
    );
  }
}

class _Endereco extends StatelessWidget {
  const _Endereco({required this.cor, required this.texto});

  final Color cor;
  final String texto;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Container(width: 8, height: 8, decoration: BoxDecoration(color: cor, shape: BoxShape.circle)),
        ),
        const SizedBox(width: Spacing.sm),
        Expanded(child: Text(texto.isEmpty ? '—' : texto, style: AppText.body)),
      ],
    );
  }
}
