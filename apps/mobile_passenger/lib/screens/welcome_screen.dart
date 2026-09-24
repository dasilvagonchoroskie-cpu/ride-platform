import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/app_theme.dart';
import '../state/app_state.dart';
import '../state/auth_state.dart';
import '../widgets/ui.dart';
import 'phone_screen.dart';

class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  static const List<List<String>> _highlights = [
    ['Motorista em minutos', 'Pareamento automatico com o motorista mais proximo.'],
    ['Preco transparente', 'Veja o valor estimado antes de confirmar a corrida.'],
    ['Viagem acompanhada', 'Acompanhe a rota em tempo real do inicio ao fim.'],
  ];

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final auth = context.read<AuthState>();

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: Spacing.xl),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: Spacing.xxxl),
              const Text(
                'Ride',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: AppColors.primary,
                  fontSize: 46,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -1.2,
                ),
              ),
              const Text(
                'Seu transporte sob demanda',
                textAlign: TextAlign.center,
                style: TextStyle(color: AppColors.textMuted, fontSize: 15),
              ),
              const SizedBox(height: Spacing.xl),
              for (final item in _highlights)
                Padding(
                  padding: const EdgeInsets.only(bottom: Spacing.md),
                  child: AppCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          item[0],
                          style: const TextStyle(
                            color: AppColors.text,
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: Spacing.xs),
                        Text(
                          item[1],
                          style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
                        ),
                      ],
                    ),
                  ),
                ),
              const SizedBox(height: Spacing.lg),
              AppButton(
                label: 'Continuar com telefone',
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(builder: (_) => const PhoneScreen()),
                ),
              ),
              const SizedBox(height: Spacing.md),
              if (app.isDemo) ...[
                const Text(
                  'Modo demonstracao ativo: o fluxo completo roda no aparelho, sem servidor.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppColors.textFaint, fontSize: 13),
                ),
                const SizedBox(height: Spacing.md),
                AppButton(
                  label: 'Entrar em modo demonstracao',
                  variant: AppButtonVariant.secondary,
                  onPressed: () => auth.demoLogin('Passageiro Demo', '+5511999990000'),
                ),
              ] else
                const Text(
                  'Conectado ao servidor. O codigo de verificacao chega por SMS.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppColors.textFaint, fontSize: 13),
                ),
              const SizedBox(height: Spacing.xxl),
            ],
          ),
        ),
      ),
    );
  }
}
