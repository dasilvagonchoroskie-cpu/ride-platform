import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/uber_theme.dart';
import '../core/utils/formatters.dart';
import '../state/driver_state.dart';
import '../widgets/ui.dart';
import 'statement_screen.dart';

class EarningsScreen extends StatelessWidget {
  const EarningsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final driver = context.watch<DriverState>();
    final wallet = driver.wallet;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Carteira')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(Spacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Saldo disponivel
              Container(
                padding: const EdgeInsets.all(Spacing.xl),
                decoration: BoxDecoration(
                  color: AppColors.primarySoft,
                  border: Border.all(color: AppColors.primaryDark),
                  borderRadius: BorderRadius.circular(Radii.lg),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('SALDO DISPONIVEL', style: AppText.label.copyWith(color: AppColors.primary)),
                    const SizedBox(height: Spacing.sm),
                    Text(
                      formatMoney(wallet.balanceCents),
                      style: AppText.display.copyWith(color: AppColors.text),
                    ),
                    const SizedBox(height: Spacing.md),
                    AppButton(
                      label: wallet.canRequestPayout ? 'Sacar via Pix' : 'Minimo ${formatMoney(wallet.minPayoutCents)} para sacar',
                      variant: AppButtonVariant.primary,
                      enabled: wallet.canRequestPayout,
                      onPressed: () => _requestPayout(context, wallet.balanceCents),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: Spacing.lg),
              const SectionTitle(text: 'Resumo'),

              AppCard(
                child: Column(
                  children: [
                    Row(
                      children: [
                        MetricTile(value: formatMoney(wallet.todayCents), label: 'Hoje'),
                        MetricTile(value: formatMoney(wallet.weekCents), label: 'Semana'),
                        MetricTile(value: formatMoney(wallet.monthCents), label: 'Mes'),
                      ],
                    ),
                    const AppDivider(),
                    Row(
                      children: [
                        MetricTile(value: '${wallet.ridesToday}', label: 'Corridas hoje'),
                        MetricTile(
                          value: wallet.hoursOnlineToday.toStringAsFixed(1),
                          label: 'Horas online',
                        ),
                        MetricTile(value: '${wallet.acceptanceRate}%', label: 'Aceitacao'),
                      ],
                    ),
                  ],
                ),
              ),

              const SizedBox(height: Spacing.lg),
              const SectionTitle(text: 'Ultimos lancamentos'),
              AppCard(
                child: Column(
                  children: [
                    for (final entry in driver.statement.take(5))
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: Spacing.sm),
                        child: Row(
                          children: [
                            Icon(
                              entry.isCredit ? Icons.arrow_downward : Icons.arrow_upward,
                              size: 18,
                              color: entry.isCredit ? AppColors.primary : AppColors.textMuted,
                            ),
                            const SizedBox(width: Spacing.md),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(entry.description, style: AppText.body),
                                  Text(
                                    formatDateTime(entry.createdAt),
                                    style: AppText.caption.copyWith(color: AppColors.textFaint),
                                  ),
                                ],
                              ),
                            ),
                            Text(
                              '${entry.isCredit ? '+' : '-'}${formatMoney(entry.amountCents.abs())}',
                              style: AppText.bodyStrong.copyWith(
                                color: entry.isCredit ? AppColors.primary : AppColors.textMuted,
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),

              const SizedBox(height: Spacing.lg),
              AppButton(
                label: 'Ver extrato completo',
                variant: AppButtonVariant.secondary,
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(builder: (_) => const StatementScreen()),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _requestPayout(BuildContext context, int amountCents) async {
    await context.read<DriverState>().requestPayout(amountCents);
    if (!context.mounted) return;

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          'Saque de ${formatMoney(amountCents)} solicitado via Pix.',
          style: AppText.body.copyWith(color: AppColors.sheet),
        ),
        backgroundColor: AppColors.primary,
      ),
    );
  }
}
