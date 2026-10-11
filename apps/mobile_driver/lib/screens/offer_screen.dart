import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../core/utils/geo.dart';
import '../data/models/driver_models.dart';
import '../state/driver_state.dart';
import '../widgets/deslizar.dart';
import '../widgets/ride_map.dart';
import '../widgets/ui.dart';

/// Enquadramento do mapa: o meio entre o ponto mais extremo de cada lado,
/// para que carro, embarque e destino apareçam juntos.
Coords _enquadrar(Coords carro, RideOffer oferta) {
  final lats = [carro.latitude, oferta.pickupCoords.latitude, oferta.dropoffCoords.latitude];
  final lons = [carro.longitude, oferta.pickupCoords.longitude, oferta.dropoffCoords.longitude];
  lats.sort();
  lons.sort();
  return Coords((lats.first + lats.last) / 2, (lons.first + lons.last) / 2);
}

/// Quanto o mapa precisa abrir para os tres pontos caberem, com uma folga
/// de 40% nas bordas para nada ficar colado no canto.
double _abertura(Coords carro, RideOffer oferta) {
  final lats = [carro.latitude, oferta.pickupCoords.latitude, oferta.dropoffCoords.latitude];
  final lons = [carro.longitude, oferta.pickupCoords.longitude, oferta.dropoffCoords.longitude];
  lats.sort();
  lons.sort();
  final maior = (lats.last - lats.first) > (lons.last - lons.first)
      ? lats.last - lats.first
      : lons.last - lons.first;
  // Piso de 0,02 para uma corrida curta nao deixar o mapa colado demais.
  final comFolga = maior * 1.4;
  return comFolga < 0.02 ? 0.02 : comFolga;
}

/// Oferta de corrida: contador regressivo, onde buscar e para onde vai.
class OfferScreen extends StatelessWidget {
  const OfferScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final driver = context.watch<DriverState>();
    final offer = driver.offer;

    if (offer == null) return const SizedBox.shrink();

    final progress = offer.expiresInSeconds == 0
        ? 0.0
        : driver.offerSecondsLeft / offer.expiresInSeconds;

    return Scaffold(
      backgroundColor: AppColors.background,
      body: Column(
        children: [
          // Mapa com a VIAGEM INTEIRA: onde buscar e para onde vai.
          //
          // Antes so aparecia o caminho ate o passageiro, e o motorista
          // aceitava sem saber o destino. Agora o traco segue ate o fim, e
          // o enquadramento abre o suficiente para os tres pontos caberem
          // na tela — carro, embarque e desembarque.
          Expanded(
            flex: 4,
            child: RideMap(
              center: _enquadrar(driver.position, offer),
              span: _abertura(driver.position, offer),
              rounded: false,
              // Carro, embarque, destino e as rotas inteiros na tela, perto
              // ou longe (o zoom fixo cortava as corridas longas).
              enquadrar: [
                driver.position,
                offer.pickupCoords,
                offer.dropoffCoords,
                ...driver.rotaOfertaAteEmbarque,
                ...driver.rotaOfertaViagem,
              ],
              enquadrarChave: '${driver.rotaOfertaAteEmbarque.length}|${driver.rotaOfertaViagem.length}',
              enquadrarMargem: const EdgeInsets.fromLTRB(40, 56, 40, 32),
              // Pelas ruas (ate o embarque em azul, a viagem em verde). Sem a
              // rota ainda (ou sem rede), so os pontos aparecem.
              driverRoute: driver.rotaOfertaAteEmbarque,
              route: driver.rotaOfertaViagem,
              markers: [
                MapMarker(id: 'me', coords: driver.position, kind: driver.vehicle?.moto == true ? MarkerKind.moto : MarkerKind.car),
                MapMarker(id: 'pickup', coords: offer.pickupCoords, kind: MarkerKind.pickup),
                MapMarker(id: 'dropoff', coords: offer.dropoffCoords, kind: MarkerKind.dropoff),
              ],
            ),
          ),

          Expanded(
            flex: 6,
            child: SheetSurface(
              padding: const EdgeInsets.fromLTRB(Spacing.lg, Spacing.md, Spacing.lg, Spacing.lg),
              // Deslizar e Recusar ficam SEMPRE na tela, embaixo; so os
              // detalhes rolam. Antes, em celular de 780 de altura, o
              // "Deslize para aceitar" ficava 162 pontos abaixo da tela
              // (a foto da tela pegou em 10/10/2026).
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Center(
                    child: Container(
                      width: 36,
                      height: 4,
                      decoration: BoxDecoration(
                        color: AppColors.sheetBorder,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  const SizedBox(height: Spacing.md),

                  // Contador de expiracao
                  Row(
                    children: [
                      SizedBox(
                        height: 44,
                        width: 44,
                        child: Stack(
                          alignment: Alignment.center,
                          children: [
                            CircularProgressIndicator(
                              value: progress,
                              strokeWidth: 3.5,
                              backgroundColor: AppColors.sheetBorder,
                              valueColor: AlwaysStoppedAnimation(
                                progress > 0.35 ? AppColors.primary : AppColors.danger,
                              ),
                            ),
                            Text(
                              '${driver.offerSecondsLeft}',
                              style: SheetText.heading.copyWith(fontSize: 15),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: Spacing.md),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Nova chamada', style: SheetText.title),
                            Text('Responda antes do tempo acabar', style: SheetText.muted),
                          ],
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: Spacing.md),

                  Expanded(
                    child: SingleChildScrollView(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          // Ganho em destaque
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: Spacing.lg, vertical: Spacing.md),
                            decoration: BoxDecoration(
                              color: AppColors.sheetField,
                              borderRadius: BorderRadius.circular(Radii.sm),
                            ),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text('VALOR DA CORRIDA', style: SheetText.label),
                                    Text(
                                      formatMoney(offer.fareCents),
                                      style: SheetText.title.copyWith(fontSize: 28),
                                    ),
                                  ],
                                ),
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    Text('Seu ganho', style: SheetText.muted),
                                    Text(formatMoney(offer.earningCents), style: SheetText.heading),
                                    const SizedBox(height: 4),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                                      decoration: BoxDecoration(
                                        color: AppColors.brandSoft,
                                        borderRadius: BorderRadius.circular(Radii.pill),
                                      ),
                                      child: Text(
                                        offer.paymentMethod,
                                        style: SheetText.label.copyWith(color: AppColors.brand, letterSpacing: 0),
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),

                          const SizedBox(height: Spacing.md),

                          // Rota primeiro: e o que decide o aceite.
                          Row(
                            children: [
                              const Icon(Icons.my_location, size: 18, color: AppColors.sheetText),
                              const SizedBox(width: Spacing.md),
                              Expanded(
                                child: Text(
                                  '${formatDistance(offer.distanceToPickupMeters.toDouble())} até o embarque',
                                  style: SheetText.body,
                                ),
                              ),
                              Text(formatDuration(offer.durationSeconds), style: SheetText.heading),
                            ],
                          ),
                          const SizedBox(height: Spacing.sm),
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Padding(
                                padding: EdgeInsets.only(top: 2),
                                child: Icon(Icons.location_on, size: 18, color: AppColors.primary),
                              ),
                              const SizedBox(width: Spacing.md),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text('ONDE BUSCAR', style: SheetText.label),
                                    Text(
                                      offer.pickupAddress,
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: SheetText.body,
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: Spacing.sm),
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Padding(
                                padding: EdgeInsets.only(top: 2),
                                child: Icon(Icons.flag, size: 18, color: AppColors.danger),
                              ),
                              const SizedBox(width: Spacing.md),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text('PARA ONDE VAI', style: SheetText.label),
                                    Text(
                                      offer.dropoffAddress,
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: SheetText.body,
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(width: Spacing.sm),
                              Text(
                                formatDistance(offer.tripDistanceMeters.toDouble()),
                                style: SheetText.muted,
                              ),
                            ],
                          ),

                          const SizedBox(height: Spacing.md),
                          const AppDivider(onLight: true),

                          // Passageiro
                          Row(
                            children: [
                              AppAvatar(initials: offer.passengerInitials, size: 40),
                              const SizedBox(width: Spacing.md),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      offer.passengerName,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: SheetText.heading,
                                    ),
                                    Row(
                                      children: [
                                        AppStars(value: offer.passengerRating, size: 12),
                                        const SizedBox(width: Spacing.xs),
                                        Text(offer.passengerRating.toStringAsFixed(1), style: SheetText.muted),
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),

                  const SizedBox(height: Spacing.md),

                  // Deslizar para aceitar (Evandro, 09/10/2026): toque sem
                  // querer no bolso nao aceita corrida.
                  Deslizar(
                    texto: 'DESLIZE PARA ACEITAR',
                    cor: AppColors.accent,
                    aoConfirmar: () => context.read<DriverState>().acceptOffer(),
                  ),
                  const SizedBox(height: Spacing.xs),
                  TextButton(
                    onPressed: () => context.read<DriverState>().declineOffer(),
                    style: TextButton.styleFrom(
                      foregroundColor: AppColors.sheetMuted,
                      minimumSize: const Size.fromHeight(44),
                    ),
                    child: const Text('Recusar', style: AppText.button),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
