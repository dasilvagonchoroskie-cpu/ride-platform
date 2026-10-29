import 'avisos.dart';
import 'permissoes_nativas.dart';
import 'marca.dart';

/// Abre a conversa com a Central no WhatsApp.
Future<void> falarComCentral(String? numero, {String? mensagem}) async {
  mensagem ??= 'Olá! Preciso de ajuda com o aplicativo ${Marca.nome}.';
  final digitos = (numero ?? '').replaceAll(RegExp(r'\D'), '');
  if (digitos.isEmpty) {
    avisar('O contato da Central ainda não foi configurado.');
    return;
  }
  final abriu = await PermissoesNativas.abrirLink('https://wa.me/$digitos?text=${Uri.encodeComponent(mensagem)}');
  if (!abriu) avisar('Não foi possível abrir o WhatsApp. Número da Central: +$digitos');
}
