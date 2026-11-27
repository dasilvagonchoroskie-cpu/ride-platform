import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api/api_client.dart';
import '../core/avisos.dart';
import '../core/entrada_google.dart';
import '../core/theme/app_theme.dart';
import '../screens/otp_screen.dart';
import '../state/driver_state.dart';
import 'ui.dart';

/// "Entrar com Google". So aparece quando o servidor diz que esta ligado.
class EntrarComGoogle extends StatefulWidget {
  const EntrarComGoogle({super.key, this.espaco = Spacing.md});

  /// Distancia ate o item de cima.
  final double espaco;

  @override
  State<EntrarComGoogle> createState() => _EntrarComGoogleState();
}

class _EntrarComGoogleState extends State<EntrarComGoogle> {
  String? _idDoServidor;
  bool _abrindo = false;

  @override
  void initState() {
    super.initState();
    context.read<DriverState>().idDoGoogle().then((id) {
      if (mounted && id != null) setState(() => _idDoServidor = id);
    });
  }

  Future<void> _entrar(String idDoServidor) async {
    if (_abrindo) return;
    setState(() => _abrindo = true);
    final driver = context.read<DriverState>();
    // A tela de baixo troca sozinha quando a pessoa entra.
    final navegador = Navigator.of(context);
    try {
      final comprovante = await EntradaGoogle.escolherConta(idDoServidor);
      if (comprovante == null) {
        avisar('Entrada com Google cancelada. Se preferir, use o código por e-mail.');
        return;
      }
      final emailParaCodigo = await driver.entrarComGoogle(comprovante);
      if (emailParaCodigo == null) {
        navegador.popUntil((r) => r.isFirst);
        return;
      }
      // O Google nao garante este endereco: confirma pelo codigo.
      final codigoTeste = await driver.requestOtpEmail(emailParaCodigo);
      avisar('Para a sua segurança, confirme este e-mail com o código que enviamos.');
      await navegador.push(
        MaterialPageRoute<void>(
          builder: (_) => OtpScreen(phone: '', email: emailParaCodigo, debugCode: codigoTeste),
        ),
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
    final id = _idDoServidor;
    if (id == null) return const SizedBox.shrink();
    return Padding(
      padding: EdgeInsets.only(top: widget.espaco),
      child: AppButton(
        label: 'Entrar com Google',
        icon: Icons.account_circle_outlined,
        variant: AppButtonVariant.secondary,
        loading: _abrindo,
        onPressed: () => _entrar(id),
      ),
    );
  }
}
