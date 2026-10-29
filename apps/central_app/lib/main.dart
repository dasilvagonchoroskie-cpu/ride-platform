import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'app.dart';
import 'core/mapa_config.dart';
import 'core/medida.dart';
import 'painel/painel_state.dart';
import 'state/central_state.dart';
import 'core/mapa/map_provider.dart';
import 'core/alarme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Montagem de medicao do mapa (so na esteira "Medir o mapa"; no APK
  // normal nao faz nada).
  Medida.iniciar();
  if (Medida.ligada) await Medida.semear();
  // Mapa (TomTom): guardado limitado a 200 MB, contador do dia e o endereco
  // das imagens guardado da ultima vez (o atual vem do servidor com login).
  abrirLink = (url) async {
    await Alarme.abrir(url);
    return true;
  };
  unawaited(MapaConfig.iniciar());

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
