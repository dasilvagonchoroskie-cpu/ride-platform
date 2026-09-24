import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/central_theme.dart';
import '../state/central_state.dart';
import '../widgets/ui.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController(text: 'admin@fortalezamov.com');
  final _password = TextEditingController(text: 'admin123');
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _enter() async {
    if (_email.text.trim().isEmpty || _password.text.isEmpty) {
      setState(() => _error = 'Informe e-mail e senha.');
      return;
    }

    setState(() => _error = null);
    await context.read<CentralState>().login(_email.text.trim(), _password.text);
  }

  @override
  Widget build(BuildContext context) {
    final central = context.watch<CentralState>();
    final tablet = MediaQuery.of(context).size.width >= 900;

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(Spacing.xl),
            child: ConstrainedBox(
              constraints: BoxConstraints(maxWidth: tablet ? 460 : double.infinity),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: Spacing.xl),
                  Container(
                    height: 64,
                    width: 64,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: AppColors.primarySoft,
                      border: Border.all(color: AppColors.primary),
                      borderRadius: BorderRadius.circular(Radii.lg),
                    ),
                    child: const Icon(Icons.monitor, color: AppColors.primary, size: 32),
                  ),
                  const SizedBox(height: Spacing.lg),
                  Text('Fortaleza Mov', style: AppText.title),
                  const SizedBox(height: Spacing.xs),
                  Text(
                    'Central administradora',
                    style: AppText.body.copyWith(color: AppColors.textMuted),
                  ),
                  const SizedBox(height: Spacing.xl),
                  AppField(
                    label: 'E-mail',
                    hint: 'admin@fortalezamov.com',
                    controller: _email,
                    keyboardType: TextInputType.emailAddress,
                    prefixIcon: Icons.alternate_email,
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: Spacing.md),
                  AppField(
                    label: 'Senha',
                    hint: '••••••••',
                    controller: _password,
                    prefixIcon: Icons.lock_outline,
                    onChanged: (_) => setState(() {}),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: Spacing.sm),
                    Text(_error!, style: AppText.caption.copyWith(color: AppColors.danger)),
                  ],
                  const SizedBox(height: Spacing.lg),
                  AppButton(
                    label: 'Entrar na Central',
                    loading: central.loading,
                    onPressed: _enter,
                  ),
                  const SizedBox(height: Spacing.md),
                  Text(
                    'Modo demonstracao: qualquer e-mail e senha concedem acesso aos dados simulados.',
                    textAlign: TextAlign.center,
                    style: AppText.caption.copyWith(color: AppColors.textFaint),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
