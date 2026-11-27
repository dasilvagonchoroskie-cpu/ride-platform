/// O que o motorista mudou nos dados do carro. Mesma regra do servidor:
/// maiuscula/minuscula e espaco sobrando nao contam.
List<String> mudancasDoCarro(Map<String, dynamic> antes, Map<String, dynamic> depois) {
  String normal(Object? v) => '${v ?? ''}'.trim().replaceAll(RegExp(r'\s+'), ' ').toLowerCase();
  return [
    for (final (campo, rotulo) in const [('brand', 'Marca'), ('model', 'Modelo'), ('year', 'Ano'), ('color', 'Cor')])
      if (depois[campo] != null && normal(antes[campo]) != normal(depois[campo]))
        '$rotulo: ${'${antes[campo] ?? '-'}'.trim()} → ${'${depois[campo]}'.trim()}',
  ];
}
