import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../data/models/models.dart';
import '../state/ride_state.dart';
import '../core/utils/geo.dart';
import '../widgets/corrida_ui.dart';
import '../widgets/motorista_ui.dart';
import 'sos_screen.dart';
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

    // Motorista ja aceitou: tela no modelo Pop Move.
    if (motorista != null) return _motoristaACaminho(context, estado, corrida, centro);

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
              ],
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
                    const SizedBox(height: Spacing.md),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: const LinearProgressIndicator(
                        minHeight: 6,
                        color: AppColors.brand,
                        backgroundColor: AppColors.brandSoft,
                      ),
                    ),
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
                    LinhaValor(rotulo: 'Valor estimado (${corrida.paymentMethod})', valor: formatMoney(corrida.aPagarCents)),
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

  /// Motorista a caminho / esperando (modelo Pop Move).
  Widget _motoristaACaminho(BuildContext context, RideState estado, Ride corrida, Coords centro) {
    final motorista = corrida.driver!;
    final altura = MediaQuery.sizeOf(context).height;
    return Scaffold(
      body: Stack(
        children: [
          Positioned.fill(
            child: RideMap(
              center: centro,
              span: 0.02,
              rounded: false,
              // O carro e voce na mesma tela (enquadra quando o carro aparece
              // e a cada etapa: a caminho, chegou).
              enquadrar: [if (motorista.posicaoReal) motorista.position, corrida.pickup.coords],
              enquadrarChave: '${corrida.status}|${motorista.posicaoReal}',
              enquadrarMargem: EdgeInsets.fromLTRB(56, 96, 56, altura * 0.45),
              markers: [
                MapMarker(id: 'pickup', coords: corrida.pickup.coords, kind: MarkerKind.pickup),
                if (motorista.posicaoReal) MapMarker(id: 'driver', coords: motorista.position, kind: corrida.moto ? MarkerKind.moto : MarkerKind.car),
              ],
              // Pelas ruas; o traco some atras do carro conforme ele anda.
              driverRoute: motorista.posicaoReal ? restanteDaRota(motorista.position, estado.driverRoute) : const [],
            ),
          ),
          // SOS sempre visivel no alto do mapa durante a corrida.
          const SafeArea(
            child: Align(
              alignment: Alignment.topRight,
              child: Padding(padding: EdgeInsets.all(Spacing.md), child: BotaoSos()),
            ),
          ),
          Align(
            alignment: Alignment.bottomCenter,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(Spacing.lg, 0, Spacing.lg, Spacing.sm),
                  child: Row(
                    children: [
                      Expanded(child: FaixaTempoAteVoce(corrida: corrida)),
                      const SizedBox(width: Spacing.sm),
                      BotaoChat(corrida: corrida),
                    ],
                  ),
                ),
                SheetSurface(
                  padding: const EdgeInsets.fromLTRB(Spacing.lg, Spacing.md, Spacing.lg, Spacing.md),
                  child: SafeArea(
                    top: false,
                    child: ConstrainedBox(
                      constraints: BoxConstraints(maxHeight: altura * 0.62),
                      child: SingleChildScrollView(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            const AlcaFolha(),
                            PainelMotorista(corrida: corrida),
                            if (corrida.pin.isNotEmpty) ...[
                              const SizedBox(height: Spacing.md),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: Spacing.md, vertical: Spacing.sm),
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
                            const SizedBox(height: Spacing.sm),
                            LinhaValor(
                              rotulo: 'Valor estimado (${corrida.paymentMethod})',
                              valor: formatMoney(corrida.aPagarCents),
                            ),
                            if (estado.modoDemo)
                              Padding(
                                padding: const EdgeInsets.only(bottom: Spacing.sm),
                                child: AppButton(
                                  label: 'Avançar (demonstração)',
                                  variant: AppButtonVariant.secondary,
                                  onPressed: () => context.read<RideState>().advanceRide(),
                                ),
                              ),
                            const SizedBox(height: Spacing.sm),
                            BotaoCancelarPilula(carregando: _cancelando, aoTocar: () => _cancelar(corrida)),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
