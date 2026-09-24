/// Formatacao identica ao aplicativo original.
class Formato {
  const Formato._();

  /// 12.5 -> "12,50"
  static String moeda(double valor) => valor.toStringAsFixed(2).replaceAll('.', ',');

  /// Segundos -> "MM:SS" ou "HH:MM:SS"
  static String tempo(num segundosTotais) {
    final s = segundosTotais.floor();
    final h = s ~/ 3600;
    final m = (s % 3600) ~/ 60;
    final seg = s % 60;
    String doisDig(int n) => n.toString().padLeft(2, '0');
    return h > 0 ? '${doisDig(h)}:${doisDig(m)}:${doisDig(seg)}' : '${doisDig(m)}:${doisDig(seg)}';
  }

  /// Quilometros com duas casas: 3.456 -> "3,46"
  static String km(double valor) => valor.toStringAsFixed(2).replaceAll('.', ',');

  /// "R$ 12,50"
  static String moedaComPrefixo(double valor) => 'R\$ ${moeda(valor)}';

  static const List<String> meses = [
    'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ];

  /// Data por extenso: "24 de setembro de 2026"
  static String dataPorExtenso(DateTime data) =>
      '${data.day} de ${meses[data.month - 1]} de ${data.year}';

  /// Data curta do historico: "24/09 14:32"
  static String dataHistorico(DateTime data) {
    String d(int n) => n.toString().padLeft(2, '0');
    return '${d(data.day)}/${d(data.month)} ${d(data.hour)}:${d(data.minute)}';
  }

  static String dataIso(DateTime data) {
    String d(int n) => n.toString().padLeft(2, '0');
    return '${data.year}-${d(data.month)}-${d(data.day)}';
  }
}
