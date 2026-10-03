import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'app.dart';
import 'painel/painel_state.dart';
import 'state/central_state.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

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
