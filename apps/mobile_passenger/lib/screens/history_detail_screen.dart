import 'package:flutter/material.dart';

import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../core/utils/geo.dart';
import '../data/models/models.dart';
import '../widgets/map_canvas.dart';
import '../widgets/ui.dart';

class HistoryDetailScreen extends StatelessWidget {
  const HistoryDetailScreen({super.key, required this.ride});

  final Ride ride;

  @override
  Widget build(BuildContext context) {
    final center = Coords(
      (ride.pickup.coords.latitude + ride.dropoff.coords.latitude) / 2,
      (ride.pickup.coords.longitude + ride.dropoff.coords.longitude) / 2,
    );

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: Text('Corrida ${ride.code}'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: Spacing.lg),
            child: Center(
              child: AppBadge(
                text: ride.status == RideStatus.completed ? 'CONCLUIDA' : 'CANCELADA',
                tone: ride.status == RideStatus.completed
                    ? AppBadgeTone.success
                    : AppBadgeTone.danger,
              ),
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(Spacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              RideMap(
                center: center,
                height: 210,
                span: 0.09,
                markers: [
                  MapMarker(id: 'pickup', coords: ride.pickup.coords, kind: MarkerKind.pickup),
                  MapMarker(id: 'dropoff', coords: ride.dropoff.coords, kind: MarkerKind.dropoff),
                ],
                route: [ride.pickup.coords, ride.dropoff.coords],
              ),
              const SizedBox(height: Spacing.lg),
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      formatDateTime(ride.finishedAt ?? ride.createdAt),
                      style: const TextStyle(
                        color: AppColors.text,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const AppDivider(),
                    _DetailRow(
                      label: 'Distancia',
                      value: formatDistance(ride.distanceMeters.toDouble()),
                    ),
                    _DetailRow(label: 'Duracao', value: formatDuration(ride.durationSeconds)),
                    _DetailRow(label: 'Categoria', value: ride.category.name),
                    _DetailRow(label: 'Pagamento', value: ride.paymentMethod),
                    const AppDivider(),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'Total',
                          style: TextStyle(color: AppColors.text, fontSize: 19, fontWeight: FontWeight.w600),
                        ),
                        Text(
                          formatMoney(ride.fareCents),
                          style: const TextStyle(
                            color: AppColors.primary,
                            fontSize: 19,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              if (ride.driver != null) ...[
                const SizedBox(height: Spacing.md),
                AppCard(
                  child: Row(
                    children: [
                      AppAvatar(initials: ride.driver!.initials),
                      const SizedBox(width: Spacing.md),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              ride.driver!.name,
                              style: const TextStyle(
                                color: AppColors.text,
                                fontSize: 15,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            Text(
                              '${ride.driver!.vehicle} - ${ride.driver!.plate}',
                              style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
                            ),
                          ],
                        ),
                      ),
                      if (ride.rating != null) AppStars(value: ride.rating!.toDouble()),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: Spacing.xs),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: AppColors.textMuted, fontSize: 15)),
          Text(
            value,
            style: const TextStyle(color: AppColors.text, fontSize: 15, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}
