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

class ComercioApp extends StatelessWidget {
  const ComercioApp({super.key, required this.sessao});

  final Sessao sessao;

  @override
  Widget build(BuildContext context) {
    return EscopoSessao(
      sessao: sessao,
      child: MaterialApp(
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
