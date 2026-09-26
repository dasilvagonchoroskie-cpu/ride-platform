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
