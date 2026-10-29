/// Nome da marca no app do motorista (etapa 6): app de outro operador sai
/// com o nome dele (--dart-define MARCA_NOME, ver scripts/novo-app.sh).
class Marca {
  Marca._();

  static const String nome = String.fromEnvironment('MARCA_NOME', defaultValue: 'Fortaleza Move');
}
