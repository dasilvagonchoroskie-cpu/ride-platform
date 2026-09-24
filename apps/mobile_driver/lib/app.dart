import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'core/theme/uber_theme.dart';
import 'data/models/driver_models.dart';
import 'screens/home_screen.dart';
import 'screens/offer_screen.dart';
import 'screens/onboarding_screen.dart';
import 'screens/pending_screen.dart';
import 'screens/ride_screen.dart';
import 'screens/splash_screen.dart';
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
    if (!driver.isOnboarded) return const OnboardingScreen();

    final ride = driver.activeRide;
    if (ride != null) {
      if (ride.phase == RidePhase.completed) return const RideScreen();
      return const RideScreen();
    }

    if (driver.offer != null) return const OfferScreen();

    if (profile.approval != DriverApproval.approved) return const PendingScreen();

    return const HomeScreen();
  }
}
