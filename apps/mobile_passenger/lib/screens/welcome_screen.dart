import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/app_theme.dart';
import '../state/app_state.dart';
import '../state/auth_state.dart';
import '../widgets/form_ui.dart';
import '../widgets/painel_ui.dart';
import '../state/config_state.dart';
import 'email_login_screen.dart';
import 'phone_screen.dart';

/// Primeira tela de quem ainda nao entrou: marca e o botao Entrar.
class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();

    return Scaffold(
      backgroundColor: AppColors.surface,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Spacing.xl, Spacing.xl, Spacing.xl, Spacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(flex: 2),
              const Center(child: BrandLogo(size: 132)),
              const SizedBox(height: Spacing.xl),
              Text(
                'Fortaleza Mov',
                textAlign: TextAlign.center,
                style: AppText.display.copyWith(fontSize: 36, color: AppColors.brand),
              ),
              const SizedBox(height: Spacing.sm),
              Text(
                'Sua corrida na cidade, com o valor\nantes de confirmar.',
                textAlign: TextAlign.center,
                style: AppText.body.copyWith(fontSize: 18, color: AppColors.textMuted, height: 1.4),
              ),
              const Spacer(flex: 3),
              BotaoPrincipal(
                texto: 'Entrar',
                // Sem SMS contratado, o telefone so funciona em teste: ai a
                // entrada e direto pelo e-mail.
                aoTocar: () {
                  final porTelefone = context.read<ConfigState>().loginTelefone;
                  Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => porTelefone ? const PhoneScreen() : const EmailLoginScreen(),
                    ),
                  );
                },
              ),
              if (app.isDemo) ...[
                const SizedBox(height: Spacing.md),
                BotaoContorno(
                  texto: 'Entrar em modo demonstração',
                  aoTocar: () => context.read<AuthState>().demoLogin('Passageiro Demo', '+5511999990001'),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
