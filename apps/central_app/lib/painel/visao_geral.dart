import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart' as gm;
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';

import '../core/theme/central_theme.dart';
import '../core/utils/geo.dart';
import '../data/painel.dart';
import '../widgets/bussola.dart';
import '../widgets/mapa_google.dart';
import 'comuns.dart';
import 'mapa_operacional.dart';
import 'painel_state.dart';
import '../core/mapa_config.dart';
import '../core/medida.dart';

LatLng _ll(Coords c) => LatLng(c.latitude, c.longitude);

/// " · visto há 5 min" (ou ha horas/dias).
String _vistoHa(DateTime? quando) {
  if (quando == null) return '';
  final d = DateTime.now().difference(quando);
  if (d.inMinutes < 1) return ' · visto agora';
  if (d.inMinutes < 60) return ' · visto há ${d.inMinutes} min';
  if (d.inHours < 24) return ' · visto há ${d.inHours} h';
  return ' · visto há ${d.inDays} dia(s)';
}

/// Visao Geral: o mapa da cidade em tela cheia, com os carros ao vivo,
/// as corridas procurando motorista e os alertas de SOS. Os numeros do
/// dia ficam pequenos em cima do mapa.
class VisaoGeral extends StatefulWidget {
  const VisaoGeral({super.key, required this.abrirDespacho});

  final VoidCallback abrirDespacho;

  @override
  State<VisaoGeral> createState() => _VisaoGeralState();
}

class _VisaoGeralState extends State<VisaoGeral> {
  final _mapa = MapController();
  late final ControleFlutterMap _controleOsm = ControleFlutterMap(_mapa);
  final ControleGoogle _controleGoogle = ControleGoogle();
  bool _centralizou = false;

  /// Filtro do mapa (so o que e desenhado; despacho, localizacao e SOS nao dependem dele).
  FiltroDoMapa _filtro = FiltroDoMapa.todos;

  /// Mapa do Google nesta montagem (nos testes, sempre o flutter_map).
  bool get _google => usarGoogleMaps && mostrarRuasNoMapa;

  ControleDoMapa get _controle => _google ? _controleGoogle : _controleOsm;

  /// Pinos desenhados para o Google (cor + icone), prontos para o mapa.
  final Map<String, gm.BitmapDescriptor> _pinos = {};

  gm.BitmapDescriptor _pino(Color cor, IconData icone, double tamanho, {IconData? selo, Color? corDoSelo}) {
    final chave = '${cor.toARGB32()}|${icone.codePoint}|$tamanho|${selo?.codePoint}|${corDoSelo?.toARGB32()}';
    final pronto = _pinos[chave];
    if (pronto != null) return pronto;
    pinoGoogle(cor, icone, tamanho: tamanho, selo: selo, corDoSelo: corDoSelo).then((b) {
      if (mounted) setState(() => _pinos[chave] = b);
    }).catchError((_) {});
    return gm.BitmapDescriptor.defaultMarker;
  }

  @override
  void dispose() {
    _controleGoogle.fechar();
    super.dispose();
  }

  void _enquadrar(PainelState p) {
    // Cidade escolhida no topo (Evandro, 11/10/2026): o mapa vai para ela.
    // "Todas as cidades": mostra todas no mapa, cada uma com um ponto.
    final cidade = p.pracaNaTela;
    final pontos = <LatLng>[
      for (final m in p.motoristas)
        if (m.posicao != null) _ll(m.posicao!),
      for (final c in p.corridas) _ll(c.embarque),
      for (final a in p.alertas)
        if (a.posicao != null) _ll(a.posicao!),
      for (final c in p.pracasNoMapa) _ll(c.posicao),
    ];
    if (cidade != null && PainelState.temPosicao(cidade) && pontos.length < 2) {
      if (_google) {
        _controleGoogle.mover(cidade.posicao, zoom: 13.5);
      } else {
        _mapa.move(_ll(cidade.posicao), 13.5);
      }
      return;
    }
    if (_google) {
      if (pontos.length >= 2) {
        _controleGoogle.enquadrar([for (final l in pontos) Coords(l.latitude, l.longitude)], animar: true);
      } else {
        _controleGoogle.mover(pontos.isEmpty ? p.centro : Coords(pontos.first.latitude, pontos.first.longitude), zoom: 14);
      }
      return;
    }
    if (pontos.length >= 2) {
      _mapa.fitCamera(CameraFit.coordinates(coordinates: pontos, padding: const EdgeInsets.fromLTRB(90, 230, 90, 215), maxZoom: 16));
    } else {
      _mapa.move(_ll(pontos.isEmpty ? p.centro : Coords(pontos.first.latitude, pontos.first.longitude)), 14);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.watch<PainelState>();
    if (!_centralizou && p.dadosDaCidadeNaTela) {
      _centralizou = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _enquadrar(p);
      });
    }

    // Filtro so do desenho: quem nao passa no filtro continua existindo para o despacho e para o SOS.
    final veiculos = [for (final m in p.motoristas) if (m.posicao != null && veiculoPassaNoFiltro(m, _filtro)) m];
    final aguardando = [
      for (final c in p.corridas)
        if (c.naFila && c.status != 'SCHEDULED' && corridaPassaNoFiltro(c, _filtro)) c,
    ];
    final contagens = {for (final f in FiltroDoMapa.values) f: contarNoFiltro(p.motoristas, f)};

    final marcadores = <Marker>[
      for (final c in aguardando)
        Marker(
          point: _ll(c.embarque),
          width: 44,
          height: 44,
          child: GestureDetector(
            onTap: () => _mostrarCorrida(context, c),
            // Pedido do Comercio esperando motorista: ciano (com a caixa no icone); passageiro: dourado de sempre.
            child: _Pino(
              cor: c.servico == 'COMERCIO' ? AppColors.comercio : AppColors.primary,
              icone: c.servico == 'COMERCIO' ? seloComercio : Icons.person_pin_circle,
            ),
          ),
        ),
      for (final m in veiculos)
        Marker(
          point: _ll(m.posicao!),
          width: 40,
          height: 40,
          child: GestureDetector(
            onTap: () => _mostrarMotorista(context, m, p),
            child: PinoDoVeiculo(veiculo: m),
          ),
        ),
      // SOS nunca some com o filtro: seguranca primeiro.
      for (final a in p.alertas)
        if (a.posicao != null)
          Marker(
            point: _ll(a.posicao!),
            width: 52,
            height: 52,
            child: const _Pino(cor: AppColors.danger, icone: Icons.sos, grande: true),
          ),
      // Todas as cidades: um ponto por cidade; toque abre aquela cidade.
      for (final c in p.pracasNoMapa)
        Marker(
          point: _ll(c.posicao),
          width: 170,
          height: 40,
          alignment: Alignment.topCenter,
          child: GestureDetector(
            onTap: () => p.escolherPraca(c.id),
            child: PinoDaCidade(nome: c.nome, online: p.onlinePorCidade[c.id] ?? 0),
          ),
        ),
    ];

    Medida.marcar('mapa');
    return Stack(
      children: [
        Positioned.fill(
          child: _google
              ? gm.GoogleMap(
                  initialCameraPosition: gm.CameraPosition(target: paraGoogle(p.centro), zoom: 14),
                  style: estiloGoogle,
                  // Indicadores em cima e legenda embaixo ficam fora da area do mapa
                  // (o logo do Google continua visivel).
                  padding: const EdgeInsets.fromLTRB(8, 190, 8, 150),
                  compassEnabled: false,
                  mapToolbarEnabled: false,
                  zoomControlsEnabled: false,
                  myLocationButtonEnabled: false,
                  tiltGesturesEnabled: false,
                  onMapCreated: (c) {
                    Medida.marcar('mapa_pronto');
                    _controleGoogle.mapa = c;
                    if (p.atualizadoEm != null) {
                      WidgetsBinding.instance.addPostFrameCallback((_) {
                        if (mounted) _enquadrar(p);
                      });
                    }
                  },
                  onCameraMove: _controleGoogle.aoMover,
                  markers: {
                    for (final c in aguardando)
                      gm.Marker(
                        markerId: gm.MarkerId('corrida-${c.id}'),
                        position: paraGoogle(c.embarque),
                        icon: c.servico == 'COMERCIO'
                            ? _pino(AppColors.comercio, seloComercio, 44)
                            : _pino(AppColors.primary, Icons.person_pin_circle, 44),
                        anchor: const Offset(0.5, 0.5),
                        consumeTapEvents: true,
                        onTap: () => _mostrarCorrida(context, c),
                      ),
                    for (final m in veiculos)
                      gm.Marker(
                        markerId: gm.MarkerId('motorista-${m.id}'),
                        position: paraGoogle(m.posicao!),
                        icon: _pino(corDoEstado(estadoDoVeiculo(m)), iconeDoVeiculo(m), 40, selo: seloDoVeiculo(m), corDoSelo: corDoSelo(m)),
                        anchor: const Offset(0.5, 0.5),
                        consumeTapEvents: true,
                        onTap: () => _mostrarMotorista(context, m, p),
                      ),
                    for (final a in p.alertas)
                      if (a.posicao != null)
                        gm.Marker(
                          markerId: gm.MarkerId('sos-${a.id}'),
                          position: paraGoogle(a.posicao!),
                          icon: _pino(AppColors.danger, Icons.sos, 52),
                          anchor: const Offset(0.5, 0.5),
                          consumeTapEvents: true,
                        ),
                    for (final c in p.pracasNoMapa)
                      gm.Marker(
                        markerId: gm.MarkerId('cidade-${c.id}'),
                        position: paraGoogle(c.posicao),
                        icon: _pino(AppColors.brandDark, Icons.location_city, 44),
                        anchor: const Offset(0.5, 0.5),
                        infoWindow: gm.InfoWindow(title: c.nome, snippet: '${p.onlinePorCidade[c.id] ?? 0} online'),
                        onTap: () => p.escolherPraca(c.id),
                      ),
                  },
                )
              : FlutterMap(
            mapController: _mapa,
            options: MapOptions(initialCenter: _ll(p.centro), initialZoom: 14),
            children: [
              if (mostrarRuasNoMapa)
                MapaConfig.atual.camadaDeRuas(pacote: 'com.rideplatform.central_app', maxZoom: MapaConfig.maxZoom.toDouble()),
              MarkerLayer(markers: marcadores),
            ],
          ),
        ),
        // Indicadores do dia, pequenos, em cima do mapa.
        Positioned(
          top: Spacing.sm,
          left: Spacing.sm,
          right: Spacing.sm,
          child: Column(
            children: [
              Row(
                children: [
                  _Indicador(rotulo: 'Corridas ativas', valor: '${p.indicadores.ativas}', cor: AppColors.primary, onTap: widget.abrirDespacho),
                  const SizedBox(width: Spacing.xs),
                  _Indicador(rotulo: 'Concluídas hoje', valor: '${p.indicadores.concluidasHoje}', cor: AppColors.success),
                ],
              ),
              const SizedBox(height: Spacing.xs),
              Row(
                children: [
                  _Indicador(
                    rotulo: 'Online / ocupados',
                    valor: '${p.indicadores.online} / ${p.indicadores.ocupados}',
                    cor: AppColors.warning,
                  ),
                  const SizedBox(width: Spacing.xs),
                  // Ganho da Central (comissao + mensalidades), nao o total
                  // das corridas dos motoristas. Toque: o detalhe do dia.
                  _Indicador(
                    rotulo: 'Ganho da Central hoje',
                    valor: reais(p.indicadores.ganhoCentralHojeCents),
                    cor: AppColors.brandDark,
                    onTap: () => _mostrarGanhoDoDia(context, p.indicadores),
                  ),
                ],
              ),
              const SizedBox(height: Spacing.xs),
              BarraDeFiltrosDoMapa(
                atual: _filtro,
                contagens: contagens,
                aoEscolher: (f) => setState(() => _filtro = f),
              ),
              if (p.erro != null) ...[
                const SizedBox(height: Spacing.xs),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(Spacing.sm),
                  decoration: BoxDecoration(color: AppColors.danger, borderRadius: BorderRadius.circular(Radii.sm)),
                  child: Row(
                    children: [
                      const Icon(Icons.wifi_off, color: Colors.white, size: 18),
                      const SizedBox(width: Spacing.sm),
                      Expanded(child: Text(p.erro!, style: AppText.caption.copyWith(color: Colors.white))),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
        // Legenda e botao de enquadrar.
        Positioned(
          left: Spacing.sm,
          bottom: Spacing.sm,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: Spacing.sm, vertical: Spacing.xs),
            decoration: BoxDecoration(
              color: AppColors.surface.withValues(alpha: 0.94),
              borderRadius: BorderRadius.circular(Radii.md),
              boxShadow: AppColors.sombraFlutuante,
            ),
            child: const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ItemDaLegenda(cor: AppColors.success, texto: 'Livre (online)'),
                ItemDaLegenda(cor: AppColors.warning, texto: 'Em corrida (passageiro)', selo: seloPassageiro),
                ItemDaLegenda(cor: AppColors.comercio, texto: 'Entrega do Comércio', selo: seloComercio),
                ItemDaLegenda(cor: cinzaOffline, texto: 'Offline (última posição)'),
                ItemDaLegenda(cor: AppColors.primary, texto: 'Esperando motorista'),
                ItemDaLegenda(cor: AppColors.danger, texto: 'SOS (prioridade máxima)'),
              ],
            ),
          ),
        ),
        // Bussola (como no Google Maps) e enquadrar todos os carros.
        Positioned(
          right: Spacing.sm,
          bottom: Spacing.sm,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              BotaoBussola(controle: _controle),
              const SizedBox(height: Spacing.sm),
              FloatingActionButton.small(
                heroTag: 'enquadrar',
                backgroundColor: AppColors.surface,
                tooltip: 'Mostrar todos os carros',
                onPressed: () => _enquadrar(p),
                child: const Icon(Icons.center_focus_strong, color: AppColors.text),
              ),
            ],
          ),
        ),
      ],
    );
  }

  /// O dia em numeros: quanto rodou no total e quanto ficou para a Central.
  void _mostrarGanhoDoDia(BuildContext context, Indicadores i) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Spacing.lg, 0, Spacing.lg, Spacing.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Hoje', style: AppText.heading.copyWith(fontSize: 20)),
              const SizedBox(height: Spacing.md),
              Container(
                padding: const EdgeInsets.all(Spacing.lg),
                decoration: BoxDecoration(gradient: AppColors.degradeMarca, borderRadius: BorderRadius.circular(Radii.md)),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('GANHO DA CENTRAL', style: AppText.label.copyWith(color: AppColors.gold, fontSize: 11)),
                    const SizedBox(height: Spacing.xs),
                    Text(reais(i.ganhoCentralHojeCents), style: AppText.metric.copyWith(color: AppColors.text)),
                    Text(
                      'Comissão das corridas ${reais(i.comissaoHojeCents)}'
                      '${i.mensalidadesHojeCents > 0 ? ' + mensalidades ${reais(i.mensalidadesHojeCents)}' : ''}',
                      style: AppText.caption.copyWith(color: AppColors.textMuted),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: Spacing.md),
              Linha('Total das corridas (${i.concluidasHoje})', reais(i.faturamentoHojeCents), destaque: true),
              Linha('Parte dos motoristas', reais(i.faturamentoHojeCents > i.comissaoHojeCents ? i.faturamentoHojeCents - i.comissaoHojeCents : 0)),
              Linha('Comissão da Central', reais(i.comissaoHojeCents)),
              if (i.mensalidadesHojeCents > 0) Linha('Mensalidades cobradas', reais(i.mensalidadesHojeCents)),
              const SizedBox(height: Spacing.sm),
              Text(
                'O ganho de cada motorista fica no cadastro dele e no relatório em PDF (aba Financeiro).',
                style: AppText.caption.copyWith(color: AppColors.textMuted),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _mostrarMotorista(BuildContext context, MotoristaOnline m, PainelState p) {
    final corrida = p.corridas.where((c) => c.motoristaId == m.id).firstOrNull;
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      builder: (_) => SafeArea(
        child: SingleChildScrollView(
          child: Padding(
          padding: const EdgeInsets.all(Spacing.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(child: Text(m.nome, style: AppText.heading)),
                  BotoesContato(telefone: m.telefone),
                ],
              ),
              if (m.sos)
                Container(
                  margin: const EdgeInsets.only(bottom: Spacing.xs),
                  padding: const EdgeInsets.all(Spacing.sm),
                  decoration: BoxDecoration(color: AppColors.danger, borderRadius: BorderRadius.circular(Radii.sm)),
                  child: Row(
                    children: [
                      const Icon(seloSos, color: Colors.white),
                      const SizedBox(width: Spacing.sm),
                      Expanded(
                        child: Text(
                          m.servico == 'COMERCIO' ? 'SOS ABERTO durante entrega do Comércio' : 'SOS ABERTO neste veículo',
                          style: AppText.bodyStrong.copyWith(color: Colors.white),
                        ),
                      ),
                    ],
                  ),
                ),
              Linha('Situação', rotuloDoEstado(m, vistoHa: _vistoHa(m.vistoEm)), destaque: true),
              Linha('Tipo de veículo', rotuloDoVeiculo(m)),
              Linha('Serviço', rotuloDoServico(m.servico, origem: m.origemDoServico)),
              if (m.servico == 'COMERCIO') ...[
                Linha('Estabelecimento', m.comercio ?? '-'),
                Linha('Origem', rotuloDaOrigem(m.origemDoServico)),
              ],
              if (corrida == null && m.corridaCodigo != null) Linha(m.servico == 'PASSAGEIRO' ? 'Corrida' : 'Entrega', m.corridaCodigo!),
              Linha('Telefone', telefoneBonito(m.telefone)),
              Linha('Veículo', m.veiculo.isEmpty ? '-' : m.veiculo),
              Linha('Placa', m.placa.isEmpty ? '-' : m.placa),
              Linha('Categoria', m.categoria),
              Linha('Nota', m.nota.toStringAsFixed(1)),
              if (corrida != null) ...[
                const Divider(color: AppColors.border),
                Text('${corrida.servico == 'PASSAGEIRO' ? 'Corrida' : 'Entrega'} ${corrida.codigo} - ${corrida.fase}', style: AppText.bodyStrong),
                Linha(corrida.servico == 'COMERCIO' ? 'Estabelecimento' : 'Passageiro', corrida.comercio ?? corrida.passageiro),
                Linha('Embarque', corrida.enderecoEmbarque),
                Linha('Destino', corrida.enderecoDestino),
              ],
            ],
          ),
        ),
        ),
      ),
    );
  }

  void _mostrarCorrida(BuildContext context, CorridaAtiva c) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      builder: (ctx) => SafeArea(
        child: SingleChildScrollView(
          child: Padding(
          padding: const EdgeInsets.all(Spacing.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${c.servico == 'PASSAGEIRO' ? 'Corrida' : 'Entrega'} ${c.codigo} - ${c.fase}', style: AppText.heading),
              const SizedBox(height: Spacing.sm),
              Linha('Serviço', rotuloDoServico(c.servico, origem: c.origemDoServico), destaque: c.servico == 'COMERCIO'),
              Row(
                children: [
                  Expanded(child: Linha(c.servico == 'COMERCIO' ? 'Estabelecimento' : 'Passageiro', c.comercio ?? c.passageiro)),
                  BotoesContato(telefone: c.telefonePassageiro),
                ],
              ),
              Linha('Embarque', c.enderecoEmbarque),
              Linha('Destino', c.enderecoDestino),
              Linha('Valor', reais(c.valorCents)),
              const SizedBox(height: Spacing.md),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  icon: const Icon(Icons.support_agent),
                  label: const Text('Abrir no Despacho'),
                  onPressed: () {
                    Navigator.of(ctx).pop();
                    widget.abrirDespacho();
                  },
                ),
              ),
            ],
          ),
        ),
        ),
      ),
    );
  }
}

class _Pino extends StatelessWidget {
  const _Pino({required this.cor, required this.icone, this.grande = false});

  final Color cor;
  final IconData icone;
  final bool grande;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: cor,
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 2),
        boxShadow: const [BoxShadow(color: Color(0x55000000), blurRadius: 6, offset: Offset(0, 2))],
      ),
      alignment: Alignment.center,
      child: Icon(icone, color: Colors.white, size: grande ? 28 : 20),
    );
  }
}

class _Indicador extends StatelessWidget {
  const _Indicador({required this.rotulo, required this.valor, required this.cor, this.onTap});

  final String rotulo;
  final String valor;
  final Color cor;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.fromLTRB(Spacing.sm, Spacing.sm, Spacing.md, Spacing.sm),
          decoration: BoxDecoration(
            color: AppColors.surface.withValues(alpha: 0.96),
            borderRadius: BorderRadius.circular(Radii.md),
            boxShadow: AppColors.sombraFlutuante,
          ),
          child: Row(
            children: [
              // Barrinha colorida na esquerda: a cor do numero (igual a legenda).
              Container(
                width: 4,
                height: 34,
                decoration: BoxDecoration(color: cor, borderRadius: BorderRadius.circular(2)),
              ),
              const SizedBox(width: Spacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(rotulo, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.caption.copyWith(color: AppColors.textMuted, fontWeight: FontWeight.w500)),
                    Text(valor, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.heading.copyWith(color: cor, fontWeight: FontWeight.w700)),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Ponto de uma cidade no mapa de "Todas as cidades": nome e motoristas
/// online. Toque abre a cidade (o mapa vai para ela).
class PinoDaCidade extends StatelessWidget {
  const PinoDaCidade({super.key, required this.nome, required this.online});

  final String nome;
  final int online;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: AppColors.brandDark,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: Colors.white, width: 1.5),
            boxShadow: const [BoxShadow(color: Color(0x55000000), blurRadius: 5, offset: Offset(0, 2))],
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.location_city, color: AppColors.gold, size: 15),
              const SizedBox(width: 4),
              Flexible(
                child: Text(
                  '$nome · $online',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.caption.copyWith(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 12),
                ),
              ),
            ],
          ),
        ),
        CustomPaint(size: const Size(10, 6), painter: _PontaCidade()),
      ],
    );
  }
}

class _PontaCidade extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final caminho = ui.Path()
      ..moveTo(0, 0)
      ..lineTo(size.width, 0)
      ..lineTo(size.width / 2, size.height)
      ..close();
    canvas.drawPath(caminho, Paint()..color = AppColors.brandDark);
  }

  @override
  bool shouldRepaint(_PontaCidade old) => false;
}
