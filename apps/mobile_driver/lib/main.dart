import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import 'app.dart';
import 'core/mapa/map_provider.dart';
import 'core/mapa_config.dart';
import 'core/medida.dart';
import 'state/driver_state.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Montagem de medicao do mapa (so na esteira "Medir o mapa"; no APK
  // normal nao faz nada).
  Medida.iniciar();
  if (Medida.ligada) await Medida.semear();
  // Mapa (TomTom): guardado limitado a 200 MB, contador do dia e o endereco
  // das imagens guardado da ultima vez (o atual vem do servidor com login).
  abrirLink = (url) => launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication).catchError((_) => false);
  unawaited(MapaConfig.iniciar());

  runApp(
    ChangeNotifierProvider<DriverState>(
      create: (_) => DriverState()..restore(),
      child: const DriverApp(),
    ),
  );
}
