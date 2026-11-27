import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api/api_client.dart';
import '../core/avisos.dart';
import '../core/entrada_google.dart';
import '../core/theme/app_theme.dart';
import '../screens/otp_screen.dart';
import '../state/app_state.dart';
import '../state/auth_state.dart';
import '../state/config_state.dart';
import 'form_ui.dart';

/// "Entrar com Google". So aparece quando o servidor diz que esta ligado.
class EntrarComGoogle extends StatefulWidget {
  const EntrarComGoogle({super.key, this.espaco = Spacing.md});

  /// Distancia ate o item de cima.
  final double espaco;

  @override
  State<EntrarComGoogle> createState() => _EntrarComGoogleState();
}

class _EntrarComGoogleState extends State<EntrarComGoogle> {
  bool _abrindo = false;

  Future<void> _entrar(String idDoServidor) async {
    if (_abrindo) return;
    setState(() => _abrindo = true);
    final auth = context.read<AuthState>();
    // A tela de baixo troca sozinha quando a pessoa entra.
    final navegador = Navigator.of(context);
    try {
      final comprovante = await EntradaGoogle.escolherConta(idDoServidor);
      if (comprovante == null) {
        avisar('Entrada com Google cancelada. Se preferir, use o código por e-mail.');
        return;
      }
      final emailParaCodigo = await auth.entrarComGoogle(comprovante);
      if (emailParaCodigo == null) {
        navegador.popUntil((r) => r.isFirst);
        return;
      }
      // O Google nao garante este endereco: confirma pelo codigo.
      final codigoTeste = await auth.requestOtp(emailParaCodigo);
      avisar('Para a sua segurança, confirme este e-mail com o código que enviamos.');
      await navegador.push(
        MaterialPageRoute<void>(builder: (_) => OtpScreen(phone: emailParaCodigo, debugCode: codigoTeste)),
      );
    } on FalhaGoogle catch (e) {
      avisar(e.mensagem);
    } on ApiException catch (e) {
      avisar(e.message);
    } catch (_) {
      avisar('Sem conexão. Tente de novo.');
    } finally {
      if (mounted) setState(() => _abrindo = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final id = context.watch<ConfigState>().loginGoogle;
    if (id == null || context.watch<AppState>().isDemo) return const SizedBox.shrink();
    return Padding(
      padding: EdgeInsets.only(top: widget.espaco),
      child: BotaoContorno(
        texto: _abrindo ? 'Abrindo o Google…' : 'Entrar com Google',
        icone: const Icon(Icons.account_circle_outlined, color: AppColors.text),
        aoTocar: _abrindo ? null : () => _entrar(id),
      ),
    );
  }
}
