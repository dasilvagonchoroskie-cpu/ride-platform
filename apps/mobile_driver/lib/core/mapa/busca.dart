import 'uso_local.dart';
import '../mapa_config.dart';

/// Regras da busca digitada (economia da cota da TomTom, 29/10/2026).
class RegrasDaBusca {
  const RegrasDaBusca._();

  /// Palavras que nao contam para as 3 letras ("Rua A" ainda nao busca).
  static final RegExp _tipoDeRua = RegExp(
    r'^(rua|r\.?|avenida|av\.?|travessa|tv\.?|trav\.?|alameda|al\.?|rodovia|rod\.?|estrada|est\.?)$',
    caseSensitive: false,
  );

  /// Letras e numeros que importam, sem contar "rua", "avenida", "av.", "travessa"...
  static int letrasUteis(String texto) {
    final palavras = texto.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty && !_tipoDeRua.hasMatch(p));
    return palavras.join().replaceAll(RegExp(r'[^0-9A-Za-zÀ-ÿ]'), '').length;
  }

  /// Ja pode buscar (3 letras uteis ou mais).
  static bool podeBuscar(String texto) => letrasUteis(texto) >= 3;

  /// Espera depois da ultima tecla: 500 ms; no modo economia, 900 ms.
  static Duration get espera => Duration(milliseconds: MapaConfig.economia ? 900 : 500);

  /// Chegou no teto do dia deste celular: so busca quando a pessoa toca em Buscar.
  static bool get soComToque => UsoLocal.acabou('buscas');
}

/// Guardado das buscas desta abertura do app (o servidor guarda por 3 dias
/// para todos; aqui nem pergunta de novo).
class BuscasGuardadas<T> {
  BuscasGuardadas({this.maximo = 60});

  final int maximo;
  final Map<String, List<T>> _itens = {};

  static String chave(String texto, double lat, double lng) =>
      '${texto.trim().toLowerCase().replaceAll(RegExp(r'\s+'), ' ')}|${lat.toStringAsFixed(2)}|${lng.toStringAsFixed(2)}';

  List<T>? ler(String chave) => _itens[chave];

  void gravar(String chave, List<T> lista) {
    if (_itens.length >= maximo) _itens.remove(_itens.keys.first);
    _itens[chave] = lista;
  }
}
