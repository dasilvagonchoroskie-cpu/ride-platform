import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/avisos.dart';
import '../core/theme/app_theme.dart';
import '../state/driver_state.dart';

/// Relatorio de faturamento em PDF (Evandro, 08/10/2026: "o motorista gerar
/// o relatorio dele, se precisar contabilizar alguma coisa").
///
/// Escolhe o periodo, pede o link ao servidor e abre no navegador do
/// celular, que mostra o PDF e deixa baixar ou compartilhar (WhatsApp,
/// e-mail, contador...).
Future<void> gerarRelatorioPdf(BuildContext context, DriverState d) async {
  final hoje = DateTime.now();
  final dia = DateTime(hoje.year, hoje.month, hoje.day);
  final escolha = await showModalBottomSheet<(DateTime, DateTime)?>(
    context: context,
    backgroundColor: AppColors.surface,
    showDragHandle: true,
    builder: (ctx) {
      Widget opcao(String texto, DateTime de, DateTime ate) => ListTile(
            leading: const Icon(Icons.calendar_month_outlined),
            title: Text(texto),
            onTap: () => Navigator.of(ctx).pop((de, ate)),
          );
      final inicioMes = DateTime(dia.year, dia.month, 1);
      final mesPassado = DateTime(dia.year, dia.month - 1, 1);
      return SafeArea(
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Padding(
                padding: EdgeInsets.fromLTRB(Spacing.lg, 0, Spacing.lg, Spacing.sm),
                child: Text('Relatório de faturamento em PDF', style: AppText.heading),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: Spacing.lg),
                child: Text(
                  'Corridas, valores, taxa da Central, seu líquido e a carteira no período. Abre no navegador para salvar ou compartilhar.',
                  style: AppText.caption.copyWith(color: AppColors.textMuted),
                ),
              ),
              const SizedBox(height: Spacing.sm),
              opcao('Hoje', dia, dia),
              opcao('Últimos 7 dias', dia.subtract(const Duration(days: 6)), dia),
              opcao('Este mês', inicioMes, dia),
              opcao('Mês passado', mesPassado, inicioMes.subtract(const Duration(days: 1))),
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
  if (escolha == null) return;
  final link = await d.linkDoRelatorio(escolha.$1, escolha.$2);
  if (link == null) return;
  final abriu = await launchUrl(Uri.parse(link), mode: LaunchMode.externalApplication);
  avisar(abriu
      ? 'Relatório aberto no navegador. Para guardar, toque em baixar ou compartilhar.'
      : 'Não foi possível abrir o navegador do celular.');
}
