import 'package:flutter/material.dart';

import '../core/config.dart';
import '../core/formato.dart';
import '../core/tema.dart';
import '../estado/escopo.dart';
import '../widgets/comuns.dart';
import 'estabelecimento_tela.dart';
import 'termos_tela.dart';

/// Dados do estabelecimento, edicao e saida.
class ContaAba extends StatelessWidget {
  const ContaAba({super.key});

  @override
  Widget build(BuildContext context) {
    final s = EscopoSessao.de(context);
    final e = s.estabelecimento;
    if (e == null) return const SizedBox.shrink();
    return ListView(padding: const EdgeInsets.fromLTRB(20, 16, 20, 40), children: [
      const Text('Meu estabelecimento', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
      const SizedBox(height: 16),
      Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(e.nomeFantasia, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800))),
              const Selo('Aprovado', cor: Cores.ok),
            ]),
            const SizedBox(height: 8),
            Linha('Razão social', e.razaoSocial ?? ''),
            Linha('CNPJ', Formato.cnpj(e.cnpj)),
            Linha('Responsável', e.responsavelNome),
            Linha('Telefone', Formato.telefone(e.telefone)),
            Linha('E-mail', e.email),
            Linha('Endereço', e.endereco.porExtenso),
            Linha('Termos aceitos', e.termosVersao ?? ''),
          ]),
        ),
      ),
      if (!e.endereco.temLocalizacao) ...[
        const SizedBox(height: 12),
        const Faixa('O endereço ainda não tem localização no mapa. Edite e confirme o endereço para poder pedir entregas.', tipo: TipoFaixa.atencao),
      ],
      const SizedBox(height: 14),
      OutlinedButton.icon(
        onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const EstabelecimentoTela())),
        icon: const Icon(Icons.edit_outlined),
        label: const Text('Editar dados'),
      ),
      const SizedBox(height: 10),
      OutlinedButton.icon(
        onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const TermosTela())),
        icon: const Icon(Icons.article_outlined),
        label: const Text('Termos de uso'),
      ),
      const SizedBox(height: 10),
      OutlinedButton.icon(onPressed: s.sair, icon: const Icon(Icons.logout), label: const Text('Sair da conta')),
      const SizedBox(height: 20),
      Center(child: Text('Fortaleza Move Comércio · versão ${AppConfig.appVersion}', style: const TextStyle(color: Cores.textoFraco, fontSize: 12))),
    ]);
  }
}
