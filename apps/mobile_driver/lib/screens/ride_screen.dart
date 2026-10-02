import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'package:url_launcher/url_launcher.dart';

import '../core/avisos.dart';
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

  static const List<String> _motivos = [
    'Passageiro não apareceu',
    'Problema no carro',
    'Endereço errado ou longe demais',
    'Outro motivo',
  ];

  Future<void> _cancelar(BuildContext context) async {
    final motivo = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: AppColors.sheet,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.all(Spacing.lg),
              child: Text('Por que vai cancelar?', style: SheetText.title),
            ),
            for (final m in _motivos)
              ListTile(
                title: Text(m, style: SheetText.body),
                onTap: () => Navigator.of(ctx).pop(m),
              ),
            TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Voltar')),
          ],
        ),
      ),
    );
    if (motivo == null || !context.mounted) return;
    await context.read<DriverState>().cancelarCorrida(motivo);
  }

  Future<void> _ligar(String telefone, {bool whatsapp = false}) async {
    final so = telefone.replaceAll(RegExp(r'\D'), '');
    final uri = whatsapp ? Uri.parse('https://wa.me/$so') : Uri.parse('tel:+$so');
    final abriu = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!abriu) avisar(whatsapp ? 'Não foi possível abrir o WhatsApp.' : 'Não foi possível abrir o telefone.');
  }

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
          '${formatDistance(offer.distanceToPickupMeters.toDouble())} de distância',
        ),
      RidePhase.waitingPassenger => (
          'Aguardando o passageiro',
          ride.pin.isEmpty
              ? 'Confirme o nome do passageiro antes de iniciar'
              : 'Peça o PIN ao passageiro: tem que ser ${ride.pin}',
        ),
      RidePhase.inProgress => (
          'Corrida em andamento',
          '${formatDuration(offer.durationSeconds)} até o destino',
        ),
      RidePhase.completed => ('Corrida concluída', 'Cobre do passageiro • ${offer.paymentMethod}'),
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
                          formatMoney(driver.valorFinalCents ?? offer.fareCents),
                          style: SheetText.title.copyWith(color: AppColors.primary, fontSize: 28),
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
                      if (driver.telefonePassageiro != null && !isCompleted) ...[
                        IconButton(
                          tooltip: 'Ligar para o passageiro',
                          onPressed: () => _ligar(driver.telefonePassageiro!),
                          icon: const Icon(Icons.call, color: AppColors.primary),
                        ),
                        IconButton(
                          tooltip: 'WhatsApp do passageiro',
                          onPressed: () => _ligar(driver.telefonePassageiro!, whatsapp: true),
                          icon: const Icon(Icons.chat, color: AppColors.primary),
                        ),
                      ],
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
                        label: 'Distância',
                        onLight: true,
                      ),
                      MetricTile(
                        value: formatDuration(offer.durationSeconds),
                        label: 'Duração',
                        onLight: true,
                      ),
                      MetricTile(
                        value: formatMoney(driver.valorFinalCents ?? offer.fareCents),
                        label: isCompleted ? 'Valor final' : 'Estimativa',
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
                        loading: driver.enviandoEtapa,
                        onPressed: () => context.read<DriverState>().markArrived(),
                      ),
                    RidePhase.waitingPassenger => AppButton(
                        label: 'Iniciar corrida',
                        variant: AppButtonVariant.primary,
                        loading: driver.enviandoEtapa,
                        onPressed: () => context.read<DriverState>().startRide(),
                      ),
                    RidePhase.inProgress => AppButton(
                        label: 'Finalizar corrida',
                        variant: AppButtonVariant.primary,
                        onPressed: () => context.read<DriverState>().finishRide(),
                      ),
                    RidePhase.completed => AppButton(
                        label: 'Recebi — ficar disponível',
                        variant: AppButtonVariant.accent,
                        onPressed: () => context.read<DriverState>().closeRide(),
                      ),
                  },
                  if (ride.phase == RidePhase.toPickup || ride.phase == RidePhase.waitingPassenger)
                    TextButton(
                      onPressed: driver.enviandoEtapa ? null : () => _cancelar(context),
                      child: const Text('Cancelar corrida', style: TextStyle(color: AppColors.danger)),
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
