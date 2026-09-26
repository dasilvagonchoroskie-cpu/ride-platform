import 'package:flutter/material.dart';

import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../widgets/ui.dart';
import 'otp_screen.dart';
import 'package:provider/provider.dart';
import '../core/config/app_config.dart';
import '../core/api/api_client.dart';
import '../state/driver_state.dart';

class PhoneScreen extends StatefulWidget {
  const PhoneScreen({super.key});

  @override
  State<PhoneScreen> createState() => _PhoneScreenState();
}

class _PhoneScreenState extends State<PhoneScreen> {
  DateTime? _ultimoEnvio;
  final TextEditingController _controller = TextEditingController();
  String? _error;

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
    // Toque duplo mandava varios pedidos de codigo de uma vez.
    final agora = DateTime.now();
    if (_ultimoEnvio != null && agora.difference(_ultimoEnvio!) < const Duration(seconds: 3)) return;
    _ultimoEnvio = agora;
    final phone = '+55${onlyDigits(_controller.text)}';

    String? debugCode;
    if (AppConfig.hasApi) {
      setState(() => _error = null);
      try {
        debugCode = await context.read<DriverState>().requestOtp(phone);
      } on ApiException catch (e) {
        if (mounted) setState(() => _error = e.message);
        return;
      }
    }
    if (!mounted) return;

    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => OtpScreen(phone: phone, debugCode: debugCode),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Cadastro do motorista')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(Spacing.xl),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Qual o seu telefone?', style: AppText.title),
              const SizedBox(height: Spacing.sm),
              Text(
                'Enviaremos um codigo de verificacao por SMS.',
                style: AppText.body.copyWith(color: AppColors.textMuted),
              ),
              const SizedBox(height: Spacing.xl),
              AppField(
                label: 'Telefone',
                hint: '(11) 98888-0000',
                controller: _controller,
                keyboardType: TextInputType.phone,
                error: _error,
                onChanged: (value) {
                  final masked = formatPhoneInput(value);
                  _controller.value = TextEditingValue(
                    text: masked,
                    selection: TextSelection.collapsed(offset: masked.length),
                  );
                  setState(() {});
                },
              ),
              const SizedBox(height: Spacing.lg),
              AppButton(label: 'Continuar', enabled: _isValid, onPressed: _continue),
            ],
          ),
        ),
      ),
    );
  }
}
