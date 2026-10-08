/// Configuracao do app do motorista.
///
/// `--dart-define=API_URL=...` aponta para o backend. Sem ela, o app inicia em
/// MODO DEMONSTRACAO com o fluxo completo do motorista rodando localmente.
class AppConfig {
  const AppConfig._();

  static const String apiUrl = String.fromEnvironment('API_URL', defaultValue: 'https://fortaleza-mov-backend.onrender.com');
  static const bool forceDemo = bool.fromEnvironment('FORCE_DEMO', defaultValue: false);

  /// Versao montada pela esteira: 1.0.<numero da montagem> (a mesma do
  /// nome do APK). Sobe sozinha a cada montagem — ninguem precisa lembrar.
  static const String appVersion = String.fromEnvironment('APP_VERSION', defaultValue: '1.0.0');
  static const Duration apiTimeout = Duration(seconds: 60);

  /// Intervalo de envio da posicao do motorista (heartbeat).
  /// Posicao para o servidor a cada 4 s (especificacao: 3 a 5 s), online ou em corrida.
  static const Duration locationInterval = Duration(seconds: 4);

  static bool get hasApi => apiUrl.isNotEmpty && !forceDemo;
}
