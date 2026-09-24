import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/uber_theme.dart';
import '../core/utils/formatters.dart';
import '../core/utils/geo.dart';
import '../data/demo/demo_engine.dart';
import '../data/models/models.dart';
import '../state/app_state.dart';
import '../state/ride_state.dart';
import '../widgets/ride_map.dart';
import '../widgets/ui.dart';

/// Selecao de categoria: mapa encolhe para os 40% superiores (mostrando a rota)
/// e os 60% inferiores exibem a lista deslizante de opcoes de viagem.
class ConfirmScreen extends StatefulWidget {
  const ConfirmScreen({super.key, required this.destination, required this.address});

  final Coords destination;
  final String address;

  @override
  State<ConfirmScreen> createState() => _ConfirmScreenState();
}

class _ConfirmScreenState extends State<ConfirmScreen> {
  RideCategory? _selected;
  PaymentOption _payment = DemoEngine.paymentMethods().first;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    final categories = context.read<RideState>().categories;
    if (categories.isNotEmpty) {
      _selected = categories.length > 1 ? categories[1] : categories.first;
    }
  }

  Future<void> _confirm() async {
    final category = _selected;
    if (category == null) return;

    setState(() => _submitting = true);

    await context.read<RideState>().requestRide(
          origin: context.read<AppState>().coords,
          destination: widget.destination,
          pickupAddress: 'Localizacao atual',
          dropoffAddress: widget.address,
          category: category,
          paymentMethod: _payment.label,
        );

    if (!mounted) return;
    setState(() => _submitting = false);
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final ride = context.watch<RideState>();
    final categories = ride.categories;

    if (_selected == null && categories.isNotEmpty) {
      _selected = categories.length > 1 ? categories[1] : categories.first;
    }

    final center = Coords(
      (app.coords.latitude + widget.destination.latitude) / 2,
      (app.coords.longitude + widget.destination.longitude) / 2,
    );

    return Scaffold(
      backgroundColor: AppColors.background,
      body: Column(
        children: [
          // ---------- 40% superiores: mapa com a rota tracada ----------
          Expanded(
            flex: 4,
            child: Stack(
              children: [
                Positioned.fill(
                  child: RideMap(
                    center: center,
                    span: 0.075,
                    rounded: false,
                    route: [app.coords, widget.destination],
                    markers: [
                      MapMarker(id: 'pickup', coords: app.coords, kind: MarkerKind.pickup),
                      MapMarker(
                        id: 'dropoff',
                        coords: widget.destination,
                        kind: MarkerKind.dropoff,
                      ),
                    ],
                  ),
                ),
                SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.all(Spacing.sm),
                    child: GestureDetector(
                      onTap: () => Navigator.of(context).pop(),
                      child: Container(
                        height: 40,
                        width: 40,
                        decoration: BoxDecoration(
                          color: AppColors.background.withValues(alpha: 0.86),
                          shape: BoxShape.circle,
                          border: Border.all(color: AppColors.border),
                        ),
                        child: const Icon(Icons.arrow_back, color: AppColors.text, size: 20),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),

          // ---------- 60% inferiores: lista de opcoes de viagem ----------
          Expanded(
            flex: 6,
            child: SheetSurface(
              padding: const EdgeInsets.fromLTRB(Spacing.lg, Spacing.lg, Spacing.lg, Spacing.lg),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Escolha uma viagem', style: SheetText.title),
                            const SizedBox(height: Spacing.xs),
                            Text(
                              widget.address,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: SheetText.muted,
                            ),
                          ],
                        ),
                      ),
                      TextButton(
                        onPressed: () => Navigator.of(context).pop(),
                        style: TextButton.styleFrom(foregroundColor: AppColors.sheetText),
                        child: const Text('Trocar'),
                      ),
                    ],
                  ),
                  const SizedBox(height: Spacing.sm),

                  // Lista deslizante vertical de categorias
                  Expanded(
                    child: ListView.builder(
                      padding: EdgeInsets.zero,
                      itemCount: categories.length,
                      itemBuilder: (context, index) {
                        final category = categories[index];
                        final isSelected = _selected?.id == category.id;

                        return Padding(
                          padding: const EdgeInsets.only(bottom: Spacing.sm),
                          child: _CategoryTile(
                            category: category,
                            selected: isSelected,
                            onTap: () => setState(() => _selected = category),
                          ),
                        );
                      },
                    ),
                  ),

                  // Forma de pagamento
                  GestureDetector(
                    onTap: _choosePayment,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: Spacing.md,
                        vertical: Spacing.md,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.sheetField,
                        borderRadius: BorderRadius.circular(Radii.sm),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.credit_card, size: 20, color: AppColors.sheetText),
                          const SizedBox(width: Spacing.md),
                          Expanded(
                            child: Text(
                              _payment.label,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: SheetText.body.copyWith(fontWeight: FontWeight.w600),
                            ),
                          ),
                          const Icon(Icons.keyboard_arrow_right, color: AppColors.sheetMuted),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: Spacing.md),

                  // Botao de acao principal: preto, texto branco em negrito,
                  // largura total, na extremidade inferior com padding confortavel.
                  AppButton(
                    label: _selected == null
                        ? 'Confirmar'
                        : 'Confirmar ${_selected!.name}',
                    variant: AppButtonVariant.primary,
                    loading: _submitting,
                    enabled: _selected != null,
                    onPressed: _confirm,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _choosePayment() async {
    final chosen = await showModalBottomSheet<PaymentOption>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => SheetSurface(
        padding: const EdgeInsets.fromLTRB(Spacing.lg, Spacing.md, Spacing.lg, Spacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.sheetBorder,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: Spacing.lg),
            Text('Forma de pagamento', style: SheetText.title),
            const SizedBox(height: Spacing.md),
            for (final method in DemoEngine.paymentMethods())
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.payments_outlined, color: AppColors.sheetText),
                title: Text(method.label, style: SheetText.body.copyWith(fontWeight: FontWeight.w600)),
                subtitle: Text(method.detail, style: SheetText.muted),
                trailing: method.id == _payment.id
                    ? const Icon(Icons.check, color: AppColors.primary)
                    : null,
                onTap: () => Navigator.of(context).pop(method),
              ),
          ],
        ),
      ),
    );

    if (chosen != null) setState(() => _payment = chosen);
  }
}

/// Item da lista de categorias: imagem do carro a esquerda, nome e capacidade
/// no centro, valor em destaque a direita. A categoria selecionada recebe
/// borda preta espessa.
class _CategoryTile extends StatelessWidget {
  const _CategoryTile({
    required this.category,
    required this.selected,
    required this.onTap,
  });

  final RideCategory category;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 140),
        padding: const EdgeInsets.symmetric(horizontal: Spacing.md, vertical: Spacing.md),
        decoration: BoxDecoration(
          color: AppColors.sheet,
          borderRadius: BorderRadius.circular(Radii.sm),
          // Borda preta espessa na categoria selecionada.
          border: Border.all(
            color: selected ? AppColors.sheetText : AppColors.sheetBorder,
            width: selected ? 2.5 : 1,
          ),
        ),
        child: Row(
          children: [
            VehicleIcon(slug: category.slug),
            const SizedBox(width: Spacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          category.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: SheetText.heading,
                        ),
                      ),
                      const SizedBox(width: Spacing.sm),
                      const Icon(Icons.person, size: 14, color: AppColors.sheetMuted),
                      Text(
                        '${category.seats}',
                        style: SheetText.muted,
                      ),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${category.etaMinutes} min de distancia',
                    style: SheetText.muted,
                  ),
                ],
              ),
            ),
            const SizedBox(width: Spacing.sm),
            Text(formatMoney(category.priceCents), style: SheetText.price),
          ],
        ),
      ),
    );
  }
}
