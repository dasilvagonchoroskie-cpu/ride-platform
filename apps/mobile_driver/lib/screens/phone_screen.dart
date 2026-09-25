import 'package:flutter/material.dart';

import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
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

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  bool get _isValid {
    final digits = onlyDigits(_controller.text);
    return digits.length >= 10 && digits.length <= 11;
  }

  void _continue() {
    if (!_isValid) {
      setState(() => _error = 'Informe um telefone com DDD.');
      return;
    }

    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => OtpScreen(phone: '+55${onlyDigits(_controller.text)}'),
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
