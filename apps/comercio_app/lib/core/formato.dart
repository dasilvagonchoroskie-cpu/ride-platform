/// Formatos e validacoes do Comercio. O servidor valida de novo: aqui e so
/// para a pessoa corrigir antes de enviar.
class Formato {
  const Formato._();

  static String digitos(String s) => s.replaceAll(RegExp(r'\D'), '');

  /// 1234 centavos -> "R$ 12,34".
  static String dinheiro(int cents) {
    final negativo = cents < 0;
    final c = cents.abs();
    final reais = (c ~/ 100).toString();
    final comPontos = reais.replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+$)'), (m) => '${m[1]}.');
    return '${negativo ? '-' : ''}R\$ $comPontos,${(c % 100).toString().padLeft(2, '0')}';
  }

  static String cnpj(String s) {
    final d = digitos(s);
    if (d.length != 14) return s;
    return '${d.substring(0, 2)}.${d.substring(2, 5)}.${d.substring(5, 8)}/${d.substring(8, 12)}-${d.substring(12)}';
  }

  static String cep(String s) {
    final d = digitos(s);
    return d.length == 8 ? '${d.substring(0, 5)}-${d.substring(5)}' : s;
  }

  /// "+5564999998888" -> "(64) 99999-8888".
  static String telefone(String s) {
    var d = digitos(s);
    if (d.length > 11 && d.startsWith('55')) d = d.substring(2);
    if (d.length == 11) return '(${d.substring(0, 2)}) ${d.substring(2, 7)}-${d.substring(7)}';
    if (d.length == 10) return '(${d.substring(0, 2)}) ${d.substring(2, 6)}-${d.substring(6)}';
    return s;
  }

  /// "2026-11-12T15:04:00.000Z" -> "12/11/2026 12:04" (horario de Brasilia).
  static String dataHora(String? iso) {
    if (iso == null || iso.isEmpty) return '';
    final d = DateTime.tryParse(iso);
    if (d == null) return '';
    final b = d.toUtc().subtract(const Duration(hours: 3));
    String dois(int n) => n.toString().padLeft(2, '0');
    return '${dois(b.day)}/${dois(b.month)}/${b.year} ${dois(b.hour)}:${dois(b.minute)}';
  }

  static String distancia(num? metros) {
    if (metros == null) return '';
    if (metros < 1000) return '${metros.round()} m';
    return '${(metros / 1000).toStringAsFixed(1).replaceAll('.', ',')} km';
  }

  static String duracao(num? segundos) {
    if (segundos == null) return '';
    final min = (segundos / 60).round();
    if (min < 60) return '$min min';
    return '${min ~/ 60} h ${(min % 60).toString().padLeft(2, '0')} min';
  }
}

class Validar {
  const Validar._();

  static bool cnpj(String valor) {
    final d = Formato.digitos(valor);
    if (d.length != 14 || RegExp(r'^(\d)\1{13}$').hasMatch(d)) return false;
    int dv(String base, List<int> pesos) {
      var soma = 0;
      for (var i = 0; i < pesos.length; i++) {
        soma += int.parse(base[i]) * pesos[i];
      }
      final r = soma % 11;
      return r < 2 ? 0 : 11 - r;
    }

    final p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    final p2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    final d1 = dv(d.substring(0, 12), p1);
    final d2 = dv(d.substring(0, 12) + d1.toString(), p2);
    return d.endsWith('$d1$d2');
  }

  static bool cpf(String valor) {
    final d = Formato.digitos(valor);
    if (d.length != 11 || RegExp(r'^(\d)\1{10}$').hasMatch(d)) return false;
    int dv(int n) {
      var soma = 0;
      for (var i = 0; i < n; i++) {
        soma += int.parse(d[i]) * (n + 1 - i);
      }
      final r = (soma * 10) % 11;
      return r == 10 ? 0 : r;
    }

    return dv(9) == int.parse(d[9]) && dv(10) == int.parse(d[10]);
  }

  static bool email(String v) => RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$').hasMatch(v.trim());

  /// Telefone brasileiro com DDD (10 ou 11 numeros; 55 na frente e aceito).
  static bool telefone(String v) {
    var d = Formato.digitos(v);
    if (d.length > 11 && d.startsWith('55')) d = d.substring(2);
    return d.length == 10 || d.length == 11;
  }

  static bool cep(String v) => Formato.digitos(v).length == 8;

  /// Mesma regra do servidor: 8+ caracteres, uma letra e um numero.
  static bool senha(String v) => v.length >= 8 && v.length <= 72 && RegExp(r'[A-Za-z]').hasMatch(v) && RegExp(r'\d').hasMatch(v);

  // ---- Mensagens para campo de formulario (null = ok) ----
  static String? obrigatorio(String? v, [String nome = 'Este campo', int min = 1]) =>
      (v == null || v.trim().length < min) ? (min > 1 ? '$nome: mínimo $min letras.' : '$nome é obrigatório.') : null;

  static String? campoCnpj(String? v) => !cnpj(v ?? '') ? 'CNPJ inválido.' : null;
  static String? campoCpf(String? v) => (v == null || v.trim().isEmpty) ? null : (!cpf(v) ? 'CPF inválido.' : null);
  static String? campoEmail(String? v) => !email(v ?? '') ? 'E-mail inválido.' : null;
  static String? campoTelefone(String? v) => !telefone(v ?? '') ? 'Telefone inválido (com DDD).' : null;
  /// Telefone de quem recebe: pode ficar vazio; preenchido, tem que ter DDD.
  static String? campoTelefoneOpcional(String? v) => (v ?? '').trim().isEmpty ? null : campoTelefone(v);
  static String? campoCep(String? v) => !cep(v ?? '') ? 'CEP inválido (8 números).' : null;
  static String? campoUf(String? v) => !RegExp(r'^[A-Za-z]{2}$').hasMatch((v ?? '').trim()) ? 'Estado: 2 letras.' : null;
  static String? campoSenha(String? v) => !senha(v ?? '') ? 'Mínimo 8 caracteres, com letra e número.' : null;
}
