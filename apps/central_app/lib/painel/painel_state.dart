import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/alarme.dart';
import '../core/api/api_client.dart';
import '../core/posicao_aparelho.dart';
import '../core/storage/app_storage.dart';
import '../core/utils/geo.dart';
import '../data/painel.dart';

/// Estado ao vivo do painel: mapa, fila de corridas e alertas de SOS.
/// Pergunta ao servidor a cada 5 segundos enquanto a Central esta aberta.
class PainelState extends ChangeNotifier {
  PainelState([PainelApi? api]) : api = api ?? PainelApi();

  final PainelApi api;

  Indicadores indicadores = const Indicadores();
  List<CorridaAtiva> corridas = const [];
  List<MotoristaOnline> motoristas = const [];
  List<AlertaSos> alertas = const [];

  /// Ultima falha ao falar com o servidor (mostrada no topo do mapa).
  String? erro;
  DateTime? atualizadoEm;

  /// Alertas que a pessoa ja viu e silenciou (o som para; o alerta fica).
  final Set<String> _silenciados = {};

  Timer? _vigia;
  bool _consultando = false;

  /// Cadastro de motorista novo que a Central ainda nao viu: a casca abre
  /// uma janela com som (Evandro, 08/10/2026: "nao recebi notificacao
  /// nenhuma de que tinha motorista pendente de aprovacao").
  MotoristaPendenteResumo? pendenteNovo;

  /// Ultimo cadastro pendente ja mostrado (guardado no aparelho para nao
  /// repetir o aviso a cada abertura). null = ainda nao lido do aparelho.
  String? _pendenteVisto;
  bool _pendenteVistoLido = false;
  static const String _chavePendenteVisto = 'central.pendenteVisto';

  /// Motorista ativo que trocou a foto de perfil (ou outro documento) e a
  /// Central ainda nao viu o aviso (Evandro, 09/10/2026).
  DocumentoParaConferir? fotoNova;
  String? _fotoVista;
  bool _fotoVistaLida = false;
  static const String _chaveFotoVista = 'central.documentoVisto';

  Coords get centro {
    if (PosicaoDoAparelho.atual != null) return PosicaoDoAparelho.atual!;
    if (motoristas.any((m) => m.posicao != null)) return motoristas.firstWhere((m) => m.posicao != null).posicao!;
    if (corridas.isNotEmpty) return corridas.first.embarque;
    return const Coords(-18.0125, -49.3547);
  }

  List<AlertaSos> get alertasNovos => alertas.where((a) => !_silenciados.contains(a.id)).toList();

  void iniciar() {
    _vigia?.cancel();
    unawaited(carregarEu());
    atualizar();
    _vigia = Timer.periodic(const Duration(seconds: 5), (_) => atualizar());
  }

  // ------------------------------------------------------------------
  // Cidades (Evandro, 08/10/2026): uma Central so; o dono ve todas e
  // escolhe a cidade no topo; o operador de uma cidade ve so a dele.
  // ------------------------------------------------------------------

  /// Quem esta na Central. null = ainda nao sabe (trata como dono; quem
  /// decide o que cada conta ve e o servidor).
  QuemSouEu? eu;

  bool get dono => eu?.dono ?? true;

  /// Cidade escolhida pelo dono (null = todas as cidades).
  String? get pracaEscolhida => api.praca;

  static const String _chavePraca = 'central.praca';

  Future<void> carregarEu() async {
    try {
      eu = await api.eu();
      if (eu!.dono) {
        final guardada = await AppStorage.read(_chavePraca);
        api.praca = guardada != null && eu!.pracas.any((p) => p.id == guardada) ? guardada : null;
      } else {
        api.praca = null; // o servidor ja filtra pela cidade do operador
      }
      notifyListeners();
    } catch (_) {
      // Servidor antigo ou sem rede: segue como dono, sem filtro.
    }
  }

  /// O dono troca a cidade do topo (null = todas). Tudo recarrega.
  Future<void> escolherPraca(String? id) async {
    api.praca = id;
    try {
      if (id == null) {
        await AppStorage.remove(_chavePraca);
      } else {
        await AppStorage.write(_chavePraca, id);
      }
    } catch (_) {}
    notifyListeners();
    await atualizar();
  }

  /// Nome da cidade que esta na tela (para o topo e os relatorios).
  String get nomeDaCidadeNaTela {
    final e = eu;
    if (e == null) return 'Todas as cidades';
    if (!e.dono) return e.pracaNome ?? 'Minha cidade';
    final id = api.praca;
    if (id == null) return e.pracas.length > 1 ? 'Todas as cidades' : (e.pracas.isEmpty ? 'Todas as cidades' : e.pracas.first.rotulo);
    return e.pracas.where((p) => p.id == id).map((p) => p.rotulo).firstOrNull ?? 'Todas as cidades';
  }

  void parar() {
    _vigia?.cancel();
    _vigia = null;
    Alarme.parar();
  }

  Future<void> atualizar() async {
    if (_consultando) return;
    _consultando = true;
    try {
      final r = await Future.wait([
        api.indicadores(),
        api.corridas(),
        api.motoristasOnline(centro, todos: true),
        api.alertas(),
      ]);
      indicadores = r[0] as Indicadores;
      corridas = r[1] as List<CorridaAtiva>;
      motoristas = r[2] as List<MotoristaOnline>;
      alertas = r[3] as List<AlertaSos>;
      erro = null;
      atualizadoEm = DateTime.now();
      _silenciados.removeWhere((id) => !alertas.any((a) => a.id == id));
      if (alertasNovos.isNotEmpty) {
        Alarme.tocar();
      } else {
        Alarme.parar();
      }
      await _conferirPendente();
      await _conferirDocumentoNovo();
      _falhasSeguidas = 0;
    } on ApiException catch (e) {
      _falhou(e.code == 'NETWORK_ERROR'
          ? 'Sem internet no celular agora. Tentando de novo…'
          : e.message);
    } catch (_) {
      _falhou('Sem internet no celular agora. Tentando de novo…');
    } finally {
      _consultando = false;
      notifyListeners();
    }
  }

  /// Chegou cadastro novo (ou havia um que a Central nunca viu)? Avisa uma
  /// vez: janela, som curto e notificacao do Android.
  Future<void> _conferirPendente() async {
    if (!_pendenteVistoLido) {
      try {
        _pendenteVisto = await AppStorage.read(_chavePendenteVisto);
      } catch (_) {}
      _pendenteVistoLido = true;
    }
    final ultimo = indicadores.ultimoPendente;
    if (ultimo == null || ultimo.id.isEmpty) {
      pendenteNovo = null;
      return;
    }
    if (ultimo.id == _pendenteVisto || ultimo.id == pendenteNovo?.id) return;
    pendenteNovo = ultimo;
    final outros = indicadores.pendentes - 1;
    await Alarme.aviso(
      'Motorista aguardando aprovação',
      '${ultimo.nome} terminou o cadastro${outros > 0 ? ' (e mais $outros na fila)' : ''}. Toque para conferir.',
      id: ultimo.id,
    );
  }

  /// Motorista ativo mandou foto nova (ou documento novo)? Avisa uma vez.
  Future<void> _conferirDocumentoNovo() async {
    if (!_fotoVistaLida) {
      try {
        _fotoVista = await AppStorage.read(_chaveFotoVista);
      } catch (_) {}
      _fotoVistaLida = true;
    }
    final ultimo = indicadores.ultimoParaConferir;
    if (ultimo == null || ultimo.id.isEmpty) {
      fotoNova = null;
      return;
    }
    if (ultimo.id == _fotoVista || ultimo.id == fotoNova?.id) return;
    fotoNova = ultimo;
    await Alarme.aviso(
      ultimo.ehFotoDePerfil ? 'Foto nova para conferir' : 'Documento para conferir',
      ultimo.ehFotoDePerfil
          ? '${ultimo.nome} trocou a foto de perfil. Toque para aprovar ou recusar.'
          : '${ultimo.nome} tem ${nomeDoDocumento(ultimo.tipo)} esperando a Central. Toque para conferir.',
      id: ultimo.id,
    );
  }

  /// A pessoa viu o aviso da foto nova.
  Future<void> marcarDocumentoVisto() async {
    final d = fotoNova;
    if (d == null) return;
    _fotoVista = d.id;
    fotoNova = null;
    try {
      await AppStorage.write(_chaveFotoVista, d.id);
    } catch (_) {}
    notifyListeners();
  }

  /// A pessoa viu o aviso (abriu o cadastro ou deixou para depois).
  Future<void> marcarPendenteVisto() async {
    final p = pendenteNovo;
    if (p == null) return;
    _pendenteVisto = p.id;
    pendenteNovo = null;
    try {
      await AppStorage.write(_chavePendenteVisto, p.id);
    } catch (_) {}
    notifyListeners();
  }

  /// Uma falha so (rede piscou) nao vira faixa vermelha: o painel segue com
  /// o ultimo retrato e tenta de novo em 5 s. So avisa depois de 2 seguidas,
  /// e sem o texto tecnico do erro (Evandro, 08/10/2026).
  int _falhasSeguidas = 0;

  void _falhou(String mensagem) {
    _falhasSeguidas += 1;
    if (_falhasSeguidas >= 2) erro = mensagem;
  }

  void silenciar(String alertaId) {
    _silenciados.add(alertaId);
    if (alertasNovos.isEmpty) Alarme.parar();
    notifyListeners();
  }

  Future<void> encerrarAlerta(String id, String nota) async {
    await api.encerrarAlerta(id, nota);
    _silenciados.add(id);
    await atualizar();
  }

  @override
  void dispose() {
    parar();
    super.dispose();
  }
}
