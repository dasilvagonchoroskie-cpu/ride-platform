import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/marca.dart';
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
    // Nome, cor e logo da Central (etapa 6) chegam com a configuracao.
    context.watch<ConfigState>();

    return Scaffold(
      backgroundColor: AppColors.background,
      body: DecoratedBox(
        // Marinho com brilho dourado atras do logo (visual premium, 11/11/2026).
        decoration: const BoxDecoration(gradient: AppColors.degradeMarinho),
        child: Stack(
          children: [
            const Positioned(
              top: -120,
              left: -80,
              right: -80,
              child: IgnorePointer(
                child: SizedBox(
                  height: 520,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: RadialGradient(
                        colors: [Color(0x40E9B53D), Color(0x00E9B53D)],
                        stops: [0, 1],
                      ),
                    ),
                  ),
                ),
              ),
            ),
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(Spacing.xl, Spacing.xl, Spacing.xl, Spacing.lg),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Spacer(flex: 2),
                    Center(
                      child: Container(
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          boxShadow: [BoxShadow(color: Color(0x66E9B53D), blurRadius: 48, spreadRadius: 2)],
                        ),
                        child: const BrandLogo(size: 128),
                      ),
                    ),
                    const SizedBox(height: Spacing.xl),
                    Text(
                      Marca.nome,
                      textAlign: TextAlign.center,
                      style: AppText.display.copyWith(fontSize: 38, color: AppColors.text, letterSpacing: -1),
                    ),
                    const SizedBox(height: Spacing.sm),
                    Text(
                      'Sua corrida na cidade, com o valor\nantes de confirmar.',
                      textAlign: TextAlign.center,
                      style: AppText.body.copyWith(fontSize: 17, color: AppColors.textMuted, height: 1.45),
                    ),
                    const SizedBox(height: Spacing.xl),
                    const Wrap(
                      alignment: WrapAlignment.center,
                      spacing: Spacing.sm,
                      runSpacing: Spacing.sm,
                      children: [
                        _Selo(icone: Icons.sell_outlined, texto: 'Preço antes'),
                        _Selo(icone: Icons.verified_user_outlined, texto: 'Motoristas verificados'),
                        _Selo(icone: Icons.sos_outlined, texto: 'SOS 24h'),
                      ],
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
                        texto: 'Modo demonstração',
                        aoTocar: () => context.read<AuthState>().demoLogin('Passageiro Demo', '+5511999990001'),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Selo pequeno de vantagem na entrada.
class _Selo extends StatelessWidget {
  const _Selo({required this.icone, required this.texto});

  final IconData icone;
  final String texto;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: Spacing.md, vertical: 7),
      decoration: BoxDecoration(
        color: const Color(0x14FFFFFF),
        borderRadius: BorderRadius.circular(Radii.pill),
        border: Border.all(color: AppColors.hairline),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icone, size: 15, color: AppColors.gold),
          const SizedBox(width: 6),
          Text(texto, style: AppText.caption.copyWith(color: AppColors.text, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
