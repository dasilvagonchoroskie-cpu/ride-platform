import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'app.dart';
import 'core/config/app_config.dart';
import 'core/mapa_config.dart';
import 'state/driver_state.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // Mapa: guardado limitado a 200 MB e endereco das imagens vindo do servidor.
  unawaited(MapaConfig.iniciar(apiUrl: AppConfig.hasApi ? AppConfig.apiUrl : null));

  runApp(
    ChangeNotifierProvider<DriverState>(
      create: (_) => DriverState()..restore(),
      child: const DriverApp(),
    ),
  );
}
