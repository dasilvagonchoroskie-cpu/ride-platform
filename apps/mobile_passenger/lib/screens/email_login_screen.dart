import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api/api_client.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/validadores.dart';
import '../state/auth_state.dart';
import '../widgets/form_ui.dart';
import 'reset_password_screen.dart';

/// Entrar com o e-mail e a senha criados no cadastro.
class EmailLoginScreen extends StatefulWidget {
  const EmailLoginScreen({super.key});

  @override
  State<EmailLoginScreen> createState() => _EmailLoginScreenState();
}

class _EmailLoginScreenState extends State<EmailLoginScreen> {
  final TextEditingController _email = TextEditingController();
  final TextEditingController _senha = TextEditingController();
  String? _erroEmail;
  String? _erroSenha;
  bool _carregando = false;

  @override
  void dispose() {
    _email.dispose();
    _senha.dispose();
    super.dispose();
  }

  Future<void> _entrar() async {
    if (_carregando) return;
    final emailOk = emailValido(_email.text);
    final senhaOk = _senha.text.isNotEmpty;
    setState(() {
      _erroEmail = emailOk ? null : 'Digite um e-mail válido.';
      _erroSenha = senhaOk ? null : 'Digite sua senha.';
    });
    if (!emailOk || !senhaOk) return;

    setState(() => _carregando = true);
    try {
      await context.read<AuthState>().entrarComEmail(_email.text, _senha.text);
      if (!mounted) return;
      Navigator.of(context).popUntil((r) => r.isFirst);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _erroSenha = e.code == 'INVALID_CREDENTIALS' ? 'E-mail ou senha incorretos.' : e.message);
      }
    } finally {
      if (mounted) setState(() => _carregando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return TelaFormulario(
      titulo: 'Entrar com e-mail',
      child: ListView(
        padding: const EdgeInsets.fromLTRB(Spacing.xl, Spacing.xl, Spacing.xl, Spacing.xl),
        children: [
          CampoForm(
            rotulo: 'E-mail',
            dica: 'Digite seu e-mail',
            controller: _email,
            teclado: TextInputType.emailAddress,
            acao: TextInputAction.next,
            preenchimento: const [AutofillHints.email],
            erro: _erroEmail,
            aoMudar: (_) => setState(() => _erroEmail = null),
          ),
          const SizedBox(height: Spacing.xl),
          CampoForm(
            rotulo: 'Senha',
            dica: 'Digite sua senha',
            controller: _senha,
            senha: true,
            acao: TextInputAction.done,
            preenchimento: const [AutofillHints.password],
            erro: _erroSenha,
            aoMudar: (_) => setState(() => _erroSenha = null),
            aoEnviar: (_) => _entrar(),
          ),
          const SizedBox(height: Spacing.xl),
          BotaoPrincipal(texto: 'Entrar', carregando: _carregando, aoTocar: _entrar),
          const SizedBox(height: Spacing.md),
          Center(
            child: TextButton(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(builder: (_) => const ResetPasswordScreen()),
              ),
              child: Text(
                'Esqueci minha senha',
                style: AppText.bodyStrong.copyWith(fontSize: 17, color: AppColors.brand),
              ),
            ),
          ),
          const SizedBox(height: Spacing.lg),
          Text(
            'Ainda não tem cadastro? Volte e entre com o seu telefone: o cadastro é feito logo depois.',
            textAlign: TextAlign.center,
            style: AppText.body.copyWith(color: AppColors.textMuted, fontSize: 15),
          ),
        ],
      ),
    );
  }
}
