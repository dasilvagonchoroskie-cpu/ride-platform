import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/uber_theme.dart';
import '../state/driver_state.dart';
import '../widgets/ui.dart';

class OtpScreen extends StatefulWidget {
  const OtpScreen({super.key, required this.phone, this.debugCode});

  final String phone;
  final String? debugCode;

  @override
  State<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends State<OtpScreen> {
  final TextEditingController _controller = TextEditingController();
  String? _error;
  bool _loading = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    if (_controller.text.length != 6) {
      setState(() => _error = 'O codigo tem 6 digitos.');
      return;
    }

    setState(() {
      _error = null;
      _loading = true;
    });

    // Em modo demonstracao qualquer codigo de 6 digitos autentica.
    await context.read<DriverState>().demoLogin('Motorista Demo', widget.phone);

    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Verificacao')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(Spacing.xl),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Digite o codigo', style: AppText.title),
              const SizedBox(height: Spacing.sm),
              Text(
                'Enviamos um SMS para ${widget.phone}',
                style: AppText.body.copyWith(color: AppColors.textMuted),
              ),
              const SizedBox(height: Spacing.lg),
              Container(
                padding: const EdgeInsets.all(Spacing.md),
                decoration: BoxDecoration(
                  color: AppColors.primarySoft,
                  border: Border.all(color: AppColors.primaryDark),
                  borderRadius: BorderRadius.circular(Radii.sm),
                ),
                child: Text(
                  'Modo demonstracao: use 123456',
                  style: AppText.caption.copyWith(color: AppColors.primary),
                ),
              ),
              const SizedBox(height: Spacing.lg),
              AppField(
                label: 'Codigo',
                hint: '000000',
                controller: _controller,
                keyboardType: TextInputType.number,
                maxLength: 6,
                error: _error,
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: Spacing.lg),
              AppButton(
                label: 'Verificar',
                loading: _loading,
                enabled: _controller.text.length == 6,
                onPressed: _verify,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
