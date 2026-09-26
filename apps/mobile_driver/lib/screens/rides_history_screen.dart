import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../data/models/driver_models.dart';
import '../state/driver_state.dart';

/// Corridas do motorista (todas as situacoes), da mais nova para a mais antiga.
class RidesHistoryScreen extends StatefulWidget {
  const RidesHistoryScreen({super.key});

  @override
  State<RidesHistoryScreen> createState() => _RidesHistoryScreenState();
}

class _RidesHistoryScreenState extends State<RidesHistoryScreen> {
  final List<RideHistoryItem> _itens = [];
  int _pagina = 1;
  bool _carregando = true;
  bool _falhou = false;
  bool _temMais = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _carregar(reiniciar: true));
  }

  Future<void> _carregar({bool reiniciar = false}) async {
    if (reiniciar) {
      _pagina = 1;
      _temMais = true;
    }
    setState(() {
      _carregando = true;
      _falhou = false;
    });
    final r = await context.read<DriverState>().carregarHistorico(pagina: _pagina);
    if (!mounted) return;
    setState(() {
      _carregando = false;
      if (r == null) {
        _falhou = true;
        return;
      }
      if (reiniciar) _itens.clear();
      _itens.addAll(r);
      _temMais = r.length >= 30;
      _pagina += 1;
    });
  }

  @override
  Widget build(BuildContext context) {
    final oculto = context.watch<DriverState>().ocultarValores;

    return Scaffold(
      appBar: AppBar(title: const Text('Corridas')),
      body: RefreshIndicator(
        onRefresh: () => _carregar(reiniciar: true),
        child: ListView(
          padding: const EdgeInsets.all(Spacing.lg),
          children: [
            if (_itens.isEmpty && _carregando)
              const Padding(
                padding: EdgeInsets.only(top: 120),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_itens.isEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 100),
                child: Column(
                  children: [
                    const Icon(Icons.directions_car_outlined, size: 56, color: AppColors.textFaint),
                    const SizedBox(height: Spacing.md),
                    Text(
                      _falhou ? 'Sem conexão com o servidor' : 'Nenhuma corrida ainda',
                      style: AppText.heading,
                    ),
                    const SizedBox(height: Spacing.xs),
                    Text(
                      _falhou
                          ? 'Puxe para baixo para tentar de novo.'
                          : 'Suas corridas aparecem aqui assim que você atender a primeira.',
                      textAlign: TextAlign.center,
                      style: AppText.body.copyWith(color: AppColors.textMuted),
                    ),
                  ],
                ),
              )
            else ...[
              for (final c in _itens) ...[
                _Item(corrida: c, oculto: oculto),
                const SizedBox(height: Spacing.sm),
              ],
              if (_temMais)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: Spacing.md),
                  child: Center(
                    child: _carregando
                        ? const CircularProgressIndicator()
                        : TextButton(onPressed: () => _carregar(), child: const Text('Carregar mais')),
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Item extends StatelessWidget {
  const _Item({required this.corrida, required this.oculto});

  final RideHistoryItem corrida;
  final bool oculto;

  @override
  Widget build(BuildContext context) {
    final c = corrida;
    final corSituacao = c.isCompleted
        ? AppColors.primary
        : c.isCancelled
            ? AppColors.danger
            : AppColors.brand;

    return Container(
      padding: const EdgeInsets.all(Spacing.lg),
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(Radii.sm)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  diaMesHora(c.finishedAt ?? c.requestedAt),
                  style: AppText.body.copyWith(color: AppColors.textMuted),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                decoration: BoxDecoration(
                  color: corSituacao.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(Radii.pill),
                ),
                child: Text(
                  c.statusLabel,
                  style: AppText.caption.copyWith(color: corSituacao, fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
          const SizedBox(height: Spacing.xs),
          Row(
            children: [
              Expanded(child: Text('Corrida ${c.code}', style: AppText.bodyStrong.copyWith(fontSize: 16))),
              if (c.isCompleted)
                Text(dinheiro(c.earningCents, oculto: oculto), style: AppText.heading.copyWith(fontSize: 18)),
            ],
          ),
          const SizedBox(height: Spacing.sm),
          _Ponto(cor: AppColors.primary, texto: c.pickupAddress),
          const SizedBox(height: 4),
          _Ponto(cor: AppColors.danger, texto: c.dropoffAddress),
        ],
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
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Container(width: 8, height: 8, decoration: BoxDecoration(color: cor, shape: BoxShape.circle)),
        ),
        const SizedBox(width: Spacing.sm),
        Expanded(child: Text(texto.isEmpty ? '—' : texto, style: AppText.body)),
      ],
    );
  }
}
