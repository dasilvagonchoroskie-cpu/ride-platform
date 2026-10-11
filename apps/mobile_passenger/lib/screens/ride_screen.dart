import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/contato.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../core/utils/geo.dart';
import '../data/models/models.dart';
import '../state/config_state.dart';
import '../state/ride_state.dart';
import '../widgets/compartilhar_viagem.dart';
import '../widgets/corrida_ui.dart';
import '../widgets/motorista_ui.dart';
import 'sos_screen.dart';
import '../widgets/ride_map.dart';
import '../widgets/ui.dart';

/// Valor no canto da tela durante a viagem: o taximetro (quando a Central
/// cobra assim) ou o preco combinado.
class _ValorAgora extends StatelessWidget {
  const _ValorAgora({required this.corrida});

  final Ride corrida;

  @override
  Widget build(BuildContext context) {
    final taximetro = corrida.taximetroCents;
    final rotulo = taximetro != null ? 'Taxímetro' : (corrida.cobranca == 'FECHADO' ? 'Preço fechado' : 'Valor estimado');
    final metros = corrida.taximetroMetros;
    return Container(
      key: const ValueKey('valor-agora'),
      padding: const EdgeInsets.symmetric(horizontal: Spacing.md, vertical: Spacing.sm),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(Radii.md),
        border: Border.all(color: taximetro != null ? AppColors.primary : AppColors.border, width: taximetro != null ? 2 : 1),
        boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 8)],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(rotulo, style: AppText.caption.copyWith(color: AppColors.textMuted)),
          Text(
            formatMoney(taximetro ?? corrida.aPagarCents),
            style: AppText.title.copyWith(fontSize: 22, color: AppColors.text, fontWeight: FontWeight.w800),
          ),
          if (taximetro != null && metros != null)
            Text(formatDistance(metros.toDouble()), style: AppText.caption.copyWith(color: AppColors.textMuted)),
        ],
      ),
    );
  }
}

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
              // Comeca mostrando o carro e o destino inteiros na tela.
              enquadrar: [centro, corrida.dropoff.coords],
              enquadrarChave: corrida.id,
              enquadrarMargem: EdgeInsets.fromLTRB(56, 110, 56, MediaQuery.sizeOf(context).height * 0.45),
              // Bussola e centralizar (no carro, ou no embarque enquanto ele nao aparece).
              minhaPosicao: centro,
              // Botoes do mapa logo abaixo do SOS: no lugar padrao eles
              // ficavam escondidos atras do botao do chat (foto da tela).
              controlesAlinhamento: const Alignment(1, -0.55),
              markers: [
                MapMarker(id: 'dropoff', coords: corrida.dropoff.coords, kind: MarkerKind.dropoff),
                if (motorista != null && motorista.posicaoReal)
                  MapMarker(id: 'driver', coords: motorista.position, kind: corrida.moto ? MarkerKind.moto : MarkerKind.car),
              ],
              // Pelas ruas ate o destino (o traco some atras do carro).
              route: restanteDaRota(centro, estado.tripRoute),
            ),
          ),
          // Taximetro no canto: o valor correndo, como no app do motorista.
          SafeArea(
            child: Align(
              alignment: Alignment.topLeft,
              child: Padding(
                padding: const EdgeInsets.all(Spacing.md),
                child: _ValorAgora(corrida: corrida),
              ),
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
                  constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.5),
                  child: SingleChildScrollView(
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
                    if (corrida.taximetroCents != null) ...[
                      LinhaValor(rotulo: 'Taxímetro (até agora)', valor: formatMoney(corrida.taximetroCents!)),
                      Text(
                        'O valor final é o do taxímetro ao chegar: bandeirada, km rodado, tempo e espera.',
                        style: AppText.caption.copyWith(color: AppColors.textMuted),
                      ),
                    ] else
                      LinhaValor(
                        rotulo: corrida.cobranca == 'FECHADO' ? 'Preço fechado' : 'Valor estimado',
                        valor: formatMoney(corrida.aPagarCents),
                      ),
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
                    const BotaoCompartilharViagem(),
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
