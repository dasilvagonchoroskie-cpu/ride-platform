import 'package:flutter/material.dart';

import 'core/tema.dart';
import 'dados/modelos.dart';
import 'estado/escopo.dart';
import 'estado/sessao.dart';
import 'telas/cadastro_tela.dart';
import 'telas/entrada_tela.dart';
import 'telas/inicio_shell.dart';
import 'telas/status_tela.dart';
import 'widgets/comuns.dart';

class ComercioApp extends StatefulWidget {
  const ComercioApp({super.key, required this.sessao});

  final Sessao sessao;

  @override
  State<ComercioApp> createState() => _ComercioAppState();
}

class _ComercioAppState extends State<ComercioApp> {
  final _navegador = GlobalKey<NavigatorState>();
  late bool _logado;
  late bool _podeUsar;

  Sessao get sessao => widget.sessao;

  bool _calcularPodeUsar() => sessao.logado && (sessao.estabelecimento?.aprovado ?? false);

  @override
  void initState() {
    super.initState();
    _logado = sessao.logado;
    _podeUsar = _calcularPodeUsar();
    sessao.addListener(_aoMudar);
  }

  @override
  void dispose() {
    sessao.removeListener(_aoMudar);
    super.dispose();
  }

  /// Saiu da conta, o login venceu ou a Central suspendeu a loja: as telas abertas por cima
  /// (pedido, acompanhamento, avisos) saem e o Porteiro mostra a tela certa. So na MUDANCA,
  /// para nao fechar uma tela que a pessoa esta lendo a cada atualizacao.
  void _aoMudar() {
    final logado = sessao.logado;
    final podeUsar = _calcularPodeUsar();
    final perdeu = (_logado && !logado) || (_podeUsar && !podeUsar);
    _logado = logado;
    _podeUsar = podeUsar;
    if (perdeu) _navegador.currentState?.popUntil((r) => r.isFirst);
  }

  @override
  Widget build(BuildContext context) {
    return EscopoSessao(
      sessao: sessao,
      child: MaterialApp(
        navigatorKey: _navegador,
        title: 'Fortaleza Move Comércio',
        debugShowCheckedModeBanner: false,
        theme: Tema.escuro,
        home: const Porteiro(),
      ),
    );
  }
}

/// Decide a tela pela situacao: entrar -> cadastrar -> aguardar -> usar.
class Porteiro extends StatelessWidget {
  const Porteiro({super.key});

  @override
  Widget build(BuildContext context) {
    final s = EscopoSessao.de(context);
    if (s.iniciando) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    if (!s.logado) return const EntradaTela();
    if (!s.cadastrado) {
      if (s.falha != null) {
        return Scaffold(
          appBar: AppBar(actions: [TextButton(onPressed: s.sair, child: const Text('Sair'))]),
          body: Estado(icone: Icons.cloud_off, titulo: 'Não foi possível conferir o seu cadastro', texto: s.falha, botao: 'Tentar de novo', aoTocar: s.atualizar),
        );
      }
      return const CadastroTela();
    }
    if (s.estabelecimento!.situacao != Situacao.aprovado) return const StatusTela();
    return const InicioShell();
  }
}
