import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/uber_theme.dart';
import '../core/utils/formatters.dart';
import '../core/utils/geo.dart';
import '../state/driver_state.dart';
import '../widgets/ride_map.dart';
import '../widgets/ui.dart';

/// Oferta de corrida com contador regressivo e rota ate o passageiro.
class OfferScreen extends StatelessWidget {
  const OfferScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final driver = context.watch<DriverState>();
    final offer = driver.offer;

    if (offer == null) return const SizedBox.shrink();

    final progress = offer.expiresInSeconds == 0
        ? 0.0
        : driver.offerSecondsLeft / offer.expiresInSeconds;

    return Scaffold(
      backgroundColor: AppColors.background,
      body: Column(
        children: [
          // Mapa com a rota ate o passageiro
          Expanded(
            flex: 4,
            child: RideMap(
              center: offer.pickupCoords,
              span: 0.05,
              rounded: false,
              route: [driver.position, offer.pickupCoords],
              markers: [
                MapMarker(id: 'me', coords: driver.position, kind: MarkerKind.car),
                MapMarker(id: 'pickup', coords: offer.pickupCoords, kind: MarkerKind.pickup),
                MapMarker(id: 'dropoff', coords: offer.dropoffCoords, kind: MarkerKind.dropoff),
              ],
            ),
          ),

          Expanded(
            flex: 6,
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

                  // Contador de expiracao
                  Row(
                    children: [
                      SizedBox(
                        height: 44,
                        width: 44,
                        child: Stack(
                          alignment: Alignment.center,
                          children: [
                            CircularProgressIndicator(
                              value: progress,
                              strokeWidth: 3.5,
                              backgroundColor: AppColors.sheetBorder,
                              valueColor: AlwaysStoppedAnimation(
                                progress > 0.35 ? AppColors.primary : AppColors.danger,
                              ),
                            ),
                            Text(
                              '${driver.offerSecondsLeft}',
                              style: SheetText.heading.copyWith(fontSize: 15),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: Spacing.md),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Nova chamada', style: SheetText.title),
                            Text('Responda antes do tempo acabar', style: SheetText.muted),
                          ],
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: Spacing.lg),

                  // Ganho em destaque
                  Container(
                    padding: const EdgeInsets.all(Spacing.lg),
                    decoration: BoxDecoration(
                      color: AppColors.sheetField,
                      borderRadius: BorderRadius.circular(Radii.sm),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('VOCE RECEBE', style: SheetText.label),
                            Text(
                              formatMoney(offer.earningCents),
                              style: SheetText.title.copyWith(fontSize: 28),
                            ),
                          ],
                        ),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text('Tarifa', style: SheetText.muted),
                            Text(formatMoney(offer.fareCents), style: SheetText.heading),
                          ],
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: Spacing.md),

                  // Passageiro
                  Row(
                    children: [
                      AppAvatar(initials: offer.passengerInitials, size: 44),
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
                                Text(offer.passengerRating.toStringAsFixed(2), style: SheetText.muted),
                                const SizedBox(width: Spacing.sm),
                                Text(offer.paymentMethod, style: SheetText.muted),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: Spacing.md),
                  const AppDivider(onLight: true),

                  // Rota
                  Row(
                    children: [
                      const Icon(Icons.my_location, size: 18, color: AppColors.sheetText),
                      const SizedBox(width: Spacing.md),
                      Expanded(
                        child: Text(
                          '${formatDistance(offer.distanceToPickupMeters.toDouble())} ate o embarque',
                          style: SheetText.body,
                        ),
                      ),
                      Text(formatDuration(offer.durationSeconds), style: SheetText.heading),
                    ],
                  ),
                  const SizedBox(height: Spacing.sm),
                  Row(
                    children: [
                      const Icon(Icons.location_on, size: 18, color: AppColors.primary),
                      const SizedBox(width: Spacing.md),
                      Expanded(
                        child: Text(
                          offer.pickupAddress,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: SheetText.body,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: Spacing.sm),
                  Row(
                    children: [
                      const Icon(Icons.flag, size: 18, color: AppColors.danger),
                      const SizedBox(width: Spacing.md),
                      Expanded(
                        child: Text(
                          offer.dropoffAddress,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: SheetText.body,
                        ),
                      ),
                      Text(
                        formatDistance(offer.tripDistanceMeters.toDouble()),
                        style: SheetText.muted,
                      ),
                    ],
                  ),

                  const Spacer(),

                  AppButton(
                    label: 'Aceitar corrida',
                    variant: AppButtonVariant.accent,
                    onPressed: () => context.read<DriverState>().acceptOffer(),
                  ),
                  const SizedBox(height: Spacing.sm),
                  AppButton(
                    label: 'Recusar',
                    variant: AppButtonVariant.secondary,
                    onPressed: () => context.read<DriverState>().declineOffer(),
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
