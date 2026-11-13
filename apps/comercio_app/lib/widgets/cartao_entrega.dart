import 'package:flutter/material.dart';

import '../core/formato.dart';
import '../core/tema.dart';
import '../dados/modelos.dart';
import 'comuns.dart';

/// Uma entrega na lista (inicio e historico).
class CartaoDeEntrega extends StatelessWidget {
  const CartaoDeEntrega({super.key, required this.entrega, required this.aoTocar});

  final Entrega entrega;
  final VoidCallback aoTocar;

  @override
  Widget build(BuildContext context) {
    final e = entrega;
    final cor = e.problema ? Cores.perigo : (e.etapa == 'ENTREGUE' ? Cores.ok : Cores.loja);
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: aoTocar,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(e.destinatarioNome ?? 'Destinatário', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700), overflow: TextOverflow.ellipsis)),
              Selo(e.situacao, cor: cor),
            ]),
            const SizedBox(height: 6),
            Text(e.enderecoDeEntrega, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Cores.textoSuave, height: 1.3)),
            const SizedBox(height: 8),
            Row(children: [
              Text('${e.codigo} · ${Formato.dataHora(e.criadaEm)}', style: const TextStyle(color: Cores.textoFraco, fontSize: 12)),
              const Spacer(),
              Text(e.veiculo == 'MOTO' ? 'Moto' : 'Carro', style: const TextStyle(color: Cores.textoSuave, fontSize: 12)),
              const SizedBox(width: 10),
              Text(Formato.dinheiro(e.valorCents), style: const TextStyle(fontWeight: FontWeight.w800, color: Cores.ouro)),
            ]),
          ]),
        ),
      ),
    );
  }
}
