import 'package:flutter/material.dart';

import '../core/formato.dart';
import '../core/tema.dart';
import '../dados/modelos.dart';
import '../estado/escopo.dart';
import '../widgets/comuns.dart';

/// Quanto o estabelecimento gastou com entregas no mes: so consulta.
/// Nao ha carteira, credito, debito automatico nem fatura aqui: o pagamento
/// de cada entrega e feito direto ao motorista.
class GastosAba extends StatefulWidget {
  const GastosAba({super.key});

  @override
  State<GastosAba> createState() => _GastosAbaState();
}

class _GastosAbaState extends State<GastosAba> {
  Gastos? _g;
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
      final g = await s.servidor.gastos();
      if (mounted) setState(() => _g = g);
    } catch (e) {
      if (mounted) setState(() => _falha = mensagemDe(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final g = _g;
    return RefreshIndicator(
      onRefresh: _carregar,
      child: ListView(padding: const EdgeInsets.fromLTRB(20, 16, 20, 100), children: [
        const Text('Gastos com entregas', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
        if (g != null) Text('${Formato.dataHora(g.de).split(' ').first} a ${Formato.dataHora(g.ate).split(' ').first}', style: const TextStyle(color: Cores.textoSuave)),
        const SizedBox(height: 16),
        if (g == null && _falha != null)
          Estado(icone: Icons.cloud_off, titulo: 'Sem conexão', texto: _falha, botao: 'Tentar de novo', aoTocar: _carregar)
        else if (g == null)
          const Padding(padding: EdgeInsets.only(top: 60), child: Center(child: CircularProgressIndicator()))
        else ...[
          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(children: [
                const Text('Total do período', style: TextStyle(color: Cores.textoSuave)),
                const SizedBox(height: 4),
                Text(Formato.dinheiro(g.totalCents), style: const TextStyle(fontSize: 34, fontWeight: FontWeight.w800, color: Cores.ouro)),
                const SizedBox(height: 14),
                Row(children: [
                  _numero('Realizadas', g.realizadas, Cores.ok),
                  _numero('Canceladas', g.canceladas, Cores.perigo),
                  _numero('Em andamento', g.emAndamento, Cores.loja),
                ]),
              ]),
            ),
          ),
          const Titulo('COBRANÇAS'),
          if (g.cobrancas.isEmpty)
            const Text('Nenhuma entrega concluída neste período.', style: TextStyle(color: Cores.textoSuave))
          else
            for (final c in g.cobrancas)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Card(
                  child: ListTile(
                    title: Text(c.destinatario ?? 'Entrega ${c.codigo}', style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Text('${c.codigo} · ${Formato.dataHora(c.em)}', style: const TextStyle(color: Cores.textoFraco, fontSize: 12)),
                    trailing: Text(Formato.dinheiro(c.valorCents), style: const TextStyle(fontWeight: FontWeight.w800)),
                  ),
                ),
              ),
          const SizedBox(height: 12),
          const Text(
            'Só entregas concluídas entram no total. O pagamento é feito direto ao motorista; este app não cobra nem debita nada.',
            style: TextStyle(color: Cores.textoFraco, fontSize: 12, height: 1.4),
          ),
        ],
      ]),
    );
  }

  Widget _numero(String rotulo, int n, Color cor) => Expanded(
        child: Column(children: [
          Text('$n', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: cor)),
          Text(rotulo, style: const TextStyle(color: Cores.textoSuave, fontSize: 12)),
        ]),
      );
}
