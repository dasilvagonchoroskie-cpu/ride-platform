import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';

import '../core/theme/app_theme.dart';
import '../core/utils/geo.dart';
import '../data/models/models.dart';
import '../state/ride_state.dart';
import '../widgets/ui.dart';

/// Escolher o destino arrastando o mapa: o alfinete fica parado no meio e
/// o endereco aparece embaixo. Serve para quando a busca nao acha o lugar
/// (casa sem numero, chacara, ponto de referencia).
class MapPickScreen extends StatefulWidget {
  const MapPickScreen({super.key, required this.inicio});

  final Coords inicio;

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

  @override
  void dispose() {
    _espera?.cancel();
    super.dispose();
  }

  void _agendar() {
    _espera?.cancel();
    setState(() => _movendo = true);
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
    Navigator.of(context).pop(PlaceSuggestion(
      address: l?.address ?? 'Ponto marcado no mapa',
      detail: l?.detail ?? '',
      coords: _centro,
      distanceKm: 0,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final texto = _movendo
        ? 'Solte o mapa no lugar certo...'
        : _buscando
            ? 'Buscando o endereço...'
            : (_lugar?.address ?? 'Ponto marcado no mapa');

    return Scaffold(
      body: Stack(
        children: [
          Positioned.fill(
            child: FlutterMap(
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
                TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'com.rideplatform.mobile_passenger',
                  maxZoom: 19,
                ),
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
                    Text('Arraste o mapa até o destino', style: SheetText.muted),
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
                              if (!_movendo && !_buscando && (_lugar?.detail ?? '').isNotEmpty)
                                Text(_lugar!.detail, maxLines: 1, overflow: TextOverflow.ellipsis, style: SheetText.muted),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: Spacing.lg),
                    AppButton(
                      label: 'Confirmar destino',
                      enabled: !_movendo,
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
