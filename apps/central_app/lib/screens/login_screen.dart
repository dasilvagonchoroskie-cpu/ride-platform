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
                  const Center(child: BrandLogo(size: 92)),
                  const SizedBox(height: Spacing.lg),
                  Text(
                    'Fortaleza',
                    textAlign: TextAlign.center,
                    style: AppText.display.copyWith(fontSize: 40, letterSpacing: -1.2),
                  ),
                  Text(
                    'MOV  -  CENTRAL',
                    textAlign: TextAlign.center,
                    style: AppText.label.copyWith(color: AppColors.brand, fontSize: 13, letterSpacing: 3, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: Spacing.xs),
                  Text(
                    'Painel de operação da plataforma',
                    textAlign: TextAlign.center,
                    style: AppText.body.copyWith(color: AppColors.textMuted),
                  ),
                  const SizedBox(height: Spacing.xl),
                  AppCard(
                    padding: const EdgeInsets.all(Spacing.lg),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
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
                              decoration: const InputDecoration(
                                counterText: '',
                                hintText: '000000',
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
                          if (central.codigoPorEmail)
                            TextButton(
                              onPressed: () => showDialog<void>(
                                context: context,
                                builder: (_) => _EsqueciSenha(central: central, email: _email.text.trim()),
                              ),
                              child: const Text('Esqueci a senha'),
                            ),
                        ],
                        if (erro != null) ...[
                          const SizedBox(height: Spacing.sm),
                          Text(erro, style: AppText.caption.copyWith(color: AppColors.danger)),
                        ],
                      ],
                    ),
                  ),
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

/// Esqueci a senha da Central (Evandro, 09/10/2026: "tem que ter como
/// recuperar a senha"): codigo de 6 numeros no e-mail e a senha nova.
class _EsqueciSenha extends StatefulWidget {
  const _EsqueciSenha({required this.central, required this.email});

  final CentralState central;
  final String email;

  @override
  State<_EsqueciSenha> createState() => _EsqueciSenhaState();
}

class _EsqueciSenhaState extends State<_EsqueciSenha> {
  late final TextEditingController _email = TextEditingController(text: widget.email);
  final TextEditingController _codigo = TextEditingController();
  final TextEditingController _senha = TextEditingController();
  bool _enviado = false;
  bool _ocupado = false;
  bool _oculta = true;
  String? _erro;

  @override
  void dispose() {
    _email.dispose();
    _codigo.dispose();
    _senha.dispose();
    super.dispose();
  }

  Future<void> _pedir() async {
    final email = _email.text.trim();
    if (!email.contains('@') || !email.contains('.')) {
      setState(() => _erro = 'Informe o e-mail da Central.');
      return;
    }
    setState(() {
      _ocupado = true;
      _erro = null;
    });
    final erro = await widget.central.pedirCodigoSenhaNova(email);
    if (!mounted) return;
    setState(() {
      _ocupado = false;
      _erro = erro;
      _enviado = erro == null;
    });
  }

  String? _problema() {
    if (_codigo.text.trim().length != 6) return 'O código tem 6 números.';
    final s = _senha.text;
    if (s.length < 8) return 'A senha nova precisa ter pelo menos 8 caracteres.';
    if (!RegExp(r'[A-Za-z]').hasMatch(s) || !RegExp(r'\d').hasMatch(s)) return 'Use letras e números na senha nova.';
    return null;
  }

  Future<void> _salvar() async {
    final problema = _problema();
    if (problema != null) {
      setState(() => _erro = problema);
      return;
    }
    setState(() {
      _ocupado = true;
      _erro = null;
    });
    final erro = await widget.central.redefinirSenha(_email.text.trim(), _codigo.text.trim(), _senha.text);
    if (!mounted) return;
    if (erro == null) {
      Navigator.of(context).pop();
      return;
    }
    setState(() {
      _ocupado = false;
      _erro = erro;
    });
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Esqueci a senha'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              _enviado
                  ? 'Enviamos um código de 6 números para ${_email.text.trim()}. Digite o código e a senha nova.'
                  : 'Vamos mandar um código de 6 números para o e-mail da Central.',
              style: AppText.caption.copyWith(color: AppColors.textMuted),
            ),
            const SizedBox(height: Spacing.md),
            TextField(
              controller: _email,
              enabled: !_enviado,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(labelText: 'E-mail da Central'),
            ),
            if (_enviado) ...[
              const SizedBox(height: Spacing.sm),
              TextField(
                controller: _codigo,
                keyboardType: TextInputType.number,
                maxLength: 6,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                decoration: const InputDecoration(labelText: 'Código do e-mail', counterText: ''),
              ),
              const SizedBox(height: Spacing.sm),
              TextField(
                controller: _senha,
                obscureText: _oculta,
                decoration: InputDecoration(
                  labelText: 'Senha nova (letras e números)',
                  suffixIcon: IconButton(
                    tooltip: _oculta ? 'Mostrar senha' : 'Esconder senha',
                    icon: Icon(_oculta ? Icons.visibility : Icons.visibility_off),
                    onPressed: () => setState(() => _oculta = !_oculta),
                  ),
                ),
              ),
            ],
            if (_erro != null) ...[
              const SizedBox(height: Spacing.sm),
              Text(_erro!, style: AppText.caption.copyWith(color: AppColors.danger)),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: _ocupado ? null : () => Navigator.of(context).pop(), child: const Text('Cancelar')),
        if (_enviado) TextButton(onPressed: _ocupado ? null : _pedir, child: const Text('Outro código')),
        FilledButton(
          onPressed: _ocupado ? null : (_enviado ? _salvar : _pedir),
          child: Text(_enviado ? 'Salvar e entrar' : 'Receber código'),
        ),
      ],
    );
  }
}
