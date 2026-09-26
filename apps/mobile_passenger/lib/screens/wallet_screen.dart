import 'package:flutter/material.dart';

import '../core/theme/app_theme.dart';
import '../data/models/models.dart';

/// Formas de pagamento. Na Fortaleza Mov o passageiro paga DIRETO ao
/// motorista: nao ha cartao salvo, saldo nem cobranca pelo aplicativo.
class WalletScreen extends StatelessWidget {
  const WalletScreen({super.key});

  IconData _icone(String tipo) => switch (tipo) {
        'PIX' => Icons.qr_code_2,
        'CREDIT_CARD' || 'DEBIT_CARD' => Icons.credit_card,
        _ => Icons.payments_outlined,
      };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Pagamento')),
      body: ListView(
        padding: const EdgeInsets.all(Spacing.lg),
        children: [
          Container(
            padding: const EdgeInsets.all(Spacing.lg),
            decoration: BoxDecoration(
              color: AppColors.brandSoft,
              borderRadius: BorderRadius.circular(Radii.sm),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.info_outline, color: AppColors.brand),
                const SizedBox(width: Spacing.md),
                Expanded(
                  child: Text(
                    'Você paga direto ao motorista, no fim da corrida. O valor '
                    'aparece antes de você confirmar — sem surpresa.',
                    style: AppText.body.copyWith(fontSize: 16),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: Spacing.lg),
          Text('Formas aceitas', style: AppText.heading),
          const SizedBox(height: Spacing.sm),
          for (final f in kFormasDePagamento)
            Container(
              margin: const EdgeInsets.only(bottom: Spacing.sm),
              padding: const EdgeInsets.all(Spacing.lg),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(Radii.sm),
              ),
              child: Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: const BoxDecoration(color: AppColors.surfaceElevated, shape: BoxShape.circle),
                    child: Icon(_icone(f.type), color: AppColors.text),
                  ),
                  const SizedBox(width: Spacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(f.label, style: AppText.bodyStrong.copyWith(fontSize: 16)),
                        Text(f.detail, style: AppText.body.copyWith(color: AppColors.textMuted)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: Spacing.md),
          Text(
            'A forma escolhida vai junto com o chamado, para o motorista saber '
            'antes de aceitar como você vai pagar.',
            style: AppText.body.copyWith(color: AppColors.textMuted),
          ),
        ],
      ),
    );
  }
}
