import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'app.dart';
import 'core/config/app_config.dart';
import 'core/mapa_config.dart';
import 'core/medida.dart';
import 'painel/painel_state.dart';
import 'state/central_state.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Montagem de medicao do mapa (so na esteira "Medir o mapa"; no APK
  // normal nao faz nada).
  Medida.iniciar();
  if (Medida.ligada) await Medida.semear();
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
