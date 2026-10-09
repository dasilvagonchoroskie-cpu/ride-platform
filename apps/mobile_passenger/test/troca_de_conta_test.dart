// Evandro (09/10/2026): saiu da conta dele, entrou na conta da mae e o
// historico (e os destinos recentes) da conta dele continuavam aparecendo.

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_passenger/core/storage/app_storage.dart';
import 'package:mobile_passenger/core/utils/geo.dart';
import 'package:mobile_passenger/data/demo/demo_engine.dart';
import 'package:mobile_passenger/data/models/models.dart';
import 'package:mobile_passenger/state/app_state.dart';
import 'package:mobile_passenger/state/auth_state.dart';
import 'package:mobile_passenger/state/ride_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('Sair da conta limpa historico, destinos e lugares recentes', () async {
    SharedPreferences.setMockInitialValues({
      'ride.accessToken': 'token-da-conta-anterior',
      'ride.recentPlaces': 'Rua A, 10|Rua B, 20',
      'ride.recentDestinations': '[{"address":"Rodoviaria","detail":"Centro","latitude":-18.0,"longitude":-49.3}]',
      'ride.donoDosDados': 'conta-do-evandro',
    });
    final auth = AuthState();
    final corridas = RideState();
    final app = AppState();

    corridas.history = DemoEngine.history(const Coords(-18.0125, -49.3547));
    app.recentPlaces = ['Rua A, 10'];
    app.destinosRecentes = [
      const PlaceSuggestion(address: 'Rodoviaria', detail: 'Centro', coords: Coords(-18.0, -49.3), distanceKm: 1.2),
    ];
    expect(corridas.history, isNotEmpty);

    await auth.logout();

    expect(corridas.history, isEmpty);
    expect(app.recentPlaces, isEmpty);
    expect(app.destinosRecentes, isEmpty);
    expect(await AppStorage.read(AppStorage.recentPlaces), isNull);
    expect(await AppStorage.read(AppStorage.recentDestinations), isNull);
    expect(await AppStorage.read(AppStorage.donoDosDados), isNull);

    corridas.dispose();
    app.dispose();
  });
}
