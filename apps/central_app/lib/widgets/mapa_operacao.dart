import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/posicao_aparelho.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/geo.dart';
import '../state/central_state.dart';
import 'ride_map.dart';
import 'ui.dart';

/// Mapa da operacao na tela principal: motoristas online na posicao REAL
/// (carro) e passageiros esperando ou em corrida (pino).
class MapaOperacao extends StatelessWidget {
  const MapaOperacao({super.key});

  @override
  Widget build(BuildContext context) {
    final central = context.watch<CentralState>();
    final motoristas = central.motoristasOnline;
    final corridas = central.rides;
    final livres = motoristas.where((m) => m.livre).length;

    final markers = <MapMarker>[
      for (final m in motoristas)
        MapMarker(
          id: 'motorista-${m.id}',
          coords: m.coords,
          kind: MarkerKind.car,
          label: '${m.nome} - ${m.livre ? 'livre' : 'em corrida'}',
        ),
      for (final r in corridas)
        MapMarker(
          id: 'passageiro-${r.id}',
          coords: r.passengerCoords,
          kind: MarkerKind.passenger,
          label: r.passengerName,
        ),
    ];

    final pontos = <Coords>[
      ...motoristas.map((m) => m.coords),
      ...corridas.map((r) => r.passengerCoords),
    ];
    // Sem ninguem no mapa: abre onde o aparelho da Central esta. Sem
    // posicao ainda, mostra o Brasil — nunca uma cidade fixa.
    final Coords centro = pontos.isEmpty
        ? (PosicaoDoAparelho.atual ?? const Coords(-14.235, -51.925))
        : Coords(
            pontos.map((p) => p.latitude).reduce((a, b) => a + b) / pontos.length,
            pontos.map((p) => p.longitude).reduce((a, b) => a + b) / pontos.length,
          );
    final semReferencia = pontos.isEmpty && PosicaoDoAparelho.atual == null;

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '$livres livre(s) - ${motoristas.length - livres} em corrida - '
                  '${corridas.length} corrida(s) ativa(s)',
                  style: AppText.body.copyWith(color: AppColors.textFaint),
                ),
              ),
              AppBadge(
                text: '${motoristas.length} ONLINE',
                tone: motoristas.isEmpty ? AppBadgeTone.neutral : AppBadgeTone.info,
              ),
            ],
          ),
          const SizedBox(height: Spacing.md),
          SizedBox(
            height: 280,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: RideMap(
                center: centro,
                markers: markers,
                route: const <Coords>[],
                span: semReferencia ? 30 : 0.12,
                interactive: true,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
