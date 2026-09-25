import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../core/utils/geo.dart';
import '../data/models/driver_models.dart';
import '../state/driver_state.dart';
import '../widgets/ride_map.dart';
import '../widgets/ui.dart';

/// Conducao da corrida: ir ate o passageiro, aguardar, conduzir ao destino
/// e concluir.
class RideScreen extends StatelessWidget {
  const RideScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final driver = context.watch<DriverState>();
    final ride = driver.activeRide;

    if (ride == null) return const SizedBox.shrink();

    final offer = ride.offer;
    final isCompleted = ride.phase == RidePhase.completed;

    final center = switch (ride.phase) {
      RidePhase.toPickup => offer.pickupCoords,
      RidePhase.waitingPassenger => offer.pickupCoords,
      _ => offer.dropoffCoords,
    };

    final route = ride.phase == RidePhase.toPickup || ride.phase == RidePhase.waitingPassenger
        ? (driver.routeToPickup.isNotEmpty
            ? driver.routeToPickup
            : [driver.position, offer.pickupCoords])
        : (driver.tripRoute.isNotEmpty
            ? driver.tripRoute
            : [offer.pickupCoords, offer.dropoffCoords]);

    final (String title, String subtitle) = switch (ride.phase) {
      RidePhase.toPickup => (
          'A caminho do embarque',
          '${formatDistance(offer.distanceToPickupMeters.toDouble())} de distancia',
        ),
      RidePhase.waitingPassenger => (
          'Aguardando o passageiro',
          'Confirme o PIN ${ride.pin} antes de iniciar',
        ),
      RidePhase.inProgress => (
          'Corrida em andamento',
          '${formatDuration(offer.durationSeconds)} ate o destino',
        ),
      RidePhase.completed => ('Corrida concluida', 'Valor a receber'),
    };

    return Scaffold(
      backgroundColor: AppColors.background,
      body: Column(
        children: [
          Expanded(
            flex: 5,
            child: Stack(
              children: [
                Positioned.fill(
                  child: RideMap(
                    center: center,
                    span: 0.045,
                    rounded: false,
                    route: route,
                    markers: [
                      MapMarker(id: 'me', coords: driver.position, kind: MarkerKind.car),
                      MapMarker(id: 'pickup', coords: offer.pickupCoords, kind: MarkerKind.pickup),
                      MapMarker(id: 'dropoff', coords: offer.dropoffCoords, kind: MarkerKind.dropoff),
                    ],
                  ),
                ),
                SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.all(Spacing.lg),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: Spacing.md,
                        vertical: Spacing.sm,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.background.withValues(alpha: 0.86),
                        borderRadius: BorderRadius.circular(Radii.pill),
                        border: Border.all(color: AppColors.border),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            isCompleted ? Icons.check_circle : Icons.navigation,
                            size: 16,
                            color: isCompleted ? AppColors.primary : AppColors.accent,
                          ),
                          const SizedBox(width: Spacing.sm),
                          Text(
                            isCompleted ? 'FINALIZADA' : 'EM SERVICO',
                            style: AppText.label.copyWith(
                              color: isCompleted ? AppColors.primary : AppColors.accent,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),

          Expanded(
            flex: 5,
            child: SheetSurface(
              padding: const EdgeInsets.fromLTRB(Spacing.lg, Spacing.md, Spacing.lg, Spacing.xl),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Center(
                    child: Container(
                      width: 36,
                      height: 4,
                      decoration: BoxDecoration(
                        color: AppColors.sheetBorder,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  const SizedBox(height: Spacing.lg),

                  Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(title, style: SheetText.title),
                            const SizedBox(height: Spacing.xs),
                            Text(subtitle, style: SheetText.muted),
                          ],
                        ),
                      ),
                      if (isCompleted)
                        Text(
                          formatMoney(offer.earningCents),
                          style: SheetText.title.copyWith(color: AppColors.primary, fontSize: 26),
                        ),
                    ],
                  ),

                  const SizedBox(height: Spacing.lg),
                  const AppDivider(onLight: true),

                  // Passageiro
                  Row(
                    children: [
                      AppAvatar(initials: offer.passengerInitials, size: 46),
                      const SizedBox(width: Spacing.md),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(offer.passengerName, style: SheetText.heading),
                            Row(
                              children: [
                                AppStars(value: offer.passengerRating, size: 12),
                                const SizedBox(width: Spacing.xs),
                                Text(offer.paymentMethod, style: SheetText.muted),
                              ],
                            ),
                          ],
                        ),
                      ),
                      if (ride.phase == RidePhase.waitingPassenger)
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: Spacing.md,
                            vertical: Spacing.sm,
                          ),
                          decoration: BoxDecoration(
                            color: AppColors.sheetField,
                            borderRadius: BorderRadius.circular(Radii.sm),
                          ),
                          child: Column(
                            children: [
                              Text('PIN', style: SheetText.label),
                              Text(
                                ride.pin,
                                style: SheetText.heading.copyWith(letterSpacing: 3),
                              ),
                            ],
                          ),
                        ),
                    ],
                  ),

                  const SizedBox(height: Spacing.md),
                  const AppDivider(onLight: true),

                  _PlaceRow(
                    icon: Icons.my_location,
                    label: 'Embarque',
                    address: offer.pickupAddress,
                  ),
                  const SizedBox(height: Spacing.sm),
                  _PlaceRow(
                    icon: Icons.flag,
                    label: 'Destino',
                    address: offer.dropoffAddress,
                  ),

                  const SizedBox(height: Spacing.md),
                  Row(
                    children: [
                      MetricTile(
                        value: formatDistance(offer.tripDistanceMeters.toDouble()),
                        label: 'Distancia',
                        onLight: true,
                      ),
                      MetricTile(
                        value: formatDuration(offer.durationSeconds),
                        label: 'Duracao',
                        onLight: true,
                      ),
                      MetricTile(
                        value: formatMoney(offer.fareCents),
                        label: 'Tarifa',
                        onLight: true,
                      ),
                    ],
                  ),

                  const Spacer(),

                  // Acao conforme a fase da corrida
                  switch (ride.phase) {
                    RidePhase.toPickup => AppButton(
                        label: 'Cheguei ao embarque',
                        variant: AppButtonVariant.primary,
                        onPressed: () => context.read<DriverState>().markArrived(),
                      ),
                    RidePhase.waitingPassenger => AppButton(
                        label: 'Iniciar corrida',
                        variant: AppButtonVariant.primary,
                        onPressed: () => context.read<DriverState>().startRide(),
                      ),
                    RidePhase.inProgress => AppButton(
                        label: 'Finalizar corrida',
                        variant: AppButtonVariant.primary,
                        onPressed: () => context.read<DriverState>().finishRide(),
                      ),
                    RidePhase.completed => AppButton(
                        label: 'Receber e ficar disponivel',
                        variant: AppButtonVariant.accent,
                        onPressed: () => context.read<DriverState>().closeRide(),
                      ),
                  },
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PlaceRow extends StatelessWidget {
  const _PlaceRow({required this.icon, required this.label, required this.address});

  final IconData icon;
  final String label;
  final String address;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 18, color: AppColors.sheetText),
        const SizedBox(width: Spacing.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label.toUpperCase(), style: SheetText.label.copyWith(fontSize: 10)),
              Text(
                address,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: SheetText.body,
              ),
            ],
          ),
        ),
      ],
    );
  }
}
