import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../data/models/models.dart';
import '../state/app_state.dart';
import '../state/ride_state.dart';
import '../widgets/map_canvas.dart';
import '../widgets/ui.dart';

class SearchingScreen extends StatefulWidget {
  const SearchingScreen({super.key});

  @override
  State<SearchingScreen> createState() => _SearchingScreenState();
}

class _SearchingScreenState extends State<SearchingScreen> with SingleTickerProviderStateMixin {
  late final AnimationController _pulse;
  final List<Timer> _timers = [];

  static const List<List<String>> _phases = [
    ['Procurando motoristas proximos', 'Ampliando o raio de busca...'],
    ['Motorista encontrado', 'Confirmando a corrida...'],
    ['Motorista a caminho', 'Ele esta indo ate voce.'],
  ];

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(vsync: this, duration: const Duration(milliseconds: 1800))..repeat();

    _timers.add(Timer(const Duration(milliseconds: 2600), () => _advance()));
    _timers.add(Timer(const Duration(milliseconds: 5200), () => _advance()));
  }

  void _advance() {
    if (!mounted) return;
    context.read<RideState>().advanceRide();
  }

  @override
  void dispose() {
    for (final timer in _timers) {
      timer.cancel();
    }
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final ride = context.watch<RideState>();
    final active = ride.activeRide;

    if (active == null) return const SizedBox.shrink();

    final phaseIndex = switch (active.status) {
      RideStatus.driverArriving => 2,
      RideStatus.driverAssigned => 1,
      _ => 0,
    };
    final phase = _phases[phaseIndex];

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(Spacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const AppBadge(text: 'CORRIDA ATIVA', tone: AppBadgeTone.success),
                  TextButton(
                    onPressed: () async {
                      await context.read<RideState>().cancelRide();
                    },
                    child: const Text('Cancelar', style: TextStyle(color: AppColors.danger)),
                  ),
                ],
              ),
              const SizedBox(height: Spacing.sm),
              Stack(
                alignment: Alignment.center,
                children: [
                  MapCanvas(
                    center: app.coords,
                    height: 260,
                    span: 0.06,
                    markers: [
                      MapMarker(id: 'pickup', coords: active.pickup.coords, kind: MarkerKind.pickup),
                      MapMarker(id: 'dropoff', coords: active.dropoff.coords, kind: MarkerKind.dropoff),
                      if (active.driver != null)
                        MapMarker(id: 'driver', coords: active.driver!.position, kind: MarkerKind.car),
                    ],
                    driverRoute: ride.driverRoute,
                    route: [active.pickup.coords, active.dropoff.coords],
                  ),
                  if (active.driver == null)
                    AnimatedBuilder(
                      animation: _pulse,
                      builder: (context, _) {
                        return Container(
                          height: 120 * _pulse.value + 60,
                          width: 120 * _pulse.value + 60,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: AppColors.primary.withOpacity(0.55 * (1 - _pulse.value)),
                          ),
                        );
                      },
                    ),
                ],
              ),
              const SizedBox(height: Spacing.lg),
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      phase[0],
                      style: const TextStyle(color: AppColors.text, fontSize: 19, fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: Spacing.xs),
                    Text(phase[1], style: const TextStyle(color: AppColors.textMuted, fontSize: 13)),
                    const SizedBox(height: Spacing.md),
                    Row(
                      children: [
                        for (var i = 0; i < _phases.length; i++)
                          Expanded(
                            child: Padding(
                              padding: const EdgeInsets.only(right: Spacing.sm),
                              child: Container(
                                height: 4,
                                decoration: BoxDecoration(
                                  color: i <= phaseIndex ? AppColors.primary : AppColors.border,
                                  borderRadius: BorderRadius.circular(2),
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                    const AppDivider(),
                    const Text(
                      'DESTINO',
                      style: TextStyle(
                        color: AppColors.textFaint,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.6,
                      ),
                    ),
                    const SizedBox(height: Spacing.xs),
                    Text(
                      active.dropoff.address,
                      maxLines: 2,
                      style: const TextStyle(color: AppColors.text, fontSize: 15),
                    ),
                    const SizedBox(height: Spacing.md),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Valor estimado', style: TextStyle(color: AppColors.textMuted, fontSize: 15)),
                        Text(
                          formatMoney(active.fareCents),
                          style: const TextStyle(color: AppColors.primary, fontSize: 17, fontWeight: FontWeight.w600),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              if (active.driver != null) ...[
                const SizedBox(height: Spacing.md),
                AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        active.driver!.name,
                        style: const TextStyle(color: AppColors.text, fontSize: 19, fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: Spacing.xs),
                      Text(
                        '${active.driver!.vehicle} - ${active.driver!.color} - ${active.driver!.plate}',
                        style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
                      ),
                      const AppDivider(),
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
                ),
              ],
              const SizedBox(height: Spacing.md),
              AppButton(
                label: 'Simular proxima etapa',
                variant: AppButtonVariant.secondary,
                onPressed: _advance,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
