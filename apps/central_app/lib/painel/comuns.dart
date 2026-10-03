import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../core/alarme.dart';
import '../core/api/api_client.dart';
import '../core/config/app_config.dart';
import '../core/storage/app_storage.dart';
import '../core/theme/central_theme.dart';

/// Pecas usadas em varias telas do painel.

String reais(int cents) => NumberFormat.currency(locale: 'pt_BR', symbol: 'R\$').format(cents / 100);

String dataHora(DateTime? d) => d == null ? '-' : DateFormat('dd/MM HH:mm').format(d);

String telefoneBonito(String? t) {
  if (t == null || t.isEmpty) return '-';
  final d = t.replaceAll(RegExp(r'\D'), '');
  final n = d.startsWith('55') && d.length > 11 ? d.substring(2) : d;
  if (n.length == 11) return '(${n.substring(0, 2)}) ${n.substring(2, 7)}-${n.substring(7)}';
  if (n.length == 10) return '(${n.substring(0, 2)}) ${n.substring(2, 6)}-${n.substring(6)}';
  return t;
}

/// Reais digitados ("12,50") para centavos.
int? centavos(String texto) {
  final limpo = texto.trim().replaceAll('R\$', '').replaceAll(' ', '').replaceAll('.', '').replaceAll(',', '.');
  final v = double.tryParse(limpo);
  return v == null ? null : (v * 100).round();
}

String paraReais(int cents) => (cents / 100).toStringAsFixed(2).replaceAll('.', ',');

/// Texto do erro para mostrar na tela (o motivo que o servidor mandou).
String mensagemDe(Object e) => e is ApiException ? e.message : '$e';

void avisar(BuildContext context, String texto, {bool erro = false}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(
      content: Text(texto),
      backgroundColor: erro ? AppColors.danger : AppColors.surfaceElevated,
    ));
}

/// Executa uma acao e mostra o motivo real se o servidor recusar.
Future<bool> tentar(BuildContext context, Future<void> Function() acao, {String? sucesso}) async {
  try {
    await acao();
    if (sucesso != null && context.mounted) avisar(context, sucesso);
    return true;
  } on ApiException catch (e) {
    if (context.mounted) avisar(context, e.message, erro: true);
  } catch (e) {
    if (context.mounted) avisar(context, 'Não deu certo: $e', erro: true);
  }
  return false;
}

/// Pede um texto (motivo, justificativa). Devolve null se cancelar.
Future<String?> pedirTexto(
  BuildContext context, {
  required String titulo,
  String rotulo = 'Motivo',
  String confirmar = 'Confirmar',
  bool obrigatorio = true,
  String? explicacao,
}) {
  return showDialog<String>(
    context: context,
    builder: (_) => _DialogoTexto(
      titulo: titulo,
      rotulo: rotulo,
      confirmar: confirmar,
      obrigatorio: obrigatorio,
      explicacao: explicacao,
    ),
  );
}

class _DialogoTexto extends StatefulWidget {
  const _DialogoTexto({
    required this.titulo,
    required this.rotulo,
    required this.confirmar,
    required this.obrigatorio,
    this.explicacao,
  });

  final String titulo;
  final String rotulo;
  final String confirmar;
  final bool obrigatorio;
  final String? explicacao;

  @override
  State<_DialogoTexto> createState() => _DialogoTextoState();
}

class _DialogoTextoState extends State<_DialogoTexto> {
  final _campo = TextEditingController();
  String? _erro;

  @override
  void dispose() {
    _campo.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: AppColors.surface,
      title: Text(widget.titulo, style: AppText.heading),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (widget.explicacao != null) ...[
            Text(widget.explicacao!, style: AppText.caption.copyWith(color: AppColors.textMuted)),
            const SizedBox(height: Spacing.md),
          ],
          TextField(
            controller: _campo,
            autofocus: true,
            maxLines: 3,
            minLines: 1,
            style: AppText.body,
            decoration: InputDecoration(labelText: widget.rotulo, errorText: _erro),
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Voltar')),
        FilledButton(
          onPressed: () {
            final t = _campo.text.trim();
            if (widget.obrigatorio && t.length < 3) {
              setState(() => _erro = 'Escreva pelo menos 3 letras.');
              return;
            }
            Navigator.of(context).pop(t);
          },
          child: Text(widget.confirmar),
        ),
      ],
    );
  }
}

/// Botoes de ligar e WhatsApp para um telefone.
class BotoesContato extends StatelessWidget {
  const BotoesContato({super.key, required this.telefone});

  final String? telefone;

  @override
  Widget build(BuildContext context) {
    final t = telefone;
    if (t == null || t.isEmpty) return const SizedBox.shrink();
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        IconButton(
          tooltip: 'Ligar',
          icon: const Icon(Icons.call, color: AppColors.success),
          onPressed: () => Alarme.ligar(t),
        ),
        IconButton(
          tooltip: 'WhatsApp',
          icon: const Icon(Icons.chat, color: AppColors.success),
          onPressed: () => Alarme.whatsapp(t),
        ),
      ],
    );
  }
}

/// Foto guardada no servidor (precisa do login da Central). Toque para ampliar.
class FotoDoServidor extends StatelessWidget {
  const FotoDoServidor({super.key, required this.caminho, this.largura = 72, this.altura = 72, this.redonda = false});

  final String caminho;
  final double largura;
  final double altura;
  final bool redonda;

  static Future<String?> _token() => AppStorage.read(AppStorage.accessToken);

  static Widget _imagem(String caminho, String token, {BoxFit fit = BoxFit.cover, double? w, double? h}) {
    final url = caminho.startsWith('http') ? caminho : '${AppConfig.apiUrl}/api$caminho';
    return Image.network(
      url,
      width: w,
      height: h,
      fit: fit,
      headers: {'Authorization': 'Bearer $token'},
      errorBuilder: (context, error, stack) => Container(
        width: w,
        height: h,
        color: AppColors.surfaceElevated,
        alignment: Alignment.center,
        child: const Icon(Icons.broken_image_outlined, color: AppColors.textFaint),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<String?>(
      future: _token(),
      builder: (context, t) {
        if (!t.hasData) return SizedBox(width: largura, height: altura);
        final img = _imagem(caminho, t.data!, w: largura, h: altura);
        return GestureDetector(
          onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(
            builder: (_) => Scaffold(
              backgroundColor: Colors.black,
              appBar: AppBar(backgroundColor: Colors.black),
              body: InteractiveViewer(
                maxScale: 6,
                child: Center(child: _imagem(caminho, t.data!, fit: BoxFit.contain)),
              ),
            ),
          )),
          child: redonda ? ClipOval(child: img) : ClipRRect(borderRadius: BorderRadius.circular(Radii.sm), child: img),
        );
      },
    );
  }
}

/// Linha "rotulo: valor".
class Linha extends StatelessWidget {
  const Linha(this.rotulo, this.valor, {super.key, this.destaque = false});

  final String rotulo;
  final String valor;
  final bool destaque;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 130, child: Text(rotulo, style: AppText.caption.copyWith(color: AppColors.textMuted))),
          Expanded(child: Text(valor, style: destaque ? AppText.bodyStrong : AppText.body)),
        ],
      ),
    );
  }
}

/// Tela vazia ou com erro, com botao de tentar de novo.
class Aviso extends StatelessWidget {
  const Aviso({super.key, required this.texto, this.icone = Icons.inbox_outlined, this.tentarDeNovo});

  final String texto;
  final IconData icone;
  final VoidCallback? tentarDeNovo;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(Spacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icone, color: AppColors.textFaint, size: 40),
            const SizedBox(height: Spacing.md),
            Text(texto, textAlign: TextAlign.center, style: AppText.body.copyWith(color: AppColors.textMuted)),
            if (tentarDeNovo != null) ...[
              const SizedBox(height: Spacing.md),
              OutlinedButton(onPressed: tentarDeNovo, child: const Text('Tentar de novo')),
            ],
          ],
        ),
      ),
    );
  }
}
