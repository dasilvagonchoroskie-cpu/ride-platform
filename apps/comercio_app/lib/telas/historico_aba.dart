import 'package:flutter/material.dart';

import '../dados/modelos.dart';
import '../estado/escopo.dart';
import '../widgets/cartao_entrega.dart';
import '../widgets/comuns.dart';
import 'entrega_tela.dart';

/// Todas as entregas do estabelecimento, da mais nova para a mais antiga.
class HistoricoAba extends StatefulWidget {
  const HistoricoAba({super.key});

  @override
  State<HistoricoAba> createState() => _HistoricoAbaState();
}

class _HistoricoAbaState extends State<HistoricoAba> {
  final List<Entrega> _itens = [];
  int _pagina = 0;
  bool _temMais = true;
  bool _carregando = false;
  String? _falha;

  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      if (mounted) _mais();
    });
  }

  Future<void> _reiniciar() async {
    _itens.clear();
    _pagina = 0;
    _temMais = true;
    await _mais();
  }

  Future<void> _mais() async {
    if (_carregando || !_temMais) return;
    final s = EscopoSessao.ler(context);
    setState(() {
      _carregando = true;
      _falha = null;
    });
    try {
      final h = await s.servidor.historico(_pagina + 1);
      if (!mounted) return;
      setState(() {
        _pagina = h.pagina;
        _itens.addAll(h.itens);
        _temMais = h.temMais;
      });
    } catch (e) {
      if (mounted) setState(() => _falha = mensagemDe(e));
    } finally {
      if (mounted) setState(() => _carregando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _reiniciar,
      child: ListView(padding: EdgeInsets.fromLTRB(20, 16, 20, 100 + MediaQuery.viewPaddingOf(context).bottom), children: [
        const Text('Histórico de entregas', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
        const SizedBox(height: 16),
        if (_itens.isEmpty && _carregando)
          const Padding(padding: EdgeInsets.only(top: 60), child: Center(child: CircularProgressIndicator()))
        else if (_itens.isEmpty && _falha != null)
          Estado(icone: Icons.cloud_off, titulo: 'Sem conexão', texto: _falha, botao: 'Tentar de novo', aoTocar: _reiniciar)
        else if (_itens.isEmpty)
          const Estado(icone: Icons.history, titulo: 'Ainda não há entregas', texto: 'Quando você pedir a primeira, ela aparece aqui.')
        else ...[
          for (final e in _itens)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: CartaoDeEntrega(
                entrega: e,
                aoTocar: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => EntregaTela(inicial: e))),
              ),
            ),
          if (_falha != null) Faixa(_falha!, tipo: TipoFaixa.erro),
          if (_temMais)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: OutlinedButton(onPressed: _carregando ? null : _mais, child: Text(_carregando ? 'Carregando…' : 'Ver mais')),
            ),
        ],
      ]),
    );
  }
}
