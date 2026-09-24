import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/uber_theme.dart';
import '../core/utils/geo.dart';
import '../data/demo/demo_engine.dart';
import '../data/models/models.dart';
import '../state/app_state.dart';
import '../state/auth_state.dart';
import '../state/ride_state.dart';
import '../widgets/ride_map.dart';
import '../widgets/ui.dart';
import 'account_screen.dart';
import 'confirm_screen.dart';
import 'history_screen.dart';
import 'wallet_screen.dart';

/// Tela principal: mapa dinamico em tela cheia com o card flutuante
/// "Para onde?" fixado na parte inferior.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.read<RideState>().refreshNearby(context.read<AppState>().coords);
    });
  }

  Future<void> _openDestinationSheet() async {
    final app = context.read<AppState>();
    final ride = context.read<RideState>();

    final target = await showModalBottomSheet<PlaceSuggestion>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      barrierColor: const Color(0x99000000),
      builder: (_) => const _DestinationSheet(),
    );

    if (target == null || !mounted) return;

    await app.addRecentPlace(target.address);
    await ride.estimate(app.coords, target.coords);

    if (!mounted) return;
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

    final markers = <MapMarker>[
      MapMarker(id: 'me', coords: app.coords, kind: MarkerKind.pickup),
      for (final driver in ride.nearbyDrivers)
        MapMarker(id: driver.id, coords: driver.position, kind: MarkerKind.car, label: driver.name),
    ];

    return Scaffold(
      backgroundColor: AppColors.background,
      body: Stack(
        children: [
          // ---- Mapa em tela cheia (80%+ da area visual) ----
          Positioned.fill(
            child: RideMap(
              center: app.coords,
              markers: markers,
              span: 0.045,
              rounded: false,
            ),
          ),

          // ---- Barra superior flutuante ----
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(Spacing.lg),
              child: Row(
                children: [
                  Expanded(
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: Spacing.md,
                        vertical: Spacing.sm,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.background.withValues(alpha: 0.86),
                        borderRadius: BorderRadius.circular(Radii.pill),
                        border: Border.all(color: AppColors.border),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.person_outline, color: AppColors.text, size: 18),
                          const SizedBox(width: Spacing.sm),
                          Expanded(
                            child: Text(
                              auth.user?.firstName ?? 'Passageiro',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: AppText.bodyStrong.copyWith(color: AppColors.text),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: Spacing.sm),
                  GestureDetector(
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(builder: (_) => const AccountScreen()),
                    ),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: Spacing.md,
                        vertical: Spacing.sm,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.background.withValues(alpha: 0.86),
                        borderRadius: BorderRadius.circular(Radii.pill),
                        border: Border.all(color: AppColors.border),
                      ),
                      child: AppBadge(
                        text: app.isDemo ? 'DEMO' : 'ONLINE',
                        tone: app.isDemo ? AppBadgeTone.info : AppBadgeTone.success,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // ---- Atalhos laterais ----
          Positioned(
            right: Spacing.lg,
            bottom: 210,
            child: Column(
              children: [
                _MapAction(
                  icon: Icons.history,
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(builder: (_) => const HistoryScreen()),
                  ),
                ),
                const SizedBox(height: Spacing.sm),
                _MapAction(
                  icon: Icons.account_balance_wallet_outlined,
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(builder: (_) => const WalletScreen()),
                  ),
                ),
              ],
            ),
          ),

          // ---- Card flutuante "Para onde?" ----
          Align(
            alignment: Alignment.bottomCenter,
            child: SheetSurface(
              padding: const EdgeInsets.fromLTRB(
                Spacing.lg,
                Spacing.md,
                Spacing.lg,
                Spacing.xl,
              ),
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
                  Text('Bem-vindo ao Ride', style: SheetText.title),
                  const SizedBox(height: Spacing.lg),

                  // Campo "Para onde?" com icone de lupa
                  GestureDetector(
                    onTap: _openDestinationSheet,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: Spacing.md,
                        vertical: Spacing.lg,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.sheetField,
                        borderRadius: BorderRadius.circular(Radii.sm),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.search, color: AppColors.sheetText, size: 22),
                          const SizedBox(width: Spacing.md),
                          Text('Para onde?', style: SheetText.heading),
                        ],
                      ),
                    ),
                  ),

                  const SizedBox(height: Spacing.lg),
                  Row(
                    children: [
                      Expanded(
                        child: _QuickAction(
                          icon: Icons.home_outlined,
                          label: 'Casa',
                          onTap: _openDestinationSheet,
                        ),
                      ),
                      const SizedBox(width: Spacing.sm),
                      Expanded(
                        child: _QuickAction(
                          icon: Icons.work_outline,
                          label: 'Trabalho',
                          onTap: _openDestinationSheet,
                        ),
                      ),
                      const SizedBox(width: Spacing.sm),
                      Expanded(
                        child: _QuickAction(
                          icon: Icons.schedule,
                          label: 'Recentes',
                          onTap: _openDestinationSheet,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MapAction extends StatelessWidget {
  const _MapAction({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 46,
        width: 46,
        decoration: BoxDecoration(
          color: AppColors.background.withValues(alpha: 0.9),
          shape: BoxShape.circle,
          border: Border.all(color: AppColors.border),
        ),
        child: Icon(icon, color: AppColors.text, size: 21),
      ),
    );
  }
}

class _QuickAction extends StatelessWidget {
  const _QuickAction({required this.icon, required this.label, required this.onTap});

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: Spacing.md),
        decoration: BoxDecoration(
          color: AppColors.sheetField,
          borderRadius: BorderRadius.circular(Radii.sm),
        ),
        child: Column(
          children: [
            Icon(icon, size: 20, color: AppColors.sheetText),
            const SizedBox(height: Spacing.xs),
            Text(label, style: SheetText.muted),
          ],
        ),
      ),
    );
  }
}

/// Bottom sheet de busca de destino: campo "Para onde?" + sugestoes.
class _DestinationSheet extends StatefulWidget {
  const _DestinationSheet();

  @override
  State<_DestinationSheet> createState() => _DestinationSheetState();
}

class _DestinationSheetState extends State<_DestinationSheet> {
  final TextEditingController _controller = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final suggestions = DemoEngine.suggestions(app.coords);

    final list = _query.length < 2
        ? suggestions.take(5).toList()
        : suggestions
            .where((s) => s.address.toLowerCase().contains(_query.toLowerCase()))
            .take(6)
            .toList();

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SheetSurface(
        padding: const EdgeInsets.fromLTRB(Spacing.lg, Spacing.md, Spacing.lg, Spacing.lg),
        child: SizedBox(
          height: MediaQuery.of(context).size.height * 0.72,
          child: Column(
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
              AppField(
                hint: 'Para onde?',
                controller: _controller,
                autofocus: true,
                onLight: true,
                prefixIcon: Icons.search,
                onChanged: (value) => setState(() => _query = value),
              ),
              const SizedBox(height: Spacing.lg),
              Text(
                _query.length < 2 ? 'SUGESTOES' : 'RESULTADOS',
                style: SheetText.label,
              ),
              const SizedBox(height: Spacing.sm),
              Expanded(
                child: ListView.separated(
                  padding: EdgeInsets.zero,
                  itemCount: list.length,
                  separatorBuilder: (_, __) => const Divider(
                    height: 1,
                    color: AppColors.sheetBorder,
                  ),
                  itemBuilder: (context, index) {
                    final item = list[index];
                    return ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.location_on_outlined, color: AppColors.sheetMuted),
                      title: Text(
                        item.address,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: SheetText.body.copyWith(fontWeight: FontWeight.w500),
                      ),
                      subtitle: Text(
                        '${formatDistance(item.distanceKm * 1000)} de voce',
                        style: SheetText.muted,
                      ),
                      onTap: () => Navigator.of(context).pop(item),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
