import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/central_theme.dart';
import '../core/utils/formatters.dart';
import '../state/central_state.dart';
import '../widgets/ui.dart';

/// Historico de corridas (visao operacional).
class RidesScreen extends StatelessWidget {
  const RidesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final central = context.watch<CentralState>();
    final rides = central.rides;

    if (rides.isEmpty) {
      return const EmptyState(
        title: 'Nenhuma corrida registrada',
        description: 'As corridas aparecem aqui conforme sao solicitadas.',
        icon: Icons.receipt_long_outlined,
      );
    }

    final total = rides.fold<int>(0, (sum, r) => sum + r.fareCents);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(Spacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: MetricCard(
                  label: 'Corridas listadas',
                  value: '${rides.length}',
                  icon: Icons.local_taxi_outlined,
                  highlight: true,
                ),
              ),
              const SizedBox(width: Spacing.md),
              Expanded(
                child: MetricCard(
                  label: 'Valor somado',
                  value: formatMoney(total),
                  icon: Icons.attach_money,
                  highlight: true,
                ),
              ),
            ],
          ),
          const SizedBox(height: Spacing.lg),
          const SectionTitle(text: 'Em andamento'),
          for (final ride in rides)
            Padding(
              padding: const EdgeInsets.only(bottom: Spacing.md),
              child: AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          ride.code,
                          style: AppText.bodyStrong.copyWith(color: AppColors.primary),
                        ),
                        const SizedBox(width: Spacing.sm),
                        AppBadge(text: ride.phaseLabel.toUpperCase()),
                        const Spacer(),
                        Text(formatMoney(ride.fareCents), style: AppText.bodyStrong),
                      ],
                    ),
                    const AppDivider(),
                    _Line(
                      icon: Icons.person_outline,
                      label: 'Passageiro',
                      value: ride.passengerName,
                    ),
                    _Line(
                      icon: Icons.directions_car_outlined,
                      label: 'Motorista',
                      value: '${ride.driverName} - ${ride.driverPlate}',
                    ),
                    _Line(
                      icon: Icons.my_location,
                      label: 'Embarque',
                      value: ride.pickupAddress,
                    ),
                    _Line(
                      icon: Icons.flag_outlined,
                      label: 'Destino',
                      value: ride.dropoffAddress,
                    ),
                    _Line(
                      icon: Icons.schedule,
                      label: 'Inicio',
                      value: formatDateTime(ride.startedAt),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _Line extends StatelessWidget {
  const _Line({required this.icon, required this.label, required this.value});

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: Spacing.xs),
      child: Row(
        children: [
          Icon(icon, size: 16, color: AppColors.textFaint),
          const SizedBox(width: Spacing.md),
          SizedBox(
            width: 90,
            child: Text(label, style: AppText.caption.copyWith(color: AppColors.textMuted)),
          ),
          Expanded(
            child: Text(
              value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppText.caption,
            ),
          ),
        ],
      ),
    );
  }
}
