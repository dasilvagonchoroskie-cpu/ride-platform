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
          const SizedBox(height: Spacing.xl),
          // Etapa 5 (Evandro, 29/10/2026): "Meus Cartoes" so com "Em breve".
          // NENHUM numero de cartao e guardado no celular nem no servidor; o
          // cartao entra depois, pelo gateway de pagamento.
          Text('Meus cartões', style: AppText.heading),
          const SizedBox(height: Spacing.sm),
          Container(
            padding: const EdgeInsets.all(Spacing.lg),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(Radii.sm),
              border: Border.all(color: AppColors.border),
            ),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: const BoxDecoration(color: AppColors.surfaceElevated, shape: BoxShape.circle),
                  child: const Icon(Icons.credit_card_off_outlined, color: AppColors.textMuted),
                ),
                const SizedBox(width: Spacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Wrap: num celular estreito o selo desce para a linha de
                      // baixo (na Row ele estourava a largura, pego no teste).
                      Wrap(
                        spacing: Spacing.sm,
                        runSpacing: 4,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          Text('Pagar pelo app', style: AppText.bodyStrong.copyWith(fontSize: 16)),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(color: AppColors.brandSoft, borderRadius: BorderRadius.circular(Radii.pill)),
                            child: Text('EM BREVE', style: AppText.label.copyWith(fontSize: 10, color: AppColors.brand)),
                          ),
                        ],
                      ),
                      Text(
                        'Cartão de crédito e débito pelo aplicativo chega em breve. Por enquanto, o pagamento é direto ao motorista.',
                        style: AppText.body.copyWith(color: AppColors.textMuted),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
