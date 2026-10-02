import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../core/api/api_client.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../state/auth_state.dart';
import '../widgets/form_ui.dart';

/// "(64) 99268-6632" a partir de "+5564992686632".
String telefoneLegivel(String numero) {
  final d = onlyDigits(numero);
  return formatPhoneInput(d.startsWith('55') && d.length > 11 ? d.substring(2) : d);
}

/// Caixa verde de "ambiente de teste" (o codigo ainda volta do servidor, sem SMS).
class AvisoCodigoTeste extends StatelessWidget {
  const AvisoCodigoTeste({super.key, required this.codigo});

  final String codigo;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(Spacing.md),
      decoration: BoxDecoration(
        color: AppColors.primarySoft,
        border: Border.all(color: AppColors.primary),
        borderRadius: BorderRadius.circular(Radii.sm),
      ),
      child: Text(
        'Ambiente de teste (ainda sem SMS): o código é $codigo',
        style: AppText.body.copyWith(color: AppColors.primaryDark, fontSize: 15),
      ),
    );
  }
}

class OtpScreen extends StatefulWidget {
  const OtpScreen({super.key, required this.phone, this.debugCode});

  final String phone;
  final String? debugCode;

  @override
  State<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends State<OtpScreen> {
  final TextEditingController _codigo = TextEditingController();
  String? _erro;
  String? _codigoTeste;
  bool _carregando = false;
  int _espera = 60;
  Timer? _relogio;

  @override
  void initState() {
    super.initState();
    _codigoTeste = widget.debugCode;
    if (_codigoTeste != null) _codigo.text = _codigoTeste!;
    _contar();
  }

  @override
  void dispose() {
    _relogio?.cancel();
    _codigo.dispose();
    super.dispose();
  }

  void _contar() {
    _relogio?.cancel();
    _espera = 60;
    _relogio = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return;
      if (_espera <= 1) t.cancel();
      setState(() => _espera = _espera > 0 ? _espera - 1 : 0);
    });
  }

  Future<void> _verificar() async {
    if (_carregando) return;
    if (_codigo.text.length != 6) {
      setState(() => _erro = 'O código tem 6 números.');
      return;
    }
    setState(() {
      _erro = null;
      _carregando = true;
    });
    try {
      await context.read<AuthState>().verifyOtp(widget.phone, _codigo.text);
      if (!mounted) return;
      // Entrou: as telas de entrada saem e o aplicativo segue para a
      // cidade/cadastro ou para o mapa.
      Navigator.of(context).popUntil((r) => r.isFirst);
    } on ApiException catch (e) {
      if (mounted) setState(() => _erro = e.message);
    } finally {
      if (mounted) setState(() => _carregando = false);
    }
  }

  Future<void> _reenviar() async {
    if (_espera > 0) return;
    try {
      final novo = await context.read<AuthState>().requestOtp(widget.phone);
      if (!mounted) return;
      setState(() {
        _erro = null;
        _codigoTeste = novo;
        _codigo.text = novo ?? '';
        _contar();
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _erro = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return TelaFormulario(
      titulo: 'Código de verificação',
      linha: false,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(Spacing.xl, Spacing.lg, Spacing.xl, Spacing.xl),
        children: [
          Text(
            'Digite o código de 6 números enviado para',
            style: AppText.body.copyWith(fontSize: 18, color: AppColors.textMuted),
          ),
          const SizedBox(height: Spacing.xs),
          Text(telefoneLegivel(widget.phone), style: AppText.bodyStrong.copyWith(fontSize: 19)),
          const SizedBox(height: Spacing.lg),
          if (_codigoTeste != null) ...[
            AvisoCodigoTeste(codigo: _codigoTeste!),
            const SizedBox(height: Spacing.lg),
          ],
          CampoForm(
            dica: '000000',
            controller: _codigo,
            teclado: TextInputType.number,
            tamanhoMaximo: 6,
            autofocus: _codigoTeste == null,
            formatadores: [FilteringTextInputFormatter.digitsOnly],
            preenchimento: const [AutofillHints.oneTimeCode],
            erro: _erro,
            aoMudar: (v) {
              setState(() => _erro = null);
              if (v.length == 6) _verificar();
            },
          ),
          const SizedBox(height: Spacing.lg),
          BotaoPrincipal(
            texto: 'Confirmar',
            ativo: _codigo.text.length == 6,
            carregando: _carregando,
            aoTocar: _verificar,
          ),
          const SizedBox(height: Spacing.md),
          Center(
            child: TextButton(
              onPressed: _espera > 0 ? null : _reenviar,
              child: Text(
                _espera > 0 ? 'Reenviar código em ${_espera}s' : 'Reenviar código',
                style: AppText.bodyStrong.copyWith(
                  fontSize: 17,
                  color: _espera > 0 ? AppColors.textFaint : AppColors.brand,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
