import 'package:flutter/material.dart';

import '../core/atualizacao.dart';
import '../core/config.dart';
import '../core/formato.dart';
import '../core/tema.dart';
import '../dados/modelos.dart';
import '../estado/escopo.dart';
import '../widgets/comuns.dart';
import '../widgets/sino_de_avisos.dart';

/// Cadastro enviado, mas ainda sem permissao para pedir entregas:
/// aguardando aprovacao, rejeitado ou suspenso.
class StatusTela extends StatefulWidget {
  const StatusTela({super.key});

  @override
  State<StatusTela> createState() => _StatusTelaState();
}

class _StatusTelaState extends State<StatusTela> {
  bool _atualizando = false;
  AtualizacaoPeriodica? _atualizacao;

  @override
  void initState() {
    super.initState();
    // Aprovacao e suspensao saem da Central a qualquer hora: confere sozinho (so com o app aberto).
    _atualizacao = AtualizacaoPeriodica(
      intervalo: AppConfig.atualizacaoDosAvisos,
      aoAtualizar: () {
        if (!_atualizando) _atualizar();
      },
    );
  }

  @override
  void dispose() {
    _atualizacao?.dispose();
    super.dispose();
  }

  Future<void> _atualizar() async {
    final s = EscopoSessao.ler(context);
    setState(() => _atualizando = true);
    await s.atualizar();
    if (mounted) setState(() => _atualizando = false);
  }

  @override
  Widget build(BuildContext context) {
    final s = EscopoSessao.de(context);
    final e = s.estabelecimento!;
    final (cor, icone, titulo) = switch (e.situacao) {
      Situacao.aguardando => (Cores.aviso, Icons.hourglass_top_rounded, 'Cadastro em análise'),
      Situacao.suspenso => (Cores.perigo, Icons.pause_circle_outline, 'Estabelecimento suspenso'),
      Situacao.rejeitado => (Cores.perigo, Icons.cancel_outlined, 'Cadastro não aprovado'),
      _ => (Cores.loja, Icons.info_outline, e.situacaoRotulo),
    };
    return Scaffold(
      appBar: AppBar(
        title: const Text('Fortaleza Move Comércio'),
        actions: [const SinoDeAvisos(), TextButton(onPressed: s.sair, child: const Text('Sair'))],
      ),
      body: RefreshIndicator(
        onRefresh: _atualizar,
        child: ListView(padding: const EdgeInsets.all(20), children: [
          const SizedBox(height: 16),
          Icon(icone, size: 64, color: cor),
          const SizedBox(height: 14),
          Text(titulo, textAlign: TextAlign.center, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
          const SizedBox(height: 10),
          Text(
            e.situacaoRotulo,
            textAlign: TextAlign.center,
            style: const TextStyle(color: Cores.textoSuave, height: 1.4),
          ),
          if ((e.motivo ?? '').isNotEmpty) ...[
            const SizedBox(height: 16),
            Faixa('Motivo informado pela Central: ${e.motivo}', tipo: TipoFaixa.atencao),
          ],
          if (s.falha != null) ...[const SizedBox(height: 16), Faixa(s.falha!, tipo: TipoFaixa.erro)],
          const SizedBox(height: 22),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(e.nomeFantasia, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                Linha('CNPJ', Formato.cnpj(e.cnpj)),
                Linha('Responsável', e.responsavelNome),
                Linha('Telefone', Formato.telefone(e.telefone)),
                Linha('Endereço', e.endereco.porExtenso),
              ]),
            ),
          ),
          const SizedBox(height: 20),
          BotaoPrincipal(texto: 'Atualizar situação', carregando: _atualizando, aoTocar: _atualizar),
        ]),
      ),
    );
  }
}
