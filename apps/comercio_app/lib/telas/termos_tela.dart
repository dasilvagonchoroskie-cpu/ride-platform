import 'package:flutter/material.dart';

import '../core/tema.dart';
import '../dados/modelos.dart';
import '../estado/escopo.dart';
import '../widgets/comuns.dart';

/// Termos de uso e condicoes comerciais do Comercio. O texto vem do servidor
/// (GET /legal/comercio). Enquanto nao houver revisao de advogado, a tela diz
/// com todas as letras que e uma minuta.
class TermosTela extends StatefulWidget {
  const TermosTela({super.key});

  @override
  State<TermosTela> createState() => _TermosTelaState();
}

class _TermosTelaState extends State<TermosTela> {
  TermosDeUso? _termos;
  String? _falha;

  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      if (mounted) _carregar();
    });
  }

  Future<void> _carregar() async {
    final s = EscopoSessao.ler(context);
    setState(() => _falha = null);
    try {
      final t = await s.servidor.termos();
      if (!mounted) return;
      if (t.conteudo.trim().isEmpty) {
        setState(() => _falha = 'O texto dos termos não veio do servidor. Tente de novo.');
      } else {
        setState(() => _termos = t);
      }
    } catch (e) {
      if (mounted) setState(() => _falha = mensagemDe(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = _termos;
    return Scaffold(
      appBar: AppBar(title: const Text('Termos de uso')),
      body: t == null
          ? (_falha != null
              ? Estado(icone: Icons.cloud_off, titulo: 'Não foi possível carregar os termos', texto: _falha, botao: 'Tentar de novo', aoTocar: _carregar)
              : const Center(child: CircularProgressIndicator()))
          : ListView(padding: EdgeInsets.fromLTRB(20, 8, 20, 32 + MediaQuery.viewPaddingOf(context).bottom), children: [
              if (!t.revisadoPorAdvogado) ...[
                const Faixa('Este texto é uma minuta técnica e ainda não foi aprovado por advogado. Ele pode mudar depois da revisão jurídica.', tipo: TipoFaixa.atencao),
                const SizedBox(height: 14),
              ],
              ..._blocos(t.conteudo),
            ]),
    );
  }

  /// Mostra o texto do servidor (Markdown simples): titulos, listas, citacao e **negrito**.
  List<Widget> _blocos(String md) => blocosDeTexto(md);
}

/// Texto em Markdown simples -> widgets (usado nos termos da abertura e na tela de termos).
List<Widget> blocosDeTexto(String md) {
  {
    final saida = <Widget>[];
    for (final bruta in md.split('\n')) {
      final linha = bruta.trimRight();
      if (linha.isEmpty) {
        saida.add(const SizedBox(height: 6));
      } else if (linha.startsWith('# ')) {
        saida.add(Padding(padding: const EdgeInsets.only(top: 8, bottom: 6), child: Text(linha.substring(2), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800))));
      } else if (linha.startsWith('## ')) {
        saida.add(Padding(padding: const EdgeInsets.only(top: 14, bottom: 4), child: Text(linha.substring(3), style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: Cores.loja))));
      } else if (linha.startsWith('### ')) {
        saida.add(Padding(padding: const EdgeInsets.only(top: 10, bottom: 4), child: Text(linha.substring(4), style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Cores.textoSuave))));
      } else if (linha == '---') {
        saida.add(const Divider(height: 28));
      } else if (linha.startsWith('> ')) {
        saida.add(Padding(padding: const EdgeInsets.symmetric(vertical: 4), child: Faixa(linha.substring(2).replaceAll('**', ''), tipo: TipoFaixa.atencao)));
      } else if (linha.startsWith('- ') || RegExp(r'^\d+\. ').hasMatch(linha)) {
        final marca = linha.startsWith('- ') ? '•' : linha.substring(0, linha.indexOf(' '));
        final texto = linha.startsWith('- ') ? linha.substring(2) : linha.substring(linha.indexOf(' ') + 1);
        saida.add(Padding(
          padding: const EdgeInsets.fromLTRB(4, 3, 0, 3),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            SizedBox(width: 24, child: Text(marca, style: const TextStyle(color: Cores.textoSuave))),
            Expanded(child: _rico(texto)),
          ]),
        ));
      } else {
        saida.add(Padding(padding: const EdgeInsets.symmetric(vertical: 3), child: _rico(linha)));
      }
    }
    return saida;
  }
}

Widget _rico(String texto) {
  final partes = texto.split('**');
  return Text.rich(
    TextSpan(
      children: [for (var i = 0; i < partes.length; i++) TextSpan(text: partes[i], style: i.isOdd ? const TextStyle(fontWeight: FontWeight.w700) : null)],
    ),
    style: const TextStyle(height: 1.45),
  );
}
