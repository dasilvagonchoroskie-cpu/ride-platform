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
import 'core/mapa/map_provider.dart';
import 'core/permissoes_nativas.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Montagem de medicao do mapa (so na esteira "Medir o mapa"; no APK
  // normal nao faz nada).
  Medida.iniciar();
  if (Medida.ligada) await Medida.semear();
  // Mapa (TomTom): guardado limitado a 200 MB, contador do dia e o endereco
  // das imagens guardado da ultima vez (o atual vem do servidor com login).
  abrirLink = PermissoesNativas.abrirLink;
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
