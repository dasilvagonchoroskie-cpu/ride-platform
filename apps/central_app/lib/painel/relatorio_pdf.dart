import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/alarme.dart';
import '../core/config/app_config.dart';
import '../core/theme/central_theme.dart';
import '../data/painel.dart';
import 'comuns.dart';
import 'painel_state.dart';

/// Relatorio de faturamento em PDF pela Central (Evandro, 08/10/2026: "por
/// motorista, individual, e da frota toda").
///
/// Com [driverId]: o relatorio daquele motorista. Sem: pergunta se e a frota
/// toda, uma cidade (dono com varias cidades) ou um motorista. Depois o
/// periodo. O PDF abre no navegador do celular, que deixa salvar e
/// compartilhar.
Future<void> abrirRelatorioPdf(BuildContext context, {String? driverId, String? nomeMotorista}) async {
  final painel = context.read<PainelState>();
  String tipo = 'motorista';
  String? motorista = driverId;
  String? praca;
  String titulo = nomeMotorista ?? 'Motorista';

  if (driverId == null) {
    final eu = painel.eu;
    final List<Praca> cidades = eu != null && eu.dono ? eu.pracas : const <Praca>[];
    final escolha = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: AppColors.surface,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Padding(
                padding: EdgeInsets.fromLTRB(Spacing.lg, 0, Spacing.lg, Spacing.sm),
                child: Text('Relatório de faturamento em PDF', style: AppText.heading),
              ),
              ListTile(
                leading: const Icon(Icons.groups_outlined),
                title: Text(eu == null || eu.dono ? 'Frota toda' : 'Frota de ${eu.pracaNome ?? 'minha cidade'}'),
                subtitle: const Text('Totais, por motorista e todas as corridas'),
                onTap: () => Navigator.of(ctx).pop('frota'),
              ),
              if (cidades.length > 1)
                for (final c in cidades)
                  ListTile(
                    leading: const Icon(Icons.location_city_outlined),
                    title: Text('Só ${c.rotulo}'),
                    onTap: () => Navigator.of(ctx).pop('praca:${c.id}'),
                  ),
              ListTile(
                leading: const Icon(Icons.person_outline),
                title: const Text('Um motorista'),
                subtitle: const Text('O faturamento de um motorista só'),
                onTap: () => Navigator.of(ctx).pop('motorista'),
              ),
            ],
          ),
        ),
      ),
    );
    if (escolha == null || !context.mounted) return;
    if (escolha == 'frota') {
      tipo = 'frota';
      titulo = 'Frota';
    } else if (escolha.startsWith('praca:')) {
      tipo = 'praca';
      praca = escolha.substring(6);
      titulo = cidades.where((c) => c.id == praca).map((c) => c.rotulo).firstOrNull ?? 'Cidade';
    } else {
      List<MotoristaCadastro> lista;
      try {
        lista = await painel.api.motoristas('APPROVED');
      } catch (e) {
        if (context.mounted) avisar(context, mensagemDe(e), erro: true);
        return;
      }
      if (!context.mounted) return;
      if (lista.isEmpty) {
        avisar(context, 'Nenhum motorista aprovado ainda.');
        return;
      }
      final m = await showModalBottomSheet<(String, String)>(
        context: context,
        backgroundColor: AppColors.surface,
        showDragHandle: true,
        isScrollControlled: true,
        builder: (ctx) => SafeArea(
          child: ConstrainedBox(
            constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(ctx).height * 0.75),
            child: ListView(
              shrinkWrap: true,
              children: [
                const Padding(
                  padding: EdgeInsets.fromLTRB(Spacing.lg, 0, Spacing.lg, Spacing.sm),
                  child: Text('Escolha o motorista', style: AppText.heading),
                ),
                for (final x in lista)
                  ListTile(
                    leading: const Icon(Icons.person_outline),
                    title: Text(x.nome),
                    subtitle: Text(telefoneBonito(x.telefone)),
                    onTap: () => Navigator.of(ctx).pop((x.id, x.nome)),
                  ),
              ],
            ),
          ),
        ),
      );
      if (m == null || !context.mounted) return;
      motorista = m.$1;
      titulo = m.$2;
    }
  }

  final periodo = await escolherPeriodo(context, titulo: 'Relatório: $titulo');
  if (periodo == null || !context.mounted) return;
  try {
    final caminho = await painel.api.linkDoRelatorio(
      tipo: tipo,
      driverId: motorista,
      pracaId: praca,
      de: periodo.$1,
      ate: periodo.$2,
    );
    await Alarme.abrir('${AppConfig.apiUrl}$caminho');
    if (context.mounted) avisar(context, 'Relatório aberto no navegador. Para guardar, toque em baixar ou compartilhar.');
  } catch (e) {
    if (context.mounted) avisar(context, mensagemDe(e), erro: true);
  }
}

/// Hoje, 7 dias, este mes, mes passado ou datas escolhidas.
Future<(DateTime, DateTime)?> escolherPeriodo(BuildContext context, {required String titulo}) {
  final agora = DateTime.now();
  final dia = DateTime(agora.year, agora.month, agora.day);
  final inicioMes = DateTime(dia.year, dia.month, 1);
  return showModalBottomSheet<(DateTime, DateTime)>(
    context: context,
    backgroundColor: AppColors.surface,
    showDragHandle: true,
    builder: (ctx) {
      Widget opcao(String texto, DateTime de, DateTime ate) => ListTile(
            leading: const Icon(Icons.calendar_month_outlined),
            title: Text(texto),
            onTap: () => Navigator.of(ctx).pop((de, ate)),
          );
      return SafeArea(
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(Spacing.lg, 0, Spacing.lg, Spacing.sm),
                child: Text(titulo, style: AppText.heading, maxLines: 2, overflow: TextOverflow.ellipsis),
              ),
              opcao('Hoje', dia, dia),
              opcao('Últimos 7 dias', dia.subtract(const Duration(days: 6)), dia),
              opcao('Este mês', inicioMes, dia),
              opcao('Mês passado', DateTime(dia.year, dia.month - 1, 1), inicioMes.subtract(const Duration(days: 1))),
              ListTile(
                leading: const Icon(Icons.date_range),
                title: const Text('Escolher as datas'),
                onTap: () async {
                  final r = await showDateRangePicker(
                    context: ctx,
                    firstDate: DateTime(2026, 1, 1),
                    lastDate: dia,
                    initialDateRange: DateTimeRange(start: inicioMes, end: dia),
                    helpText: 'Período do relatório',
                    saveText: 'Gerar',
                  );
                  if (r != null && ctx.mounted) Navigator.of(ctx).pop((r.start, r.end));
                },
              ),
            ],
          ),
        ),
      );
    },
  );
}
