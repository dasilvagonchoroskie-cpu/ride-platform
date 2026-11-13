import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/tema.dart';
import '../dados/modelos.dart';
import '../estado/escopo.dart';
import '../widgets/comuns.dart';
import 'termos_tela.dart';

/// Primeira tela do app: Termos de Uso e Politica de Privacidade. Sem aceitar,
/// a pessoa nao chega a tela de entrar nem de criar a conta. Se o servidor
/// publicar uma versao nova, o aceite e pedido de novo.
class TermosInicioTela extends StatefulWidget {
  const TermosInicioTela({super.key});

  @override
  State<TermosInicioTela> createState() => _TermosInicioTelaState();
}

class _TermosInicioTelaState extends State<TermosInicioTela> {
  TermosDeUso? _termos;
  TermosDeUso? _privacidade;
  String? _falha;
  bool _li = false;
  bool _gravando = false;

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
      final p = await s.servidor.privacidade();
      if (!mounted) return;
      if (t.conteudo.trim().isEmpty || p.conteudo.trim().isEmpty) {
        setState(() => _falha = 'Os textos não vieram do servidor. Tente de novo.');
      } else {
        setState(() {
          _termos = t;
          _privacidade = p;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _falha = mensagemDe(e));
    }
  }

  Future<void> _aceitar() async {
    final t = _termos;
    final p = _privacidade;
    if (t == null || p == null || !_li) return;
    setState(() => _gravando = true);
    try {
      await EscopoSessao.ler(context).aceitarTermos('${t.versao}|${p.versao}');
    } finally {
      if (mounted) setState(() => _gravando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = _termos;
    final p = _privacidade;
    if (t == null || p == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Termos e privacidade')),
        body: _falha != null
            ? Estado(icone: Icons.cloud_off, titulo: 'Não foi possível carregar os termos', texto: _falha, botao: 'Tentar de novo', aoTocar: _carregar)
            : const Center(child: CircularProgressIndicator()),
      );
    }
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Termos e privacidade'),
          bottom: const TabBar(tabs: [Tab(text: 'Termos de uso'), Tab(text: 'Política de privacidade')]),
        ),
        body: SafeArea(
          child: Column(children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 12, 20, 4),
              child: Faixa('Leia os dois textos e aceite para continuar. Sem o aceite não é possível entrar nem criar a conta do estabelecimento.'),
            ),
            Expanded(
              child: TabBarView(children: [
                ListView(padding: const EdgeInsets.fromLTRB(20, 8, 20, 20), children: [
                  if (!t.revisadoPorAdvogado) ...[
                    const Faixa('Este texto é uma minuta técnica e ainda não foi aprovado por advogado. Ele pode mudar depois da revisão jurídica.', tipo: TipoFaixa.atencao),
                    const SizedBox(height: 14),
                  ],
                  ...blocosDeTexto(t.conteudo),
                ]),
                ListView(padding: const EdgeInsets.fromLTRB(20, 8, 20, 20), children: blocosDeTexto(p.conteudo)),
              ]),
            ),
            Material(
              color: Cores.cartao,
              child: Container(
              padding: const EdgeInsets.fromLTRB(12, 6, 20, 14),
              decoration: const BoxDecoration(border: Border(top: BorderSide(color: Cores.borda))),
              child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                CheckboxListTile(
                  key: const ValueKey('aceite-inicial'),
                  value: _li,
                  onChanged: (v) => setState(() => _li = v ?? false),
                  controlAffinity: ListTileControlAffinity.leading,
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Li e aceito os Termos de uso e a Política de privacidade e de dados'),
                ),
                Row(children: [
                  Expanded(flex: 2, child: OutlinedButton(onPressed: () => SystemNavigator.pop(), child: const Text('Não aceito'))),
                  const SizedBox(width: 12),
                  Expanded(flex: 3, child: BotaoPrincipal(texto: 'Aceitar e continuar', carregando: _gravando, aoTocar: _li ? _aceitar : null)),
                ]),
              ]),
            ),
            ),
          ]),
        ),
      ),
    );
  }
}
