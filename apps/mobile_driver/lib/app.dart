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

class DriverApp extends StatelessWidget {
  const DriverApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Fortaleza Mov Motorista',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.dark,
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

    final profile = driver.profile;
    if (profile == null) return const WelcomeScreen();

    // Antes ate do cadastro do veiculo: nao faz sentido pedir CNH e
    // documentos sem a pessoa ter aceitado como esses dados sao usados.
    if (!profile.termsAccepted) return const TermsScreen();

    if (!driver.isOnboarded) return const OnboardingScreen();

    final ride = driver.activeRide;
    if (ride != null) {
      if (ride.phase == RidePhase.completed) return const RideScreen();
      return const RideScreen();
    }

    if (driver.offer != null) return const OfferScreen();

    // Antes de trabalhar: sem estas autorizacoes o alarme de chamado falha
    // com o celular no bolso. Pedido ja na espera da aprovacao, para o
    // motorista estar pronto quando a Central liberar.
    if (driver.permissoesOk == false) return const PermissionsScreen();

    if (profile.approval != DriverApproval.approved) return const PendingScreen();

    return const HomeScreen();
  }
}
