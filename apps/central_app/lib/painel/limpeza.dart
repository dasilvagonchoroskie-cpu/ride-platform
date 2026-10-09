import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/central_theme.dart';
import '../data/painel.dart';
import '../widgets/ui.dart';
import 'cidades_equipe.dart' show confirmar;
import 'comuns.dart';
import 'painel_state.dart';

/// Limpeza de dados (so o dono) — Evandro, 08/10/2026: "esses registros que
/// foram de teste tem que eliminar, tem que limpar, tem que ter a opcao de
/// limpar ali tambem".
///
/// - Apagar dados de teste: contas do teste automatico e tudo delas.
/// - Zerar a operacao: comeca do zero antes de operar de verdade (corridas,
///   recargas, saques, SOS e avaliacoes). Contas, carros, documentos,
///   tarifas e configuracoes ficam. O servidor faz uma copia antes.
/// - Apagar contas escolhidas (as que nao tem corrida).
class LimpezaTela extends StatefulWidget {
  const LimpezaTela({super.key});

  @override
  State<LimpezaTela> createState() => _LimpezaTelaState();
}

class _LimpezaTelaState extends State<LimpezaTela> {
  ResumoLimpeza? _resumo;
  List<ContaParaLimpar>? _contas;
  final Set<String> _marcadas = {};
  final _busca = TextEditingController();
  String? _erro;
  bool _ocupado = false;

  PainelApi get _api => context.read<PainelState>().api;

  @override
  void initState() {
    super.initState();
    _carregar();
  }

  @override
  void dispose() {
    _busca.dispose();
    super.dispose();
  }

  Future<void> _carregar() async {
    setState(() => _erro = null);
    try {
      final r = await Future.wait([_api.resumoLimpeza(), _api.contasParaLimpar(_busca.text)]);
      if (!mounted) return;
      setState(() {
        _resumo = r[0] as ResumoLimpeza;
        _contas = r[1] as List<ContaParaLimpar>;
        _marcadas.removeWhere((id) => !_contas!.any((c) => c.id == id));
      });
    } catch (e) {
      if (mounted) setState(() => _erro = mensagemDe(e));
    }
  }

  Future<void> _rodar(Future<String> Function() acao) async {
    setState(() => _ocupado = true);
    try {
      final msg = await acao();
      if (mounted) avisar(context, msg);
      await _carregar();
      if (mounted) await context.read<PainelState>().atualizar();
    } catch (e) {
      if (mounted) avisar(context, mensagemDe(e), erro: true);
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  Future<void> _apagarTeste() async {
    final sim = await confirmar(
      context,
      'Apagar os dados de teste?',
      'Apaga as ${_resumo?.contasTeste ?? 0} contas criadas pelo teste automático e tudo delas (corridas, carteira, carros, documentos). Suas contas e as dos clientes ficam.',
      sim: 'Apagar dados de teste',
      perigo: true,
    );
    if (!sim || !mounted) return;
    await _rodar(() async {
      final r = await _api.apagarDadosDeTeste();
      return 'Pronto: ${r['contas'] ?? 0} contas e ${r['corridas'] ?? 0} corridas de teste apagadas.';
    });
  }

  Future<void> _zerar() async {
    final escrito = await pedirTexto(
      context,
      titulo: 'Zerar a operação',
      rotulo: 'Escreva ZERAR para confirmar',
      confirmar: 'Zerar agora',
      explicacao: 'Apaga TODAS as corridas, recargas, saques, alertas de SOS e avaliações, e deixa as carteiras em R\$ 0,00. '
          'Ficam as contas, carros, documentos, tarifas e configurações. O servidor guarda uma cópia antes. '
          'Use só para começar do zero antes de operar de verdade.',
    );
    if (escrito == null || !mounted) return;
    if (escrito.trim().toUpperCase() != 'ZERAR') {
      avisar(context, 'Não zerou: escreva ZERAR para confirmar.', erro: true);
      return;
    }
    await _rodar(() async {
      final r = await _api.zerarOperacao();
      return 'Operação zerada: ${r['corridas'] ?? 0} corridas e ${r['movimentos'] ?? 0} lançamentos apagados. Cópia guardada.';
    });
  }

  Future<void> _apagarMarcadas() async {
    final n = _marcadas.length;
    final sim = await confirmar(
      context,
      'Apagar $n conta(s)?',
      'A pessoa perde o acesso e os dados dela somem. Conta que já tem corrida no histórico não é apagada (zere a operação antes ou bloqueie).',
      sim: 'Apagar',
      perigo: true,
    );
    if (!sim || !mounted) return;
    await _rodar(() async {
      final r = await _api.apagarContas(_marcadas.toList());
      _marcadas.clear();
      final recusadas = (r['recusadas'] as List? ?? const []).length;
      return 'Apagadas: ${r['contas'] ?? 0}.${recusadas > 0 ? ' $recusadas ficaram (têm corridas no histórico).' : ''}';
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_erro != null) return Aviso(texto: 'Não foi possível carregar: $_erro', tentarDeNovo: _carregar);
    final r = _resumo;
    final contas = _contas;
    if (r == null || contas == null) return const Center(child: CircularProgressIndicator());

    Widget linha(String rotulo, int n) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 2),
          child: Row(
            children: [
              Expanded(child: Text(rotulo, style: AppText.body.copyWith(color: AppColors.textMuted))),
              Text('$n', style: AppText.bodyStrong),
            ],
          ),
        );

    return RefreshIndicator(
      onRefresh: _carregar,
      child: ListView(
        padding: const EdgeInsets.all(Spacing.md),
        children: [
          Card(
            color: AppColors.surface,
            child: Padding(
              padding: const EdgeInsets.all(Spacing.md),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text('O que tem no sistema', style: AppText.heading),
                  const SizedBox(height: Spacing.sm),
                  linha('Contas do teste automático', r.contasTeste),
                  linha('Contas de passageiros e motoristas', r.contas),
                  linha('Corridas', r.corridas),
                  linha('Lançamentos de carteira', r.movimentos),
                  linha('Saques', r.saques),
                  linha('Alertas de SOS', r.sos),
                  linha('Avaliações', r.avaliacoes),
                  if (r.ultimaCopia != null) ...[
                    const SizedBox(height: Spacing.sm),
                    Text('Última cópia de segurança: ${r.ultimaCopia}', style: AppText.caption.copyWith(color: AppColors.textMuted)),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: Spacing.md),
          FilledButton.icon(
            onPressed: _ocupado || r.contasTeste == 0 ? null : _apagarTeste,
            icon: const Icon(Icons.cleaning_services_outlined),
            label: Text(r.contasTeste == 0 ? 'Nenhum dado de teste' : 'Apagar dados de teste (${r.contasTeste})'),
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
          ),
          const SizedBox(height: Spacing.sm),
          OutlinedButton.icon(
            onPressed: _ocupado ? null : _zerar,
            icon: const Icon(Icons.restart_alt, color: AppColors.danger),
            label: const Text('Zerar a operação (começar do zero)', style: TextStyle(color: AppColors.danger)),
            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48), side: const BorderSide(color: AppColors.danger)),
          ),
          if (_ocupado) ...[
            const SizedBox(height: Spacing.md),
            const LinearProgressIndicator(),
          ],
          const SizedBox(height: Spacing.lg),
          const Text('Contas', style: AppText.heading),
          const SizedBox(height: Spacing.sm),
          TextField(
            controller: _busca,
            textInputAction: TextInputAction.search,
            onSubmitted: (_) => _carregar(),
            decoration: InputDecoration(
              prefixIcon: const Icon(Icons.search),
              hintText: 'Buscar por nome, telefone ou e-mail',
              suffixIcon: IconButton(icon: const Icon(Icons.arrow_forward), onPressed: _carregar),
            ),
          ),
          const SizedBox(height: Spacing.sm),
          if (_marcadas.isNotEmpty)
            FilledButton.icon(
              onPressed: _ocupado ? null : _apagarMarcadas,
              style: FilledButton.styleFrom(backgroundColor: AppColors.danger, minimumSize: const Size.fromHeight(46)),
              icon: const Icon(Icons.delete_outline),
              label: Text('Apagar ${_marcadas.length} conta(s) marcada(s)'),
            ),
          for (final c in contas)
            CheckboxListTile(
              value: _marcadas.contains(c.id),
              onChanged: (v) => setState(() => v == true ? _marcadas.add(c.id) : _marcadas.remove(c.id)),
              controlAffinity: ListTileControlAffinity.leading,
              contentPadding: EdgeInsets.zero,
              title: Row(
                children: [
                  Flexible(child: Text(c.nome, overflow: TextOverflow.ellipsis, style: AppText.bodyStrong)),
                  if (c.teste) ...[
                    const SizedBox(width: Spacing.xs),
                    const AppBadge(text: 'TESTE', tone: AppBadgeTone.warning),
                  ],
                ],
              ),
              subtitle: Text(
                [
                  c.motorista ? 'Motorista' : 'Passageiro',
                  if (c.telefone.isNotEmpty) telefoneBonito(c.telefone),
                  if (c.email.isNotEmpty) c.email,
                  '${c.corridas} corrida(s)',
                ].join(' · '),
                style: AppText.caption.copyWith(color: AppColors.textMuted),
              ),
            ),
          if (contas.isEmpty)
            const Padding(padding: EdgeInsets.all(Spacing.lg), child: Text('Nenhuma conta encontrada.', textAlign: TextAlign.center)),
          const SizedBox(height: Spacing.xl),
        ],
      ),
    );
  }
}
