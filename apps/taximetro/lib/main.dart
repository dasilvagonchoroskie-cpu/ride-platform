import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'app.dart';
import 'state/taximetro_state.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(
    ChangeNotifierProvider<TaximetroState>(
      create: (_) => TaximetroState()..iniciar(),
      child: const TaxiApp(),
    ),
  );
}
