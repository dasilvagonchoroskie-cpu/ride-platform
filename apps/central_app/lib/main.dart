import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'app.dart';
import 'core/config/app_config.dart';
import 'core/mapa_config.dart';
import 'painel/painel_state.dart';
import 'state/central_state.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // Mapa: guardado limitado a 200 MB e endereco das imagens vindo do servidor.
  unawaited(MapaConfig.iniciar(apiUrl: AppConfig.hasApi ? AppConfig.apiUrl : null));

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<CentralState>(create: (_) => CentralState()..restore()),
        // Mapa, fila e SOS ao vivo (comeca a perguntar ao servidor so depois do login).
        ChangeNotifierProvider<PainelState>(create: (_) => PainelState()),
      ],
      child: const CentralApp(),
    ),
  );
}
