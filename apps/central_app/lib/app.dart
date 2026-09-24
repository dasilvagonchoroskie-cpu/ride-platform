import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'core/theme/central_theme.dart';
import 'screens/login_screen.dart';
import 'screens/shell_screen.dart';
import 'screens/splash_screen.dart';
import 'state/central_state.dart';

class CentralApp extends StatelessWidget {
  const CentralApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Fortaleza Mov Central',
      debugShowCheckedModeBanner: false,
      theme: CentralTheme.dark,
      home: const _Root(),
    );
  }
}

class _Root extends StatelessWidget {
  const _Root();

  @override
  Widget build(BuildContext context) {
    final central = context.watch<CentralState>();

    if (!central.ready) return const SplashScreen();
    if (central.admin == null) return const LoginScreen();

    return const ShellScreen();
  }
}
