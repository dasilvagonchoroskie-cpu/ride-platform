/// Registro de uma corrida no historico.
class RegistroCorrida {
  RegistroCorrida({
    required this.data,
    required this.valor,
    required this.distanciaKm,
    required this.tempoS,
    required this.bandeirada,
    this.valorDistancia = 0,
    this.valorEspera = 0,
    this.tempoParadoS = 0,
    this.esperaInicialS = 0,
    this.kmIncluidoUsado = 0,
    this.minutosIncluidoUsado = 0,
    this.trajeto = '',
    this.formaPagamento = '',
  });

  DateTime data;
  double valor;
  double distanciaKm;
  int tempoS;
  double bandeirada;
  double valorDistancia;
  double valorEspera;
  int tempoParadoS;
  double esperaInicialS;
  double kmIncluidoUsado;
  double minutosIncluidoUsado;
  String trajeto;
  String formaPagamento;

  Map<String, dynamic> toJson() => {
        'data': data.toIso8601String(),
        'valor': valor,
        'distanciaKm': distanciaKm,
        'tempoS': tempoS,
        'bandeirada': bandeirada,
        'valorDistancia': valorDistancia,
        'valorEspera': valorEspera,
        'tempoParadoS': tempoParadoS,
        'esperaInicialS': esperaInicialS,
        'kmIncluidoUsado': kmIncluidoUsado,
        'minutosIncluidoUsado': minutosIncluidoUsado,
        'trajeto': trajeto,
        'formaPagamento': formaPagamento,
      };

  factory RegistroCorrida.fromJson(Map<String, dynamic> json) => RegistroCorrida(
        data: DateTime.tryParse(json['data'] as String? ?? '') ?? DateTime.now(),
        valor: (json['valor'] as num?)?.toDouble() ?? 0,
        distanciaKm: (json['distanciaKm'] as num?)?.toDouble() ?? 0,
        tempoS: (json['tempoS'] as num?)?.toInt() ?? 0,
        bandeirada: (json['bandeirada'] as num?)?.toDouble() ?? 0,
        valorDistancia: (json['valorDistancia'] as num?)?.toDouble() ?? 0,
        valorEspera: (json['valorEspera'] as num?)?.toDouble() ?? 0,
        tempoParadoS: (json['tempoParadoS'] as num?)?.toInt() ?? 0,
        esperaInicialS: (json['esperaInicialS'] as num?)?.toDouble() ?? 0,
        kmIncluidoUsado: (json['kmIncluidoUsado'] as num?)?.toDouble() ?? 0,
        minutosIncluidoUsado: (json['minutosIncluidoUsado'] as num?)?.toDouble() ?? 0,
        trajeto: json['trajeto'] as String? ?? '',
        formaPagamento: json['formaPagamento'] as String? ?? '',
      );

  /// Detalhamento da conta (mesma composicao do original).
  String get detalhamento {
    final kmCobrados = (distanciaKm - kmIncluidoUsado) < 0 ? 0.0 : distanciaKm - kmIncluidoUsado;
    final partes = <String>['bandeirada R\$ ${_m(bandeirada)}'];

    if (valorDistancia > 0) {
      partes.add('${kmCobrados.toStringAsFixed(2).replaceAll('.', ',')} km R\$ ${_m(valorDistancia)}');
    }
    if (valorEspera > 0) {
      final francaS = esperaInicialS < minutosIncluidoUsado * 60
          ? esperaInicialS
          : minutosIncluidoUsado * 60;
      final inclusos = francaS > 0 ? ' (${_t(francaS.toInt())} inclusos)' : '';
      partes.add('parado ${_t(tempoParadoS)}$inclusos R\$ ${_m(valorEspera)}');
    }
    return partes.join('  +  ');
  }

  static String _m(double v) => v.toStringAsFixed(2).replaceAll('.', ',');
  static String _t(int s) {
    final m = s ~/ 60;
    final seg = s % 60;
    return '${m.toString().padLeft(2, '0')}:${seg.toString().padLeft(2, '0')}';
  }
}
