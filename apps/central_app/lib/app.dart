import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'core/theme/central_theme.dart';
import 'screens/login_screen.dart';
import 'screens/shell_screen.dart';
import 'screens/splash_screen.dart';
import 'state/central_state.dart';
import 'core/avisos.dart';
import 'core/posicao_aparelho.dart';
import 'screens/permissoes_screen.dart';

class CentralApp extends StatelessWidget {
  const CentralApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      scaffoldMessengerKey: avisos,
      title: 'Fortaleza Mov Central',
      debugShowCheckedModeBanner: false,
      theme: CentralTheme.dark,
      // Logo ao instalar: autorizacoes antes de qualquer outra tela.
      home: const PortaoPermissoes(
        itens: [
          ItemPermissao('localizacao', 'Localização',
              'Para o mapa de monitoramento abrir na sua cidade.',
              obrigatoria: false),
          ItemPermissao('notificacao', 'Notificações',
              'Para avisos da operação, como cadastro novo esperando aprovação.',
              obrigatoria: false),
        ],
        aoLiberar: PosicaoDoAparelho.carregar,
        child: _Root(),
      ),
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
