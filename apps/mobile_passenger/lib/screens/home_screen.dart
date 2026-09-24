import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/app_theme.dart';
import '../core/utils/geo.dart';
import '../data/demo/demo_engine.dart';
import '../data/models/models.dart';
import '../state/app_state.dart';
import '../state/auth_state.dart';
import '../state/ride_state.dart';
import '../widgets/map_canvas.dart';
import '../widgets/ui.dart';
import 'account_screen.dart';
import 'confirm_screen.dart';
import 'history_screen.dart';
import 'wallet_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final TextEditingController _destination = TextEditingController();
  PlaceSuggestion? _selected;
  bool _loadingEstimate = false;

  @override
  void dispose() {
    _destination.dispose();
    super.dispose();
  }

  Future<void> _search() async {
    final target = _selected;
    if (target == null) return;

    setState(() => _loadingEstimate = true);

    final app = context.read<AppState>();
    final ride = context.read<RideState>();

    await app.addRecentPlace(target.address);
    await ride.estimate(app.coords, target.coords);

    if (!mounted) return;
    setState(() => _loadingEstimate = false);

    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ConfirmScreen(destination: target.coords, address: target.address),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final auth = context.watch<AuthState>();
    final ride = context.watch<RideState>();

    final suggestions = DemoEngine.suggestions(app.coords);
    final query = _destination.text.toLowerCase();
    final filtered = query.length < 2
        ? <PlaceSuggestion>[]
        : suggestions.where((s) => s.address.toLowerCase().contains(query)).take(5).toList();

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(Spacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Ola, ${auth.user?.firstName ?? 'passageiro'}',
                          style: const TextStyle(
                            color: AppColors.text,
                            fontSize: 24,
                            fontWeight: FontWeight.w700,
                            letterSpacing: -0.4,
                          ),
                        ),
                        const Text(
                          'Para onde voce vai hoje?',
                          style: TextStyle(color: AppColors.textMuted, fontSize: 13),
                        ),
                      ],
                    ),
                  ),
                  GestureDetector(
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(builder: (_) => const AccountScreen()),
                    ),
                    child: AppBadge(
                      text: app.isDemo ? 'DEMO' : 'ONLINE',
                      tone: app.isDemo ? AppBadgeTone.info : AppBadgeTone.success,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: Spacing.lg),
              MapCanvas(
                center: app.coords,
                height: 250,
                markers: [
                  MapMarker(id: 'me', coords: app.coords, kind: MarkerKind.pickup),
                  for (final driver in ride.nearbyDrivers)
                    MapMarker(id: driver.id, coords: driver.position, kind: MarkerKind.car),
                ],
              ),
              const SizedBox(height: Spacing.lg),
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    AppField(
                      label: 'Destino',
                      hint: 'Digite o endereco de destino',
                      controller: _destination,
                      onChanged: (_) => setState(() => _selected = null),
                    ),
                    if (query.length < 2 && app.recentPlaces.isNotEmpty) ...[
                      const SizedBox(height: Spacing.sm),
                      const Text(
                        'RECENTES',
                        style: TextStyle(
                          color: AppColors.textFaint,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 0.6,
                        ),
                      ),
                      for (final place in app.recentPlaces.take(3))
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          dense: true,
                          title: Text(
                            place,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(color: AppColors.text, fontSize: 15),
                          ),
                          onTap: () => setState(() {
                            _destination.text = place;
                            _selected = suggestions.firstWhere(
                              (s) => s.address == place,
                              orElse: () => suggestions.first,
                            );
                          }),
                        ),
                    ],
                    if (filtered.isNotEmpty) ...[
                      const SizedBox(height: Spacing.sm),
                      const Text(
                        'SUGESTOES',
                        style: TextStyle(
                          color: AppColors.textFaint,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 0.6,
                        ),
                      ),
                      for (final suggestion in filtered)
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          dense: true,
                          title: Text(
                            suggestion.address,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(color: AppColors.text, fontSize: 15),
                          ),
                          subtitle: Text(
                            '${formatDistance(suggestion.distanceKm * 1000)} de voce',
                            style: const TextStyle(color: AppColors.textFaint, fontSize: 12),
                          ),
                          onTap: () => setState(() {
                            _destination.text = suggestion.address;
                            _selected = suggestion;
                          }),
                        ),
                    ],
                    const SizedBox(height: Spacing.md),
                    AppButton(
                      label: 'Buscar corrida',
                      loading: _loadingEstimate || ride.estimating,
                      enabled: _selected != null,
                      onPressed: _search,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: Spacing.lg),
              const SectionTitle(text: 'Atalhos'),
              Row(
                children: [
                  Expanded(
                    child: _Shortcut(
                      title: 'Historico',
                      subtitle: 'Suas corridas',
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(builder: (_) => const HistoryScreen()),
                      ),
                    ),
                  ),
                  const SizedBox(width: Spacing.md),
                  Expanded(
                    child: _Shortcut(
                      title: 'Pagamento',
                      subtitle: 'Formas e cupons',
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(builder: (_) => const WalletScreen()),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Shortcut extends StatelessWidget {
  const _Shortcut({required this.title, required this.subtitle, required this.onTap});

  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: const TextStyle(color: AppColors.text, fontSize: 15, fontWeight: FontWeight.w600)),
            const SizedBox(height: Spacing.xs),
            Text(subtitle, style: const TextStyle(color: AppColors.textMuted, fontSize: 13)),
          ],
        ),
      ),
    );
  }
}
