import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/app_theme.dart';
import '../state/driver_state.dart';
import '../widgets/ui.dart';
import 'phone_screen.dart';

class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  static const List<List<String>> _highlights = [
    ['Ganhe quando quiser', 'Fique online e receba chamadas na sua regiao.'],
    ['Valores transparentes', 'Veja o ganho de cada corrida antes de aceitar.'],
    ['Saque via Pix', 'Transfira seu saldo quando atingir o valor minimo.'],
  ];

  @override
  Widget build(BuildContext context) {
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
                'Fortaleza',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontFamily: AppText.family,
                  color: AppColors.text,
                  fontSize: 42,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -1.2,
                ),
              ),
              const Text(
                'MOV  -  MOTORISTA',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontFamily: AppText.family,
                  color: AppColors.primary,
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 3,
                ),
              ),
              const SizedBox(height: Spacing.xl),
              for (final item in _highlights)
                Padding(
                  padding: const EdgeInsets.only(bottom: Spacing.md),
                  child: AppCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(item[0], style: AppText.bodyStrong.copyWith(fontSize: 16)),
                        const SizedBox(height: Spacing.xs),
                        Text(item[1], style: AppText.caption.copyWith(color: AppColors.textMuted)),
                      ],
                    ),
                  ),
                ),
              const SizedBox(height: Spacing.lg),
              AppButton(
                label: 'Comecar cadastro',
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(builder: (_) => const PhoneScreen()),
                ),
              ),
              const SizedBox(height: Spacing.md),
              AppButton(
                label: 'Entrar em modo demonstracao',
                variant: AppButtonVariant.secondary,
                onPressed: () => context.read<DriverState>().demoLogin(
                      'Motorista Demo',
                      '+5511988880000',
                    ),
              ),
              const SizedBox(height: Spacing.md),
              const Text(
                'No modo demonstracao o fluxo completo do motorista roda no aparelho, sem servidor.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontFamily: AppText.family,
                  color: AppColors.textFaint,
                  fontSize: 13,
                ),
              ),
              const SizedBox(height: Spacing.xxl),
            ],
          ),
        ),
      ),
    );
  }
}
