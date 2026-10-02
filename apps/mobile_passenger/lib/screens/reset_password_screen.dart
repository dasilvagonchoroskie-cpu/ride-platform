import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../core/api/api_client.dart';
import '../core/avisos.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../core/utils/validadores.dart';
import '../state/auth_state.dart';
import '../widgets/form_ui.dart';
import 'otp_screen.dart';

/// Esqueci a senha: o codigo chega no telefone da conta e libera criar
/// uma senha nova. Depois disso a pessoa ja fica conectada.
class ResetPasswordScreen extends StatefulWidget {
  const ResetPasswordScreen({super.key, this.telefone});

  /// Ja preenchido quando vem de Meus dados (formato +55...).
  final String? telefone;

  @override
  State<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends State<ResetPasswordScreen> {
  final TextEditingController _telefone = TextEditingController();
  final TextEditingController _codigo = TextEditingController();
  final TextEditingController _senha = TextEditingController();
  final TextEditingController _confirma = TextEditingController();

  String? _numero;
  String? _codigoTeste;
  String? _erroTelefone;
  String? _erroCodigo;
  String? _erroSenha;
  String? _erroConfirma;
  bool _carregando = false;

  @override
  void initState() {
    super.initState();
    if (widget.telefone != null) _telefone.text = telefoneLegivel(widget.telefone!);
  }

  @override
  void dispose() {
    _telefone.dispose();
    _codigo.dispose();
    _senha.dispose();
    _confirma.dispose();
    super.dispose();
  }

  Future<void> _pedirCodigo() async {
    final d = onlyDigits(_telefone.text);
    if (d.length < 10 || d.length > 11) {
      setState(() => _erroTelefone = 'Informe o telefone com DDD.');
      return;
    }
    setState(() {
      _erroTelefone = null;
      _carregando = true;
    });
    final numero = '+55$d';
    try {
      final codigo = await context.read<AuthState>().pedirCodigoSenha(numero);
      if (!mounted) return;
      setState(() {
        _numero = numero;
        _codigoTeste = codigo;
        _codigo.text = codigo ?? '';
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _erroTelefone = e.message);
    } finally {
      if (mounted) setState(() => _carregando = false);
    }
  }

  Future<void> _salvar() async {
    final codigoOk = _codigo.text.length == 6;
    final problema = problemaSenha(_senha.text);
    final iguais = _senha.text == _confirma.text;
    setState(() {
      _erroCodigo = codigoOk ? null : 'O código tem 6 números.';
      _erroSenha = problema;
      _erroConfirma = iguais ? null : 'As senhas não são iguais.';
    });
    if (!codigoOk || problema != null || !iguais) return;

    setState(() => _carregando = true);
    try {
      await context.read<AuthState>().redefinirSenha(_numero!, _codigo.text, _senha.text);
      if (!mounted) return;
      Navigator.of(context).popUntil((r) => r.isFirst);
      avisar('Senha nova criada. Você já está conectado.');
    } on ApiException catch (e) {
      if (mounted) setState(() => _erroCodigo = e.message);
    } finally {
      if (mounted) setState(() => _carregando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final temCodigo = _numero != null;

    return TelaFormulario(
      titulo: 'Criar senha nova',
      child: ListView(
        padding: const EdgeInsets.fromLTRB(Spacing.xl, Spacing.xl, Spacing.xl, Spacing.xl),
        children: [
          Text(
            temCodigo
                ? 'Digite o código enviado para ${telefoneLegivel(_numero!)} e crie a senha nova.'
                : 'Informe o telefone da sua conta. Vamos enviar um código para criar uma senha nova.',
            style: AppText.body.copyWith(fontSize: 18, color: AppColors.textMuted),
          ),
          const SizedBox(height: Spacing.xl),
          if (!temCodigo) ...[
            CampoForm(
              rotulo: 'Telefone',
              dica: '(64) 99999-9999',
              controller: _telefone,
              teclado: TextInputType.phone,
              formatadores: [mascaraTelefone],
              erro: _erroTelefone,
              aoMudar: (_) => setState(() => _erroTelefone = null),
            ),
            const SizedBox(height: Spacing.xl),
            BotaoPrincipal(texto: 'Enviar código', carregando: _carregando, aoTocar: _pedirCodigo),
          ] else ...[
            if (_codigoTeste != null) ...[
              AvisoCodigoTeste(codigo: _codigoTeste!),
              const SizedBox(height: Spacing.lg),
            ],
            CampoForm(
              rotulo: 'Código',
              dica: '000000',
              controller: _codigo,
              teclado: TextInputType.number,
              tamanhoMaximo: 6,
              formatadores: [FilteringTextInputFormatter.digitsOnly],
              erro: _erroCodigo,
              aoMudar: (_) => setState(() => _erroCodigo = null),
            ),
            const SizedBox(height: Spacing.xl),
            CampoForm(
              rotulo: 'Senha nova',
              dica: 'Digite a senha nova',
              controller: _senha,
              senha: true,
              ajuda: 'Mínimo de 8 caracteres, com letras e números.',
              erro: _erroSenha,
              aoMudar: (_) => setState(() => _erroSenha = null),
            ),
            const SizedBox(height: Spacing.xl),
            CampoForm(
              rotulo: 'Confirme a senha',
              dica: 'Repita a senha',
              controller: _confirma,
              senha: true,
              erro: _erroConfirma,
              aoMudar: (_) => setState(() => _erroConfirma = null),
            ),
            const SizedBox(height: Spacing.xl),
            BotaoPrincipal(texto: 'Salvar senha nova', carregando: _carregando, aoTocar: _salvar),
          ],
        ],
      ),
    );
  }
}
