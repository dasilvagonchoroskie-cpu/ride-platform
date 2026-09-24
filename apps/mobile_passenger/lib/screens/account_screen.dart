import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/config/app_config.dart';
import '../core/theme/app_theme.dart';
import '../state/app_state.dart';
import '../state/auth_state.dart';
import '../widgets/ui.dart';

class AccountScreen extends StatefulWidget {
  const AccountScreen({super.key});

  @override
  State<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends State<AccountScreen> {
  late final TextEditingController _name;
  late final TextEditingController _email;
  bool _saved = false;

  @override
  void initState() {
    super.initState();
    final user = context.read<AuthState>().user;
    _name = TextEditingController(text: user?.name ?? '');
    _email = TextEditingController(text: user?.email ?? '');
  }

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    await context.read<AuthState>().updateProfile(
          _name.text,
          _email.text.isEmpty ? null : _email.text,
        );
    if (!mounted) return;
    setState(() => _saved = true);
    await Future<void>.delayed(const Duration(seconds: 2));
    if (mounted) setState(() => _saved = false);
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final auth = context.watch<AuthState>();
    final user = auth.user;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Conta')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(Spacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AppCard(
                child: Row(
                  children: [
                    AppAvatar(
                      initials: (user?.firstName ?? 'P').substring(0, 1).toUpperCase(),
                      size: 60,
                    ),
                    const SizedBox(width: Spacing.lg),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            user?.name ?? 'Passageiro',
                            style: const TextStyle(
                              color: AppColors.text,
                              fontSize: 19,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          Text(
                            user?.phone ?? '-',
                            style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: Spacing.lg),
              const SectionTitle(text: 'Dados pessoais'),
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    AppField(label: 'Nome', controller: _name, onChanged: (_) => setState(() {})),
                    const SizedBox(height: Spacing.md),
                    AppField(
                      label: 'E-mail',
                      hint: 'voce@email.com',
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      onChanged: (_) => setState(() {}),
                    ),
                    AppButton(
                      label: _saved ? 'Salvo' : 'Salvar alteracoes',
                      variant: AppButtonVariant.secondary,
                      onPressed: _save,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: Spacing.lg),
              const SectionTitle(text: 'Enderecos recentes'),
              AppCard(
                child: app.recentPlaces.isEmpty
                    ? const Text(
                        'Nenhum endereco salvo ainda.',
                        style: TextStyle(color: AppColors.textMuted, fontSize: 13),
                      )
                    : Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          for (final place in app.recentPlaces)
                            Padding(
                              padding: const EdgeInsets.symmetric(vertical: Spacing.xs),
                              child: Text(
                                place,
                                style: const TextStyle(color: AppColors.text, fontSize: 15),
                              ),
                            ),
                        ],
                      ),
              ),
              const SizedBox(height: Spacing.lg),
              const SectionTitle(text: 'Diagnostico'),
              AppCard(
                child: Column(
                  children: [
                    _DiagRow(label: 'Versao do app', value: AppConfig.appVersion),
                    const AppDivider(),
                    _DiagRow(
                      label: 'Fonte de dados',
                      value: app.isDemo ? 'Demonstracao local' : 'API',
                    ),
                    const AppDivider(),
                    _DiagRow(
                      label: 'Permissao de localizacao',
                      value: app.locationGranted ? 'Concedida' : 'Negada (usando padrao)',
                    ),
                    const AppDivider(),
                    _DiagRow(label: 'Posicao atual', value: app.coords.toString()),
                    const AppDivider(),
                    _DiagRow(label: 'Stack', value: 'Flutter / Dart'),
                  ],
                ),
              ),
              const SizedBox(height: Spacing.lg),
              AppButton(
                label: 'Sair da conta',
                variant: AppButtonVariant.danger,
                onPressed: () async {
                  await context.read<AuthState>().logout();
                  if (context.mounted) Navigator.of(context).pop();
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DiagRow extends StatelessWidget {
  const _DiagRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Expanded(
          child: Text(label, style: const TextStyle(color: AppColors.textMuted, fontSize: 13)),
        ),
        Text(
          value,
          style: const TextStyle(color: AppColors.text, fontSize: 13),
        ),
      ],
    );
  }
}
