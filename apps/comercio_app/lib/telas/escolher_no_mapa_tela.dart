import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../core/config.dart';
import '../core/tema.dart';
import '../dados/comercio_api.dart';
import '../dados/modelos.dart';
import '../estado/escopo.dart';
import '../widgets/comuns.dart';

/// Escolher o endereco arrastando o mapa: o alfinete fica parado no meio e o
/// endereco aparece embaixo (mesmo jeito do aplicativo do passageiro). Serve
/// para quando a busca nao acha o lugar (casa sem numero, chacara, ponto novo).
///
/// "Confirmar" so libera depois que o endereco do ponto chegou. A tela nunca
/// pede a localizacao do celular da loja: comeca na loja (ou em Goiatuba).
/// Volta com um [Lugar] (ou null se a pessoa saiu sem confirmar).
class EscolherNoMapaTela extends StatefulWidget {
  const EscolherNoMapaTela({super.key, required this.servidor, this.inicioLat, this.inicioLng});

  final ComercioApi servidor;
  final double? inicioLat;
  final double? inicioLng;

  @override
  State<EscolherNoMapaTela> createState() => _EscolherNoMapaTelaState();
}

class _EscolherNoMapaTelaState extends State<EscolherNoMapaTela> {
  final MapController _mapa = MapController();
  late LatLng _centro = LatLng(widget.inicioLat ?? AppConfig.centroLat, widget.inicioLng ?? AppConfig.centroLng);
  Future<ConfigDoMapa?>? _ruas;
  Lugar? _lugar;
  bool _buscando = false;
  bool _movendo = false;
  bool _falhou = false;
  Timer? _espera;

  @override
  void dispose() {
    _espera?.cancel();
    super.dispose();
  }

  void _agendar() {
    _espera?.cancel();
    setState(() {
      _movendo = true;
      _lugar = null;
      _falhou = false;
    });
    _espera = Timer(const Duration(milliseconds: 700), _buscarEndereco);
  }

  Future<void> _buscarEndereco() async {
    final ponto = _centro;
    setState(() {
      _movendo = false;
      _buscando = true;
    });
    Lugar? lugar;
    var falhou = false;
    try {
      lugar = await widget.servidor.enderecoDoPonto(ponto.latitude, ponto.longitude);
    } catch (_) {
      falhou = true;
    }
    if (!mounted || ponto != _centro) return;
    setState(() {
      _buscando = false;
      _lugar = lugar;
      _falhou = falhou;
    });
  }

  void _confirmar() {
    final l = _lugar;
    // Sem nome de rua (limite do servico de mapa): vai so o ponto; a pessoa digita a rua.
    Navigator.of(context).pop(Lugar(
      endereco: l?.endereco ?? 'Ponto no mapa',
      detalhe: l?.detalhe ?? '',
      latitude: _centro.latitude,
      longitude: _centro.longitude,
      bairro: l?.bairro ?? '',
      cep: l?.cep ?? '',
    ));
  }

  /// As imagens do mapa nao chegaram (internet, chave ou limite do fornecedor): a pessoa ve o motivo em vez de um fundo vazio.
  String? _erroImagens;

  void _imagemFalhou(Object erro) {
    if (_erroImagens != null) return;
    final texto = erro.toString().replaceAll(RegExp(r'key=[^&\s)]+'), 'key=…');
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) setState(() => _erroImagens = texto.length > 140 ? '${texto.substring(0, 140)}…' : texto);
    });
  }

  @override
  Widget build(BuildContext context) {
    _ruas ??= EscopoSessao.ler(context).configDoMapa();
    return Scaffold(
      appBar: AppBar(title: const Text('Marcar no mapa')),
      body: FutureBuilder<ConfigDoMapa?>(
        future: _ruas,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
          final ruas = snap.data;
          if (ruas == null) {
            return Padding(
              padding: const EdgeInsets.all(20),
              child: Estado(
                icone: Icons.map_outlined,
                titulo: 'Mapa indisponível agora',
                texto: '${EscopoSessao.ler(context).erroDoMapa ?? ''}\nDigite o endereço e use "Buscar no mapa". Nenhum pedido foi feito.'.trim(),
              ),
            );
          }
          final semNome = (_lugar?.endereco ?? '').startsWith('Ponto no mapa');
          final pronto = !_movendo && !_buscando;
          final texto = _movendo
              ? 'Solte o mapa no lugar certo...'
              : _buscando
                  ? 'Buscando o endereço...'
                  : _falhou
                      ? 'Não consegui ler o endereço deste ponto. Você poderá digitar a rua.'
                      : semNome
                          ? 'Sem nome de rua neste ponto. Você poderá digitar a rua.'
                          : (_lugar?.endereco ?? 'Ponto marcado no mapa');
          return Stack(children: [
            Positioned.fill(
              child: FlutterMap(
                mapController: _mapa,
                options: MapOptions(
                  initialCenter: _centro,
                  initialZoom: 16.5,
                  backgroundColor: Cores.cartaoAlto,
                  interactionOptions: const InteractionOptions(flags: InteractiveFlag.all & ~InteractiveFlag.rotate),
                  onMapReady: _agendar,
                  onPositionChanged: (camera, comGesto) {
                    _centro = camera.center;
                    if (comGesto) _agendar();
                  },
                ),
                children: [
                  TileLayer(
                    urlTemplate: ruas.tiles,
                    userAgentPackageName: 'br.com.fortalezamov.comercio',
                    tileDimension: ruas.tamanho,
                    zoomOffset: ruas.tamanho < 512 ? 0 : -1,
                    maxZoom: ruas.maxZoom,
                    panBuffer: 0,
                    errorTileCallback: (tile, erro, pilha) => _imagemFalhou(erro),
                  ),
                ],
              ),
            ),
            // Alfinete fixo no meio (a ponta encosta no centro do mapa).
            const IgnorePointer(
              child: Center(
                child: Padding(
                  padding: EdgeInsets.only(bottom: 44),
                  child: Icon(Icons.location_pin, size: 52, color: Colors.redAccent, semanticLabel: 'alfinete'),
                ),
              ),
            ),
            if (_erroImagens != null)
              Positioned(
                left: 12,
                right: 12,
                top: 28,
                child: Faixa('As imagens do mapa não carregaram. Confira a internet e tente de novo. ($_erroImagens)', tipo: TipoFaixa.atencao, icone: Icons.map_outlined),
              ),
            Positioned(
              right: 6,
              top: 4,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                color: Colors.white70,
                child: Text(ruas.atribuicao, style: const TextStyle(fontSize: 10, color: Colors.black87)),
              ),
            ),
            Align(
              alignment: Alignment.bottomCenter,
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(20, 14, 20, 16),
                decoration: const BoxDecoration(color: Cores.cartao, border: Border(top: BorderSide(color: Cores.borda))),
                child: SafeArea(
                  top: false,
                  child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    const Text('Arraste o mapa até o endereço da entrega', style: TextStyle(color: Cores.textoSuave)),
                    const SizedBox(height: 8),
                    Text(texto, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
                    if (pronto && (_lugar?.detalhe ?? '').isNotEmpty && !semNome)
                      Text(_lugar!.detalhe, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Cores.textoSuave)),
                    const SizedBox(height: 12),
                    BotaoPrincipal(texto: 'Confirmar este ponto', aoTocar: pronto ? _confirmar : null),
                  ]),
                ),
              ),
            ),
          ]);
        },
      ),
    );
  }
}
