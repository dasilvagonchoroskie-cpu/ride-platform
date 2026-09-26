import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'core/theme/app_theme.dart';
import 'data/models/models.dart';
import 'screens/complete_screen.dart';
import 'screens/home_screen.dart';
import 'screens/ride_screen.dart';
import 'screens/searching_screen.dart';
import 'screens/splash_screen.dart';
import 'screens/terms_screen.dart';
import 'screens/welcome_screen.dart';
import 'state/app_state.dart';
import 'state/auth_state.dart';
import 'state/ride_state.dart';
import 'core/avisos.dart';
import 'core/permissoes_nativas.dart';
import 'screens/locating_screen.dart';
import 'screens/permissoes_screen.dart';

class RideApp extends StatelessWidget {
  const RideApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      scaffoldMessengerKey: avisos,
      title: 'Fortaleza Mov',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.dark,
      // Logo ao instalar: autorizacoes antes de qualquer outra tela.
      home: PortaoPermissoes(
        itens: const [
          ItemPermissao('localizacao', 'Localização',
              'Para achar você no mapa e o motorista saber onde buscar.'),
          ItemPermissao('gps', 'GPS do celular ligado',
              'Sem o GPS ligado o celular não sabe onde você está.'),
          ItemPermissao('notificacao', 'Notificações',
              'Para avisar quando o motorista aceitar e quando ele chegar.',
              obrigatoria: false),
        ],
        aoLiberar: () => context.read<AppState>().atualizarLocalizacao(),
        child: const _Root(),
      ),
    );
  }
}

/// Portao de entrada: decide entre splash, onboarding, corrida ativa e home.
class _Root extends StatelessWidget {
  const _Root();

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final auth = context.watch<AuthState>();
    final ride = context.watch<RideState>();

    if (!app.bootstrapped || !auth.ready) return const SplashScreen();
    if (auth.user == null) return const WelcomeScreen();

    // Ninguem passa daqui sem aceitar. Fica antes de qualquer outra
    // tela, inclusive corrida em andamento.
    if (!auth.user!.termsAccepted) return const TermsScreen();

    final active = ride.activeRide;
    if (active != null) {
      switch (active.status) {
        case RideStatus.completed:
          return const CompleteScreen();
        case RideStatus.inProgress:
          return const RideScreen();
        default:
          return const SearchingScreen();
      }
    }

    // O mapa so abre com a posicao real do aparelho.
    if (!app.localizacaoReal) {
      return LocatingScreen(
        tentarDeNovo: () => app.atualizarLocalizacao(),
        ligarGps: () => PermissoesNativas.pedir('gps'),
      );
    }
    return const HomeScreen();
  }
}
