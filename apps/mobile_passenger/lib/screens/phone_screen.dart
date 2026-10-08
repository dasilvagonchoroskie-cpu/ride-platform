import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api/api_client.dart';
import '../core/contato.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../core/utils/validadores.dart';
import '../state/app_state.dart';
import '../state/auth_state.dart';
import '../state/config_state.dart';
import '../widgets/form_ui.dart';
import 'email_login_screen.dart';
import 'legal_screen.dart';
import 'otp_screen.dart';

/// Entrada pelo telefone, com as outras formas de entrar embaixo.
class PhoneScreen extends StatefulWidget {
  const PhoneScreen({super.key});

  @override
  State<PhoneScreen> createState() => _PhoneScreenState();
}

class _PhoneScreenState extends State<PhoneScreen> {
  final TextEditingController _telefone = TextEditingController();
  String? _erro;
  bool _enviando = false;

  @override
  void dispose() {
    _telefone.dispose();
    super.dispose();
  }

  bool get _valido {
    final d = onlyDigits(_telefone.text);
    return d.length >= 10 && d.length <= 11;
  }

  Future<void> _continuar() async {
    // Toque duplo mandava varios pedidos de codigo de uma vez: o primeiro
    // funcionava e os outros voltavam "Aguarde 59s", que era o que aparecia.
    if (_enviando) return;
    if (!_valido) {
      setState(() => _erro = 'Informe o telefone com DDD.');
      return;
    }
    setState(() {
      _erro = null;
      _enviando = true;
    });

    final app = context.read<AppState>();
    final auth = context.read<AuthState>();
    final numero = '+55${onlyDigits(_telefone.text)}';

    try {
      if (app.isDemo) {
        await auth.demoLogin('Passageiro Demo', numero);
        if (mounted) Navigator.of(context).popUntil((r) => r.isFirst);
        return;
      }
      final codigoTeste = await auth.requestOtp(numero);
      if (!mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute<void>(builder: (_) => OtpScreen(phone: numero, debugCode: codigoTeste)),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.code == 'TELEFONE_SEM_CONTA') {
        // Sem SMS, a conta nova nasce pelo e-mail: o codigo chega nele.
        auth.telefoneParaCadastro = numero;
        await Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (_) => EmailLoginScreen(
              aviso: 'O telefone ${telefoneLegivel(numero)} ainda não tem conta. Para criar a sua, '
                  'digite o seu e-mail: o código de confirmação chega nele.',
            ),
          ),
        );
        return;
      }
      setState(() => _erro = e.message);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final config = context.watch<ConfigState>();

    return TelaFormulario(
      titulo: 'Fortaleza Mov',
      linha: false,
      rodape: const _RodapePrivacidade(),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(Spacing.xl, Spacing.lg, Spacing.xl, Spacing.xl),
        children: [
          const RotuloCampo('Informe seu telefone'),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                height: 58,
                padding: const EdgeInsets.symmetric(horizontal: Spacing.lg),
                decoration: BoxDecoration(
                  border: Border.all(color: AppColors.campoBorda),
                  borderRadius: BorderRadius.circular(Radii.sm),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text('🇧🇷', style: TextStyle(fontSize: 24)),
                    const SizedBox(width: Spacing.sm),
                    Text('+55', style: AppText.body.copyWith(fontSize: 18)),
                  ],
                ),
              ),
              const SizedBox(width: Spacing.md),
              Expanded(
                child: CampoForm(
                  dica: '(64) 99999-9999',
                  controller: _telefone,
                  teclado: TextInputType.phone,
                  formatadores: [mascaraTelefone],
                  erro: _erro,
                  acao: TextInputAction.done,
                  preenchimento: const [AutofillHints.telephoneNumberNational],
                  aoMudar: (_) => setState(() => _erro = null),
                  aoEnviar: (_) => _continuar(),
                ),
              ),
            ],
          ),
          const SizedBox(height: Spacing.lg),
          BotaoPrincipal(texto: 'Continuar', ativo: _valido, carregando: _enviando, aoTocar: _continuar),
          const SizedBox(height: Spacing.xl),
          const DivisorOu(),
          const SizedBox(height: Spacing.xl),
          BotaoContorno(
            texto: 'Continuar com e-mail',
            icone: const Icon(Icons.mail_outline, color: AppColors.text),
            aoTocar: () => Navigator.of(context).push(
              MaterialPageRoute<void>(builder: (_) => const EmailLoginScreen()),
            ),
          ),
          const SizedBox(height: Spacing.xl),
          Center(
            child: TextButton.icon(
              onPressed: () => falarComCentral(config.whatsapp),
              icon: const Icon(Icons.headset_mic_outlined, size: 28, color: AppColors.text),
              label: Text(
                'Fale conosco',
                style: AppText.bodyStrong.copyWith(fontSize: 19, color: AppColors.text),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _RodapePrivacidade extends StatelessWidget {
  const _RodapePrivacidade();

  @override
  Widget build(BuildContext context) {
    final estilo = AppText.body.copyWith(fontSize: 15, color: AppColors.textMuted, height: 1.4);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          'Saiba como protegemos suas informações e garantimos sua segurança em nossa',
          textAlign: TextAlign.center,
          style: estilo,
        ),
        InkWell(
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute<void>(builder: (_) => const LegalScreen(privacidade: true)),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 8),
            child: Text(
              'Política de Privacidade',
              style: estilo.copyWith(decoration: TextDecoration.underline, color: AppColors.text),
            ),
          ),
        ),
      ],
    );
  }
}
