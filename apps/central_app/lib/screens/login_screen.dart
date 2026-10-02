import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../core/config/app_config.dart';
import '../core/theme/central_theme.dart';
import '../state/central_state.dart';
import '../widgets/ui.dart';

/// Entrada da Central: como nos aplicativos do motorista e do passageiro,
/// por um codigo de 6 numeros — aqui ele chega no e-mail da Central.
/// A senha continua como segunda forma (e e a unica enquanto o envio de
/// e-mail nao estiver ligado no servidor).
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final TextEditingController _email = TextEditingController();
  final TextEditingController _senha = TextEditingController();
  final TextEditingController _codigo = TextEditingController();
  String? _error;
  bool _comSenha = false;
  bool _codigoEnviado = false;
  bool _enviando = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => context.read<CentralState>().conferirFormasDeEntrar());
  }

  @override
  void dispose() {
    _email.dispose();
    _senha.dispose();
    _codigo.dispose();
    super.dispose();
  }

  bool get _emailOk => RegExp(r'^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$').hasMatch(_email.text.trim());

  Future<void> _pedirCodigo() async {
    if (!_emailOk) {
      setState(() => _error = 'Digite o e-mail da Central.');
      return;
    }
    setState(() {
      _error = null;
      _enviando = true;
    });
    final erro = await context.read<CentralState>().pedirCodigo(_email.text);
    if (!mounted) return;
    setState(() {
      _enviando = false;
      _error = erro;
      _codigoEnviado = erro == null;
    });
  }

  Future<void> _entrarComCodigo() async {
    if (_codigo.text.length != 6) {
      setState(() => _error = 'O código tem 6 números.');
      return;
    }
    setState(() => _error = null);
    await context.read<CentralState>().entrarComCodigo(_email.text, _codigo.text);
  }

  Future<void> _entrarComSenha() async {
    if (!_emailOk || _senha.text.isEmpty) {
      setState(() => _error = 'Informe e-mail e senha.');
      return;
    }
    setState(() => _error = null);
    await context.read<CentralState>().login(_email.text.trim(), _senha.text);
  }

  @override
  Widget build(BuildContext context) {
    final central = context.watch<CentralState>();
    final tablet = MediaQuery.of(context).size.width >= 900;
    // Sem envio de e-mail ligado, so a senha funciona para a Central.
    final porCodigo = central.codigoPorEmail && !_comSenha;
    final erro = _error ?? central.error;

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
                  Text('Central administradora', style: AppText.body.copyWith(color: AppColors.textMuted)),
                  const SizedBox(height: Spacing.xl),
                  AppField(
                    label: 'E-mail da Central',
                    hint: 'seuemail@gmail.com',
                    controller: _email,
                    keyboardType: TextInputType.emailAddress,
                    prefixIcon: Icons.alternate_email,
                    enabled: !_codigoEnviado || !porCodigo,
                    onChanged: (_) => setState(() => _error = null),
                  ),
                  const SizedBox(height: Spacing.md),
                  if (porCodigo) ...[
                    if (_codigoEnviado) ...[
                      Text(
                        'Enviamos um código de 6 números para ${_email.text.trim()}.',
                        style: AppText.body.copyWith(color: AppColors.textMuted),
                      ),
                      const SizedBox(height: Spacing.md),
                      TextField(
                        controller: _codigo,
                        keyboardType: TextInputType.number,
                        maxLength: 6,
                        inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                        style: AppText.title.copyWith(letterSpacing: 8),
                        textAlign: TextAlign.center,
                        decoration: InputDecoration(
                          counterText: '',
                          hintText: '000000',
                          filled: true,
                          fillColor: AppColors.surfaceElevated,
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(Radii.sm)),
                        ),
                        onChanged: (v) {
                          setState(() => _error = null);
                          if (v.length == 6) _entrarComCodigo();
                        },
                      ),
                      const SizedBox(height: Spacing.lg),
                      AppButton(label: 'Entrar na Central', loading: central.loading, onPressed: _entrarComCodigo),
                      TextButton(
                        onPressed: _enviando ? null : _pedirCodigo,
                        child: const Text('Mandar outro código'),
                      ),
                    ] else
                      AppButton(label: 'Receber código no e-mail', loading: _enviando, onPressed: _pedirCodigo),
                  ] else ...[
                    AppField(
                      label: 'Senha',
                      hint: 'Sua senha',
                      controller: _senha,
                      obscure: true,
                      prefixIcon: Icons.lock_outline,
                      onChanged: (_) => setState(() => _error = null),
                    ),
                    const SizedBox(height: Spacing.lg),
                    AppButton(label: 'Entrar na Central', loading: central.loading, onPressed: _entrarComSenha),
                  ],
                  if (erro != null) ...[
                    const SizedBox(height: Spacing.sm),
                    Text(erro, style: AppText.caption.copyWith(color: AppColors.danger)),
                  ],
                  const SizedBox(height: Spacing.md),
                  if (central.codigoPorEmail)
                    TextButton(
                      onPressed: () => setState(() {
                        _comSenha = !_comSenha;
                        _error = null;
                      }),
                      child: Text(_comSenha ? 'Entrar com código no e-mail' : 'Entrar com senha'),
                    ),
                  if (!AppConfig.hasApi)
                    Text(
                      'Sem servidor configurado: modo demonstração, com dados simulados.',
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
