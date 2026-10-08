import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/config/app_config.dart';
import '../core/theme/app_theme.dart';
import '../state/driver_state.dart';
import '../widgets/ui.dart';
import 'phone_screen.dart';

class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  static const List<List<String>> _highlights = [
    ['Ganhe quando quiser', 'Fique disponível e receba chamadas na sua região.'],
    ['Valores transparentes', 'Veja o ganho de cada corrida antes de aceitar.'],
    ['Saque via Pix', 'Transfira seu saldo quando atingir o valor mínimo.'],
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
                  color: AppColors.brand,
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
                label: 'Entrar ou cadastrar',
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(builder: (_) => const PhoneScreen()),
                ),
              ),
              const SizedBox(height: Spacing.md),
              const Text(
                'Já tem cadastro, ou usa o app do passageiro? Entre com o mesmo telefone: '
                'a conta é a mesma e o que já foi aprovado pela Central continua valendo.',
                textAlign: TextAlign.center,
                style: TextStyle(fontFamily: AppText.family, color: AppColors.textMuted, fontSize: 13),
              ),
              // Modo demonstracao so existe no aplicativo sem servidor (testes):
              // no aplicativo de verdade ele confundia e nao fazia nada real.
              if (!AppConfig.hasApi) ...[
                const SizedBox(height: Spacing.md),
                AppButton(
                  label: 'Entrar em modo demonstração',
                  variant: AppButtonVariant.secondary,
                  onPressed: () => context.read<DriverState>().demoLogin(
                        'Motorista Demo',
                        '+5511988880000',
                      ),
                ),
              ],
              const SizedBox(height: Spacing.xxl),
            ],
          ),
        ),
      ),
    );
  }
}
