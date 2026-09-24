import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/central_theme.dart';
import '../state/central_state.dart';
import '../widgets/responsive.dart';
import '../widgets/ui.dart';
import 'dashboard_screen.dart';
import 'drivers_pending_screen.dart';
import 'fare_config_screen.dart';
import 'monitoring_screen.dart';
import 'rides_screen.dart';
import 'settings_screen.dart';

/// Casca da Central: Drawer no celular, NavigationRail no tablet.
class ShellScreen extends StatefulWidget {
  const ShellScreen({super.key});

  @override
  State<ShellScreen> createState() => _ShellScreenState();
}

class _ShellScreenState extends State<ShellScreen> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final central = context.watch<CentralState>();

    final destinations = <ShellDestination>[
      const ShellDestination(icon: Icons.dashboard_outlined, label: 'Painel'),
      ShellDestination(
        icon: Icons.how_to_reg_outlined,
        label: 'Aprovacoes',
        badge: central.pendingCount == 0 ? null : central.pendingCount,
      ),
      ShellDestination(
        icon: Icons.map_outlined,
        label: 'Monitoramento',
        badge: central.activeRidesCount == 0 ? null : central.activeRidesCount,
      ),
      const ShellDestination(icon: Icons.receipt_long_outlined, label: 'Corridas'),
      const ShellDestination(icon: Icons.tune, label: 'Tarifas'),
      const ShellDestination(icon: Icons.settings_outlined, label: 'Ajustes'),
    ];

    const titles = [
      'Painel financeiro',
      'Aprovacao de motoristas',
      'Monitoramento em tempo real',
      'Corridas',
      'Configuracao de tarifas',
      'Ajustes',
    ];

    final pages = <Widget>[
      DashboardScreen(onNavigate: (i) => setState(() => _index = i)),
      const DriversPendingScreen(),
      const MonitoringScreen(),
      const RidesScreen(),
      const FareConfigScreen(),
      const SettingsScreen(),
    ];

    return ResponsiveShell(
      title: titles[_index],
      destinationIndex: _index,
      onDestinationSelected: (i) => setState(() => _index = i),
      destinations: destinations,
      actions: [
        IconButton(
          tooltip: 'Atualizar',
          onPressed: central.loading ? null : () => central.loadAll(),
          icon: central.loading
              ? const SizedBox(
                  height: 18,
                  width: 18,
                  child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary),
                )
              : const Icon(Icons.refresh),
        ),
        Padding(
          padding: const EdgeInsets.only(right: Spacing.md),
          child: Center(
            child: AppBadge(
              text: central.isDemo ? 'DEMO' : 'ONLINE',
              tone: central.isDemo ? AppBadgeTone.info : AppBadgeTone.success,
            ),
          ),
        ),
      ],
      child: pages[_index],
    );
  }
}
