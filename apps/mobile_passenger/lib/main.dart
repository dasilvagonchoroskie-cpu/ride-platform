import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'app.dart';
import 'state/app_state.dart';
import 'state/auth_state.dart';
import 'state/ride_state.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<AppState>(create: (_) => AppState()..bootstrap()),
        ChangeNotifierProvider<AuthState>(create: (_) => AuthState()..restore()),
        ChangeNotifierProvider<RideState>(create: (_) => RideState()..restore()),
      ],
      child: const RideApp(),
    ),
  );
}
