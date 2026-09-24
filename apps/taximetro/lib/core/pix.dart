/// Geracao do payload Pix (EMV / BR Code), portada do aplicativo original.
class Pix {
  const Pix._();

  /// CRC16/CCITT-FALSE, usado pelo BR Code.
  static String crc16(String payload) {
    var resultado = 0xFFFF;
    for (var i = 0; i < payload.length; i++) {
      resultado ^= (payload.codeUnitAt(i) << 8);
      for (var j = 0; j < 8; j++) {
        resultado = (resultado & 0x8000) != 0
            ? ((resultado << 1) ^ 0x1021) & 0xFFFF
            : (resultado << 1) & 0xFFFF;
      }
    }
    return resultado.toRadixString(16).toUpperCase().padLeft(4, '0');
  }

  static String _campo(String id, String valor) =>
      '$id${valor.length.toString().padLeft(2, '0')}$valor';

  /// Sanitiza o texto: remove acentos e caracteres fora do ASCII.
  static String _limpar(String texto) {
    const acentos = {
      'á': 'a', 'à': 'a', 'ã': 'a', 'â': 'a', 'ä': 'a',
      'é': 'e', 'ê': 'e', 'è': 'e',
      'í': 'i', 'ì': 'i', 'î': 'i',
      'ó': 'o', 'õ': 'o', 'ô': 'o', 'ò': 'o',
      'ú': 'u', 'ù': 'u', 'û': 'u',
      'ç': 'c', 'ñ': 'n',
      'Á': 'A', 'À': 'A', 'Ã': 'A', 'Â': 'A',
      'É': 'E', 'Ê': 'E', 'Í': 'I', 'Ó': 'O', 'Õ': 'O', 'Ô': 'O',
      'Ú': 'U', 'Ç': 'C',
    };
    final buffer = StringBuffer();
    for (final rune in texto.runes) {
      final char = String.fromCharCode(rune);
      buffer.write(acentos[char] ?? char);
    }
    return buffer.toString().replaceAll(RegExp(r'[^\x20-\x7E]'), '');
  }

  /// Gera o payload completo do Pix.
  static String gerarPayload({
    required String chave,
    required String nomeRecebedor,
    required String cidade,
    double? valor,
    String txid = '***',
  }) {
    final nome = _limpar(nomeRecebedor).toUpperCase();
    final cidadeLimpa = _limpar(cidade).toUpperCase();

    final merchantAccount = _campo('00', 'br.gov.bcb.pix') + _campo('01', chave);

    var payload = StringBuffer()
      ..write(_campo('00', '01'))
      ..write(_campo('26', merchantAccount))
      ..write(_campo('52', '0000'))
      ..write(_campo('53', '986'));

    if (valor != null && valor > 0) {
      payload.write(_campo('54', valor.toStringAsFixed(2)));
    }

    payload
      ..write(_campo('58', 'BR'))
      ..write(_campo('59', nome.isEmpty ? 'RECEBEDOR' : nome.substring(0, nome.length > 25 ? 25 : nome.length)))
      ..write(_campo('60', cidadeLimpa.isEmpty ? 'CIDADE' : cidadeLimpa.substring(0, cidadeLimpa.length > 15 ? 15 : cidadeLimpa.length)))
      ..write(_campo('62', _campo('05', txid.isEmpty ? '***' : txid)));

    final semCrc = '${payload.toString()}6304';
    return '$semCrc${crc16(semCrc)}';
  }

  /// Detecta o tipo da chave a partir do formato digitado.
  static String detectarTipo(String chave) {
    final limpa = chave.trim();
    if (limpa.isEmpty) return 'aleatoria';
    if (limpa.contains('@')) return 'email';

    final digitos = limpa.replaceAll(RegExp(r'\D'), '');
    if (digitos.length == 11 && RegExp(r'^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$').hasMatch(limpa)) {
      return 'cpf';
    }
    if (digitos.length == 14) return 'cnpj';
    if (limpa.startsWith('+') || RegExp(r'^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$').hasMatch(limpa)) {
      return 'telefone';
    }
    if (RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
            caseSensitive: false)
        .hasMatch(limpa)) {
      return 'aleatoria';
    }
    return 'aleatoria';
  }

  /// Normaliza a chave conforme o tipo escolhido.
  static String normalizar(String tipo, String chave) {
    final limpa = chave.trim();
    switch (tipo) {
      case 'cpf':
      case 'cnpj':
        return limpa.replaceAll(RegExp(r'\D'), '');
      case 'telefone':
        var digitos = limpa.replaceAll(RegExp(r'\D'), '');
        if (!digitos.startsWith('55')) digitos = '55$digitos';
        return '+$digitos';
      case 'email':
        return limpa.toLowerCase();
      default:
        return limpa;
    }
  }

  /// Aplica mascara de exibicao conforme o tipo.
  static String formatarDigitada(String tipo, String valor) {
    final digitos = valor.replaceAll(RegExp(r'\D'), '');
    switch (tipo) {
      case 'cpf':
        final d = digitos.length > 11 ? digitos.substring(0, 11) : digitos;
        if (d.length <= 3) return d;
        if (d.length <= 6) return '${d.substring(0, 3)}.${d.substring(3)}';
        if (d.length <= 9) return '${d.substring(0, 3)}.${d.substring(3, 6)}.${d.substring(6)}';
        return '${d.substring(0, 3)}.${d.substring(3, 6)}.${d.substring(6, 9)}-${d.substring(9)}';
      case 'cnpj':
        final d = digitos.length > 14 ? digitos.substring(0, 14) : digitos;
        if (d.length <= 2) return d;
        if (d.length <= 5) return '${d.substring(0, 2)}.${d.substring(2)}';
        if (d.length <= 8) return '${d.substring(0, 2)}.${d.substring(2, 5)}.${d.substring(5)}';
        if (d.length <= 12) {
          return '${d.substring(0, 2)}.${d.substring(2, 5)}.${d.substring(5, 8)}/${d.substring(8)}';
        }
        return '${d.substring(0, 2)}.${d.substring(2, 5)}.${d.substring(5, 8)}/${d.substring(8, 12)}-${d.substring(12)}';
      case 'telefone':
        final d = digitos.length > 11 ? digitos.substring(0, 11) : digitos;
        if (d.length <= 2) return d;
        if (d.length <= 6) return '(${d.substring(0, 2)}) ${d.substring(2)}';
        if (d.length <= 10) return '(${d.substring(0, 2)}) ${d.substring(2, 6)}-${d.substring(6)}';
        return '(${d.substring(0, 2)}) ${d.substring(2, 7)}-${d.substring(7)}';
      default:
        return valor;
    }
  }
}
