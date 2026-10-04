import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api/api_client.dart';
import '../core/avisos.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../data/models/models.dart';
import '../state/ride_state.dart';

/// Cupons de desconto (botao do ingresso na tela Inicio, modelo Viaje 22).
/// O cupom escolhido vale para a proxima corrida; o desconto e pago pela
/// plataforma ao motorista.
class CuponsScreen extends StatefulWidget {
  const CuponsScreen({super.key, this.naConfirmacao = false});

  /// Aberta da tela de confirmacao: ao escolher, o preco e refeito na hora.
  final bool naConfirmacao;

  @override
  State<CuponsScreen> createState() => _CuponsScreenState();
}

class _CuponsScreenState extends State<CuponsScreen> {
  late Future<List<CupomDisponivel>> _lista;
  final _codigo = TextEditingController();

  @override
  void initState() {
    super.initState();
    _lista = context.read<RideState>().cupons();
  }

  @override
  void dispose() {
    _codigo.dispose();
    super.dispose();
  }

  Future<void> _usar(String codigo) async {
    final estado = context.read<RideState>();
    await estado.aplicarCupom(codigo, refazerPreco: widget.naConfirmacao);
    if (!mounted) return;
    if (estado.cupomCodigo == null) return; // recusado: o motivo ja apareceu
    if (!widget.naConfirmacao) avisar('Cupom ${estado.cupomCodigo} guardado: vale na sua próxima corrida.');
    await Navigator.of(context).maybePop();
  }

  String _desconto(CupomDisponivel c) {
    if (c.percentual) {
      final teto = c.maxDescontoCents == null ? '' : ' (até ${formatMoney(c.maxDescontoCents!)})';
      return '${c.valor}% de desconto$teto';
    }
    return '${formatMoney(c.valor)} de desconto';
  }

  String? _validade(CupomDisponivel c) {
    final d = DateTime.tryParse(c.validoAte ?? '')?.toLocal();
    if (d == null) return null;
    return 'Válido até ${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';
  }

  @override
  Widget build(BuildContext context) {
    final escolhido = context.watch<RideState>().cupomCodigo;
    return Scaffold(
      appBar: AppBar(title: const Text('Cupons')),
      body: FutureBuilder<List<CupomDisponivel>>(
        future: _lista,
        builder: (context, s) {
          if (s.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          final erro = s.error is ApiException ? (s.error! as ApiException).message : 'Sem conexão com o servidor.';
          final cupons = s.data ?? const <CupomDisponivel>[];
          return ListView(
            padding: const EdgeInsets.all(Spacing.lg),
            children: [
              if (escolhido != null)
                Container(
                  margin: const EdgeInsets.only(bottom: Spacing.md),
                  padding: const EdgeInsets.all(Spacing.md),
                  decoration: BoxDecoration(color: AppColors.brandSoft, borderRadius: BorderRadius.circular(Radii.md)),
                  child: Row(
                    children: [
                      const Icon(Icons.check_circle, color: AppColors.brand),
                      const SizedBox(width: Spacing.sm),
                      Expanded(child: Text('Cupom $escolhido na próxima corrida', style: AppText.bodyStrong)),
                      TextButton(
                        onPressed: () => context
                            .read<RideState>()
                            .aplicarCupom(null, refazerPreco: widget.naConfirmacao),
                        child: const Text('Tirar'),
                      ),
                    ],
                  ),
                ),
              Text('Tenho um código', style: AppText.heading),
              const SizedBox(height: Spacing.sm),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _codigo,
                      textCapitalization: TextCapitalization.characters,
                      decoration: const InputDecoration(hintText: 'Ex.: PRIMEIRACORRIDA'),
                      onSubmitted: _usar,
                    ),
                  ),
                  const SizedBox(width: Spacing.sm),
                  FilledButton(onPressed: () => _usar(_codigo.text), child: const Text('Usar')),
                ],
              ),
              const SizedBox(height: Spacing.xl),
              Text('Disponíveis para você', style: AppText.heading),
              const SizedBox(height: Spacing.sm),
              if (s.hasError)
                Text(erro, style: AppText.body.copyWith(color: AppColors.danger))
              else if (cupons.isEmpty)
                Text('Nenhum cupom disponível agora.', style: AppText.body.copyWith(color: AppColors.textMuted))
              else
                for (final c in cupons)
                  Card(
                    margin: const EdgeInsets.only(bottom: Spacing.md),
                    child: Padding(
                      padding: const EdgeInsets.all(Spacing.md),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              const Icon(Icons.confirmation_number, color: AppColors.brand),
                              const SizedBox(width: Spacing.sm),
                              Expanded(
                                child: Text(c.code, style: AppText.heading.copyWith(letterSpacing: 1)),
                              ),
                            ],
                          ),
                          const SizedBox(height: Spacing.xs),
                          Text(_desconto(c), style: AppText.bodyStrong.copyWith(color: AppColors.brand)),
                          if (c.description.isNotEmpty) Text(c.description, style: AppText.body),
                          if (c.minimoCents > 0)
                            Text(
                              'Para corridas a partir de ${formatMoney(c.minimoCents)}',
                              style: AppText.caption.copyWith(color: AppColors.textMuted),
                            ),
                          if (_validade(c) != null)
                            Text(_validade(c)!, style: AppText.caption.copyWith(color: AppColors.textMuted)),
                          const SizedBox(height: Spacing.sm),
                          Align(
                            alignment: Alignment.centerRight,
                            child: escolhido == c.code
                                ? const Chip(label: Text('Em uso'))
                                : FilledButton.tonal(
                                    onPressed: () => _usar(c.code),
                                    child: Text(widget.naConfirmacao ? 'Usar nesta corrida' : 'Usar na próxima corrida'),
                                  ),
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
