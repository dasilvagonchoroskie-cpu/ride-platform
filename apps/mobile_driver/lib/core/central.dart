import 'package:url_launcher/url_launcher.dart';

import 'avisos.dart';

/// Abre a conversa com a Central no WhatsApp, com a mensagem ja escrita.
Future<void> abrirWhatsApp(String? numero, String mensagem) async {
  final so = (numero ?? '').replaceAll(RegExp(r'\D'), '');
  if (so.isEmpty) {
    avisar('A Central ainda não informou o WhatsApp.');
    return;
  }
  final uri = Uri.parse('https://wa.me/$so?text=${Uri.encodeComponent(mensagem)}');
  final abriu = await launchUrl(uri, mode: LaunchMode.externalApplication);
  if (!abriu) avisar('Não foi possível abrir o WhatsApp.');
}
