import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/central_theme.dart';
import '../core/utils/formatters.dart';
import '../data/models/central_models.dart';
import '../state/central_state.dart';
import '../widgets/ui.dart';
import 'driver_review_screen.dart';

/// Fila de motoristas aguardando analise.
class DriversPendingScreen extends StatefulWidget {
  const DriversPendingScreen({super.key});

  @override
  State<DriversPendingScreen> createState() => _DriversPendingScreenState();
}

class _DriversPendingScreenState extends State<DriversPendingScreen> {
  String _filter = 'todos';

  @override
  Widget build(BuildContext context) {
    final central = context.watch<CentralState>();

    final list = switch (_filter) {
      'completos' => central.pending.where((d) => d.documentsComplete).toList(),
      'incompletos' => central.pending.where((d) => !d.documentsComplete).toList(),
      _ => central.pending,
    };

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(Spacing.lg, Spacing.lg, Spacing.lg, Spacing.sm),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  '${central.pendingCount} aguardando analise',
                  style: AppText.body.copyWith(color: AppColors.textMuted),
                ),
              ),
              for (final entry in const [
                ['todos', 'Todos'],
                ['completos', 'Prontos'],
                ['incompletos', 'Pendentes'],
              ])
                Padding(
                  padding: const EdgeInsets.only(left: Spacing.sm),
                  child: GestureDetector(
                    onTap: () => setState(() => _filter = entry[0]),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: Spacing.md,
                        vertical: Spacing.sm,
                      ),
                      decoration: BoxDecoration(
                        color: _filter == entry[0] ? AppColors.primarySoft : AppColors.surfaceElevated,
                        border: Border.all(
                          color: _filter == entry[0] ? AppColors.primary : AppColors.border,
                        ),
                        borderRadius: BorderRadius.circular(Radii.pill),
                      ),
                      child: Text(
                        entry[1],
                        style: AppText.label.copyWith(
                          color: _filter == entry[0] ? AppColors.primary : AppColors.textMuted,
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
        Expanded(
          child: list.isEmpty
              ? const EmptyState(
                  title: 'Nenhum motorista na fila',
                  description: 'Todos os cadastros pendentes ja foram analisados.',
                  icon: Icons.check_circle_outline,
                )
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(Spacing.lg, 0, Spacing.lg, Spacing.lg),
                  itemCount: list.length,
                  separatorBuilder: (_, __) => const SizedBox(height: Spacing.md),
                  itemBuilder: (context, index) {
                    final application = list[index];
                    return _ApplicationTile(
                      application: application,
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => DriverReviewScreen(application: application),
                        ),
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }
}

class _ApplicationTile extends StatelessWidget {
  const _ApplicationTile({required this.application, required this.onTap});

  final DriverApplication application;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final ready = application.documentsComplete;

    return GestureDetector(
      onTap: onTap,
      child: AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                AppAvatar(initials: application.initials, size: 46),
                const SizedBox(width: Spacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(application.name, style: AppText.bodyStrong.copyWith(fontSize: 16)),
                      const SizedBox(height: 2),
                      Text(
                        '${application.city} - ${application.vehicle.categoryName}',
                        style: AppText.caption.copyWith(color: AppColors.textMuted),
                      ),
                    ],
                  ),
                ),
                AppBadge(
                  text: ready ? 'PRONTO' : 'PENDENTE',
                  tone: ready ? AppBadgeTone.success : AppBadgeTone.warning,
                ),
              ],
            ),
            const AppDivider(),
            Row(
              children: [
                Expanded(
                  child: _Info(
                    label: 'Veiculo',
                    value: '${application.vehicle.description} - ${application.vehicle.plate}',
                  ),
                ),
                Expanded(
                  child: _Info(label: 'Enviado', value: formatDateTime(application.submittedAt)),
                ),
              ],
            ),
            const SizedBox(height: Spacing.sm),
            Row(
              children: [
                const Icon(Icons.description_outlined, size: 15, color: AppColors.textFaint),
                const SizedBox(width: Spacing.xs),
                Text(
                  '${application.documentsApproved}/${application.documents.length} documentos aprovados',
                  style: AppText.caption.copyWith(color: AppColors.textMuted),
                ),
                const Spacer(),
                const Icon(Icons.chevron_right, color: AppColors.textFaint),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Info extends StatelessWidget {
  const _Info({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label.toUpperCase(), style: AppText.label.copyWith(color: AppColors.textFaint, fontSize: 10)),
        const SizedBox(height: 2),
        Text(value, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.caption),
      ],
    );
  }
}
