import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api/api_client.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../state/driver_state.dart';

int _int(Object? v) => v is num ? v.toInt() : int.tryParse('$v') ?? 0;

/// Historico de corridas e desempenho: concluidas de hoje, da semana ou do
/// mes, com origem, destino, valor, data e taxa descontada; e as metricas
/// de aceitacao, cancelamentos e nota.
class RidesHistoryScreen extends StatefulWidget {
  const RidesHistoryScreen({super.key});

  @override
  State<RidesHistoryScreen> createState() => _RidesHistoryScreenState();
}

class _RidesHistoryScreenState extends State<RidesHistoryScreen> {
  String _periodo = 'day';
  Map<String, dynamic>? _dados;
  String? _erro;

  @override
  void initState() {
    super.initState();
    _carregar();
  }

  Future<void> _carregar() async {
    setState(() {
      _dados = null;
      _erro = null;
    });
    try {
      final r = await context.read<DriverState>().api.request(
        'GET',
        '/driver/rides/history',
        query: {'period': _periodo, 'pageSize': '100'},
      ) as Map<String, dynamic>;
      if (mounted) setState(() => _dados = r);
    } on ApiException catch (e) {
      if (mounted) setState(() => _erro = e.message);
    } catch (_) {
      if (mounted) setState(() => _erro = 'Sem conexão com o servidor.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = _dados;
    final soma = (r?['summary'] as Map?) ?? const {};
    final des = (r?['performance'] as Map?) ?? const {};
    final itens = ((r?['items'] as List?) ?? const []).whereType<Map<String, dynamic>>().toList();
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Histórico de corridas')),
      body: RefreshIndicator(
        onRefresh: _carregar,
        child: ListView(
          padding: const EdgeInsets.all(Spacing.lg),
          children: [
            SegmentedButton<String>(
              showSelectedIcon: false,
              segments: const [
                ButtonSegment(value: 'day', label: Text('Hoje')),
                ButtonSegment(value: 'week', label: Text('Esta semana')),
                ButtonSegment(value: 'month', label: Text('Este mês')),
              ],
              selected: {_periodo},
              onSelectionChanged: (s) {
                _periodo = s.first;
                _carregar();
              },
            ),
            const SizedBox(height: Spacing.md),
            if (_erro != null)
              Text(_erro!, style: AppText.body.copyWith(color: AppColors.danger))
            else if (r == null)
              const Padding(padding: EdgeInsets.all(Spacing.xl), child: Center(child: CircularProgressIndicator()))
            else ...[
              Row(
                children: [
                  _Numero(rotulo: 'Corridas', valor: '${_int(soma['rides'])}'),
                  const SizedBox(width: Spacing.sm),
                  _Numero(rotulo: 'Valor total', valor: formatMoney(_int(soma['totalCents']))),
                ],
              ),
              const SizedBox(height: Spacing.sm),
              Row(
                children: [
                  _Numero(rotulo: 'Taxa descontada', valor: formatMoney(_int(soma['commissionCents'])), cor: AppColors.danger),
                  const SizedBox(width: Spacing.sm),
                  _Numero(rotulo: 'Seu líquido', valor: formatMoney(_int(soma['netCents'])), cor: AppColors.primary),
                ],
              ),
              const SizedBox(height: Spacing.sm),
              Row(
                children: [
                  _Numero(rotulo: 'Aceitação de chamadas', valor: '${_int(des['acceptanceRate'])}%'),
                  const SizedBox(width: Spacing.sm),
                  _Numero(rotulo: 'Cancelamentos', valor: '${_int(des['cancellations'])}'),
                  const SizedBox(width: Spacing.sm),
                  _Numero(rotulo: 'Sua nota', valor: '★ ${(des['ratingAvg'] as num? ?? 5).toStringAsFixed(1)}'),
                ],
              ),
              const SizedBox(height: Spacing.lg),
              if (itens.isEmpty)
                Text('Nenhuma corrida concluída neste período.', style: AppText.body.copyWith(color: AppColors.textMuted)),
              for (final c in itens) _Corrida(c: c),
            ],
          ],
        ),
      ),
    );
  }
}

class _Numero extends StatelessWidget {
  const _Numero({required this.rotulo, required this.valor, this.cor = AppColors.text});

  final String rotulo;
  final String valor;
  final Color cor;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(Spacing.md),
        decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(Radii.md)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(rotulo, maxLines: 2, style: AppText.caption.copyWith(color: AppColors.textMuted)),
            FittedBox(fit: BoxFit.scaleDown, child: Text(valor, style: AppText.heading.copyWith(color: cor))),
          ],
        ),
      ),
    );
  }
}

class _Corrida extends StatelessWidget {
  const _Corrida({required this.c});

  final Map<String, dynamic> c;

  @override
  Widget build(BuildContext context) {
    final valor = _int(c['finalFareCents'] ?? c['estimatedFareCents']);
    final taxa = _int(c['commissionCents']);
    final quando = c['finishedAt'] ?? c['requestedAt'];
    return Container(
      margin: const EdgeInsets.only(bottom: Spacing.sm),
      padding: const EdgeInsets.all(Spacing.md),
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(Radii.md)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${quando == null ? '' : formatDateTime('$quando')} · ${c['code'] ?? ''}',
                  style: AppText.caption.copyWith(color: AppColors.textMuted),
                ),
              ),
              Text(formatMoney(valor), style: AppText.bodyStrong),
            ],
          ),
          const SizedBox(height: Spacing.xs),
          Text('De: ${c['pickupAddress'] ?? '-'}', style: AppText.body),
          Text('Para: ${c['dropoffAddress'] ?? '-'}', style: AppText.body),
          Text('Taxa descontada: ${formatMoney(taxa)} · Líquido: ${formatMoney(valor - taxa)}',
              style: AppText.caption.copyWith(color: AppColors.textMuted)),
        ],
      ),
    );
  }
}
