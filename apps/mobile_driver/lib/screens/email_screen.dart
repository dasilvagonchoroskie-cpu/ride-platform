import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api/api_client.dart';
import '../core/theme/app_theme.dart';
import '../state/driver_state.dart';
import '../widgets/ui.dart';
import 'otp_screen.dart';

/// Entrada pelo e-mail: o codigo de 6 numeros chega no e-mail (gratis).
class EmailScreen extends StatefulWidget {
  const EmailScreen({super.key, this.aviso});

  /// Explicacao no topo (ex.: telefone sem conta: a conta nasce pelo e-mail).
  final String? aviso;

  @override
  State<EmailScreen> createState() => _EmailScreenState();
}

class _EmailScreenState extends State<EmailScreen> {
  final TextEditingController _email = TextEditingController();
  String? _error;
  bool _enviando = false;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  bool get _valido => RegExp(r'^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$').hasMatch(_email.text.trim());

  Future<void> _continuar() async {
    if (_enviando) return;
    if (!_valido) {
      setState(() => _error = 'Digite um e-mail válido.');
      return;
    }
    setState(() {
      _error = null;
      _enviando = true;
    });
    final email = _email.text.trim().toLowerCase();
    try {
      final codigo = await context.read<DriverState>().requestOtpEmail(email);
      if (!mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute<void>(builder: (_) => OtpScreen(phone: '', email: email, debugCode: codigo)),
      );
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Entrar com e-mail')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(Spacing.xl),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (widget.aviso != null) ...[
                Container(
                  padding: const EdgeInsets.all(Spacing.md),
                  decoration: BoxDecoration(
                    color: AppColors.primarySoft,
                    border: Border.all(color: AppColors.primaryDark),
                    borderRadius: BorderRadius.circular(Radii.sm),
                  ),
                  child: Text(widget.aviso!, style: AppText.body.copyWith(color: AppColors.primary)),
                ),
                const SizedBox(height: Spacing.lg),
              ],
              Text('Qual o seu e-mail?', style: AppText.title),
              const SizedBox(height: Spacing.sm),
              Text(
                'Você recebe um código de 6 números no e-mail. Se ainda não tem conta, ela é criada agora.',
                style: AppText.body.copyWith(color: AppColors.textMuted),
              ),
              const SizedBox(height: Spacing.xl),
              AppField(
                label: 'E-mail',
                hint: 'seuemail@gmail.com',
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                error: _error,
                onChanged: (_) => setState(() => _error = null),
              ),
              const SizedBox(height: Spacing.lg),
              AppButton(
                label: 'Receber código',
                enabled: _valido,
                loading: _enviando,
                onPressed: _continuar,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
