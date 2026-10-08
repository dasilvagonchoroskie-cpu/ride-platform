import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

final NumberFormat _currency = NumberFormat.currency(locale: 'pt_BR', symbol: 'R\$');

/// 1234 -> "R$ 12,34". Todo dinheiro circula em centavos.
String formatMoney(int cents) => _currency.format(cents / 100);

/// Mascara de telefone enquanto o usuario digita: (11) 91234-5678
String formatPhoneInput(String value) {
  final digits = value.replaceAll(RegExp(r'\D'), '');
  final d = digits.length > 11 ? digits.substring(0, 11) : digits;

  if (d.length <= 2) return d;
  if (d.length <= 6) return '(${d.substring(0, 2)}) ${d.substring(2)}';
  if (d.length <= 10) {
    return '(${d.substring(0, 2)}) ${d.substring(2, 6)}-${d.substring(6)}';
  }
  return '(${d.substring(0, 2)}) ${d.substring(2, 7)}-${d.substring(7)}';
}

String onlyDigits(String value) => value.replaceAll(RegExp(r'\D'), '');

/// Telefone da conta (+5564992686632) para mostrar: (64) 99268-6632.
String telefoneBonito(String? e164) {
  if (e164 == null || e164.isEmpty) return '';
  var d = onlyDigits(e164);
  if (d.startsWith('55') && d.length > 11) d = d.substring(2);
  return formatPhoneInput(d);
}

String formatDateTime(String iso) {
  try {
    return DateFormat('dd/MM/yyyy HH:mm').format(DateTime.parse(iso));
  } catch (_) {
    return iso;
  }
}

// ---------------------------------------------------------------------
// Datas e duracoes em portugues, sem depender de pacote de idioma.
// ---------------------------------------------------------------------

const List<String> mesesCurtos = [
  'jan.', 'fev.', 'mar.', 'abr.', 'maio', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.',
];

const List<String> mesesLongos = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const List<String> diasCurtos = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

String _dois(int n) => n.toString().padLeft(2, '0');

/// "21 de set."
String diaMes(DateTime d) => '${d.day} de ${mesesCurtos[d.month - 1]}';

/// "23 de set - 17:12"
String diaMesHora(DateTime d) =>
    '${d.day} de ${mesesCurtos[d.month - 1].replaceAll('.', '')} - ${_dois(d.hour)}:${_dois(d.minute)}';

/// "25/09/2026"
String dataCurta(DateTime d) => '${_dois(d.day)}/${_dois(d.month)}/${d.year}';

/// 7080 -> "1h 58min"; 660 -> "11min"; 20 -> "0min"
String formatDuracao(int segundos) {
  final minutos = segundos ~/ 60;
  final h = minutos ~/ 60;
  final m = minutos % 60;
  if (h == 0) return '${m}min';
  return m == 0 ? '${h}h' : '${h}h ${m}min';
}

/// Valor em reais, ou pontinhos quando o motorista escondeu os valores.
String dinheiro(int centavos, {bool oculto = false}) => oculto ? r'R$ ••••' : formatMoney(centavos);

/// "2 corridas" / "1 corrida"
String corridas(int n) => n == 1 ? '1 corrida' : '$n corridas';


// ---------------------------------------------------------------------
// Datas digitadas pelo motorista (cadastro).
// ---------------------------------------------------------------------

/// Le uma data no padrao brasileiro, com ou sem barras:
/// "18/06/2031", "18-06-2031", "18.06.2031" e "18062031" viram 18 de junho de 2031.
/// Tambem aceita o formato que vem do servidor ("2031-06-18").
/// Data que nao existe (31/02) ou incompleta devolve null.
DateTime? lerDataBr(String entrada) {
  final s = entrada.trim();
  final iso = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(s);
  int dia, mes, ano;
  if (iso != null) {
    ano = int.parse(iso.group(1)!);
    mes = int.parse(iso.group(2)!);
    dia = int.parse(iso.group(3)!);
  } else {
    final partes = RegExp(r'^(\d{1,2})\D(\d{1,2})\D(\d{4})$').firstMatch(s);
    final so = s.replaceAll(RegExp(r'\D'), '');
    if (partes != null) {
      dia = int.parse(partes.group(1)!);
      mes = int.parse(partes.group(2)!);
      ano = int.parse(partes.group(3)!);
    } else if (so.length == 8 && so.length == s.length) {
      dia = int.parse(so.substring(0, 2));
      mes = int.parse(so.substring(2, 4));
      ano = int.parse(so.substring(4));
    } else {
      return null;
    }
  }
  if (ano < 1900 || ano > 2100 || mes < 1 || mes > 12 || dia < 1) return null;
  final data = DateTime(ano, mes, dia);
  // 31/02 "vira" marco no DateTime; aqui isso e data invalida.
  if (data.year != ano || data.month != mes || data.day != dia) return null;
  return data;
}

/// "18/06/2031" -> "2031-06-18" (o que o servidor espera). Invalida volta como veio.
String dataBrParaIso(String entrada) {
  final d = lerDataBr(entrada);
  if (d == null) return entrada.trim();
  return '${d.year}-${_dois(d.month)}-${_dois(d.day)}';
}

/// Coloca as barras sozinho enquanto digita: 18062031 -> 18/06/2031.
class MascaraData extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue antes, TextEditingValue depois) {
    var d = depois.text.replaceAll(RegExp(r'\D'), '');
    if (d.length > 8) d = d.substring(0, 8);
    final b = StringBuffer();
    for (var i = 0; i < d.length; i++) {
      if (i == 2 || i == 4) b.write('/');
      b.write(d[i]);
    }
    final texto = b.toString();
    return TextEditingValue(text: texto, selection: TextSelection.collapsed(offset: texto.length));
  }
}

/// Coloca pontos e traco no CPF enquanto digita: 000.000.000-00.
class MascaraCpf extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue antes, TextEditingValue depois) {
    var d = depois.text.replaceAll(RegExp(r'\D'), '');
    if (d.length > 11) d = d.substring(0, 11);
    final b = StringBuffer();
    for (var i = 0; i < d.length; i++) {
      if (i == 3 || i == 6) b.write('.');
      if (i == 9) b.write('-');
      b.write(d[i]);
    }
    final texto = b.toString();
    return TextEditingValue(text: texto, selection: TextSelection.collapsed(offset: texto.length));
  }
}
