/// Configuracao do app Comercio. A URL do servidor vem do build
/// (`--dart-define=API_URL=...`); sem ela usa o servidor de testes atual.
class AppConfig {
  const AppConfig._();

  static const String apiUrl = String.fromEnvironment('API_URL', defaultValue: 'https://fortaleza-mov-backend.onrender.com');

  /// Versao montada pela esteira: 1.0.N.
  static const String appVersion = String.fromEnvironment('APP_VERSION', defaultValue: '1.0.0');

  static const Duration apiTimeout = Duration(seconds: 60);

  /// Acompanhamento da entrega: de quantos em quantos segundos atualiza.
  static const Duration atualizacao = Duration(seconds: 8);

  /// Centro usado so para orientar a busca de enderecos quando o
  /// estabelecimento ainda nao tem localizacao (Goiatuba, GO).
  static const double centroLat = -18.0108;
  static const double centroLng = -49.3558;
}
