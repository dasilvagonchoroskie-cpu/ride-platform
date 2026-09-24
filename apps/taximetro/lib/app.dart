import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'screens/autorizacoes_screen.dart';
import 'screens/licenca_screen.dart';
import 'screens/medidor_screen.dart';
import 'state/taximetro_state.dart';
import 'widgets/ui.dart';

class TaxiApp extends StatelessWidget {
  const TaxiApp({super.key});

  @override
  Widget build(BuildContext context) {
    final aparencia = context.watch<TaximetroState>().aparencia;
    return MaterialApp(
      title: 'Taximetro',
      debugShowCheckedModeBanner: false,
      theme: temaDoApp(aparencia),
      home: const _Raiz(),
    );
  }
}

class _Raiz extends StatelessWidget {
  const _Raiz();

  @override
  Widget build(BuildContext context) {
    final estado = context.watch<TaximetroState>();

    if (!estado.pronto) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (!estado.licenciado) return const LicencaScreen();
    return const AutorizacoesScreen(child: MedidorScreen());
  }
}
