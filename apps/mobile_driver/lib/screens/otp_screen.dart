import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/app_theme.dart';
import '../state/driver_state.dart';
import '../widgets/ui.dart';
import '../core/config/app_config.dart';
import '../core/api/api_client.dart';
import '../core/utils/formatters.dart';

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
    var contaNova = false;
    if (AppConfig.hasApi) {
      try {
        contaNova = await driver.verifyOtp(widget.phone, _controller.text, emailLogin: widget.email);
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
    // Numero que nunca tinha entrado: confere se foi digitado certo antes de
    // abrir um cadastro vazio (Evandro digitou 6631 em vez de 6632).
    if (contaNova && widget.email == null && !await _numeroCerto()) {
      await driver.desfazerContaNova();
      if (mounted) Navigator.of(context).pop(); // volta para corrigir o numero
      return;
    }
    if (!mounted) return;
    // Entrou: as telas de entrada saem e o aplicativo segue o cadastro.
    Navigator.of(context).popUntil((r) => r.isFirst);
  }

  /// true = o numero esta certo e a pessoa quer criar a conta.
  Future<bool> _numeroCerto() async {
    final ok = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: const Text('Conta nova'),
        content: Text(
          'O número ${telefoneBonito(widget.phone)} ainda não tinha conta no Fortaleza Mov.\n\n'
          'Se você já é motorista ou usa o app do passageiro, entre com o MESMO número de lá: '
          'a conta é a mesma para os dois aplicativos e o cadastro aprovado abre direto.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Número errado')),
          FilledButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Está certo, cadastrar')),
        ],
      ),
    );
    return ok ?? false;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Verificação')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(Spacing.xl),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Digite o código', style: AppText.title),
              const SizedBox(height: Spacing.sm),
              Text(
                widget.email != null
                    ? 'Enviamos um código para ${widget.email}'
                    : context.watch<DriverState>().codigoEnviadoPara != null
                        ? 'Enviamos o código para o ${context.watch<DriverState>().codigoEnviadoPara} '
                            '(o e-mail da conta do telefone ${telefoneBonito(widget.phone)})'
                        : 'Código para o telefone ${telefoneBonito(widget.phone)}',
                style: AppText.body.copyWith(color: AppColors.textMuted),
              ),
              if (widget.email == null) ...[
                const SizedBox(height: Spacing.md),
                // O numero bem grande: um digito errado aparece antes de entrar.
                Text(telefoneBonito(widget.phone), style: AppText.title),
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('Número errado? Corrigir'),
                  ),
                ),
              ],
              if (widget.debugCode == null) ...[
                const SizedBox(height: Spacing.sm),
                Text(
                  'Não chegou? Olhe também a caixa de Spam (lixo eletrônico). '
                  'Nunca passe este código para ninguém: a Fortaleza Mov nunca pede o seu código.',
                  style: AppText.caption.copyWith(color: AppColors.textMuted),
                ),
              ],
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
