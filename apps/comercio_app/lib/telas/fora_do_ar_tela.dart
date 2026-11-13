import 'dart:async';

import 'package:flutter/material.dart';

import '../estado/escopo.dart';
import '../estado/sessao.dart';
import '../widgets/comuns.dart';

/// Tela unica quando a Central desliga o aplicativo Comercio (chave geral):
/// nada funciona enquanto estiver desligado, mesmo com o app instalado.
/// Confere sozinha de tempos em tempos e volta ao normal quando a Central liga.
class ForaDoArTela extends StatefulWidget {
  const ForaDoArTela({super.key, this.intervalo = const Duration(seconds: 30)});

  final Duration intervalo;

  @override
  State<ForaDoArTela> createState() => _ForaDoArTelaState();
}

class _ForaDoArTelaState extends State<ForaDoArTela> {
  Timer? _timer;
  bool _conferindo = false;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(widget.intervalo, (_) => _conferir());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _conferir() async {
    if (_conferindo || !mounted) return;
    setState(() => _conferindo = true);
    final Sessao s = EscopoSessao.ler(context);
    await s.atualizar();
    if (mounted) setState(() => _conferindo = false);
  }

  @override
  Widget build(BuildContext context) {
    final s = EscopoSessao.ler(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Fortaleza Move Comércio', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
        actions: [TextButton(onPressed: s.sair, child: const Text('Sair'))],
      ),
      body: SafeArea(
        child: Estado(
          icone: Icons.power_settings_new,
          titulo: 'Serviço temporariamente fora do ar',
          texto: 'O Comércio está desligado no momento. Assim que o serviço voltar, o aplicativo volta a funcionar sozinho. Você não precisa instalar nada de novo.',
          botao: _conferindo ? 'Conferindo…' : 'Verificar de novo',
          aoTocar: _conferindo ? null : _conferir,
        ),
      ),
    );
  }
}
