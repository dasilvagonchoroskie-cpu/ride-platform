import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/central_theme.dart';
import '../state/central_state.dart';
import '../widgets/ui.dart';
import 'settings_screen.dart';

/// R5 (Requisicao de continuidade, 11/11/2026): a conta passou pelo
/// procedimento excepcional (Google Authenticator e codigos de recuperacao
/// perdidos). O autenticador antigo nao vale mais; antes de usar a Central,
/// liga de novo no celular novo. O servidor recusa o resto ate isso.
class RefazerDoisFatoresScreen extends StatelessWidget {
  const RefazerDoisFatoresScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final central = context.watch<CentralState>();
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(Spacing.xl),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 520),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  AppCard(
                    padding: const EdgeInsets.all(Spacing.lg),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          children: [
                            const Icon(Icons.verified_user_outlined, color: AppColors.brand),
                            const SizedBox(width: Spacing.sm),
                            Expanded(child: Text('Ligue a verificação de novo', style: AppText.heading)),
                          ],
                        ),
                        const SizedBox(height: Spacing.sm),
                        Text(
                          'Olá, ${central.admin?.name ?? ''}. A verificação em duas etapas desta conta foi '
                          'redefinida pelo procedimento excepcional. O Google Authenticator antigo e os códigos '
                          'de recuperação antigos não valem mais. Ligue no celular novo para voltar a usar a Central.',
                          style: AppText.body.copyWith(color: AppColors.textMuted),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: Spacing.md),
                  CartaoDoisFatores(aoLigar: central.doisFatoresRefeitos),
                  TextButton(onPressed: () => central.logout(), child: const Text('Sair')),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
