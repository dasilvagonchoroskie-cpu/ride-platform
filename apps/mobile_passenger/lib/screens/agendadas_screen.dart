import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/avisos.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../data/models/models.dart';
import '../state/ride_state.dart';

const _diasSemana = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

String _dois(int n) => n.toString().padLeft(2, '0');

/// "qui, 09/10 às 14:30" (com "hoje" e "amanhã" quando cabe).
String horarioAgendado(DateTime quando, [DateTime? agora]) {
  final hoje = DateUtils.dateOnly(agora ?? DateTime.now());
  final dia = DateUtils.dateOnly(quando);
  final diferenca = dia.difference(hoje).inDays;
  final hora = '${_dois(quando.hour)}:${_dois(quando.minute)}';
  if (diferenca == 0) return 'hoje às $hora';
  if (diferenca == 1) return 'amanhã às $hora';
  return '${_diasSemana[quando.weekday - 1]}, ${_dois(quando.day)}/${_dois(quando.month)} às $hora';
}

/// Pergunta o dia e a hora da corrida agendada (30 min a 7 dias a frente).
/// Devolve null se a pessoa desistir ou escolher um horario fora do prazo.
Future<DateTime?> escolherHorarioAgendado(BuildContext context, {DateTime? agora}) async {
  final base = agora ?? DateTime.now();
  final cedo = base.add(const Duration(minutes: 40));
  final dia = await showDatePicker(
    context: context,
    helpText: 'Dia da corrida',
    cancelText: 'Cancelar',
    confirmText: 'Próximo',
    initialDate: DateUtils.dateOnly(cedo),
    firstDate: DateUtils.dateOnly(base),
    lastDate: DateUtils.dateOnly(base.add(const Duration(days: 7))),
  );
  if (dia == null || !context.mounted) return null;
  final hora = await showTimePicker(
    context: context,
    helpText: 'Horário da corrida',
    cancelText: 'Cancelar',
    confirmText: 'Agendar',
    initialTime: TimeOfDay.fromDateTime(cedo),
    builder: (ctx, child) => MediaQuery(
      data: MediaQuery.of(ctx).copyWith(alwaysUse24HourFormat: true),
      child: child!,
    ),
  );
  if (hora == null) return null;
  final quando = DateTime(dia.year, dia.month, dia.day, hora.hour, hora.minute);
  final problema = RideState.horarioInvalido(quando, base);
  if (problema != null) {
    avisar(problema);
    return null;
  }
  return quando;
}

/// Conta > Corridas agendadas (modelo Du Goias): o que esta marcado, com
/// o valor estimado e o botao de cancelar.
class AgendadasScreen extends StatefulWidget {
  const AgendadasScreen({super.key, this.recemAgendada});

  /// Corrida que acabou de ser agendada (aparece com destaque).
  final String? recemAgendada;

  @override
  State<AgendadasScreen> createState() => _AgendadasScreenState();
}

class _AgendadasScreenState extends State<AgendadasScreen> {
  bool _carregando = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await context.read<RideState>().carregarAgendadas();
      if (mounted) setState(() => _carregando = false);
    });
  }

  Future<void> _cancelar(Ride r, String quando) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: Text('Cancelar o agendamento?', style: AppText.heading),
        content: Text('A corrida de $quando para ${r.dropoff.address} será cancelada, sem multa.', style: AppText.body),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Voltar')),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Cancelar agendamento', style: TextStyle(color: AppColors.danger)),
          ),
        ],
      ),
    );
    if (ok == true && mounted) await context.read<RideState>().cancelarAgendada(r);
  }

  @override
  Widget build(BuildContext context) {
    final lista = [...context.watch<RideState>().agendadas]
      ..sort((a, b) => (a.agendadaPara ?? '').compareTo(b.agendadaPara ?? ''));
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(title: const Text('Corridas agendadas')),
      body: _carregando && lista.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : lista.isEmpty
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(Spacing.xl),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.event_available, size: 56, color: AppColors.textMuted),
                        const SizedBox(height: Spacing.md),
                        Text(
                          'Nenhuma corrida agendada.\nNa tela Início, toque no calendário ao lado de "Buscar destino" para agendar.',
                          textAlign: TextAlign.center,
                          style: AppText.body.copyWith(color: AppColors.textMuted),
                        ),
                      ],
                    ),
                  ),
                )
              : ListView(
                  padding: const EdgeInsets.all(Spacing.lg),
                  children: [
                    Text(
                      'O motorista é procurado 10 minutos antes do horário. O aplicativo abre a corrida sozinho quando ele aceitar.',
                      style: AppText.caption.copyWith(color: AppColors.textMuted),
                    ),
                    const SizedBox(height: Spacing.md),
                    for (final r in lista) _cartao(r),
                  ],
                ),
    );
  }

  Widget _cartao(Ride r) {
    final q = DateTime.tryParse(r.agendadaPara ?? '')?.toLocal();
    final quando = q == null ? 'horário a confirmar' : horarioAgendado(q);
    final nova = r.id == widget.recemAgendada;
    return Card(
      margin: const EdgeInsets.only(bottom: Spacing.md),
      color: nova ? AppColors.brandSoft : AppColors.surface,
      child: Padding(
        padding: const EdgeInsets.all(Spacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.event, color: AppColors.brand),
                const SizedBox(width: Spacing.sm),
                Expanded(
                  child: Text(
                    quando[0].toUpperCase() + quando.substring(1),
                    style: AppText.heading.copyWith(color: AppColors.text),
                  ),
                ),
                if (nova) const Chip(label: Text('Nova')),
              ],
            ),
            const SizedBox(height: Spacing.sm),
            _Ponto(cor: AppColors.success, texto: r.pickup.address),
            _Ponto(cor: AppColors.danger, texto: r.dropoff.address),
            const SizedBox(height: Spacing.xs),
            Text(
              'Valor estimado ${formatMoney(r.aPagarCents)} · ${r.paymentMethod}',
              style: AppText.bodyStrong.copyWith(color: AppColors.text),
            ),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () => _cancelar(r, quando),
                child: const Text('Cancelar agendamento', style: TextStyle(color: AppColors.danger)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Ponto extends StatelessWidget {
  const _Ponto({required this.cor, required this.texto});

  final Color cor;
  final String texto;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Icon(Icons.circle, size: 10, color: cor),
          ),
          const SizedBox(width: Spacing.sm),
          Expanded(
            child: Text(texto, maxLines: 2, overflow: TextOverflow.ellipsis, style: AppText.body),
          ),
        ],
      ),
    );
  }
}
