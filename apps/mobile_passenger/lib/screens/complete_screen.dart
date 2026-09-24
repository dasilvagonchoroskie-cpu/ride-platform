import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../core/utils/geo.dart';
import '../state/ride_state.dart';
import '../widgets/ui.dart';
import 'history_screen.dart';

class CompleteScreen extends StatefulWidget {
  const CompleteScreen({super.key});

  @override
  State<CompleteScreen> createState() => _CompleteScreenState();
}

class _CompleteScreenState extends State<CompleteScreen> {
  static const List<String> _tags = [
    'Motorista educado',
    'Carro limpo',
    'Direcao segura',
    'Chegou rapido',
    'Otimo trajeto',
  ];

  int _score = 5;
  final Set<String> _selectedTags = {};
  bool _saving = false;

  Future<void> _submit() async {
    setState(() => _saving = true);
    await context.read<RideState>().completeRide(_score);

    if (!mounted) return;
    setState(() => _saving = false);

    await Navigator.of(context).pushReplacement(
      MaterialPageRoute<void>(builder: (_) => const HistoryScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final ride = context.watch<RideState>().activeRide;
    if (ride == null) return const SizedBox.shrink();

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(Spacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: Spacing.lg),
              const Center(child: AppBadge(text: 'CORRIDA FINALIZADA', tone: AppBadgeTone.success)),
              const SizedBox(height: Spacing.md),
              const Text(
                'Voce chegou ao destino',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: AppColors.text,
                  fontSize: 24,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.4,
                ),
              ),
              const SizedBox(height: Spacing.xs),
              Center(
                child: Text(
                  formatDateTime(ride.finishedAt ?? ride.createdAt),
                  style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
                ),
              ),
              const SizedBox(height: Spacing.lg),
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'RECIBO',
                      style: TextStyle(
                        color: AppColors.textFaint,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.6,
                      ),
                    ),
                    const SizedBox(height: Spacing.md),
                    _ReceiptRow(label: 'Valor total', value: formatMoney(ride.fareCents)),
                    _ReceiptRow(
                      label: 'Distancia',
                      value: formatDistance(ride.distanceMeters.toDouble()),
                    ),
                    _ReceiptRow(label: 'Pagamento', value: ride.paymentMethod),
                    _ReceiptRow(label: 'Bandeira', value: ride.fareFlag.label),
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
                      ride.dropoff.address,
                      style: const TextStyle(color: AppColors.text, fontSize: 15),
                    ),
                  ],
                ),
              ),
              if (ride.driver != null) ...[
                const SizedBox(height: Spacing.md),
                AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
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
                        ],
                      ),
                      const AppDivider(),
                      const Text(
                        'COMO FOI A CORRIDA?',
                        style: TextStyle(
                          color: AppColors.textFaint,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 0.6,
                        ),
                      ),
                      const SizedBox(height: Spacing.sm),
                      Row(
                        children: [
                          for (var star = 1; star <= 5; star++)
                            GestureDetector(
                              onTap: () => setState(() => _score = star),
                              child: Padding(
                                padding: const EdgeInsets.only(right: Spacing.sm),
                                child: Text(
                                  '★',
                                  style: TextStyle(
                                    fontSize: 34,
                                    color: star <= _score ? AppColors.warning : AppColors.border,
                                  ),
                                ),
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: Spacing.md),
                      Wrap(
                        spacing: Spacing.sm,
                        runSpacing: Spacing.sm,
                        children: [
                          for (final tag in _tags)
                            GestureDetector(
                              onTap: () => setState(() {
                                if (!_selectedTags.remove(tag)) _selectedTags.add(tag);
                              }),
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: Spacing.md,
                                  vertical: Spacing.sm,
                                ),
                                decoration: BoxDecoration(
                                  color: _selectedTags.contains(tag)
                                      ? AppColors.primarySoft
                                      : AppColors.surfaceElevated,
                                  border: Border.all(
                                    color: _selectedTags.contains(tag)
                                        ? AppColors.primary
                                        : AppColors.border,
                                  ),
                                  borderRadius: BorderRadius.circular(Radii.pill),
                                ),
                                child: Text(
                                  tag,
                                  style: TextStyle(
                                    color: _selectedTags.contains(tag)
                                        ? AppColors.primary
                                        : AppColors.textMuted,
                                    fontSize: 13,
                                  ),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: Spacing.lg),
              AppButton(label: 'Enviar avaliacao', loading: _saving, onPressed: _submit),
            ],
          ),
        ),
      ),
    );
  }
}

class _ReceiptRow extends StatelessWidget {
  const _ReceiptRow({required this.label, required this.value});

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
