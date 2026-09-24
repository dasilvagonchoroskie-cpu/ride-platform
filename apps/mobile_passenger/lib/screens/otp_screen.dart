import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api/api_client.dart';
import '../core/theme/app_theme.dart';
import '../state/auth_state.dart';
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
  void initState() {
    super.initState();
    if (widget.debugCode != null) _controller.text = widget.debugCode!;
  }

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

    try {
      await context.read<AuthState>().verifyOtp(widget.phone, _controller.text);
    } on ApiException {
      if (mounted) setState(() => _error = 'Codigo incorreto ou expirado.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(Spacing.xl),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: Spacing.xxl),
              const Text(
                'Digite o codigo',
                style: TextStyle(color: AppColors.text, fontSize: 24, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: Spacing.sm),
              Text(
                'Enviamos um SMS para ${widget.phone}',
                style: const TextStyle(color: AppColors.textMuted, fontSize: 15),
              ),
              const SizedBox(height: Spacing.lg),
              if (widget.debugCode != null)
                Container(
                  padding: const EdgeInsets.all(Spacing.md),
                  decoration: BoxDecoration(
                    color: AppColors.primarySoft,
                    border: Border.all(color: AppColors.primaryDark),
                    borderRadius: BorderRadius.circular(Radii.md),
                  ),
                  child: Text(
                    'Ambiente de teste: codigo ${widget.debugCode}',
                    style: const TextStyle(color: AppColors.primary, fontSize: 13),
                  ),
                ),
              const SizedBox(height: Spacing.lg),
              AppField(
                label: 'Codigo',
                hint: '000000',
                controller: _controller,
                keyboardType: TextInputType.number,
                error: _error,
                maxLength: 6,
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: Spacing.lg),
              AppButton(
                label: 'Verificar',
                loading: _loading,
                enabled: _controller.text.length == 6,
                onPressed: _verify,
              ),
              const SizedBox(height: Spacing.sm),
              AppButton(
                label: 'Voltar',
                variant: AppButtonVariant.ghost,
                onPressed: () => Navigator.of(context).pop(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
