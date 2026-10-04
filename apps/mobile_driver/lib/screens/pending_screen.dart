import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/app_theme.dart';
import '../data/models/driver_models.dart';
import '../state/driver_state.dart';
import '../widgets/ui.dart';
import 'perfil_screen.dart';

class PendingScreen extends StatelessWidget {
  const PendingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final driver = context.watch<DriverState>();
    final rejected = driver.profile?.approval == DriverApproval.rejected;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Cadastro em análise'),
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
                rejected ? 'Cadastro não aprovado' : 'Falta a conferência na Central',
                textAlign: TextAlign.center,
                style: AppText.title,
              ),
              const SizedBox(height: Spacing.sm),
              Text(
                rejected
                    ? 'Fale com a Central para saber o que precisa ser corrigido.'
                    : 'Envie as fotos dos documentos aqui. A Central confere e libera o seu cadastro; esta tela muda sozinha.',
                textAlign: TextAlign.center,
                style: AppText.body.copyWith(color: AppColors.textMuted),
              ),
              const SizedBox(height: Spacing.xl),
              // Cadastro -> envio dos documentos -> aprovacao da Central.
              const DocumentosDoMotorista(),
              const SizedBox(height: Spacing.lg),
              // A conferencia e PRESENCIAL (Lei 13.640/2018). Antes esta tela
              // mostrava documentos "APPROVED" que ninguem tinha conferido: o
              // envio era simulado no aparelho.
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('A CENTRAL TAMBÉM CONFERE PESSOALMENTE', style: AppText.label.copyWith(color: AppColors.textFaint)),
                    const SizedBox(height: Spacing.md),
                    for (final item in const [
                      'CNH com EAR (exerce atividade remunerada)',
                      'Documento do veículo (CRLV) em dia',
                      'Certidão negativa de antecedentes criminais',
                      'O veículo, para a vistoria',
                    ])
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: Spacing.xs),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Icon(Icons.check_box_outline_blank, size: 18, color: AppColors.textMuted),
                            const SizedBox(width: Spacing.md),
                            Expanded(child: Text(item, style: AppText.body)),
                          ],
                        ),
                      ),
                    const SizedBox(height: Spacing.sm),
                    Text(
                      'A Central confere tudo pessoalmente e libera o seu cadastro na hora.',
                      style: AppText.caption.copyWith(color: AppColors.textMuted),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: Spacing.lg),
              AppButton(
                label: 'Atualizar status',
                variant: AppButtonVariant.secondary,
                // Pergunta na hora ao servidor se a Central ja aprovou
                // (a tela tambem confere sozinha a cada 20 segundos).
                onPressed: () => context.read<DriverState>().sincronizarCadastro(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
