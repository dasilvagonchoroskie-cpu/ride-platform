import 'package:flutter/services.dart';

import 'formatters.dart';

// Conferencias feitas no aparelho, antes de enviar: o servidor confere
// de novo, mas assim a pessoa ve o erro na hora, embaixo do campo.

bool cpfValido(String valor) {
  final cpf = onlyDigits(valor);
  if (cpf.length != 11 || RegExp(r'^(\d)\1{10}$').hasMatch(cpf)) return false;
  int digito(String parte) {
    var soma = 0;
    for (var i = 0; i < parte.length; i++) {
      soma += int.parse(parte[i]) * (parte.length + 1 - i);
    }
    final resto = (soma * 10) % 11;
    return resto == 10 ? 0 : resto;
  }

  final d1 = digito(cpf.substring(0, 9));
  final d2 = digito(cpf.substring(0, 10));
  return d1 == int.parse(cpf[9]) && d2 == int.parse(cpf[10]);
}

/// 12345678909 -> 123.456.789-09 (aceita digitacao pela metade).
String formatarCpf(String valor) {
  final d = onlyDigits(valor);
  final c = d.length > 11 ? d.substring(0, 11) : d;
  final b = StringBuffer();
  for (var i = 0; i < c.length; i++) {
    if (i == 3 || i == 6) b.write('.');
    if (i == 9) b.write('-');
    b.write(c[i]);
  }
  return b.toString();
}

bool emailValido(String valor) =>
    RegExp(r'^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$').hasMatch(valor.trim());

/// Mesma regra do servidor: 8 a 72 caracteres, com letra e numero.
String? problemaSenha(String senha) {
  if (senha.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (senha.length > 72) return 'A senha pode ter no máximo 72 caracteres.';
  if (!RegExp(r'[A-Za-z]').hasMatch(senha)) return 'Use pelo menos uma letra.';
  if (!RegExp(r'\d').hasMatch(senha)) return 'Use pelo menos um número.';
  return null;
}

/// "Nome e sobrenome": pelo menos duas palavras com 2 letras ou mais.
bool nomeCompleto(String valor) =>
    valor.trim().split(RegExp(r'\s+')).where((p) => p.length >= 2).length >= 2;

/// Mascara aplicada enquanto a pessoa digita.
class MascaraTexto extends TextInputFormatter {
  MascaraTexto(this.formatar);

  final String Function(String) formatar;

  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final texto = formatar(newValue.text);
    return TextEditingValue(text: texto, selection: TextSelection.collapsed(offset: texto.length));
  }
}

final MascaraTexto mascaraCpf = MascaraTexto(formatarCpf);
final MascaraTexto mascaraTelefone = MascaraTexto(formatPhoneInput);
