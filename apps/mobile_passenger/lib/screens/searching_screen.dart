import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../data/models/models.dart';
import '../state/ride_state.dart';
import '../widgets/corrida_ui.dart';
import '../widgets/ride_map.dart';
import '../widgets/ui.dart';

/// Do pedido ate o embarque: procurando motorista, motorista a caminho e
/// motorista esperando. Tudo vem do servidor (o aplicativo pergunta a
/// cada poucos segundos) — nada e simulado.
class SearchingScreen extends StatefulWidget {
  const SearchingScreen({super.key});

  @override
  State<SearchingScreen> createState() => _SearchingScreenState();
}

class _SearchingScreenState extends State<SearchingScreen> {
  bool _cancelando = false;

  Future<void> _cancelar(Ride corrida) async {
    final ok = await confirmarCancelamento(context, motoristaJaVem: corrida.driver != null);
    if (!ok || !mounted) return;
    setState(() => _cancelando = true);
    await context.read<RideState>().cancelRide();
    if (mounted) setState(() => _cancelando = false);
  }

  @override
  Widget build(BuildContext context) {
    final estado = context.watch<RideState>();
    final corrida = estado.activeRide;
    if (corrida == null) return const SizedBox.shrink();

    final motorista = corrida.driver;
    final (titulo, subtitulo) = switch (corrida.status) {
      RideStatus.driverWaiting => ('O motorista chegou', 'Ele está te esperando no local de embarque.'),
      RideStatus.driverAssigned || RideStatus.driverArriving => (
          'Motorista a caminho',
          'Ele está indo até o local de embarque.',
        ),
      _ => ('Procurando motorista', 'Chamando os motoristas mais perto de você...'),
    };

    final centro = motorista != null && motorista.posicaoReal ? motorista.position : corrida.pickup.coords;

    return Scaffold(
      body: Stack(
        children: [
          Positioned.fill(
            child: RideMap(
              center: centro,
              span: 0.02,
              rounded: false,
              markers: [
                MapMarker(id: 'pickup', coords: corrida.pickup.coords, kind: MarkerKind.pickup),
                MapMarker(id: 'dropoff', coords: corrida.dropoff.coords, kind: MarkerKind.dropoff),
                if (motorista != null && motorista.posicaoReal)
                  MapMarker(id: 'driver', coords: motorista.position, kind: MarkerKind.car),
              ],
              driverRoute: estado.driverRoute,
            ),
          ),
          Align(
            alignment: Alignment.bottomCenter,
            child: SheetSurface(
              padding: const EdgeInsets.fromLTRB(Spacing.xl, Spacing.md, Spacing.xl, Spacing.lg),
              child: SafeArea(
                top: false,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const AlcaFolha(),
                    Text(titulo, style: AppText.title.copyWith(fontSize: 22, color: AppColors.text)),
                    const SizedBox(height: Spacing.xs),
                    Text(subtitulo, style: AppText.body.copyWith(color: AppColors.textMuted)),
                    if (motorista == null) ...[
                      const SizedBox(height: Spacing.md),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(4),
                        child: const LinearProgressIndicator(
                          minHeight: 6,
                          color: AppColors.brand,
                          backgroundColor: AppColors.brandSoft,
                        ),
                      ),
                    ] else ...[
                      const SizedBox(height: Spacing.lg),
                      CartaoMotorista(motorista: motorista),
                      if (corrida.pin.isNotEmpty) ...[
                        const SizedBox(height: Spacing.lg),
                        Container(
                          padding: const EdgeInsets.all(Spacing.md),
                          decoration: BoxDecoration(
                            color: AppColors.brandSoft,
                            borderRadius: BorderRadius.circular(Radii.md),
                          ),
                          child: Row(
                            children: [
                              Expanded(
                                child: Text(
                                  'Ao entrar no carro, diga este código ao motorista:',
                                  style: AppText.body.copyWith(color: AppColors.text),
                                ),
                              ),
                              const SizedBox(width: Spacing.md),
                              Text(
                                corrida.pin,
                                style: AppText.title.copyWith(color: AppColors.brand, letterSpacing: 6),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ],
                    const SizedBox(height: Spacing.md),
                    const Divider(height: 1, color: AppColors.border),
                    const SizedBox(height: Spacing.sm),
                    Text('Destino', style: AppText.caption.copyWith(color: AppColors.textMuted)),
                    Text(
                      corrida.dropoff.address,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: AppText.bodyStrong.copyWith(color: AppColors.text),
                    ),
                    LinhaValor(rotulo: 'Valor estimado (${corrida.paymentMethod})', valor: formatMoney(corrida.fareCents)),
                    const SizedBox(height: Spacing.sm),
                    if (estado.modoDemo)
                      Padding(
                        padding: const EdgeInsets.only(bottom: Spacing.sm),
                        child: AppButton(
                          label: 'Avançar (demonstração)',
                          variant: AppButtonVariant.secondary,
                          onPressed: () => context.read<RideState>().advanceRide(),
                        ),
                      ),
                    OutlinedButton(
                      onPressed: _cancelando ? null : () => _cancelar(corrida),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.danger,
                        side: const BorderSide(color: AppColors.danger),
                        minimumSize: const Size.fromHeight(50),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.sm)),
                      ),
                      child: Text(_cancelando ? 'Cancelando...' : 'Cancelar corrida'),
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
