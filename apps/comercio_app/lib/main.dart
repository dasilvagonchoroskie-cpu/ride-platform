import 'package:flutter/material.dart';

import 'app.dart';
import 'estado/sessao.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final sessao = Sessao();
  runApp(ComercioApp(sessao: sessao));
  await sessao.iniciar();
}
