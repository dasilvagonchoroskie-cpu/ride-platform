import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/uber_theme.dart';
import '../core/utils/formatters.dart';
import '../state/driver_state.dart';
import '../widgets/ui.dart';

class StatementScreen extends StatelessWidget {
  const StatementScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final driver = context.watch<DriverState>();
    final entries = driver.statement;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Extrato')),
      body: SafeArea(
        child: entries.isEmpty
            ? const EmptyState(
                title: 'Sem lancamentos',
                description: 'Seus ganhos aparecem aqui depois da primeira corrida.',
              )
            : ListView.separated(
                padding: const EdgeInsets.all(Spacing.lg),
                itemCount: entries.length,
                separatorBuilder: (_, __) => const Divider(height: 1, color: AppColors.border),
                itemBuilder: (context, index) {
                  final entry = entries[index];
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: Spacing.md),
                    child: Row(
                      children: [
                        Icon(
                          entry.isCredit ? Icons.arrow_downward : Icons.arrow_upward,
                          size: 18,
                          color: entry.isCredit ? AppColors.primary : AppColors.textMuted,
                        ),
                        const SizedBox(width: Spacing.md),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(entry.description, style: AppText.bodyStrong),
                              Text(
                                '${entry.code} - ${formatDateTime(entry.createdAt)}',
                                style: AppText.caption.copyWith(color: AppColors.textFaint),
                              ),
                            ],
                          ),
                        ),
                        Text(
                          '${entry.isCredit ? '+' : '-'}${formatMoney(entry.amountCents.abs())}',
                          style: AppText.bodyStrong.copyWith(
                            color: entry.isCredit ? AppColors.primary : AppColors.textMuted,
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
      ),
    );
  }
}
