import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'app.dart';
import 'state/central_state.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  runApp(
    ChangeNotifierProvider<CentralState>(
      create: (_) => CentralState()..restore(),
      child: const CentralApp(),
    ),
  );
}
