import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/central_theme.dart';
import '../state/central_state.dart';
import '../widgets/ui.dart';

/// Operador com senha provisoria (etapa 7, Evandro 29/10/2026): a senha que
/// o dono criou vale so para entrar. Antes de usar a Central, a pessoa troca
/// por uma senha dela (o servidor recusa o resto ate a troca).
class TrocarSenhaScreen extends StatefulWidget {
  const TrocarSenhaScreen({super.key});

  @override
  State<TrocarSenhaScreen> createState() => _TrocarSenhaScreenState();
}

class _TrocarSenhaScreenState extends State<TrocarSenhaScreen> {
  final TextEditingController _atual = TextEditingController();
  final TextEditingController _nova = TextEditingController();
  final TextEditingController _repetir = TextEditingController();
  String? _erro;
  bool _enviando = false;

  @override
  void dispose() {
    _atual.dispose();
    _nova.dispose();
    _repetir.dispose();
    super.dispose();
  }

  static bool senhaBoa(String s) => s.length >= 8 && RegExp(r'[A-Za-z]').hasMatch(s) && RegExp(r'\d').hasMatch(s);

  Future<void> _trocar() async {
    final nova = _nova.text;
    final problema = _atual.text.isEmpty
        ? 'Digite a senha que você recebeu.'
        : !senhaBoa(nova)
            ? 'A senha nova precisa de 8 ou mais letras e números, com pelo menos 1 letra e 1 número.'
            : nova == _atual.text
                ? 'A senha nova tem que ser diferente da que você recebeu.'
                : nova != _repetir.text
                    ? 'As duas senhas novas não são iguais.'
                    : null;
    if (problema != null) {
      setState(() => _erro = problema);
      return;
    }
    setState(() {
      _erro = null;
      _enviando = true;
    });
    final erro = await context.read<CentralState>().trocarSenhaProvisoria(_atual.text, nova);
    if (!mounted) return;
    setState(() {
      _enviando = false;
      _erro = erro;
    });
  }

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
              constraints: const BoxConstraints(maxWidth: 460),
              child: AppCard(
                padding: const EdgeInsets.all(Spacing.lg),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.lock_reset, color: AppColors.brand),
                        const SizedBox(width: Spacing.sm),
                        Expanded(child: Text('Troque a sua senha', style: AppText.heading)),
                      ],
                    ),
                    const SizedBox(height: Spacing.sm),
                    Text(
                      'Olá, ${central.admin?.name ?? ''}. A senha que você recebeu é provisória: '
                      'crie uma senha só sua para usar a Central.',
                      style: AppText.body.copyWith(color: AppColors.textMuted),
                    ),
                    const SizedBox(height: Spacing.md),
                    AppField(label: 'Senha que você recebeu', controller: _atual, obscure: true, prefixIcon: Icons.lock_outline),
                    const SizedBox(height: Spacing.sm),
                    AppField(
                      label: 'Senha nova',
                      helper: '8 ou mais, com letra e número',
                      controller: _nova,
                      obscure: true,
                      prefixIcon: Icons.lock,
                    ),
                    const SizedBox(height: Spacing.sm),
                    AppField(label: 'Repita a senha nova', controller: _repetir, obscure: true, prefixIcon: Icons.lock),
                    const SizedBox(height: Spacing.lg),
                    AppButton(label: 'Trocar a senha e entrar', loading: _enviando || central.loading, onPressed: _trocar),
                    TextButton(onPressed: () => central.logout(), child: const Text('Sair')),
                    if (_erro != null) ...[
                      const SizedBox(height: Spacing.sm),
                      Text(_erro!, style: AppText.caption.copyWith(color: AppColors.danger)),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
