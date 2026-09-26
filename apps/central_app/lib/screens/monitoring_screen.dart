import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/central_theme.dart';
import '../core/utils/formatters.dart';
import '../core/utils/geo.dart';
import '../data/models/central_models.dart';
import '../state/central_state.dart';
import '../widgets/ride_map.dart';
import '../widgets/ui.dart';
import '../core/posicao_aparelho.dart';

/// Monitoramento: mapa com todas as corridas ativas (passageiro + motorista).
class MonitoringScreen extends StatefulWidget {
  const MonitoringScreen({super.key});

  @override
  State<MonitoringScreen> createState() => _MonitoringScreenState();
}

class _MonitoringScreenState extends State<MonitoringScreen> {
  String? _selectedId;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<CentralState>().startMonitoring();
    });
  }

  @override
  void dispose() {
    context.read<CentralState>().stopMonitoring();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final central = context.watch<CentralState>();
    final rides = central.rides;
    final selected = _selectedId == null
        ? null
        : rides.where((r) => r.id == _selectedId).firstOrNull;

    final markers = <MapMarker>[
      for (final ride in rides) ...[
        // Motorista: carro preto
        MapMarker(
          id: 'driver-${ride.id}',
          coords: ride.driverCoords,
          kind: MarkerKind.car,
          label: '${ride.driverName} - ${ride.driverPlate}',
        ),
        // Passageiro: pino azul com silhueta
        MapMarker(
          id: 'passenger-${ride.id}',
          coords: ride.passengerCoords,
          kind: MarkerKind.passenger,
          label: ride.passengerName,
        ),
      ],
    ];

    final polylines = selected == null ? const <Coords>[] : selected.polyline;

    return Column(
      children: [
        // Legenda
        Padding(
          padding: const EdgeInsets.fromLTRB(Spacing.lg, Spacing.lg, Spacing.lg, Spacing.sm),
          child: Row(
            children: [
              _Legend(color: AppColors.primary, label: 'Passageiro'),
              const SizedBox(width: Spacing.lg),
              _Legend(color: AppColors.text, label: 'Motorista'),
              const Spacer(),
              AppBadge(
                text: '${rides.length} ATIVAS',
                tone: rides.isEmpty ? AppBadgeTone.neutral : AppBadgeTone.info,
              ),
            ],
          ),
        ),

        // Mapa
        Expanded(
          flex: 3,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: Spacing.lg),
            child: RideMap(
              center: selected?.driverCoords ?? fallbackCenter(rides),
              markers: markers,
              route: polylines,
              span: selected == null ? 0.14 : 0.05,
              interactive: true,
            ),
          ),
        ),

        // Lista de corridas ativas
        Expanded(
          flex: 2,
          child: rides.isEmpty
              ? const EmptyState(
                  title: 'Nenhuma corrida ativa',
                  description: 'Assim que uma corrida comecar, ela aparece no mapa.',
                  icon: Icons.map_outlined,
                )
              : ListView.separated(
                  padding: const EdgeInsets.all(Spacing.lg),
                  itemCount: rides.length,
                  separatorBuilder: (_, __) => const SizedBox(height: Spacing.sm),
                  itemBuilder: (context, index) {
                    final ride = rides[index];
                    final isSelected = ride.id == _selectedId;

                    return GestureDetector(
                      onTap: () => setState(
                        () => _selectedId = isSelected ? null : ride.id,
                      ),
                      child: Container(
                        padding: const EdgeInsets.all(Spacing.md),
                        decoration: BoxDecoration(
                          color: isSelected ? AppColors.primarySoft : AppColors.surface,
                          border: Border.all(
                            color: isSelected ? AppColors.primary : AppColors.border,
                          ),
                          borderRadius: BorderRadius.circular(Radii.md),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.directions_car, color: AppColors.text, size: 22),
                            const SizedBox(width: Spacing.md),
                            Expanded(
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
                                    ],
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    '${ride.driverName} - ${ride.driverPlate}',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: AppText.caption.copyWith(color: AppColors.textMuted),
                                  ),
                                  Text(
                                    'Passageiro: ${ride.passengerName}',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: AppText.caption.copyWith(color: AppColors.textFaint),
                                  ),
                                ],
                              ),
                            ),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text(
                                  formatMoney(ride.fareCents),
                                  style: AppText.bodyStrong.copyWith(color: AppColors.primary),
                                ),
                                Text(
                                  formatTime(ride.startedAt),
                                  style: AppText.caption.copyWith(color: AppColors.textFaint),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }

  static Coords fallbackCenter(List<ActiveRide> rides) {
    // Sem corrida: abre onde o aparelho esta. Sem posicao ainda, mostra o
    // Brasil inteiro — nunca uma cidade fixa.
    if (rides.isEmpty) return PosicaoDoAparelho.atual ?? const Coords(-14.235, -51.925);
    final lat = rides.map((r) => r.driverCoords.latitude).reduce((a, b) => a + b) / rides.length;
    final lng = rides.map((r) => r.driverCoords.longitude).reduce((a, b) => a + b) / rides.length;
    return Coords(lat, lng);
  }
}

class _Legend extends StatelessWidget {
  const _Legend({required this.color, required this.label});

  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          height: 10,
          width: 10,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: Spacing.sm),
        Text(label, style: AppText.caption.copyWith(color: AppColors.textMuted)),
      ],
    );
  }
}
