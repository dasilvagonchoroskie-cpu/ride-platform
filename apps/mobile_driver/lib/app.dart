import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'core/theme/app_theme.dart';
import 'data/models/driver_models.dart';
import 'screens/home_screen.dart';
import 'screens/offer_screen.dart';
import 'screens/onboarding_screen.dart';
import 'screens/pending_screen.dart';
import 'screens/permissions_screen.dart';
import 'screens/ride_screen.dart';
import 'screens/splash_screen.dart';
import 'screens/terms_screen.dart';
import 'screens/welcome_screen.dart';
import 'state/driver_state.dart';
import 'core/avisos.dart';
import 'core/native/corridas_nativo.dart';
import 'screens/locating_screen.dart';

class DriverApp extends StatelessWidget {
  const DriverApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      scaffoldMessengerKey: avisos,
      title: 'Fortaleza Mov Motorista',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      home: const _Root(),
    );
  }
}

/// Portao de entrada do motorista.
class _Root extends StatelessWidget {
  const _Root();

  @override
  Widget build(BuildContext context) {
    final driver = context.watch<DriverState>();

    if (!driver.ready) return const SplashScreen();

    // Corrida ou chamado em andamento vem antes de qualquer outra tela.
    if (driver.activeRide != null) return const RideScreen();
    if (driver.offer != null) return const OfferScreen();

    // Logo ao instalar: autorizacoes antes de tudo — inclusive do login.
    if (driver.permissoesOk == false) return const PermissionsScreen();

    final profile = driver.profile;
    if (profile == null) return const WelcomeScreen();

    // Antes do cadastro: ninguem entrega CNH sem aceitar como ela e usada.
    if (!profile.termsAccepted) return const TermsScreen();
    if (!driver.isOnboarded) return const OnboardingScreen();
    if (profile.approval != DriverApproval.approved) return const PendingScreen();

    // O mapa so abre com a posicao real do aparelho.
    if (!driver.posicaoReal) {
      return LocatingScreen(
        tentarDeNovo: () => driver.lerPosicaoInicial(),
        ligarGps: () => CorridasNativo.pedir('gps'),
      );
    }
    return const HomeScreen();
  }
}
