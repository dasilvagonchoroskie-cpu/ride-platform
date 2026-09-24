import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../core/utils/geo.dart';
import '../data/demo/demo_engine.dart';
import '../data/models/models.dart';
import '../state/app_state.dart';
import '../state/ride_state.dart';
import '../widgets/map_canvas.dart';
import '../widgets/ui.dart';

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

    final app = context.read<AppState>();
    final ride = context.read<RideState>();

    await ride.requestRide(
      origin: app.coords,
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

    final distanceMeters = _selected == null
        ? 3200
        : ((_selected!.priceCents / 180) * 1000).round();

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        title: const Text('Confirmar corrida'),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(Spacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              MapCanvas(
                center: center,
                height: 210,
                span: 0.09,
                markers: [
                  MapMarker(id: 'pickup', coords: app.coords, kind: MarkerKind.pickup),
                  MapMarker(id: 'dropoff', coords: widget.destination, kind: MarkerKind.dropoff),
                ],
                route: [app.coords, widget.destination],
              ),
              const SizedBox(height: Spacing.lg),
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'DESTINO',
                      style: TextStyle(
                        color: AppColors.textFaint,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.6,
                      ),
                    ),
                    const SizedBox(height: Spacing.xs),
                    Text(
                      widget.address,
                      style: const TextStyle(color: AppColors.text, fontSize: 15, fontWeight: FontWeight.w600),
                    ),
                    const AppDivider(),
                    Row(
                      children: [
                        MetricTile(value: formatDistance(distanceMeters.toDouble()), label: 'Distancia'),
                        MetricTile(
                          value: formatDuration(((distanceMeters / 1000 / 24) * 3600).round()),
                          label: 'Tempo',
                        ),
                        MetricTile(
                          value: _selected == null ? '-' : formatMoney(_selected!.priceCents),
                          label: 'Estimativa',
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: Spacing.lg),
              const SectionTitle(text: 'Escolha a categoria'),
              for (final category in categories)
                Padding(
                  padding: const EdgeInsets.only(bottom: Spacing.sm),
                  child: _OptionTile(
                    title: category.name,
                    subtitle: '${category.description} - ${category.seats} lugar(es)',
                    trailing: formatMoney(category.priceCents),
                    caption: 'Chega em ${category.etaMinutes} min',
                    selected: _selected?.id == category.id,
                    onTap: () => setState(() => _selected = category),
                  ),
                ),
              const SizedBox(height: Spacing.sm),
              const SectionTitle(text: 'Forma de pagamento'),
              for (final method in DemoEngine.paymentMethods())
                Padding(
                  padding: const EdgeInsets.only(bottom: Spacing.sm),
                  child: _OptionTile(
                    title: method.label,
                    subtitle: method.detail,
                    selected: _payment.id == method.id,
                    onTap: () => setState(() => _payment = method),
                  ),
                ),
              const SizedBox(height: Spacing.lg),
              AppButton(
                label: _selected == null
                    ? 'Confirmar'
                    : 'Confirmar ${formatMoney(_selected!.priceCents)}',
                loading: _submitting,
                enabled: _selected != null,
                onPressed: _confirm,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _OptionTile extends StatelessWidget {
  const _OptionTile({
    required this.title,
    required this.subtitle,
    required this.selected,
    required this.onTap,
    this.trailing,
    this.caption,
  });

  final String title;
  final String subtitle;
  final bool selected;
  final VoidCallback onTap;
  final String? trailing;
  final String? caption;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(Spacing.lg),
        decoration: BoxDecoration(
          color: selected ? AppColors.primarySoft : AppColors.surface,
          border: Border.all(color: selected ? AppColors.primary : AppColors.border),
          borderRadius: BorderRadius.circular(Radii.md),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(color: AppColors.text, fontSize: 15, fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 2),
                  Text(subtitle, style: const TextStyle(color: AppColors.textMuted, fontSize: 13)),
                  if (caption != null) ...[
                    const SizedBox(height: 2),
                    Text(caption!, style: const TextStyle(color: AppColors.primary, fontSize: 13)),
                  ],
                ],
              ),
            ),
            if (trailing != null)
              Text(
                trailing!,
                style: const TextStyle(color: AppColors.text, fontSize: 17, fontWeight: FontWeight.w600),
              )
            else if (selected)
              const Icon(Icons.check, color: AppColors.primary, size: 20),
          ],
        ),
      ),
    );
  }
}
