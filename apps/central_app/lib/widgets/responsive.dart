import 'package:flutter/material.dart';

import '../core/theme/central_theme.dart';
import 'ui.dart';

/// Layout adaptativo: menu lateral fixo em tablets (>= 900 px) e Drawer
/// deslizante em celulares.
class ResponsiveShell extends StatelessWidget {
  const ResponsiveShell({
    super.key,
    required this.title,
    required this.destinationIndex,
    required this.onDestinationSelected,
    required this.destinations,
    required this.child,
    this.actions = const [],
  });

  final String title;
  final int destinationIndex;
  final ValueChanged<int> onDestinationSelected;
  final List<ShellDestination> destinations;
  final Widget child;
  final List<Widget> actions;

  static bool isTablet(BuildContext context) => MediaQuery.of(context).size.width >= 900;

  @override
  Widget build(BuildContext context) {
    final tablet = isTablet(context);

    final rail = NavigationRail(
      backgroundColor: AppColors.surface,
      selectedIndex: destinationIndex,
      onDestinationSelected: onDestinationSelected,
      labelType: NavigationRailLabelType.all,
      indicatorColor: AppColors.primarySoft,
      selectedIconTheme: const IconThemeData(color: AppColors.primary),
      unselectedIconTheme: const IconThemeData(color: AppColors.textMuted),
      selectedLabelTextStyle: AppText.label.copyWith(color: AppColors.primary),
      unselectedLabelTextStyle: AppText.label.copyWith(color: AppColors.textMuted),
      destinations: [
        for (final destination in destinations)
          NavigationRailDestination(
            icon: _badged(destination),
            label: Text(destination.label),
          ),
      ],
    );

    final drawer = Drawer(
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const _DrawerHeader(),
            const Divider(height: 1, color: AppColors.border),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(vertical: Spacing.sm),
                children: [
                  for (var i = 0; i < destinations.length; i++)
                    ListTile(
                      leading: Icon(
                        destinations[i].icon,
                        color: i == destinationIndex ? AppColors.primary : AppColors.textMuted,
                      ),
                      title: Text(
                        destinations[i].label,
                        style: AppText.bodyStrong.copyWith(
                          color: i == destinationIndex ? AppColors.primary : AppColors.text,
                        ),
                      ),
                      trailing: destinations[i].badge == null
                          ? null
                          : AppBadge(text: '${destinations[i].badge}'),
                      selected: i == destinationIndex,
                      selectedTileColor: AppColors.primarySoft,
                      onTap: () {
                        Navigator.of(context).pop();
                        onDestinationSelected(i);
                      },
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );

    return Scaffold(
      backgroundColor: AppColors.background,
      drawer: tablet ? null : drawer,
      appBar: AppBar(
        title: Text(title),
        leading: tablet ? null : const _MenuButton(),
        automaticallyImplyLeading: false,
        actions: actions,
      ),
      body: SafeArea(
        child: Row(
          children: [
            if (tablet) ...[rail, const VerticalDivider(width: 1, color: AppColors.border)],
            Expanded(child: child),
          ],
        ),
      ),
    );
  }

  Widget _badged(ShellDestination destination) {
    if (destination.badge == null) return Icon(destination.icon);
    return Badge(
      backgroundColor: AppColors.danger,
      label: Text('${destination.badge}', style: const TextStyle(fontSize: 9)),
      child: Icon(destination.icon),
    );
  }
}

class ShellDestination {
  const ShellDestination({required this.icon, required this.label, this.badge});

  final IconData icon;
  final String label;
  final int? badge;
}

class _MenuButton extends StatelessWidget {
  const _MenuButton();

  @override
  Widget build(BuildContext context) {
    return IconButton(
      icon: const Icon(Icons.menu),
      onPressed: () => Scaffold.of(context).openDrawer(),
    );
  }
}

class _DrawerHeader extends StatelessWidget {
  const _DrawerHeader();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(Spacing.lg),
      child: Row(
        children: [
          Container(
            height: 42,
            width: 42,
            decoration: BoxDecoration(
              color: AppColors.primarySoft,
              border: Border.all(color: AppColors.primary),
              borderRadius: BorderRadius.circular(Radii.md),
            ),
            child: const Icon(Icons.monitor, color: AppColors.primary, size: 22),
          ),
          const SizedBox(width: Spacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Fortaleza', style: AppText.bodyStrong.copyWith(fontSize: 16)),
                Text(
                  'MOV  -  CENTRAL',
                  style: AppText.label.copyWith(color: AppColors.primary, fontSize: 10, letterSpacing: 2),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
