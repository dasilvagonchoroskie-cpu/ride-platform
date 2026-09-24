/// Configuracao do app.
///
/// A URL do backend vem de `--dart-define=API_URL=...` no momento do build.
/// Sem ela, o app inicia em MODO DEMONSTRACAO: o fluxo completo de corrida
/// roda no proprio aparelho, sem rede.
class AppConfig {
  const AppConfig._();

  static const String apiUrl = String.fromEnvironment('API_URL', defaultValue: '');
  static const bool forceDemo = bool.fromEnvironment('FORCE_DEMO', defaultValue: false);

  /// Chave do Google Maps SDK, injetada no build:
  /// `--dart-define=MAPS_API_KEY=...`
  static const String mapsApiKey = String.fromEnvironment('MAPS_API_KEY', defaultValue: '');

  /// Sem chave, o mapa usa o renderizador estilizado proprio (nunca o
  /// retangulo cinza do SDK sem credencial).
  static bool get hasMaps => mapsApiKey.isNotEmpty;

  static const String appVersion = '0.1.0';
  static const Duration apiTimeout = Duration(seconds: 15);

  static bool get hasApi => apiUrl.isNotEmpty && !forceDemo;
}
