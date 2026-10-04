/// PIX "Copia e Cola" estatico (BR Code do Banco Central), feito no proprio
/// aparelho a partir da chave e do nome da Central. Sem valor: o motorista
/// digita no banco quanto quer recarregar.
String pixCopiaECola({required String chave, required String nome, String cidade = 'GOIATUBA'}) {
  String limpar(String s, int max) {
    const de = 'ÀÁÂÃÄÇÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜàáâãäçèéêëìíîïòóôõöùúûü';
    const para = 'AAAAACEEEEIIIIOOOOOUUUUaaaaaceeeeiiiiooooouuuu';
    final b = StringBuffer();
    for (final ch in s.split('')) {
      final i = de.indexOf(ch);
      b.write(i >= 0 ? para[i] : ch);
    }
    final t = b.toString().toUpperCase().replaceAll(RegExp(r'[^A-Z0-9 ]'), '').trim();
    return t.length > max ? t.substring(0, max) : t;
  }

  String campo(String id, String valor) => '$id${valor.length.toString().padLeft(2, '0')}$valor';

  final conta = campo('00', 'br.gov.bcb.pix') + campo('01', chave.trim());
  final semCrc = '${campo('00', '01')}'
      '${campo('26', conta)}'
      '${campo('52', '0000')}'
      '${campo('53', '986')}'
      '${campo('58', 'BR')}'
      '${campo('59', limpar(nome.isEmpty ? 'FORTALEZA MOV' : nome, 25))}'
      '${campo('60', limpar(cidade, 15))}'
      '${campo('62', campo('05', '***'))}'
      '6304';
  return '$semCrc${_crc16(semCrc)}';
}

/// CRC16-CCITT (polinomio 0x1021, inicio 0xFFFF), como o Banco Central pede.
String _crc16(String dados) {
  var crc = 0xFFFF;
  for (final byte in dados.codeUnits) {
    crc ^= byte << 8;
    for (var i = 0; i < 8; i++) {
      crc = (crc & 0x8000) != 0 ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
  }
  return crc.toRadixString(16).toUpperCase().padLeft(4, '0');
}
