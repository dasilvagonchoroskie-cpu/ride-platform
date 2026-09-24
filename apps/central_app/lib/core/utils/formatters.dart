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

/// Percentual formatado: 0.2 -> "20%"
String formatPercent(double value) => '${(value * 100).toStringAsFixed(1)}%';

/// Numero compacto: 12500 -> "12,5 mil"
String formatCompactNumber(int value) {
  if (value < 1000) return '$value';
  if (value < 1000000) {
    return '${(value / 1000).toStringAsFixed(1).replaceAll('.', ',')} mil';
  }
  return '${(value / 1000000).toStringAsFixed(1).replaceAll('.', ',')} mi';
}

/// Data curta: "24/09"
String formatShortDate(String iso) {
  try {
    final date = DateTime.parse(iso);
    return '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}';
  } catch (_) {
    return iso;
  }
}

/// Hora curta: "14:32"
String formatTime(String iso) {
  try {
    final date = DateTime.parse(iso);
    return '${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
  } catch (_) {
    return iso;
  }
}
