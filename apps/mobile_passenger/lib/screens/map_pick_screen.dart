import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart' as gm;
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';

import '../core/theme/app_theme.dart';
import '../core/utils/geo.dart';
import '../data/models/models.dart';
import '../state/ride_state.dart';
import '../widgets/mapa_google.dart';
import '../widgets/ride_map.dart' show mostrarRuasNoMapa;
import '../widgets/ui.dart';
import '../core/mapa_config.dart';

/// Escolher o destino arrastando o mapa: o alfinete fica parado no meio e
/// o endereco aparece embaixo. Serve para quando a busca nao acha o lugar
/// (casa sem numero, chacara, ponto de referencia).
/// Etapa 3 (29/10/2026): uma consulta de endereco so quando o mapa para; o
/// "Confirmar" so libera depois que o endereco chega; "Editar" deixa
/// escrever o numero ou uma referencia (ex.: "portao azul").
class MapPickScreen extends StatefulWidget {
  const MapPickScreen({super.key, required this.inicio, this.parada = false});

  final Coords inicio;

  /// Escolhendo uma parada (o texto da tela muda).
  final bool parada;

  @override
  State<MapPickScreen> createState() => _MapPickScreenState();
}

class _MapPickScreenState extends State<MapPickScreen> {
  final MapController _mapa = MapController();
  late Coords _centro = widget.inicio;
  PlaceSuggestion? _lugar;
  bool _buscando = false;
  bool _movendo = false;
  Timer? _espera;

  /// Endereco escrito pela pessoa ("Editar"); vale no lugar do encontrado.
  String? _editado;

  @override
  void dispose() {
    _espera?.cancel();
    super.dispose();
  }

  void _agendar() {
    _espera?.cancel();
    setState(() {
      _movendo = true;
      _editado = null;
    });
    _espera = Timer(const Duration(milliseconds: 700), _buscarEndereco);
  }

  Future<void> _buscarEndereco() async {
    final ponto = _centro;
    setState(() {
      _movendo = false;
      _buscando = true;
    });
    final lugar = await context.read<RideState>().addressOf(ponto);
    if (!mounted || ponto != _centro) return;
    setState(() {
      _buscando = false;
      _lugar = lugar;
    });
  }

  void _confirmar() {
    final l = _lugar;
    final editado = _editado?.trim();
    Navigator.of(context).pop(PlaceSuggestion(
      address: (editado != null && editado.length >= 3) ? editado : (l?.address ?? 'Ponto marcado no mapa'),
      detail: l?.detail ?? '',
      coords: _centro,
      distanceKm: 0,
    ));
  }

  /// "Editar": escrever o numero da casa ou uma referencia.
  Future<void> _editar() async {
    final campo = TextEditingController(text: _editado ?? _lugar?.address ?? '');
    final texto = await showDialog<String>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Editar o endereço'),
        content: TextField(
          controller: campo,
          autofocus: true,
          maxLength: 120,
          textCapitalization: TextCapitalization.sentences,
          decoration: const InputDecoration(hintText: 'Rua, número e uma referência (ex.: portão azul)'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(c).pop(), child: const Text('Voltar')),
          TextButton(onPressed: () => Navigator.of(c).pop(campo.text), child: const Text('Usar este')),
        ],
      ),
    );
    if (texto != null && texto.trim().length >= 3 && mounted) setState(() => _editado = texto.trim());
  }

  @override
  Widget build(BuildContext context) {
    final texto = _movendo
        ? 'Solte o mapa no lugar certo...'
        : _buscando
            ? 'Buscando o endereço...'
            : (_editado ?? _lugar?.address ?? 'Ponto marcado no mapa');
    final pronto = !_movendo && !_buscando;

    return Scaffold(
      body: Stack(
        children: [
          Positioned.fill(
            child: usarGoogleMaps && mostrarRuasNoMapa
                ? gm.GoogleMap(
                    initialCameraPosition: gm.CameraPosition(target: paraGoogle(widget.inicio), zoom: 16.5),
                    style: estiloGoogle,
                    compassEnabled: false,
                    mapToolbarEnabled: false,
                    zoomControlsEnabled: false,
                    myLocationButtonEnabled: false,
                    tiltGesturesEnabled: false,
                    onMapCreated: (_) => _agendar(),
                    onCameraMove: (posicao) {
                      _centro = doGoogle(posicao.target);
                      _agendar();
                    },
                  )
                : FlutterMap(
              mapController: _mapa,
              options: MapOptions(
                initialCenter: LatLng(widget.inicio.latitude, widget.inicio.longitude),
                initialZoom: 16.5,
                backgroundColor: AppColors.mapBackground,
                onMapReady: _agendar,
                onPositionChanged: (camera, comGesto) {
                  _centro = Coords(camera.center.latitude, camera.center.longitude);
                  if (comGesto) _agendar();
                },
              ),
              children: [
                MapaConfig.atual.camadaDeRuas(pacote: 'br.com.fortalezamov.passageiro', maxZoom: MapaConfig.maxZoom.toDouble()),
              ],
            ),
          ),
          // Alfinete fixo no meio (a ponta encosta no centro do mapa).
          const IgnorePointer(
            child: Center(
              child: Padding(
                padding: EdgeInsets.only(bottom: 44),
                child: Icon(Icons.location_pin, size: 52, color: AppColors.danger),
              ),
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(Spacing.lg),
              child: Material(
                color: AppColors.surface,
                shape: const CircleBorder(),
                elevation: 3,
                child: IconButton(
                  icon: const Icon(Icons.arrow_back, color: AppColors.text),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ),
            ),
          ),
          Align(
            alignment: Alignment.bottomCenter,
            child: SheetSurface(
              padding: const EdgeInsets.fromLTRB(Spacing.lg, Spacing.lg, Spacing.lg, Spacing.xl),
              child: SafeArea(
                top: false,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(widget.parada ? 'Arraste o mapa até a parada' : 'Arraste o mapa até o destino', style: SheetText.muted),
                    const SizedBox(height: Spacing.sm),
                    Row(
                      children: [
                        const Icon(Icons.flag, color: AppColors.danger),
                        const SizedBox(width: Spacing.sm),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(texto, maxLines: 2, overflow: TextOverflow.ellipsis, style: SheetText.heading),
                              if (pronto && (_lugar?.detail ?? '').isNotEmpty)
                                Text(_lugar!.detail, maxLines: 1, overflow: TextOverflow.ellipsis, style: SheetText.muted),
                            ],
                          ),
                        ),
                        if (pronto) TextButton(onPressed: _editar, child: const Text('Editar')),
                      ],
                    ),
                    const SizedBox(height: Spacing.lg),
                    // So libera depois que o endereco do ponto chegou (antes ia
                    // como "Ponto marcado no mapa" se a pessoa tocasse rapido).
                    AppButton(
                      label: widget.parada ? 'Confirmar parada' : 'Confirmar destino',
                      enabled: pronto,
                      onPressed: _confirmar,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
