/// Configuracao do app do motorista.
///
/// `--dart-define=API_URL=...` aponta para o backend. Sem ela, o app inicia em
/// MODO DEMONSTRACAO com o fluxo completo do motorista rodando localmente.
class AppConfig {
  const AppConfig._();

  static const String apiUrl = String.fromEnvironment('API_URL', defaultValue: '');
  static const bool forceDemo = bool.fromEnvironment('FORCE_DEMO', defaultValue: false);

  static const String appVersion = '0.1.0';
  static const Duration apiTimeout = Duration(seconds: 15);

  /// Intervalo de envio da posicao do motorista (heartbeat).
  static const Duration locationInterval = Duration(seconds: 5);

  static bool get hasApi => apiUrl.isNotEmpty && !forceDemo;
}
