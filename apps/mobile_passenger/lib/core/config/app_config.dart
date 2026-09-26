/// Configuracao do app.
///
/// A URL do backend vem de `--dart-define=API_URL=...` no momento do build.
/// Sem ela, o app inicia em MODO DEMONSTRACAO: o fluxo completo de corrida
/// roda no proprio aparelho, sem rede.
class AppConfig {
  const AppConfig._();

  static const String apiUrl = String.fromEnvironment('API_URL', defaultValue: 'https://fortaleza-mov-backend.onrender.com');
  static const bool forceDemo = bool.fromEnvironment('FORCE_DEMO', defaultValue: false);


  static const String appVersion = '0.2.0';
  static const Duration apiTimeout = Duration(seconds: 60);

  static bool get hasApi => apiUrl.isNotEmpty && !forceDemo;
}
