import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api/api_client.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/validadores.dart';
import '../state/auth_state.dart';
import '../state/config_state.dart';
import '../widgets/form_ui.dart';
import 'otp_screen.dart';
import 'reset_password_screen.dart';

/// Entrar pelo e-mail: com o codigo que chega no e-mail (gratis) ou com a
/// senha criada no cadastro. Conta nova tambem nasce por aqui.
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

  /// Com o envio por e-mail ligado, o codigo e o caminho principal.
  bool? _comSenha;

  @override
  void dispose() {
    _email.dispose();
    _senha.dispose();
    super.dispose();
  }

  bool _emailOk() {
    final ok = emailValido(_email.text);
    setState(() => _erroEmail = ok ? null : 'Digite um e-mail válido.');
    return ok;
  }

  Future<void> _receberCodigo() async {
    if (_carregando || !_emailOk()) return;
    setState(() => _carregando = true);
    final email = _email.text.trim().toLowerCase();
    try {
      final codigo = await context.read<AuthState>().requestOtp(email);
      if (!mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute<void>(builder: (_) => OtpScreen(phone: email, debugCode: codigo)),
      );
    } on ApiException catch (e) {
      if (mounted) setState(() => _erroEmail = e.message);
    } finally {
      if (mounted) setState(() => _carregando = false);
    }
  }

  Future<void> _entrarComSenha() async {
    if (_carregando || !_emailOk()) return;
    if (_senha.text.isEmpty) {
      setState(() => _erroSenha = 'Digite sua senha.');
      return;
    }
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
    final codigoLigado = context.watch<ConfigState>().loginEmail;
    final comSenha = _comSenha ?? !codigoLigado;

    return TelaFormulario(
      titulo: 'Entrar com e-mail',
      child: ListView(
        padding: const EdgeInsets.fromLTRB(Spacing.xl, Spacing.xl, Spacing.xl, Spacing.xl),
        children: [
          if (!comSenha) ...[
            Text(
              'Você recebe um código de 6 números no e-mail. Se ainda não tem conta, ela é criada agora.',
              style: AppText.body.copyWith(fontSize: 17, color: AppColors.textMuted, height: 1.4),
            ),
            const SizedBox(height: Spacing.xl),
          ],
          CampoForm(
            rotulo: 'E-mail',
            dica: 'Digite seu e-mail',
            controller: _email,
            teclado: TextInputType.emailAddress,
            acao: comSenha ? TextInputAction.next : TextInputAction.done,
            preenchimento: const [AutofillHints.email],
            erro: _erroEmail,
            aoMudar: (_) => setState(() => _erroEmail = null),
            aoEnviar: comSenha ? null : (_) => _receberCodigo(),
          ),
          if (comSenha) ...[
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
              aoEnviar: (_) => _entrarComSenha(),
            ),
          ],
          const SizedBox(height: Spacing.xl),
          if (comSenha)
            BotaoPrincipal(texto: 'Entrar', carregando: _carregando, aoTocar: _entrarComSenha)
          else
            BotaoPrincipal(texto: 'Receber código', carregando: _carregando, aoTocar: _receberCodigo),
          const SizedBox(height: Spacing.md),
          if (codigoLigado)
            Center(
              child: TextButton(
                onPressed: () => setState(() => _comSenha = !comSenha),
                child: Text(
                  comSenha ? 'Prefiro receber um código no e-mail' : 'Prefiro entrar com a minha senha',
                  style: AppText.bodyStrong.copyWith(fontSize: 17, color: AppColors.brand),
                ),
              ),
            ),
          if (comSenha)
            Center(
              child: TextButton(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => ResetPasswordScreen(email: emailValido(_email.text) ? _email.text.trim() : null),
                  ),
                ),
                child: Text(
                  'Esqueci minha senha',
                  style: AppText.bodyStrong.copyWith(fontSize: 17, color: AppColors.brand),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
