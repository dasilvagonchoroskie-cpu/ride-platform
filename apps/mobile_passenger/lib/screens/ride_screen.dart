import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/contato.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../state/config_state.dart';
import '../state/ride_state.dart';
import '../widgets/corrida_ui.dart';
import '../widgets/motorista_ui.dart';
import '../widgets/ride_map.dart';
import '../widgets/ui.dart';

/// Viagem em andamento. Quem encerra e o motorista (o valor final vem do
/// servidor); o passageiro acompanha e, se precisar, chama a Central.
class RideScreen extends StatelessWidget {
  const RideScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final estado = context.watch<RideState>();
    final corrida = estado.activeRide;
    if (corrida == null) return const SizedBox.shrink();
    final motorista = corrida.driver;
    final whatsapp = context.watch<ConfigState>().whatsapp;
    final centro = motorista != null && motorista.posicaoReal ? motorista.position : corrida.pickup.coords;

    return Scaffold(
      body: Stack(
        children: [
          Positioned.fill(
            child: RideMap(
              center: centro,
              span: 0.03,
              rounded: false,
              markers: [
                MapMarker(id: 'dropoff', coords: corrida.dropoff.coords, kind: MarkerKind.dropoff),
                if (motorista != null && motorista.posicaoReal)
                  MapMarker(id: 'driver', coords: motorista.position, kind: MarkerKind.car),
              ],
              route: [centro, corrida.dropoff.coords],
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
              padding: const EdgeInsets.fromLTRB(Spacing.xl, Spacing.md, Spacing.xl, Spacing.lg),
              child: SafeArea(
                top: false,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const AlcaFolha(),
                    Text('Em viagem', style: AppText.title.copyWith(fontSize: 22, color: AppColors.text)),
                    const SizedBox(height: Spacing.xs),
                    Text(
                      corrida.dropoff.address,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: AppText.body.copyWith(color: AppColors.textMuted),
                    ),
                    if (motorista != null) ...[
                      const SizedBox(height: Spacing.md),
                      PainelMotorista(corrida: corrida),
                    ],
                    const SizedBox(height: Spacing.md),
                    const Divider(height: 1, color: AppColors.border),
                    LinhaValor(rotulo: 'Valor estimado', valor: formatMoney(corrida.aPagarCents)),
                    LinhaValor(rotulo: 'Pagamento', valor: '${corrida.paymentMethod}, direto ao motorista'),
                    const SizedBox(height: Spacing.sm),
                    if (estado.modoDemo)
                      Padding(
                        padding: const EdgeInsets.only(bottom: Spacing.sm),
                        child: AppButton(
                          label: 'Encerrar (demonstração)',
                          variant: AppButtonVariant.secondary,
                          onPressed: () => context.read<RideState>().advanceRide(),
                        ),
                      ),
                    TextButton.icon(
                      onPressed: () => falarComCentral(
                        whatsapp,
                        mensagem: 'Olá! Estou na corrida ${corrida.code} da Fortaleza Mov e preciso de ajuda.',
                      ),
                      icon: const Icon(Icons.support_agent, color: AppColors.brand),
                      label: Text('Preciso de ajuda', style: AppText.bodyStrong.copyWith(color: AppColors.brand)),
                    ),
                  ],
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
