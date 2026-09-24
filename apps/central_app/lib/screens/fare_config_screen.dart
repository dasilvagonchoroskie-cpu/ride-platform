import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/central_theme.dart';
import '../core/utils/formatters.dart';
import '../data/models/central_models.dart';
import '../state/central_state.dart';
import '../widgets/ui.dart';

/// Configuracao de tarifas por categoria.
class FareConfigScreen extends StatefulWidget {
  const FareConfigScreen({super.key});

  @override
  State<FareConfigScreen> createState() => _FareConfigScreenState();
}

class _FareConfigScreenState extends State<FareConfigScreen> {
  String? _slug;
  late TextEditingController _base;
  late TextEditingController _perKm;
  late TextEditingController _perMinute;
  late TextEditingController _minimum;
  late TextEditingController _fee;

  @override
  void initState() {
    super.initState();
    _base = TextEditingController();
    _perKm = TextEditingController();
    _perMinute = TextEditingController();
    _minimum = TextEditingController();
    _fee = TextEditingController();
  }

  @override
  void dispose() {
    for (final controller in [_base, _perKm, _perMinute, _minimum, _fee]) {
      controller.dispose();
    }
    super.dispose();
  }

  void _fill(FareSettings fare) {
    _slug = fare.categorySlug;
    _base.text = (fare.baseFareCents / 100).toStringAsFixed(2).replaceAll('.', ',');
    _perKm.text = (fare.perKmCents / 100).toStringAsFixed(2).replaceAll('.', ',');
    _perMinute.text = (fare.perMinuteCents / 100).toStringAsFixed(2).replaceAll('.', ',');
    _minimum.text = (fare.minimumFareCents / 100).toStringAsFixed(2).replaceAll('.', ',');
    _fee.text = fare.platformFeePercent.toStringAsFixed(1).replaceAll('.', ',');
  }

  /// "12,50" -> 1250 centavos.
  int _toCents(String value) {
    final normalized = value.replaceAll('.', '').replaceAll(',', '.');
    final parsed = double.tryParse(normalized) ?? 0;
    return (parsed * 100).round();
  }

  double _toDouble(String value) {
    return double.tryParse(value.replaceAll(',', '.')) ?? 0;
  }

  Future<void> _save() async {
    final slug = _slug;
    if (slug == null) return;

    final fare = FareSettings(
      categorySlug: slug,
      baseFareCents: _toCents(_base.text),
      perKmCents: _toCents(_perKm.text),
      perMinuteCents: _toCents(_perMinute.text),
      minimumFareCents: _toCents(_minimum.text),
      platformFeePercent: _toDouble(_fee.text),
    );

    final ok = await context.read<CentralState>().saveFare(fare);
    if (!mounted) return;

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          ok ? 'Tarifas salvas e publicadas.' : 'Falha ao salvar as tarifas.',
          style: AppText.body.copyWith(color: AppColors.text),
        ),
        backgroundColor: ok ? AppColors.primary : AppColors.danger,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final central = context.watch<CentralState>();
    final fares = central.fares;
    final tablet = MediaQuery.of(context).size.width >= 900;

    if (fares.isEmpty) {
      return const Center(child: CircularProgressIndicator(color: AppColors.primary));
    }

    _slug ??= fares.first.categorySlug;
    final selected = fares.firstWhere(
      (f) => f.categorySlug == _slug,
      orElse: () => fares.first,
    );

    // Preenche os campos quando troca de categoria ou chega dado novo.
    if (_base.text.isEmpty) _fill(selected);

    final selector = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SectionTitle(text: 'Categoria'),
        for (final fare in fares)
          Padding(
            padding: const EdgeInsets.only(bottom: Spacing.sm),
            child: GestureDetector(
              onTap: () {
                setState(() {
                  _fill(fare);
                });
              },
              child: Container(
                padding: const EdgeInsets.all(Spacing.md),
                decoration: BoxDecoration(
                  color: _slug == fare.categorySlug ? AppColors.primarySoft : AppColors.surface,
                  border: Border.all(
                    color: _slug == fare.categorySlug ? AppColors.primary : AppColors.border,
                  ),
                  borderRadius: BorderRadius.circular(Radii.sm),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(fare.categoryName, style: AppText.bodyStrong),
                          Text(
                            'Base ${formatMoney(fare.baseFareCents)} - ${formatMoney(fare.perKmCents)}/km',
                            style: AppText.caption.copyWith(color: AppColors.textMuted),
                          ),
                        ],
                      ),
                    ),
                    Text(
                      '${fare.platformFeePercent.toStringAsFixed(0)}%',
                      style: AppText.bodyStrong.copyWith(color: AppColors.primary),
                    ),
                  ],
                ),
              ),
            ),
          ),
      ],
    );

    final form = AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(child: Text('${selected.categoryName} - valores', style: AppText.heading)),
              AppBadge(text: 'CENTAVOS/REAIS', tone: AppBadgeTone.info),
            ],
          ),
          const SizedBox(height: Spacing.lg),
          AppField(
            label: 'Preco base (R\$)',
            hint: '5,00',
            controller: _base,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            helper: 'Valor fixo cobrado ao iniciar a corrida',
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: Spacing.md),
          AppField(
            label: 'Preco por KM (R\$)',
            hint: '1,80',
            controller: _perKm,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            helper: 'Multiplicado pela distancia da rota',
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: Spacing.md),
          AppField(
            label: 'Preco por minuto (R\$)',
            hint: '0,30',
            controller: _perMinute,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            helper: 'Multiplicado pelo tempo estimado',
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: Spacing.md),
          AppField(
            label: 'Tarifa minima (R\$)',
            hint: '9,00',
            controller: _minimum,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            helper: 'Piso cobrado em corridas curtas',
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: Spacing.md),
          AppField(
            label: 'Taxa da plataforma (%)',
            hint: '20,0',
            controller: _fee,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            helper: 'Percentual retido de cada corrida',
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: Spacing.lg),
          Container(
            padding: const EdgeInsets.all(Spacing.md),
            decoration: BoxDecoration(
              color: AppColors.primarySoft,
              border: Border.all(color: AppColors.primary),
              borderRadius: BorderRadius.circular(Radii.sm),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('PREVIA DA TARIFA', style: AppText.label.copyWith(color: AppColors.primary)),
                const SizedBox(height: Spacing.sm),
                Text(
                  'Corrida de 5 km em 12 min: ${formatMoney(_preview())}',
                  style: AppText.bodyStrong,
                ),
                const SizedBox(height: Spacing.xs),
                Text(
                  'Plataforma ${formatMoney((_preview() * _toDouble(_fee.text) / 100).round())} - Motorista ${formatMoney((_preview() * (100 - _toDouble(_fee.text)) / 100).round())}',
                  style: AppText.caption.copyWith(color: AppColors.textMuted),
                ),
              ],
            ),
          ),
          const SizedBox(height: Spacing.lg),
          AppButton(
            label: 'Salvar e publicar tarifas',
            variant: AppButtonVariant.approve,
            icon: Icons.publish,
            loading: central.loading,
            onPressed: _save,
          ),
        ],
      ),
    );

    return SingleChildScrollView(
      padding: const EdgeInsets.all(Spacing.lg),
      child: tablet
          ? Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(width: 320, child: selector),
                const SizedBox(width: Spacing.lg),
                Expanded(child: form),
              ],
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                selector,
                const SizedBox(height: Spacing.lg),
                form,
                const SizedBox(height: Spacing.lg),
              ],
            ),
    );
  }

  /// Estimativa com 5 km e 12 minutos.
  int _preview() {
    final base = _toCents(_base.text);
    final perKm = _toCents(_perKm.text);
    final perMinute = _toCents(_perMinute.text);
    final minimum = _toCents(_minimum.text);
    final value = base + perKm * 5 + perMinute * 12;
    return value < minimum ? minimum : value;
  }
}
