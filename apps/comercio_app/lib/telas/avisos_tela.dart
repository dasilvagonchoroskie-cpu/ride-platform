import 'package:flutter/material.dart';

import '../core/formato.dart';
import '../core/tema.dart';
import '../dados/modelos.dart';
import '../estado/escopo.dart';
import '../widgets/comuns.dart';
import 'entrega_tela.dart';

/// Caixa de avisos do estabelecimento: cadastro, decisoes da Central e andamento
/// das entregas. Vem da caixa de notificacoes da plataforma; cada conta ve so os seus.
class AvisosTela extends StatefulWidget {
  const AvisosTela({super.key});

  @override
  State<AvisosTela> createState() => _AvisosTelaState();
}

class _AvisosTelaState extends State<AvisosTela> {
  List<Aviso>? _itens;
  String? _falha;
  bool _ocupado = false;

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
      final caixa = await s.servidor.avisos();
      if (mounted) setState(() => _itens = caixa.itens);
    } catch (e) {
      if (mounted) setState(() => _falha = mensagemDe(e));
    }
  }

  Future<void> _abrir(Aviso a) async {
    final s = EscopoSessao.ler(context);
    final navegador = Navigator.of(context);
    if (!a.lido) {
      setState(() => _itens = _itens?.map((x) => x.id == a.id ? Aviso(id: x.id, titulo: x.titulo, texto: x.texto, tipo: x.tipo, criadoEm: x.criadoEm, lido: true, rideId: x.rideId) : x).toList());
      try {
        await s.servidor.marcarAvisosLidos([a.id]);
      } catch (_) {
        // Fica lido na tela; o servidor marca na proxima vez.
      }
    }
    final ride = a.rideId;
    if (a.ehDeEntrega && ride != null && ride.isNotEmpty) {
      await navegador.push(MaterialPageRoute<void>(builder: (_) => EntregaTela(id: ride)));
    }
  }

  Future<void> _marcarTodas() async {
    final itens = _itens;
    if (itens == null || _ocupado) return;
    final naoLidos = itens.where((a) => !a.lido).map((a) => a.id).toList();
    if (naoLidos.isEmpty) return;
    final s = EscopoSessao.ler(context);
    setState(() => _ocupado = true);
    try {
      await s.servidor.marcarAvisosLidos(naoLidos);
      await _carregar();
    } catch (e) {
      if (mounted) avisar(context, mensagemDe(e));
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  Future<void> _apagarTodas() async {
    final itens = _itens;
    if (itens == null || itens.isEmpty || _ocupado) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: const Text('Apagar todos os avisos?'),
        content: const Text('Eles somem só da sua caixa de avisos. As entregas e o histórico não mudam.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(d, false), child: const Text('Manter')),
          TextButton(onPressed: () => Navigator.pop(d, true), child: const Text('Apagar')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final s = EscopoSessao.ler(context);
    setState(() => _ocupado = true);
    try {
      await s.servidor.apagarAvisos(itens.map((a) => a.id).toList());
      await _carregar();
    } catch (e) {
      if (mounted) avisar(context, mensagemDe(e));
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  IconData _icone(Aviso a) => switch (a.tipo) {
        'comercio-entrega' => Icons.local_shipping_outlined,
        'comercio-decisao' => Icons.verified_outlined,
        _ => Icons.storefront_outlined,
      };

  @override
  Widget build(BuildContext context) {
    final itens = _itens;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Avisos'),
        actions: [
          if (itens != null && itens.any((a) => !a.lido)) IconButton(tooltip: 'Marcar todos como lidos', onPressed: _ocupado ? null : _marcarTodas, icon: const Icon(Icons.done_all)),
          if (itens != null && itens.isNotEmpty) IconButton(tooltip: 'Apagar todos', onPressed: _ocupado ? null : _apagarTodas, icon: const Icon(Icons.delete_outline)),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _carregar,
        child: itens == null
            ? (_falha != null
                ? ListView(children: [Estado(icone: Icons.cloud_off, titulo: 'Não foi possível carregar', texto: _falha, botao: 'Tentar de novo', aoTocar: _carregar)])
                : const Center(child: CircularProgressIndicator()))
            : itens.isEmpty
                ? ListView(children: const [Estado(icone: Icons.notifications_none, titulo: 'Nenhum aviso ainda', texto: 'Aqui aparecem a decisão do seu cadastro e o andamento das entregas.')])
                : ListView.separated(
                    padding: const EdgeInsets.fromLTRB(0, 8, 0, 24),
                    itemCount: itens.length,
                    separatorBuilder: (context, indice) => const Divider(height: 1),
                    itemBuilder: (context, i) {
                      final a = itens[i];
                      return Material(
                        color: Colors.transparent,
                        child: ListTile(
                          key: ValueKey('aviso-${a.id}'),
                          leading: Icon(_icone(a), color: a.lido ? Cores.textoFraco : Cores.loja),
                          title: Text(a.titulo, style: TextStyle(fontWeight: a.lido ? FontWeight.w500 : FontWeight.w800)),
                          subtitle: Text([a.texto, if (a.criadoEm != null) Formato.dataHora(a.criadoEm!.toIso8601String())].join('\n')),
                          isThreeLine: true,
                          trailing: a.lido ? null : const Icon(Icons.circle, size: 10, color: Cores.ouro),
                          onTap: () => _abrir(a),
                        ),
                      );
                    },
                  ),
      ),
    );
  }
}
