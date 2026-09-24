import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/central_theme.dart';
import '../core/utils/formatters.dart';
import '../state/central_state.dart';
import '../widgets/ui.dart';

/// Painel financeiro: faturamento do dia, da semana, corridas e operacao.
class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key, this.onNavigate});

  final ValueChanged<int>? onNavigate;

  @override
  Widget build(BuildContext context) {
    final central = context.watch<CentralState>();
    final summary = central.financials;
    final tablet = MediaQuery.of(context).size.width >= 900;

    if (summary == null) {
      return const Center(child: CircularProgressIndicator(color: AppColors.primary));
    }

    final cards = <Widget>[
      MetricCard(
        label: 'Faturamento hoje',
        value: formatMoney(summary.todayCents),
        helper: '${summary.ridesToday} corridas',
        icon: Icons.today,
        highlight: true,
      ),
      MetricCard(
        label: 'Faturamento da semana',
        value: formatMoney(summary.weekCents),
        helper: '${summary.ridesWeek} corridas',
        icon: Icons.date_range,
        highlight: true,
      ),
      MetricCard(
        label: 'Faturamento do mes',
        value: formatMoney(summary.monthCents),
        helper: 'Ticket medio ${formatMoney(summary.averageTicketCents)}',
        icon: Icons.calendar_month,
        highlight: true,
      ),
      MetricCard(
        label: 'Corridas realizadas',
        value: formatCompactNumber(summary.ridesToday),
        helper: 'hoje - ${summary.ridesWeek} na semana',
        icon: Icons.local_taxi_outlined,
      ),
      MetricCard(
        label: 'Comissao da plataforma',
        value: formatMoney(summary.commissionTodayCents),
        helper: 'hoje',
        icon: Icons.percent,
      ),
      MetricCard(
        label: 'Repasse aos motoristas',
        value: formatMoney(summary.driverPayoutsTodayCents),
        helper: 'hoje',
        icon: Icons.account_balance_wallet_outlined,
      ),
    ];

    return SingleChildScrollView(
      padding: const EdgeInsets.all(Spacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Cartoes flutuantes
          if (tablet)
            GridView.count(
              crossAxisCount: 3,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: Spacing.md,
              crossAxisSpacing: Spacing.md,
              childAspectRatio: 1.85,
              children: cards,
            )
          else
            Column(
              children: [
                for (final card in cards)
                  Padding(padding: const EdgeInsets.only(bottom: Spacing.md), child: card),
              ],
            ),

          const SizedBox(height: Spacing.sm),
          const SectionTitle(text: 'Faturamento por hora'),
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Ultimas 12 horas', style: AppText.caption.copyWith(color: AppColors.textMuted)),
                    Text(
                      formatMoney(summary.hourlyRevenue.fold<int>(0, (a, b) => a + b)),
                      style: AppText.bodyStrong.copyWith(color: AppColors.primary),
                    ),
                  ],
                ),
                const SizedBox(height: Spacing.md),
                HourlyBarChart(values: summary.hourlyRevenue),
              ],
            ),
          ),

          const SizedBox(height: Spacing.lg),
          const SectionTitle(text: 'Operacao agora'),
          if (tablet)
            Row(
              children: [
                Expanded(
                  child: MetricCard(
                    label: 'Motoristas online',
                    value: '${summary.onlineDrivers}',
                    helper: 'de ${summary.activeDrivers} cadastrados',
                    icon: Icons.person_pin_circle_outlined,
                  ),
                ),
                const SizedBox(width: Spacing.md),
                Expanded(
                  child: MetricCard(
                    label: 'Corridas ativas',
                    value: '${central.activeRidesCount}',
                    helper: 'em andamento',
                    icon: Icons.navigation_outlined,
                  ),
                ),
                const SizedBox(width: Spacing.md),
                Expanded(
                  child: MetricCard(
                    label: 'Aprovacoes pendentes',
                    value: '${central.pendingCount}',
                    helper: 'aguardando analise',
                    icon: Icons.pending_actions_outlined,
                  ),
                ),
                const SizedBox(width: Spacing.md),
                Expanded(
                  child: MetricCard(
                    label: 'Taxa de cancelamento',
                    value: formatPercent(summary.cancellationRate),
                    helper: 'hoje',
                    icon: Icons.cancel_outlined,
                  ),
                ),
              ],
            )
          else
            Column(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: MetricCard(
                        label: 'Motoristas online',
                        value: '${summary.onlineDrivers}',
                        helper: 'de ${summary.activeDrivers}',
                        icon: Icons.person_pin_circle_outlined,
                      ),
                    ),
                    const SizedBox(width: Spacing.md),
                    Expanded(
                      child: MetricCard(
                        label: 'Corridas ativas',
                        value: '${central.activeRidesCount}',
                        helper: 'em andamento',
                        icon: Icons.navigation_outlined,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: Spacing.md),
                Row(
                  children: [
                    Expanded(
                      child: MetricCard(
                        label: 'Aprovacoes',
                        value: '${central.pendingCount}',
                        helper: 'pendentes',
                        icon: Icons.pending_actions_outlined,
                      ),
                    ),
                    const SizedBox(width: Spacing.md),
                    Expanded(
                      child: MetricCard(
                        label: 'Cancelamentos',
                        value: formatPercent(summary.cancellationRate),
                        helper: 'hoje',
                        icon: Icons.cancel_outlined,
                      ),
                    ),
                  ],
                ),
              ],
            ),

          const SizedBox(height: Spacing.lg),
          const SectionTitle(text: 'Acoes rapidas'),
          Row(
            children: [
              Expanded(
                child: AppButton(
                  label: 'Aprovar motoristas',
                  variant: AppButtonVariant.approve,
                  icon: Icons.how_to_reg,
                  onPressed: () => onNavigate?.call(1),
                ),
              ),
              const SizedBox(width: Spacing.md),
              Expanded(
                child: AppButton(
                  label: 'Ver mapa',
                  variant: AppButtonVariant.secondary,
                  icon: Icons.map,
                  onPressed: () => onNavigate?.call(2),
                ),
              ),
            ],
          ),
          const SizedBox(height: Spacing.md),
        ],
      ),
    );
  }
}
