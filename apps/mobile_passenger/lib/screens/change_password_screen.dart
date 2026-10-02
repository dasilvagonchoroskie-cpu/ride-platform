import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api/api_client.dart';
import '../core/avisos.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/validadores.dart';
import '../state/auth_state.dart';
import '../widgets/form_ui.dart';
import 'reset_password_screen.dart';

/// Troca de senha com a senha atual. Quem esqueceu a atual usa o codigo
/// do telefone.
class ChangePasswordScreen extends StatefulWidget {
  const ChangePasswordScreen({super.key});

  @override
  State<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends State<ChangePasswordScreen> {
  final TextEditingController _atual = TextEditingController();
  final TextEditingController _nova = TextEditingController();
  final TextEditingController _confirma = TextEditingController();
  String? _erroAtual;
  String? _erroNova;
  String? _erroConfirma;
  bool _salvando = false;

  @override
  void dispose() {
    _atual.dispose();
    _nova.dispose();
    _confirma.dispose();
    super.dispose();
  }

  Future<void> _salvar() async {
    final problema = problemaSenha(_nova.text);
    setState(() {
      _erroAtual = _atual.text.isEmpty ? 'Digite a senha atual.' : null;
      _erroNova = problema;
      _erroConfirma = _nova.text == _confirma.text ? null : 'As senhas não são iguais.';
    });
    if (_erroAtual != null || _erroNova != null || _erroConfirma != null) return;

    setState(() => _salvando = true);
    try {
      await context.read<AuthState>().trocarSenha(_atual.text, _nova.text);
      if (!mounted) return;
      avisar('Senha alterada.');
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _erroAtual = e.code == 'INVALID_CREDENTIALS' ? 'Senha atual incorreta.' : e.message);
      }
    } finally {
      if (mounted) setState(() => _salvando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final usuario = context.watch<AuthState>().user;

    return TelaFormulario(
      titulo: 'Alterar senha',
      child: ListView(
        padding: const EdgeInsets.fromLTRB(Spacing.xl, Spacing.xl, Spacing.xl, Spacing.xxl),
        children: [
          CampoForm(
            rotulo: 'Senha atual',
            dica: 'Digite a senha atual',
            controller: _atual,
            senha: true,
            erro: _erroAtual,
            aoMudar: (_) => setState(() => _erroAtual = null),
          ),
          const SizedBox(height: Spacing.xl),
          CampoForm(
            rotulo: 'Senha nova',
            dica: 'Digite a senha nova',
            ajuda: 'Mínimo de 8 caracteres, com letras e números.',
            controller: _nova,
            senha: true,
            erro: _erroNova,
            aoMudar: (_) => setState(() => _erroNova = null),
          ),
          const SizedBox(height: Spacing.xl),
          CampoForm(
            rotulo: 'Confirme a senha nova',
            dica: 'Repita a senha nova',
            controller: _confirma,
            senha: true,
            erro: _erroConfirma,
            aoMudar: (_) => setState(() => _erroConfirma = null),
          ),
          const SizedBox(height: Spacing.xl),
          BotaoPrincipal(texto: 'Salvar senha', carregando: _salvando, aoTocar: _salvar),
          const SizedBox(height: Spacing.md),
          Center(
            child: TextButton(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(builder: (_) => ResetPasswordScreen(telefone: usuario?.phone, email: usuario?.email)),
              ),
              child: Text(
                'Esqueci a senha atual',
                style: AppText.bodyStrong.copyWith(fontSize: 17, color: AppColors.brand),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
