import 'package:flutter/material.dart';

import '../core/atualizacao.dart';
import '../core/config.dart';
import '../estado/escopo.dart';
import '../telas/avisos_tela.dart';

/// Sino do app (a caixa de avisos da plataforma): mostra quantos avisos do
/// Comercio ainda nao foram lidos. Confere o servidor de tempos em tempos;
/// sem rede, mantem o ultimo numero (nunca inventa).
class SinoDeAvisos extends StatefulWidget {
  const SinoDeAvisos({super.key});

  @override
  State<SinoDeAvisos> createState() => _SinoDeAvisosState();
}

class _SinoDeAvisosState extends State<SinoDeAvisos> {
  int _naoLidos = 0;
  AtualizacaoPeriodica? _atualizacao;
  bool _conferindo = false;

  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      if (mounted) _conferir();
    });
    _atualizacao = AtualizacaoPeriodica(intervalo: AppConfig.atualizacaoDosAvisos, aoAtualizar: _conferir);
  }

  @override
  void dispose() {
    _atualizacao?.dispose();
    super.dispose();
  }

  Future<void> _conferir() async {
    if (_conferindo) return;
    _conferindo = true;
    final servidor = EscopoSessao.ler(context).servidor;
    try {
      final caixa = await servidor.avisos();
      if (mounted) setState(() => _naoLidos = caixa.naoLidos);
    } catch (_) {
      // Sem rede ou servidor ocupado: fica o ultimo numero.
    } finally {
      _conferindo = false;
    }
  }

  Future<void> _abrir() async {
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const AvisosTela()));
    if (mounted) _conferir();
  }

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: _naoLidos > 0 ? 'Avisos ($_naoLidos novos)' : 'Avisos',
      onPressed: _abrir,
      icon: Badge(
        isLabelVisible: _naoLidos > 0,
        label: Text(_naoLidos > 9 ? '9+' : '$_naoLidos'),
        child: const Icon(Icons.notifications_outlined),
      ),
    );
  }
}
