import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../core/utils/geo.dart';
import '../state/app_state.dart';
import '../state/ride_state.dart';
import '../widgets/map_canvas.dart';
import '../widgets/ui.dart';

class RideScreen extends StatelessWidget {
  const RideScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final ride = context.watch<RideState>();
    final active = ride.activeRide;

    if (active == null) return const SizedBox.shrink();

    final route = ride.tripRoute.isNotEmpty
        ? ride.tripRoute
        : buildRoute(active.pickup.coords, active.dropoff.coords, steps: 40);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Viagem em andamento'),
        actions: const [
          Padding(
            padding: EdgeInsets.only(right: Spacing.lg),
            child: Center(child: AppBadge(text: 'EM VIAGEM', tone: AppBadgeTone.info)),
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
                center: app.coords,
                height: 250,
                span: 0.07,
                markers: [
                  MapMarker(id: 'pickup', coords: active.pickup.coords, kind: MarkerKind.pickup),
                  MapMarker(id: 'dropoff', coords: active.dropoff.coords, kind: MarkerKind.dropoff),
                  if (active.driver != null)
                    MapMarker(id: 'driver', coords: active.driver!.position, kind: MarkerKind.car),
                ],
                route: route,
              ),
              const SizedBox(height: Spacing.lg),
              if (active.driver != null)
                AppCard(
                  child: Column(
                    children: [
                      Row(
                        children: [
                          AppAvatar(initials: active.driver!.initials, size: 54),
                          const SizedBox(width: Spacing.md),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  active.driver!.name,
                                  style: const TextStyle(
                                    color: AppColors.text,
                                    fontSize: 16,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Row(
                                  children: [
                                    AppStars(value: active.driver!.rating),
                                    const SizedBox(width: Spacing.xs),
                                    Text(
                                      active.driver!.rating.toStringAsFixed(2),
                                      style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
                                    ),
                                  ],
                                ),
                                Text(
                                  '${active.driver!.vehicle} - ${active.driver!.color}',
                                  style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
                                ),
                              ],
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: Spacing.md,
                              vertical: Spacing.sm,
                            ),
                            decoration: BoxDecoration(
                              color: AppColors.surfaceElevated,
                              border: Border.all(color: AppColors.border),
                              borderRadius: BorderRadius.circular(Radii.sm),
                            ),
                            child: Text(
                              active.driver!.plate,
                              style: const TextStyle(
                                color: AppColors.text,
                                fontWeight: FontWeight.w600,
                                letterSpacing: 1,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const AppDivider(),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'PIN DE EMBARQUE',
                                style: TextStyle(
                                  color: AppColors.textFaint,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  letterSpacing: 0.6,
                                ),
                              ),
                              Text(
                                active.pin,
                                style: const TextStyle(
                                  color: AppColors.primary,
                                  fontSize: 24,
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: 6,
                                ),
                              ),
                            ],
                          ),
                          Text(
                            '${active.driver!.totalRides} corridas',
                            style: const TextStyle(color: AppColors.textFaint, fontSize: 13),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              const SizedBox(height: Spacing.md),
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'ROTA',
                      style: TextStyle(
                        color: AppColors.textFaint,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.6,
                      ),
                    ),
                    const SizedBox(height: Spacing.md),
                    _RouteRow(color: AppColors.primary, text: active.pickup.address),
                    Container(
                      width: 1,
                      height: 18,
                      margin: const EdgeInsets.only(left: 4.5, top: 2, bottom: 2),
                      color: AppColors.border,
                    ),
                    _RouteRow(color: AppColors.danger, text: active.dropoff.address),
                    const AppDivider(),
                    Row(
                      children: [
                        MetricTile(
                          value: formatDistance(active.distanceMeters.toDouble()),
                          label: 'Distancia',
                        ),
                        MetricTile(value: formatDuration(active.durationSeconds), label: 'Duracao'),
                        MetricTile(value: formatMoney(active.fareCents), label: active.paymentMethod),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: Spacing.lg),
              AppButton(
                label: 'Finalizar viagem',
                onPressed: () => context.read<RideState>().advanceRide(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RouteRow extends StatelessWidget {
  const _RouteRow({required this.color, required this.text});

  final Color color;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          height: 10,
          width: 10,
          margin: const EdgeInsets.only(top: 5),
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: Spacing.md),
        Expanded(
          child: Text(text, style: const TextStyle(color: AppColors.text, fontSize: 15)),
        ),
      ],
    );
  }
}
