import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/app_theme.dart';
import '../state/driver_state.dart';
import '../widgets/ui.dart';
import '../core/config/app_config.dart';
import '../core/api/api_client.dart';

class OtpScreen extends StatefulWidget {
  const OtpScreen({super.key, required this.phone, this.debugCode, this.email});

  final String phone;
  final String? debugCode;

  /// Entrada pelo e-mail: o codigo foi para este endereco.
  final String? email;

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
    // Ambiente de teste: o servidor devolve o codigo e ele ja vem
    // preenchido — entra sem gastar com SMS.
    if (widget.debugCode != null) _controller.text = widget.debugCode!;
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    if (_controller.text.length != 6) {
      setState(() => _error = 'O código tem 6 dígitos.');
      return;
    }

    setState(() {
      _error = null;
      _loading = true;
    });

    final driver = context.read<DriverState>();
    if (AppConfig.hasApi) {
      try {
        await driver.verifyOtp(widget.phone, _controller.text, emailLogin: widget.email);
      } on ApiException catch (e) {
        if (mounted) {
          setState(() {
            _error = e.message;
            _loading = false;
          });
        }
        return;
      }
    } else {
      // Sem servidor configurado: modo demonstracao.
      await driver.demoLogin('Motorista Demo', widget.phone);
    }

    if (!mounted) return;
    setState(() => _loading = false);
    // Entrou: as telas de entrada saem e o aplicativo segue o cadastro.
    Navigator.of(context).popUntil((r) => r.isFirst);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Verificação')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(Spacing.xl),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Digite o código', style: AppText.title),
              const SizedBox(height: Spacing.sm),
              Text(
                widget.email != null
                    ? 'Enviamos um código para ${widget.email}'
                    : 'Código para o telefone ${widget.phone}',
                style: AppText.body.copyWith(color: AppColors.textMuted),
              ),
              if (widget.debugCode != null) ...[
                const SizedBox(height: Spacing.lg),
                Container(
                  padding: const EdgeInsets.all(Spacing.md),
                  decoration: BoxDecoration(
                    color: AppColors.primarySoft,
                    border: Border.all(color: AppColors.primaryDark),
                    borderRadius: BorderRadius.circular(Radii.sm),
                  ),
                  child: Text(
                    'Ambiente de teste (o código ainda não vai por SMS): ${widget.debugCode}',
                    style: AppText.caption.copyWith(color: AppColors.primary),
                  ),
                ),
              ],
              const SizedBox(height: Spacing.lg),
              AppField(
                label: 'Código',
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
