import 'package:flutter/material.dart';

import '../core/theme/central_theme.dart';
import '../data/painel.dart';
import '../widgets/ui.dart';
import 'comuns.dart';

/// Pedidos de exclusao de conta feitos pela pagina da internet (exigencia da
/// Google Play; 11/10/2026). A Central confere quem e e exclui, ou marca que
/// nao achou a conta. Prazo combinado na pagina: ate 7 dias.
class PedidosDeExclusaoScreen extends StatefulWidget {
  const PedidosDeExclusaoScreen({super.key, required this.api});

  final PainelApi api;

  @override
  State<PedidosDeExclusaoScreen> createState() => _PedidosDeExclusaoScreenState();
}

class _PedidosDeExclusaoScreenState extends State<PedidosDeExclusaoScreen> {
  late Future<List<PedidoDeExclusao>> _pedidos = widget.api.pedidosDeExclusao();

  void _recarregar() => setState(() {
        _pedidos = widget.api.pedidosDeExclusao();
      });

  Future<void> _excluir(PedidoDeExclusao p) async {
    final c = p.conta;
    if (c == null) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Excluir a conta de ${c.nome}?'),
        content: Text(
          c.motorista
              ? 'Sai o cadastro de motorista, os documentos, os carros e a carteira (o saldo se perde). '
                  'As corridas ficam no financeiro sem o nome. Não dá para desfazer.'
              : 'Saem nome, telefone, e-mail, CPF, foto e endereços. As corridas ficam no financeiro sem o nome. '
                  'Não dá para desfazer.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Voltar')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Excluir'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final feito = await tentar(context, () => widget.api.excluirContaDoPedido(p.id), sucesso: 'Conta de ${c.nome} excluída.');
    if (feito && mounted) _recarregar();
  }

  Future<void> _semConta(PedidoDeExclusao p) async {
    final obs = await pedirTexto(
      context,
      titulo: 'Marcar como atendido',
      rotulo: 'Observação (opcional)',
      explicacao: p.conta == null
          ? 'Nenhuma conta com "${p.contato}". Se puder, avise a pessoa por esse contato.'
          : 'O pedido sai da lista sem excluir a conta (ex.: a pessoa desistiu).',
      confirmar: 'Marcar',
      obrigatorio: false,
    );
    if (obs == null || !mounted) return;
    final feito = await tentar(
      context,
      () => widget.api.resolverPedidoDeExclusao(p.id, p.conta == null ? 'SEM_CONTA' : 'RESOLVIDO', observacao: obs),
      sucesso: 'Pedido marcado como atendido.',
    );
    if (feito && mounted) _recarregar();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Pedidos de exclusão de conta')),
      body: FutureBuilder<List<PedidoDeExclusao>>(
        future: _pedidos,
        builder: (context, s) {
          if (s.hasError) return Aviso(texto: 'Não foi possível carregar: ${s.error}', tentarDeNovo: _recarregar);
          if (!s.hasData) return const Center(child: CircularProgressIndicator());
          final lista = s.data!;
          if (lista.isEmpty) return const Aviso(texto: 'Nenhum pedido esperando.', icone: Icons.check_circle_outline);
          return ListView(
            padding: const EdgeInsets.all(Spacing.lg),
            children: [
              Text(
                'Pedidos feitos na página da internet. Confira quem é e atenda em até 7 dias.',
                style: AppText.body.copyWith(color: AppColors.textMuted),
              ),
              const SizedBox(height: Spacing.md),
              for (final p in lista)
                Padding(
                  padding: const EdgeInsets.only(bottom: Spacing.md),
                  child: AppCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(p.contato, style: AppText.heading),
                        Text(
                          'Pedido em ${dataHora(p.criadoEm)}',
                          style: AppText.caption.copyWith(color: AppColors.textMuted),
                        ),
                        if (p.motivo != null) ...[
                          const SizedBox(height: Spacing.xs),
                          Text('Motivo: ${p.motivo}', style: AppText.body),
                        ],
                        const SizedBox(height: Spacing.sm),
                        if (p.conta == null)
                          Text(
                            'Nenhuma conta com esse telefone ou e-mail.',
                            style: AppText.bodyStrong.copyWith(color: AppColors.warning),
                          )
                        else
                          Row(
                            children: [
                              Icon(p.conta!.motorista ? Icons.badge_outlined : Icons.person_outline, color: AppColors.brand),
                              const SizedBox(width: Spacing.sm),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      '${p.conta!.nome} · ${p.conta!.motorista ? 'motorista' : 'passageiro'}',
                                      style: AppText.bodyStrong,
                                    ),
                                    Text(
                                      [
                                        if (p.conta!.telefone != null) telefoneBonito(p.conta!.telefone),
                                        if (p.conta!.email != null) p.conta!.email!,
                                      ].join(' · '),
                                      style: AppText.caption.copyWith(color: AppColors.textMuted),
                                    ),
                                  ],
                                ),
                              ),
                              BotoesContato(telefone: p.conta!.telefone),
                            ],
                          ),
                        const SizedBox(height: Spacing.sm),
                        Row(
                          children: [
                            Expanded(
                              child: OutlinedButton(
                                onPressed: () => _semConta(p),
                                child: Text(p.conta == null ? 'Sem conta' : 'Não excluir'),
                              ),
                            ),
                            if (p.conta != null) ...[
                              const SizedBox(width: Spacing.sm),
                              Expanded(
                                child: FilledButton.icon(
                                  style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
                                  icon: const Icon(Icons.delete_outline),
                                  label: const Text('Excluir conta'),
                                  onPressed: () => _excluir(p),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}
