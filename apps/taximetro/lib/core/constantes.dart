/// Constantes do taximetro, portadas 1:1 do aplicativo original.
class Constantes {
  const Constantes._();

  // ---- Filtros de GPS (mesmos valores do original) ----
  /// Distancia minima (m) para considerar movimento real, nao ruido.
  static const double distanciaMinimaRuidoM = 3;

  /// Abaixo desta velocidade o carro esta parado de verdade.
  static const double velocidadeParadoKmh = 2.5;

  /// Distancia (m) para valer como "saiu do lugar" e encerrar a franquia.
  static const double distanciaSaiuDoLugarM = 50;

  /// Velocidade impossivel num carro (~200 km/h): descarta o trecho.
  static const double velocidadeImpossivelMs = 55;

  /// Leitura com margem de erro pior que esta nao mede distancia.
  static const double precisaoMaximaM = 30;

  /// Valvula de seguranca quando o aparelho nao informa velocidade.
  static const double fugaDaAncoraM = 150;

  /// Teto de um unico buraco de contagem (meia hora), em segundos.
  static const int tetoDoBuracoS = 1800;

  /// Intervalo do relogio da corrida (ms).
  static const int relogioCorridaMs = 1000;

  /// Se o GPS contou ha menos que isto, deixa o tempo com ele (ms).
  static const int janelaGpsRecenteMs = 2500;

  /// Intervalo minimo entre atualizacoes da notificacao (ms).
  static const int intervaloNotificacaoMs = 1000;

  // ---- Chaves de armazenamento ----
  static const String chaveConfig = 'taxi.config';
  static const String chaveHistorico = 'taxi.historico';
  static const String chaveAparencia = 'taxi.aparencia';
  static const String chaveLicenca = 'taxi.licenca';
}

/// Configuracao padrao (CONFIG_PADRAO do original).
class ConfigPadrao {
  const ConfigPadrao._();

  static const double bandeiradaDia = 10.00;
  static const double bandeiradaNoite = 20.00;
  static const int horaInicioNoite = 22;
  static const int horaFimNoite = 6;
  static const double kmIncluidoNaBandeirada = 1.5;
  static const double minutosIncluidoNaBandeirada = 5;
  static const String navegador = 'waze';
  static const double taxaKm = 2.80;
  static const double taxaEspera = 0.55;
  static const double limiarVelocidadeKmh = 5;
}
