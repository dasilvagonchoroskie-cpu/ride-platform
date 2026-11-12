import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/tema.dart';

/// Aviso curto na parte de baixo da tela.
void avisar(BuildContext context, String mensagem) {
  final m = ScaffoldMessenger.maybeOf(context);
  if (m == null) return;
  m
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(mensagem), duration: Duration(seconds: (4 + mensagem.length ~/ 15).clamp(4, 12))));
}

String mensagemDe(Object e) => e is ApiException ? e.message : 'Algo deu errado. Tente de novo.';

class Titulo extends StatelessWidget {
  const Titulo(this.texto, {super.key});
  final String texto;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(0, 20, 0, 8),
        child: Text(texto, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Cores.textoSuave, letterSpacing: .4)),
      );
}

/// Faixa de aviso (erro, atencao ou informacao).
class Faixa extends StatelessWidget {
  const Faixa(this.texto, {super.key, this.tipo = TipoFaixa.info, this.icone});
  final String texto;
  final TipoFaixa tipo;
  final IconData? icone;

  @override
  Widget build(BuildContext context) {
    final (cor, fundo, ic) = switch (tipo) {
      TipoFaixa.erro => (Cores.perigo, Cores.perigoSuave, Icons.error_outline),
      TipoFaixa.atencao => (Cores.aviso, Cores.avisoSuave, Icons.warning_amber_rounded),
      TipoFaixa.info => (Cores.loja, Cores.lojaSuave, Icons.info_outline),
    };
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: fundo, borderRadius: BorderRadius.circular(12), border: Border.all(color: cor.withValues(alpha: .5))),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(icone ?? ic, color: cor, size: 20),
        const SizedBox(width: 10),
        Expanded(child: Text(texto, style: const TextStyle(color: Cores.texto, height: 1.35))),
      ]),
    );
  }
}

enum TipoFaixa { erro, atencao, info }

/// Linha "rotulo: valor" dos detalhes.
class Linha extends StatelessWidget {
  const Linha(this.rotulo, this.valor, {super.key});
  final String rotulo;
  final String valor;

  @override
  Widget build(BuildContext context) {
    if (valor.trim().isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(width: 112, child: Text(rotulo, style: const TextStyle(color: Cores.textoSuave))),
        Expanded(child: Text(valor, style: const TextStyle(fontWeight: FontWeight.w500))),
      ]),
    );
  }
}

/// Botao principal com "carregando" (nao deixa tocar duas vezes).
class BotaoPrincipal extends StatelessWidget {
  const BotaoPrincipal({super.key, required this.texto, required this.aoTocar, this.carregando = false});
  final String texto;
  final VoidCallback? aoTocar;
  final bool carregando;

  @override
  Widget build(BuildContext context) => FilledButton(
        onPressed: carregando ? null : aoTocar,
        child: carregando ? const SizedBox(height: 22, width: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Cores.sobreOuro)) : Text(texto),
      );
}

/// Cartao de tela cheia para "carregando", erro com "tentar de novo" e vazio.
class Estado extends StatelessWidget {
  const Estado({super.key, required this.icone, required this.titulo, this.texto, this.botao, this.aoTocar});
  final IconData icone;
  final String titulo;
  final String? texto;
  final String? botao;
  final VoidCallback? aoTocar;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(icone, size: 52, color: Cores.loja),
            const SizedBox(height: 14),
            Text(titulo, textAlign: TextAlign.center, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            if (texto != null) ...[
              const SizedBox(height: 8),
              Text(texto!, textAlign: TextAlign.center, style: const TextStyle(color: Cores.textoSuave, height: 1.4)),
            ],
            if (botao != null) ...[
              const SizedBox(height: 18),
              OutlinedButton(onPressed: aoTocar, child: Text(botao!)),
            ],
          ]),
        ),
      );
}

/// Selo da situacao da entrega (cor pelo estado).
class Selo extends StatelessWidget {
  const Selo(this.texto, {super.key, this.cor = Cores.loja});
  final String texto;
  final Color cor;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(color: cor.withValues(alpha: .18), borderRadius: BorderRadius.circular(20)),
        child: Text(texto, style: TextStyle(color: cor, fontWeight: FontWeight.w700, fontSize: 12)),
      );
}
