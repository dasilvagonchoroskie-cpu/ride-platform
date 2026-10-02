import 'package:flutter/material.dart';

import 'package:provider/provider.dart';

import '../core/theme/app_theme.dart';
import '../state/ride_state.dart';
import 'account_screen.dart';
import 'history_screen.dart';
import 'home_screen.dart';

/// Barra de baixo com Inicio, Atividade e Conta.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _aba = 0;

  @override
  void initState() {
    super.initState();
    // Depois do login: se houver corrida aberta no servidor, retoma.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.read<RideState>().sincronizarComServidor();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _aba,
        children: const [HomeScreen(), HistoryScreen(embutida: true), AccountScreen()],
      ),
      bottomNavigationBar: DecoratedBox(
        decoration: const BoxDecoration(border: Border(top: BorderSide(color: AppColors.border))),
        child: NavigationBar(
          selectedIndex: _aba,
          onDestinationSelected: (i) => setState(() => _aba = i),
          backgroundColor: AppColors.surface,
          surfaceTintColor: Colors.transparent,
          indicatorColor: AppColors.brandSoft,
          elevation: 0,
          height: 74,
          labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
          destinations: const [
            NavigationDestination(
              icon: Icon(Icons.home_outlined, color: AppColors.textMuted),
              selectedIcon: Icon(Icons.home, color: AppColors.brand),
              label: 'Início',
            ),
            NavigationDestination(
              icon: Icon(Icons.history, color: AppColors.textMuted),
              selectedIcon: Icon(Icons.history, color: AppColors.brand),
              label: 'Atividade',
            ),
            NavigationDestination(
              icon: Icon(Icons.person_outline, color: AppColors.textMuted),
              selectedIcon: Icon(Icons.person, color: AppColors.brand),
              label: 'Conta',
            ),
          ],
        ),
      ),
    );
  }
}
