import 'dart:async';

import 'package:flutter/material.dart';

import '../core/config.dart';
import '../core/tema.dart';
import '../dados/modelos.dart';
import '../estado/escopo.dart';
import '../widgets/cartao_entrega.dart';
import '../widgets/comuns.dart';
import 'entrega_tela.dart';

/// Entregas em andamento (as abertas), com atualizacao automatica.
class InicioAba extends StatefulWidget {
  const InicioAba({super.key, required this.aoNovaEntrega});

  final VoidCallback aoNovaEntrega;

  @override
  State<InicioAba> createState() => _InicioAbaState();
}

class _InicioAbaState extends State<InicioAba> {
  List<Entrega>? _abertas;
  String? _falha;
  Timer? _timer;
  bool _carregando = false;

  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      if (mounted) _carregar();
    });
    _timer = Timer.periodic(AppConfig.atualizacao * 2, (_) => _carregar(silencioso: true));
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _carregar({bool silencioso = false}) async {
    if (_carregando) return;
    _carregando = true;
    final s = EscopoSessao.ler(context);
    try {
      final h = await s.servidor.historico(1);
      if (!mounted) return;
      setState(() {
        _abertas = h.itens.where((e) => !e.final_).toList();
        _falha = null;
      });
    } catch (e) {
      if (mounted && !silencioso) setState(() => _falha = mensagemDe(e));
      if (mounted && silencioso && _abertas == null) setState(() => _falha = mensagemDe(e));
    } finally {
      _carregando = false;
    }
  }

  Future<void> _abrir(Entrega e) async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => EntregaTela(inicial: e)));
    if (mounted) _carregar();
  }

  @override
  Widget build(BuildContext context) {
    final s = EscopoSessao.de(context);
    final nome = s.estabelecimento?.nomeFantasia ?? '';
    final lista = _abertas;
    return RefreshIndicator(
      onRefresh: _carregar,
      child: ListView(padding: const EdgeInsets.fromLTRB(20, 16, 20, 100), children: [
        Text(nome, style: const TextStyle(fontSize: 13, color: Cores.textoSuave, fontWeight: FontWeight.w600)),
        const Text('Entregas em andamento', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
        const SizedBox(height: 16),
        if (_falha != null && lista == null)
          Estado(icone: Icons.cloud_off, titulo: 'Sem conexão', texto: _falha, botao: 'Tentar de novo', aoTocar: _carregar)
        else if (lista == null)
          const Padding(padding: EdgeInsets.only(top: 60), child: Center(child: CircularProgressIndicator()))
        else if (lista.isEmpty)
          const Estado(icone: Icons.inventory_2_outlined, titulo: 'Nenhuma entrega em andamento', texto: 'Toque em "Nova entrega" para pedir a coleta e a entrega de uma encomenda.')
        else
          for (final e in lista) Padding(padding: const EdgeInsets.only(bottom: 12), child: CartaoDeEntrega(entrega: e, aoTocar: () => _abrir(e))),
      ]),
    );
  }
}
