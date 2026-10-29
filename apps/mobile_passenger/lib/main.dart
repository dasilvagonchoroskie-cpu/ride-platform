import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'app.dart';
import 'core/mapa_config.dart';
import 'core/medida.dart';
import 'state/app_state.dart';
import 'state/auth_state.dart';
import 'state/config_state.dart';
import 'state/ride_state.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Montagem de medicao do mapa (so na esteira "Medir o mapa"; no APK
  // normal nao faz nada).
  Medida.iniciar();
  if (Medida.ligada) await Medida.semear();
  // Mapa: guardado limitado a 200 MB e endereco guardado (o servidor manda
  // o atual junto com a configuracao do app, em ConfigState).
  unawaited(MapaConfig.iniciar());

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<AppState>(create: (_) => AppState()..bootstrap()),
        ChangeNotifierProvider<AuthState>(create: (_) => AuthState()..restore()),
        ChangeNotifierProvider<RideState>(create: (_) => RideState()..restore()),
        ChangeNotifierProvider<ConfigState>(create: (_) => ConfigState()..iniciar()),
      ],
      child: const RideApp(),
    ),
  );
}
