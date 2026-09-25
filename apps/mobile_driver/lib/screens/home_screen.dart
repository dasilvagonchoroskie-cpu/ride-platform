import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../state/driver_state.dart';
import '../widgets/ride_map.dart';
import '../widgets/ui.dart';
import 'account_screen.dart';
import 'earnings_screen.dart';

/// Tela principal do motorista: mapa em tela cheia com o controle
/// Online/Offline fixado na base.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  bool _busy = false;

  Future<void> _toggle() async {
    final driver = context.read<DriverState>();
    setState(() => _busy = true);

    if (driver.isOnline) {
      await driver.goOffline();
    } else {
      await driver.goOnline();
    }

    if (!mounted) return;
    setState(() => _busy = false);

    final error = driver.error;
    if (error != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(error, style: AppText.body.copyWith(color: AppColors.sheet)),
          backgroundColor: AppColors.danger,
        ),
      );
      driver.error = null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final driver = context.watch<DriverState>();
    final wallet = driver.wallet;

    return Scaffold(
      backgroundColor: AppColors.background,
      body: Stack(
        children: [
          Positioned.fill(
            child: RideMap(
              center: driver.position,
              markers: [
                MapMarker(id: 'me', coords: driver.position, kind: MarkerKind.car),
              ],
              span: 0.03,
              rounded: false,
            ),
          ),

          // Barra superior: identificacao + atalho da carteira
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(Spacing.lg),
              child: Row(
                children: [
                  Expanded(
                    child: GestureDetector(
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
                        child: Row(
                          children: [
                            AppAvatar(initials: driver.profile?.initials ?? 'M', size: 30),
                            const SizedBox(width: Spacing.sm),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    driver.profile?.firstName ?? 'Motorista',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: AppText.bodyStrong,
                                  ),
                                  Row(
                                    children: [
                                      AppStars(value: driver.profile?.rating ?? 5, size: 11),
                                      const SizedBox(width: Spacing.xs),
                                      Text(
                                        '${driver.profile?.totalRides ?? 0} corridas',
                                        style: AppText.caption.copyWith(
                                          color: AppColors.textMuted,
                                          fontSize: 11,
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: Spacing.sm),
                  GestureDetector(
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(builder: (_) => const EarningsScreen()),
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
                      child: Row(
                        children: [
                          const Icon(Icons.account_balance_wallet, size: 16, color: AppColors.primary),
                          const SizedBox(width: Spacing.sm),
                          Text(
                            formatMoney(wallet.balanceCents),
                            style: AppText.bodyStrong.copyWith(color: AppColors.primary),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Controle Online/Offline na base
          Align(
            alignment: Alignment.bottomCenter,
            child: SheetSurface(
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

                  Row(
                    children: [
                      Container(
                        height: 10,
                        width: 10,
                        decoration: BoxDecoration(
                          color: driver.isOnline ? AppColors.primary : AppColors.sheetFaint,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: Spacing.sm),
                      Text(
                        driver.isOnline ? 'Voce esta online' : 'Voce esta offline',
                        style: SheetText.title,
                      ),
                    ],
                  ),
                  const SizedBox(height: Spacing.xs),
                  Text(
                    driver.isOnline
                        ? 'Aguardando chamadas na sua regiao.'
                        : 'Fique online para comecar a receber chamadas.',
                    style: SheetText.muted,
                  ),

                  const SizedBox(height: Spacing.lg),

                  // Resumo do dia
                  Row(
                    children: [
                      MetricTile(
                        value: formatMoney(wallet.todayCents),
                        label: 'Ganhos hoje',
                        onLight: true,
                      ),
                      MetricTile(
                        value: '${wallet.ridesToday}',
                        label: 'Corridas',
                        onLight: true,
                      ),
                      MetricTile(
                        value: '${wallet.acceptanceRate}%',
                        label: 'Aceitacao',
                        onLight: true,
                      ),
                    ],
                  ),

                  const SizedBox(height: Spacing.lg),

                  // Botao principal: preto, largura total, texto branco
                  AppButton(
                    label: driver.isOnline ? 'Ficar offline' : 'Ficar online',
                    variant: driver.isOnline
                        ? AppButtonVariant.secondary
                        : AppButtonVariant.primary,
                    loading: _busy,
                    onPressed: _toggle,
                  ),

                  if (driver.isOnline) ...[
                    const SizedBox(height: Spacing.sm),
                    AppButton(
                      label: 'Simular chamada recebida',
                      variant: AppButtonVariant.accent,
                      onPressed: () => context.read<DriverState>().receiveOffer(),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
