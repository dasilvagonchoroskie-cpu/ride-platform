import '../core/constantes.dart';

/// Configuracao do taximetro (equivalente ao CONFIG do original).
class ConfigTaxi {
  ConfigTaxi({
    this.bandeiradaDia = ConfigPadrao.bandeiradaDia,
    this.bandeiradaNoite = ConfigPadrao.bandeiradaNoite,
    this.horaInicioNoite = ConfigPadrao.horaInicioNoite,
    this.horaFimNoite = ConfigPadrao.horaFimNoite,
    this.kmIncluidoNaBandeirada = ConfigPadrao.kmIncluidoNaBandeirada,
    this.minutosIncluidoNaBandeirada = ConfigPadrao.minutosIncluidoNaBandeirada,
    this.navegador = ConfigPadrao.navegador,
    this.taxaKm = ConfigPadrao.taxaKm,
    this.taxaEspera = ConfigPadrao.taxaEspera,
    this.limiarVelocidadeKmh = ConfigPadrao.limiarVelocidadeKmh,
    this.motoristaNome = '',
    this.motoristaCnh = '',
    this.cnhCategoria = '',
    this.cnhValidade = '',
    this.veiculoMarca = '',
    this.veiculoModelo = '',
    this.veiculoPlaca = '',
    this.veiculoCor = '',
    this.veiculoAno = '',
    this.tipoChavePix = 'aleatoria',
    this.chavePix = '',
    this.nomeRecebedorPix = '',
    this.cidadePix = '',
  });

  double bandeiradaDia;
  double bandeiradaNoite;
  int horaInicioNoite;
  int horaFimNoite;
  double kmIncluidoNaBandeirada;
  double minutosIncluidoNaBandeirada;
  String navegador;
  double taxaKm;
  double taxaEspera;
  double limiarVelocidadeKmh;

  String motoristaNome;
  String motoristaCnh;
  String cnhCategoria;
  String cnhValidade;
  String veiculoMarca;
  String veiculoModelo;
  String veiculoPlaca;
  String veiculoCor;
  String veiculoAno;

  String tipoChavePix;
  String chavePix;
  String nomeRecebedorPix;
  String cidadePix;

  /// Bandeirada vigente conforme o horario (logica identica ao original).
  double get bandeiradaAtual {
    final hora = DateTime.now().hour;
    final inicio = horaInicioNoite;
    final fim = horaFimNoite;
    final noturno = inicio > fim
        ? (hora >= inicio || hora < fim) // ex.: 22h as 6h (vira o dia)
        : (hora >= inicio && hora < fim);
    return noturno ? bandeiradaNoite : bandeiradaDia;
  }

  bool get emHorarioNoturno {
    final hora = DateTime.now().hour;
    final inicio = horaInicioNoite;
    final fim = horaFimNoite;
    return inicio > fim ? (hora >= inicio || hora < fim) : (hora >= inicio && hora < fim);
  }

  /// Descricao do veiculo para o comprovante.
  String get descricaoVeiculo => [
        veiculoMarca,
        veiculoModelo,
        veiculoCor,
        veiculoAno,
      ].where((p) => p.trim().isNotEmpty).join(' ');

  Map<String, dynamic> toJson() => {
        'bandeiradaDia': bandeiradaDia,
        'bandeiradaNoite': bandeiradaNoite,
        'horaInicioNoite': horaInicioNoite,
        'horaFimNoite': horaFimNoite,
        'kmIncluidoNaBandeirada': kmIncluidoNaBandeirada,
        'minutosIncluidoNaBandeirada': minutosIncluidoNaBandeirada,
        'navegador': navegador,
        'taxaKm': taxaKm,
        'taxaEspera': taxaEspera,
        'limiarVelocidadeKmh': limiarVelocidadeKmh,
        'motoristaNome': motoristaNome,
        'motoristaCnh': motoristaCnh,
        'cnhCategoria': cnhCategoria,
        'cnhValidade': cnhValidade,
        'veiculoMarca': veiculoMarca,
        'veiculoModelo': veiculoModelo,
        'veiculoPlaca': veiculoPlaca,
        'veiculoCor': veiculoCor,
        'veiculoAno': veiculoAno,
        'tipoChavePix': tipoChavePix,
        'chavePix': chavePix,
        'nomeRecebedorPix': nomeRecebedorPix,
        'cidadePix': cidadePix,
      };

  factory ConfigTaxi.fromJson(Map<String, dynamic> json) => ConfigTaxi(
        bandeiradaDia: (json['bandeiradaDia'] as num?)?.toDouble() ?? ConfigPadrao.bandeiradaDia,
        bandeiradaNoite: (json['bandeiradaNoite'] as num?)?.toDouble() ?? ConfigPadrao.bandeiradaNoite,
        horaInicioNoite: (json['horaInicioNoite'] as num?)?.toInt() ?? ConfigPadrao.horaInicioNoite,
        horaFimNoite: (json['horaFimNoite'] as num?)?.toInt() ?? ConfigPadrao.horaFimNoite,
        kmIncluidoNaBandeirada:
            (json['kmIncluidoNaBandeirada'] as num?)?.toDouble() ?? ConfigPadrao.kmIncluidoNaBandeirada,
        minutosIncluidoNaBandeirada:
            (json['minutosIncluidoNaBandeirada'] as num?)?.toDouble() ?? ConfigPadrao.minutosIncluidoNaBandeirada,
        navegador: json['navegador'] as String? ?? ConfigPadrao.navegador,
        taxaKm: (json['taxaKm'] as num?)?.toDouble() ?? ConfigPadrao.taxaKm,
        taxaEspera: (json['taxaEspera'] as num?)?.toDouble() ?? ConfigPadrao.taxaEspera,
        limiarVelocidadeKmh:
            (json['limiarVelocidadeKmh'] as num?)?.toDouble() ?? ConfigPadrao.limiarVelocidadeKmh,
        motoristaNome: json['motoristaNome'] as String? ?? '',
        motoristaCnh: json['motoristaCnh'] as String? ?? '',
        cnhCategoria: json['cnhCategoria'] as String? ?? '',
        cnhValidade: json['cnhValidade'] as String? ?? '',
        veiculoMarca: json['veiculoMarca'] as String? ?? '',
        veiculoModelo: json['veiculoModelo'] as String? ?? '',
        veiculoPlaca: json['veiculoPlaca'] as String? ?? '',
        veiculoCor: json['veiculoCor'] as String? ?? '',
        veiculoAno: json['veiculoAno'] as String? ?? '',
        tipoChavePix: json['tipoChavePix'] as String? ?? 'aleatoria',
        chavePix: json['chavePix'] as String? ?? '',
        nomeRecebedorPix: json['nomeRecebedorPix'] as String? ?? '',
        cidadePix: json['cidadePix'] as String? ?? '',
      );
}
