import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/uber_theme.dart';
import '../data/models/driver_models.dart';
import '../state/driver_state.dart';
import '../widgets/ui.dart';

class PendingScreen extends StatelessWidget {
  const PendingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final driver = context.watch<DriverState>();
    final rejected = driver.profile?.approval == DriverApproval.rejected;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Cadastro em analise'),
        actions: [
          TextButton(
            onPressed: () => context.read<DriverState>().logout(),
            style: TextButton.styleFrom(foregroundColor: AppColors.textMuted),
            child: const Text('Sair'),
          ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(Spacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: Spacing.lg),
              Icon(
                rejected ? Icons.error_outline : Icons.hourglass_top,
                size: 56,
                color: rejected ? AppColors.danger : AppColors.primary,
              ),
              const SizedBox(height: Spacing.lg),
              Text(
                rejected ? 'Cadastro reprovado' : 'Estamos analisando seu cadastro',
                textAlign: TextAlign.center,
                style: AppText.title,
              ),
              const SizedBox(height: Spacing.sm),
              Text(
                rejected
                    ? 'Corrija os documentos apontados e reenvie para nova analise.'
                    : 'A analise leva em media 24 horas. Voce sera avisado quando for aprovado.',
                textAlign: TextAlign.center,
                style: AppText.body.copyWith(color: AppColors.textMuted),
              ),
              const SizedBox(height: Spacing.xl),
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('DOCUMENTOS', style: AppText.label.copyWith(color: AppColors.textFaint)),
                    const SizedBox(height: Spacing.md),
                    for (final document in driver.documents)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: Spacing.xs),
                        child: Row(
                          children: [
                            Icon(
                              document.isApproved
                                  ? Icons.check_circle
                                  : document.isRejected
                                      ? Icons.cancel
                                      : Icons.schedule,
                              size: 18,
                              color: document.isApproved
                                  ? AppColors.primary
                                  : document.isRejected
                                      ? AppColors.danger
                                      : AppColors.textMuted,
                            ),
                            const SizedBox(width: Spacing.md),
                            Expanded(child: Text(document.type.label, style: AppText.body)),
                            Text(
                              document.status.name.toUpperCase(),
                              style: AppText.label.copyWith(
                                fontSize: 9,
                                color: document.isApproved
                                    ? AppColors.primary
                                    : document.isRejected
                                        ? AppColors.danger
                                        : AppColors.textMuted,
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: Spacing.lg),
              AppButton(
                label: 'Atualizar status',
                variant: AppButtonVariant.secondary,
                onPressed: () {
                  // Simula a aprovacao do painel administrativo.
                  final state = context.read<DriverState>();
                  if (state.documentsComplete) {
                    state.completeOnboarding(
                      cpf: state.profile?.cpf ?? '',
                      cnhNumber: state.profile?.cnhNumber ?? '',
                      cnhCategory: state.profile?.cnhCategory ?? 'B',
                      cnhExpiresAt: state.profile?.cnhExpiresAt ?? '',
                    );
                  }
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}
