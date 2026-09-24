import 'dart:convert';

import 'package:crypto/crypto.dart';

/// Sistema de licenca por codigo do aparelho, portado do original.
///
/// O codigo do aparelho e derivado de um identificador estavel; a chave de
/// ativacao e validada contra o codigo, de forma que a chave de um aparelho
/// nao serve em outro.
class Licenca {
  const Licenca._();

  static const String alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  /// Gera o codigo do aparelho a partir do identificador bruto.
  /// Formato: XXXX-XXXX-XXXX
  static String codigoDoAparelho(String idBruto) {
    final digest = sha256.convert(utf8.encode('taximetro:$idBruto')).bytes;
    final buffer = StringBuffer();
    for (var i = 0; i < 12; i++) {
      buffer.write(alfabeto[digest[i] % alfabeto.length]);
    }
    final codigo = buffer.toString();
    return '${codigo.substring(0, 4)}-${codigo.substring(4, 8)}-${codigo.substring(8, 12)}';
  }

  /// Deriva a chave de ativacao valida para um codigo de aparelho.
  static String chaveEsperada(String codigoAparelho) {
    final limpo = codigoAparelho.replaceAll(RegExp(r'[^A-Z0-9]'), '');
    final digest = sha256.convert(utf8.encode('chave:$limpo')).bytes;
    final buffer = StringBuffer();
    for (var i = 0; i < 16; i++) {
      buffer.write(alfabeto[digest[i] % alfabeto.length]);
    }
    final chave = buffer.toString();
    return '${chave.substring(0, 4)}-${chave.substring(4, 8)}-'
        '${chave.substring(8, 12)}-${chave.substring(12, 16)}';
  }

  /// Confere se a chave informada libera o aparelho.
  static bool conferir(String codigoAparelho, String chaveInformada) {
    final esperada = chaveEsperada(codigoAparelho);
    final normalizada = chaveInformada.trim().toUpperCase().replaceAll(RegExp(r'[^A-Z0-9]'), '');
    return normalizada == esperada.replaceAll(RegExp(r'[^A-Z0-9]'), '');
  }

  /// Formata a chave digitada: XXXX-XXXX-XXXX-XXXX
  static String formatarChaveDigitada(String valor) {
    final limpo = valor.toUpperCase().replaceAll(RegExp(r'[^A-Z0-9]'), '');
    final cortado = limpo.length > 16 ? limpo.substring(0, 16) : limpo;
    final partes = <String>[];
    for (var i = 0; i < cortado.length; i += 4) {
      partes.add(cortado.substring(i, i + 4 > cortado.length ? cortado.length : i + 4));
    }
    return partes.join('-');
  }
}
