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
      indicatorColor: AppColors.brandSoft,
      selectedIconTheme: const IconThemeData(color: AppColors.brand),
      unselectedIconTheme: const IconThemeData(color: AppColors.textMuted),
      selectedLabelTextStyle: AppText.label.copyWith(color: AppColors.brand),
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
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const _DrawerHeader(),
          Expanded(
            child: SafeArea(
              top: false,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(Spacing.sm, Spacing.md, Spacing.sm, Spacing.md),
                children: [
                  for (var i = 0; i < destinations.length; i++)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 2),
                      child: ListTile(
                        dense: false,
                        visualDensity: const VisualDensity(vertical: -1),
                        contentPadding: const EdgeInsets.symmetric(horizontal: Spacing.md),
                        leading: Icon(
                          destinations[i].icon,
                          color: i == destinationIndex ? AppColors.brand : AppColors.textMuted,
                        ),
                        title: Text(
                          destinations[i].label,
                          style: AppText.body.copyWith(
                            fontSize: 16,
                            fontWeight: i == destinationIndex ? FontWeight.w700 : FontWeight.w500,
                            color: i == destinationIndex ? AppColors.brand : AppColors.text,
                          ),
                        ),
                        trailing: destinations[i].badge == null
                            ? null
                            : Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                decoration: BoxDecoration(
                                  color: AppColors.danger,
                                  borderRadius: BorderRadius.circular(Radii.pill),
                                ),
                                child: Text(
                                  '${destinations[i].badge}',
                                  style: AppText.caption.copyWith(color: AppColors.onPrimary, fontWeight: FontWeight.w700),
                                ),
                              ),
                        selected: i == destinationIndex,
                        selectedTileColor: AppColors.brandSoft,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.md)),
                        onTap: () {
                          Navigator.of(context).pop();
                          onDestinationSelected(i);
                        },
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
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
    final topo = MediaQuery.of(context).padding.top;
    return Container(
      decoration: const BoxDecoration(
        gradient: AppColors.degradeMarca,
        borderRadius: BorderRadius.only(topRight: Radius.circular(Radii.lg)),
      ),
      padding: EdgeInsets.fromLTRB(Spacing.lg, topo + Spacing.lg, Spacing.lg, Spacing.lg),
      child: Row(
        children: [
          const BrandLogo(size: 52),
          const SizedBox(width: Spacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Fortaleza',
                  style: AppText.title.copyWith(color: AppColors.onPrimary, fontSize: 22, height: 1.1),
                ),
                const SizedBox(height: 2),
                Text(
                  'MOV  -  CENTRAL',
                  style: AppText.label.copyWith(color: AppColors.gold, fontSize: 11, letterSpacing: 2.4, fontWeight: FontWeight.w700),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
