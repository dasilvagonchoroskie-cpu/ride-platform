import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../core/utils/geo.dart';
import '../data/models/models.dart';
import '../state/app_state.dart';
import '../state/ride_state.dart';
import '../widgets/ui.dart';
import 'history_detail_screen.dart';

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final app = context.read<AppState>();
      final ride = context.read<RideState>();
      if (ride.history.isEmpty) ride.loadHistory(app.coords);
    });
  }

  @override
  Widget build(BuildContext context) {
    final ride = context.watch<RideState>();
    final history = ride.history;
    final completed = history.where((r) => r.status == RideStatus.completed).toList();
    final totalSpent = completed.fold<int>(0, (sum, r) => sum + r.fareCents);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Suas corridas'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: Spacing.lg),
            child: Center(
              child: AppBadge(text: '${completed.length} CORRIDAS', tone: AppBadgeTone.info),
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
              AppCard(
                child: Row(
                  children: [
                    MetricTile(value: '${completed.length}', label: 'Concluidas'),
                    MetricTile(value: formatMoney(totalSpent), label: 'Total gasto'),
                    MetricTile(
                      value: completed.isEmpty
                          ? '-'
                          : formatMoney((totalSpent / completed.length).round()),
                      label: 'Media',
                    ),
                  ],
                ),
              ),
              const SizedBox(height: Spacing.lg),
              if (history.isEmpty)
                const EmptyState(
                  title: 'Nenhuma corrida ainda',
                  description: 'Suas corridas aparecem aqui depois da primeira viagem.',
                )
              else
                for (final item in history)
                  Padding(
                    padding: const EdgeInsets.only(bottom: Spacing.md),
                    child: GestureDetector(
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => HistoryDetailScreen(ride: item),
                        ),
                      ),
                      child: AppCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  item.code,
                                  style: const TextStyle(
                                    color: AppColors.primary,
                                    fontSize: 15,
                                    fontWeight: FontWeight.w600,
                                    letterSpacing: 1,
                                  ),
                                ),
                                AppBadge(
                                  text: item.status == RideStatus.completed ? 'CONCLUIDA' : 'CANCELADA',
                                  tone: item.status == RideStatus.completed
                                      ? AppBadgeTone.success
                                      : AppBadgeTone.danger,
                                ),
                              ],
                            ),
                            const SizedBox(height: Spacing.xs),
                            Text(
                              formatDateTime(item.finishedAt ?? item.createdAt),
                              style: const TextStyle(color: AppColors.textFaint, fontSize: 13),
                            ),
                            const SizedBox(height: Spacing.sm),
                            Text(
                              item.dropoff.address,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(color: AppColors.text, fontSize: 15),
                            ),
                            const SizedBox(height: Spacing.md),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  'Bandeira ${item.fareFlag.label} - ${formatDistance(item.distanceMeters.toDouble())}',
                                  style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
                                ),
                                Text(
                                  formatMoney(item.fareCents),
                                  style: const TextStyle(
                                    color: AppColors.text,
                                    fontSize: 15,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
            ],
          ),
        ),
      ),
    );
  }
}
