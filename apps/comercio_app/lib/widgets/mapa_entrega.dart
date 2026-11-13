import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../core/tema.dart';
import '../dados/modelos.dart';
import 'comuns.dart';

/// Mapa do acompanhamento: loja (coleta), destino e, quando o aparelho do
/// motorista esta mandando localizacao, a posicao dele. Reaproveita o que a
/// plataforma ja tem (mesmas imagens do mapa e a mesma posicao do motorista
/// que o passageiro ve); o Comercio NAO cria outro sistema de localizacao e
/// nunca pede a localizacao do celular da loja.
///
/// Regras de honestidade: ponto que o servidor nao mandou nao aparece; sinal
/// velho e avisado; sem imagens do mapa os pontos continuam certos, mas a
/// tela diz que as ruas nao estao disponiveis.
class MapaEntrega extends StatefulWidget {
  const MapaEntrega({super.key, required this.mapa, required this.ruas, required this.veiculo, required this.comMotorista, this.telaCheia = false});

  /// true = mapa ocupando a tela toda (aberto pelo botao "Ampliar").
  final bool telaCheia;

  final MapaDaEntrega mapa;

  /// null = sem imagens de rua agora.
  final ConfigDoMapa? ruas;

  /// 'MOTO' ou 'CARRO' (so muda o desenho do marcador do motorista).
  final String veiculo;

  /// A entrega ja tem motorista (para explicar a falta de sinal).
  final bool comMotorista;

  @override
  State<MapaEntrega> createState() => _MapaEntregaState();
}

class _MapaEntregaState extends State<MapaEntrega> {
  final MapController _controle = MapController();
  bool _pronto = false;

  /// As imagens do mapa nao chegaram: o motivo aparece embaixo do mapa.
  String? _erroImagens;

  /// A pessoa mexeu no mapa: o app para de reenquadrar sozinho ate ela tocar em "Centralizar".
  bool _mexeu = false;

  List<LatLng> get _pontos => [
        if (widget.mapa.coleta != null) LatLng(widget.mapa.coleta!.latitude, widget.mapa.coleta!.longitude),
        if (widget.mapa.pontos.isEmpty && widget.mapa.entrega != null) LatLng(widget.mapa.entrega!.latitude, widget.mapa.entrega!.longitude),
        for (final p in widget.mapa.pontos) LatLng(p.latitude, p.longitude),
        if (widget.mapa.motorista != null) LatLng(widget.mapa.motorista!.latitude, widget.mapa.motorista!.longitude),
      ];

  static bool _todosIguais(List<LatLng> p) => p.every((x) => x.latitude == p.first.latitude && x.longitude == p.first.longitude);

  CameraFit? _ajuste(List<LatLng> p) =>
      p.length < 2 || _todosIguais(p) ? null : CameraFit.coordinates(coordinates: p, padding: const EdgeInsets.all(52), maxZoom: 17);

  @override
  void didUpdateWidget(MapaEntrega antigo) {
    super.didUpdateWidget(antigo);
    final a = antigo.mapa.motorista;
    final n = widget.mapa.motorista;
    final mudou = (a?.latitude != n?.latitude) || (a?.longitude != n?.longitude);
    if (mudou && _pronto && !_mexeu) _enquadrar();
  }

  void _enquadrar() {
    final p = _pontos;
    if (p.isEmpty) return;
    final ajuste = _ajuste(p);
    if (ajuste != null) {
      _controle.fitCamera(ajuste);
    } else {
      _controle.move(p.first, 15);
    }
  }

  @override
  void dispose() {
    _controle.dispose();
    super.dispose();
  }

  Widget _pino(String chave, IconData icone, Color cor, String rotulo, {bool velho = false}) {
    return Semantics(
      key: ValueKey(chave),
      label: rotulo,
      child: Container(
        decoration: BoxDecoration(
          color: velho ? Cores.textoFraco : cor,
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white, width: 2),
          boxShadow: const [BoxShadow(color: Colors.black38, blurRadius: 4)],
        ),
        child: Icon(icone, color: Cores.sobreOuro, size: 20),
      ),
    );
  }

  Widget _pinoNumero(String chave, int ordem) {
    return Semantics(
      key: ValueKey(chave),
      label: 'Entrega $ordem',
      child: Container(
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: Cores.ouro,
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white, width: 2),
          boxShadow: const [BoxShadow(color: Colors.black38, blurRadius: 4)],
        ),
        child: Text('$ordem', style: const TextStyle(color: Cores.sobreOuro, fontWeight: FontWeight.w800)),
      ),
    );
  }

  String _hora(DateTime d) => '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';

  Widget _legenda(Color cor, String texto) => Row(mainAxisSize: MainAxisSize.min, children: [
        Container(width: 10, height: 10, decoration: BoxDecoration(color: cor, shape: BoxShape.circle)),
        const SizedBox(width: 5),
        Text(texto, style: const TextStyle(fontSize: 12, color: Cores.textoSuave)),
      ]);

  @override
  Widget build(BuildContext context) {
    final pontos = _pontos;
    if (pontos.isEmpty) {
      return const Faixa('O mapa desta entrega não está disponível agora.', tipo: TipoFaixa.atencao, icone: Icons.map_outlined);
    }
    final m = widget.mapa;
    final motorista = m.motorista;
    final ruas = widget.ruas;
    final nitido = ruas != null && ruas.tamanho >= 512 && MediaQuery.devicePixelRatioOf(context) >= 1.5;
    final ajuste = _ajuste(pontos);
    // Mapa grande: metade da altura da tela (entre 340 e 620); na tela cheia, o que sobrar.
    final altura = (MediaQuery.sizeOf(context).height * 0.5).clamp(340.0, 620.0);
    final mapa = ClipRRect(
        borderRadius: BorderRadius.circular(widget.telaCheia ? 0 : 14),
        child: SizedBox(
          height: widget.telaCheia ? null : altura,
          child: Stack(children: [
            FlutterMap(
              mapController: _controle,
              options: MapOptions(
                initialCenter: pontos.first,
                initialZoom: 15,
                initialCameraFit: ajuste,
                backgroundColor: Cores.cartaoAlto,
                interactionOptions: InteractionOptions(flags: InteractiveFlag.all & ~InteractiveFlag.rotate),
                onMapReady: () => _pronto = true,
                onPositionChanged: (camera, temGesto) {
                  if (temGesto && !_mexeu) setState(() => _mexeu = true);
                },
              ),
              children: [
                if (ruas != null)
                  TileLayer(
                    urlTemplate: ruas.tiles,
                    userAgentPackageName: 'br.com.fortalezamov.comercio',
                    tileDimension: nitido ? 256 : ruas.tamanho,
                    zoomOffset: nitido || ruas.tamanho < 512 ? 0 : -1,
                    maxZoom: ruas.maxZoom,
                    panBuffer: 0,
                    errorTileCallback: (tile, erro, pilha) {
                      // Imagem que nao veio fica no fundo, sem quebrar o mapa; a tela avisa o motivo.
                      if (_erroImagens != null) return;
                      final texto = erro.toString().replaceAll(RegExp(r'key=[^&\s)]+'), 'key=…');
                      WidgetsBinding.instance.addPostFrameCallback((_) {
                        if (mounted) setState(() => _erroImagens = texto.length > 140 ? '${texto.substring(0, 140)}…' : texto);
                      });
                    },
                  ),
                MarkerLayer(markers: [
                  if (m.coleta != null)
                    Marker(point: LatLng(m.coleta!.latitude, m.coleta!.longitude), width: 40, height: 40, child: _pino('pino-coleta', Icons.storefront, Cores.loja, 'Loja (coleta)')),
                  if (m.pontos.isEmpty && m.entrega != null)
                    Marker(point: LatLng(m.entrega!.latitude, m.entrega!.longitude), width: 40, height: 40, child: _pino('pino-entrega', Icons.flag, Cores.ouro, 'Destino da entrega')),
                  // Varias entregas: cada uma com o numero; ✔ verde quando o motorista confirmou o codigo.
                  for (final p in m.pontos)
                    Marker(
                      point: LatLng(p.latitude, p.longitude),
                      width: 40,
                      height: 40,
                      child: p.entregue
                          ? _pino('pino-feito-${p.ordem}', Icons.check, Cores.ok, 'Entrega ${p.ordem} concluída')
                          : _pinoNumero('pino-entrega-${p.ordem}', p.ordem),
                    ),
                  if (motorista != null)
                    Marker(
                      point: LatLng(motorista.latitude, motorista.longitude),
                      width: 44,
                      height: 44,
                      child: _pino('pino-motorista', widget.veiculo == 'MOTO' ? Icons.two_wheeler : Icons.directions_car, Colors.white, 'Motorista', velho: motorista.desatualizada),
                    ),
                ]),
              ],
            ),
            if (ruas != null)
              Positioned(
                right: 6,
                bottom: 4,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                  color: Colors.white70,
                  child: Text(ruas.atribuicao, style: const TextStyle(fontSize: 10, color: Colors.black87)),
                ),
              ),
            if (!widget.telaCheia)
              Positioned(
                left: 8,
                top: 8,
                child: FilledButton.tonalIcon(
                  key: const Key('ampliar-mapa'),
                  style: FilledButton.styleFrom(minimumSize: const Size(0, 40)),
                  onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(
                    builder: (_) => Scaffold(
                      appBar: AppBar(title: const Text('Mapa da entrega')),
                      body: SafeArea(
                        child: Column(children: [
                          Expanded(
                            child: MapaEntrega(mapa: widget.mapa, ruas: widget.ruas, veiculo: widget.veiculo, comMotorista: widget.comMotorista, telaCheia: true),
                          ),
                        ]),
                      ),
                    ),
                  )),
                  icon: const Icon(Icons.fullscreen, size: 18),
                  label: const Text('Ampliar'),
                ),
              ),
            if (_mexeu)
              Positioned(
                right: 8,
                top: 8,
                child: FilledButton.tonalIcon(
                  style: FilledButton.styleFrom(minimumSize: const Size(0, 40)),
                  onPressed: () {
                    setState(() => _mexeu = false);
                    _enquadrar();
                  },
                  icon: const Icon(Icons.my_location, size: 18),
                  label: const Text('Centralizar'),
                ),
              ),
          ]),
        ),
      );
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (widget.telaCheia) Expanded(child: mapa) else mapa,
      const SizedBox(height: 8),
      Wrap(spacing: 14, runSpacing: 4, children: [
        if (m.coleta != null) _legenda(Cores.loja, 'Loja'),
        if (m.pontos.isEmpty && m.entrega != null) _legenda(Cores.ouro, 'Destino'),
        if (m.pontos.isNotEmpty) ...[_legenda(Cores.ouro, 'A entregar'), _legenda(Cores.ok, 'Entregue ✔')],
        if (motorista != null) _legenda(Colors.white, 'Motorista'),
      ]),
      if (_erroImagens != null) ...[
        const SizedBox(height: 8),
        Faixa('As imagens do mapa não carregaram ($_erroImagens). Os pontos mostrados estão corretos.', tipo: TipoFaixa.atencao, icone: Icons.map_outlined),
      ],
      if (ruas == null) ...[
        const SizedBox(height: 8),
        const Text('As ruas do mapa não estão disponíveis agora; os pontos mostrados estão corretos.', style: TextStyle(fontSize: 12, color: Cores.textoSuave)),
      ],
      const SizedBox(height: 8),
      if (motorista != null && motorista.desatualizada)
        Faixa(
          motorista.atualizadaEm == null
              ? 'Sem sinal novo do motorista. A posição no mapa pode estar desatualizada.'
              : 'Sem sinal novo do motorista desde ${_hora(motorista.atualizadaEm!)}. A posição no mapa pode estar desatualizada.',
          tipo: TipoFaixa.atencao,
          icone: Icons.signal_cellular_connected_no_internet_0_bar,
        )
      else if (motorista != null)
        Text(
          motorista.atualizadaEm == null ? 'Posição do motorista em tempo real.' : 'Posição do motorista atualizada às ${_hora(motorista.atualizadaEm!)}.',
          style: const TextStyle(fontSize: 12, color: Cores.textoSuave),
        )
      else if (widget.comMotorista)
        const Text('O aparelho do motorista não está enviando a localização agora. Quando enviar, ele aparece no mapa.', style: TextStyle(fontSize: 12, color: Cores.textoSuave)),
    ]);
  }
}
