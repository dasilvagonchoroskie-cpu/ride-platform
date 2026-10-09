import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/central_theme.dart';
import '../data/painel.dart';
import '../widgets/ui.dart';
import 'comuns.dart';
import 'painel_state.dart';
import 'relatorio_pdf.dart';

/// Financeiro: saques PIX dos motoristas e relatorio de receitas.
class Financeiro extends StatelessWidget {
  const Financeiro({super.key});

  @override
  Widget build(BuildContext context) {
    return const DefaultTabController(
      length: 2,
      child: Column(
        children: [
          TabBar(tabs: [Tab(text: 'Saques PIX'), Tab(text: 'Receitas')]),
          Expanded(child: TabBarView(children: [_Saques(), _Receitas()])),
        ],
      ),
    );
  }
}

class _Saques extends StatefulWidget {
  const _Saques();

  @override
  State<_Saques> createState() => _SaquesState();
}

class _SaquesState extends State<_Saques> {
  late Future<List<Saque>> _lista;

  PainelApi get _api => Provider.of<PainelState>(context, listen: false).api;

  @override
  void initState() {
    super.initState();
    _lista = _api.saques();
  }

  void _recarregar() => setState(() { _lista = _api.saques(); });

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Saque>>(
      future: _lista,
      builder: (context, s) {
        if (s.hasError) return Aviso(texto: 'Não foi possível carregar: ${s.error}', tentarDeNovo: _recarregar);
        if (!s.hasData) return const Center(child: CircularProgressIndicator());
        final lista = [...s.data!]..sort((a, b) => (a.aberto ? 0 : 1).compareTo(b.aberto ? 0 : 1));
        if (lista.isEmpty) {
          return const Aviso(
            texto: 'Nenhum pedido de saque. O motorista pede pelo aplicativo dele o saldo que tiver na carteira.',
          );
        }
        return RefreshIndicator(
          onRefresh: () async => _recarregar(),
          child: ListView.separated(
            padding: const EdgeInsets.all(Spacing.md),
            itemCount: lista.length,
            separatorBuilder: (context, index) => const SizedBox(height: Spacing.sm),
            itemBuilder: (context, i) {
              final q = lista[i];
              final cor = q.aberto ? AppColors.warning : (q.status == 'PAID' ? AppColors.success : AppColors.danger);
              return Container(
                padding: const EdgeInsets.all(Spacing.md),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(Radii.md),
                  border: Border(left: BorderSide(color: cor, width: 4)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(child: Text(q.motorista, style: AppText.bodyStrong)),
                        Text(reais(q.valorCents), style: AppText.heading.copyWith(color: cor)),
                      ],
                    ),
                    Linha('Chave PIX', q.chavePix, destaque: true),
                    Linha('Situação', q.situacao),
                    Linha('Pedido em', dataHora(q.pedidoEm)),
                    if (q.feitoEm != null) Linha('Decidido em', dataHora(q.feitoEm)),
                    if (q.aberto) Linha('Saldo da carteira', reais(q.saldoCents)),
                    if (q.motivo != null) Linha('Motivo', q.motivo!),
                    if (q.aberto)
                      Wrap(
                        spacing: Spacing.sm,
                        children: [
                          FilledButton.icon(
                            icon: const Icon(Icons.check),
                            label: const Text('Já fiz o PIX'),
                            onPressed: () async {
                              final certo = await showDialog<bool>(
                                context: context,
                                builder: (ctx) => AlertDialog(
                                  backgroundColor: AppColors.surface,
                                  title: const Text('Confirmar saque'),
                                  content: Text(
                                    'Você já mandou ${reais(q.valorCents)} para a chave ${q.chavePix}? '
                                    'O valor sai da carteira do motorista.',
                                  ),
                                  actions: [
                                    TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Ainda não')),
                                    FilledButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Sim, já fiz')),
                                  ],
                                ),
                              );
                              if (certo != true || !context.mounted) return;
                              final ok = await tentar(context, () => _api.decidirSaque(q.id, true), sucesso: 'Saque confirmado.');
                              if (ok) _recarregar();
                            },
                          ),
                          OutlinedButton(
                            onPressed: () async {
                              final motivo = await pedirTexto(context, titulo: 'Recusar saque', confirmar: 'Recusar');
                              if (motivo == null || !context.mounted) return;
                              final ok = await tentar(context, () => _api.decidirSaque(q.id, false, motivo), sucesso: 'Saque recusado.');
                              if (ok) _recarregar();
                            },
                            child: const Text('Recusar'),
                          ),
                        ],
                      ),
                  ],
                ),
              );
            },
          ),
        );
      },
    );
  }
}

class _Receitas extends StatefulWidget {
  const _Receitas();

  @override
  State<_Receitas> createState() => _ReceitasState();
}

class _ReceitasState extends State<_Receitas> {
  int _dias = 1;
  late Future<Receitas> _dados;

  PainelApi get _api => Provider.of<PainelState>(context, listen: false).api;

  @override
  void initState() {
    super.initState();
    _dados = _api.receitas(_dias);
  }

  void _periodo(int dias) => setState(() {
        _dias = dias;
        _dados = _api.receitas(dias);
      });

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(Spacing.md),
      children: [
        // Evandro, 08/10/2026: "gerar o relatorio em PDF, por motorista e da frota toda".
        OutlinedButton.icon(
          onPressed: () => abrirRelatorioPdf(context),
          icon: const Icon(Icons.picture_as_pdf_outlined),
          label: const Text('Relatório em PDF (frota, cidade ou motorista)'),
          style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(46)),
        ),
        const SizedBox(height: Spacing.md),
        SegmentedButton<int>(
          segments: const [
            ButtonSegment(value: 1, label: Text('Hoje')),
            ButtonSegment(value: 7, label: Text('7 dias')),
            ButtonSegment(value: 30, label: Text('30 dias')),
          ],
          selected: {_dias},
          onSelectionChanged: (s) => _periodo(s.first),
        ),
        const SizedBox(height: Spacing.md),
        FutureBuilder<Receitas>(
          future: _dados,
          builder: (context, s) {
            if (s.hasError) return Aviso(texto: 'Não foi possível carregar: ${s.error}', tentarDeNovo: () => _periodo(_dias));
            if (!s.hasData) return const Padding(padding: EdgeInsets.all(Spacing.xl), child: Center(child: CircularProgressIndicator()));
            final r = s.data!;
            final periodo = _dias == 1 ? 'hoje' : 'nos últimos $_dias dias';
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // O que e da Central (Evandro, 09/10/2026): comissao de cada
                // corrida + mensalidades. O total das corridas e dos motoristas.
                MetricCard(
                  label: 'Ganho da Central $periodo',
                  value: reais(r.ganhoCentralCents),
                  icon: Icons.account_balance,
                  highlight: true,
                  helper: 'Comissão das corridas ${reais(r.comissaoCents)}'
                      '${r.mensalidadesCents > 0 ? ' + mensalidades ${reais(r.mensalidadesCents)}' : ''}',
                ),
                const SizedBox(height: Spacing.sm),
                Row(
                  children: [
                    _Cartao(rotulo: 'Total das corridas (${r.corridas})', valor: reais(r.totalCents), cor: AppColors.text),
                    const SizedBox(width: Spacing.sm),
                    _Cartao(
                      rotulo: 'Parte dos motoristas',
                      valor: reais(r.totalCents > r.comissaoCents ? r.totalCents - r.comissaoCents : 0),
                      cor: AppColors.text,
                    ),
                  ],
                ),
                const SizedBox(height: Spacing.sm),
                Row(
                  children: [
                    _Cartao(rotulo: 'Comissão da Central', valor: reais(r.comissaoCents), cor: AppColors.success),
                    const SizedBox(width: Spacing.sm),
                    _Cartao(rotulo: 'Mensalidades cobradas', valor: reais(r.mensalidadesCents), cor: AppColors.success),
                  ],
                ),
                const SizedBox(height: Spacing.sm),
                Row(
                  children: [
                    _Cartao(rotulo: 'Pago em dinheiro\n(em mãos do motorista)', valor: reais(r.dinheiroCents), cor: AppColors.warning),
                    const SizedBox(width: Spacing.sm),
                    _Cartao(rotulo: 'Pago via PIX / cartão / app', valor: reais(r.pixAppCents), cor: AppColors.primary),
                  ],
                ),

                const SizedBox(height: Spacing.sm),
                Row(
                  children: [
                    _Cartao(rotulo: 'Créditos vendidos', valor: reais(r.creditosVendidosCents), cor: AppColors.text),
                    const SizedBox(width: Spacing.sm),
                    _Cartao(rotulo: 'Saques PIX pagos', valor: reais(r.saquesPagosCents), cor: AppColors.text),
                  ],
                ),
                const SizedBox(height: Spacing.sm),
                _Cartao(rotulo: 'Descontos de cupom (pagos pela Central)', valor: reais(r.cuponsCents), cor: AppColors.textMuted, largo: true),
                const SizedBox(height: Spacing.md),
                const Text('Por forma de pagamento', style: AppText.heading),
                if (r.porForma.isEmpty)
                  Padding(
                    padding: const EdgeInsets.all(Spacing.md),
                    child: Text('Nenhuma corrida concluída no período.', style: AppText.caption.copyWith(color: AppColors.textMuted)),
                  ),
                for (final f in r.porForma)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(nomeDoPagamento(f.$1), style: AppText.body),
                    subtitle: Text('${f.$2} corrida(s)', style: AppText.caption.copyWith(color: AppColors.textMuted)),
                    trailing: Text(reais(f.$3), style: AppText.bodyStrong),
                  ),
              ],
            );
          },
        ),
      ],
    );
  }
}

class _Cartao extends StatelessWidget {
  const _Cartao({required this.rotulo, required this.valor, required this.cor, this.largo = false});

  final String rotulo;
  final String valor;
  final Color cor;
  final bool largo;

  @override
  Widget build(BuildContext context) {
    final caixa = Container(
      padding: const EdgeInsets.all(Spacing.md),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(Radii.md),
        boxShadow: AppColors.sombra,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(rotulo, style: AppText.caption.copyWith(color: AppColors.textMuted)),
          const SizedBox(height: Spacing.xs),
          Text(valor, style: AppText.heading.copyWith(color: cor)),
        ],
      ),
    );
    return largo ? caixa : Expanded(child: caixa);
  }
}
