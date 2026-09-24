import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'app.dart';
import 'state/driver_state.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  runApp(
    ChangeNotifierProvider<DriverState>(
      create: (_) => DriverState()..restore(),
      child: const DriverApp(),
    ),
  );
}
