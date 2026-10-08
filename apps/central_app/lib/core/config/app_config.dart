/// Configuracao da Central.
///
/// `--dart-define=API_URL=...` aponta para o backend/Firestore. Sem ela, a
/// Central inicia em MODO DEMONSTRACAO com dados simulados no aparelho.
class AppConfig {
  const AppConfig._();

  static const String apiUrl = String.fromEnvironment('API_URL', defaultValue: 'https://fortaleza-mov-backend.onrender.com');
  static const bool forceDemo = bool.fromEnvironment('FORCE_DEMO', defaultValue: false);

  /// Projeto Firebase (Firestore) usado quando API_URL nao esta definido.
  static const String firebaseProjectId =
      String.fromEnvironment('FIREBASE_PROJECT_ID', defaultValue: '');

  /// Versao montada pela esteira: 1.0.<numero da montagem> (a mesma do
  /// nome do APK). Sobe sozinha a cada montagem — ninguem precisa lembrar.
  static const String appVersion = String.fromEnvironment('APP_VERSION', defaultValue: '1.0.0');
  static const Duration apiTimeout = Duration(seconds: 60);

  /// Intervalo de atualizacao do mapa de monitoramento.
  static const Duration monitorInterval = Duration(seconds: 5);

  static bool get hasApi => apiUrl.isNotEmpty && !forceDemo;
  static bool get hasFirebase => firebaseProjectId.isNotEmpty;
}
