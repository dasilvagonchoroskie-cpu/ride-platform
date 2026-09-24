import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api/api_client.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../state/app_state.dart';
import '../state/auth_state.dart';
import '../widgets/ui.dart';
import 'otp_screen.dart';

class PhoneScreen extends StatefulWidget {
  const PhoneScreen({super.key});

  @override
  State<PhoneScreen> createState() => _PhoneScreenState();
}

class _PhoneScreenState extends State<PhoneScreen> {
  final TextEditingController _controller = TextEditingController();
  String? _error;
  bool _sending = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  bool get _isValid {
    final digits = onlyDigits(_controller.text);
    return digits.length >= 10 && digits.length <= 11;
  }

  Future<void> _continue() async {
    if (!_isValid) {
      setState(() => _error = 'Informe um telefone com DDD.');
      return;
    }

    setState(() {
      _error = null;
      _sending = true;
    });

    final app = context.read<AppState>();
    final auth = context.read<AuthState>();
    final normalized = '+55${onlyDigits(_controller.text)}';

    try {
      if (app.isDemo) {
        await auth.demoLogin('Passageiro Demo', normalized);
        return;
      }

      final debugCode = await auth.requestOtp(normalized);
      if (!mounted) return;

      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => OtpScreen(phone: normalized, debugCode: debugCode),
        ),
      );
    } on ApiException {
      if (mounted) {
        setState(() => _error = 'Nao foi possivel enviar o codigo. Verifique o numero.');
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(Spacing.xl),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: Spacing.xxl),
              const Text(
                'Qual o seu telefone?',
                style: TextStyle(
                  color: AppColors.text,
                  fontSize: 24,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.4,
                ),
              ),
              const SizedBox(height: Spacing.sm),
              const Text(
                'Enviaremos um codigo de verificacao. Seus dados ficam protegidos.',
                style: TextStyle(color: AppColors.textMuted, fontSize: 15),
              ),
              const SizedBox(height: Spacing.xl),
              AppField(
                label: 'Telefone',
                hint: '(11) 91234-5678',
                controller: _controller,
                keyboardType: TextInputType.phone,
                error: _error,
                onChanged: (value) {
                  _controller.value = TextEditingValue(
                    text: formatPhoneInput(value),
                    selection: TextSelection.collapsed(offset: formatPhoneInput(value).length),
                  );
                  setState(() {});
                },
              ),
              const SizedBox(height: Spacing.lg),
              AppButton(
                label: 'Continuar',
                loading: _sending,
                enabled: _isValid,
                onPressed: _continue,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
