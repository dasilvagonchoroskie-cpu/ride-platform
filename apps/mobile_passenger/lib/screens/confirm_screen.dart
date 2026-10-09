import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api/api_client.dart';
import '../core/avisos.dart';

import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../core/utils/geo.dart';
import '../data/models/models.dart';
import '../state/app_state.dart';
import '../state/ride_state.dart';
import 'agendadas_screen.dart';
import 'cupons_screen.dart';
import '../widgets/ride_map.dart';
import '../widgets/ui.dart';

/// Confirmacao da viagem.
///
/// Modalidade unica: nao ha lista de opcoes a percorrer. O mapa mostra a
/// rota em cima e embaixo aparece um card so, com o preco da bandeira
/// vigente e o botao de confirmar.
class ConfirmScreen extends StatefulWidget {
  const ConfirmScreen({super.key, required this.destination, required this.address});

  final Coords destination;
  final String address;

  @override
  State<ConfirmScreen> createState() => _ConfirmScreenState();
}

class _ConfirmScreenState extends State<ConfirmScreen> {
  PaymentOption _payment = kFormasDePagamento.first;
  bool _submitting = false;

  /// Endereco escrito do embarque (pelo GPS). O motorista precisa ler a rua,
  /// e nao "Local de embarque (GPS)".
  String? _embarque;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final ponto = context.read<AppState>().coords;
      final lugar = await context.read<RideState>().addressOf(ponto);
      if (mounted && lugar != null) setState(() => _embarque = lugar.fullAddress);
    });
  }

  Future<void> _confirm() async {
    if (_submitting) return;
    setState(() => _submitting = true);

    final Ride pedida;
    try {
      pedida = await context.read<RideState>().requestRide(
            origin: context.read<AppState>().coords,
            destination: widget.destination,
            pickupAddress: _embarque ?? 'Local de embarque (GPS)',
            dropoffAddress: widget.address,
            paymentMethod: _payment.label,
            paymentType: _payment.type,
          );
    } on ApiException {
      // O motivo ja aparece na tela (aviso do servidor). Antes o botao
      // ficava girando para sempre.
      if (mounted) setState(() => _submitting = false);
      return;
    } catch (_) {
      avisar('Sem conexão com o servidor. A corrida não foi pedida.');
      if (mounted) setState(() => _submitting = false);
      return;
    }

    if (!mounted) return;
    setState(() => _submitting = false);
    if (pedida.status == RideStatus.scheduled) {
      // Agendada: mostra a lista com a corrida nova em destaque.
      final q = DateTime.tryParse(pedida.agendadaPara ?? '')?.toLocal();
      if (q != null) avisar('Corrida agendada para ${horarioAgendado(q)}.');
      await Navigator.of(context).pushReplacement(
        MaterialPageRoute<void>(builder: (_) => AgendadasScreen(recemAgendada: pedida.id)),
      );
      return;
    }
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final ride = context.watch<RideState>();
    final quote = ride.quote;

    final center = Coords(
      (app.coords.latitude + widget.destination.latitude) / 2,
      (app.coords.longitude + widget.destination.longitude) / 2,
    );

    return Scaffold(
      backgroundColor: AppColors.background,
      body: Column(
        // Largura toda para o mapa (sem isto a pilha do mapa ficava da
        // largura do botao de voltar e o mapa virava uma fita no meio).
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // ---------- 40% superiores: mapa com a rota tracada ----------
          Expanded(
            flex: 4,
            child: Stack(
              children: [
                Positioned.fill(
                  child: RideMap(
                    center: center,
                    span: 0.075,
                    rounded: false,
                    // A viagem inteira na tela, perto ou longe (antes o zoom era
                    // fixo e Goiatuba → Rio Verde mostrava um pedaco vazio).
                    enquadrar: [app.coords, widget.destination, ...ride.rotaPrevia],
                    enquadrarChave: ride.rotaPrevia.length,
                    enquadrarMargem: const EdgeInsets.fromLTRB(40, 72, 40, 36),
                    // Pelas ruas (aparece assim que o servidor responde).
                    route: ride.rotaPrevia,
                    markers: [
                      MapMarker(id: 'pickup', coords: app.coords, kind: MarkerKind.pickup),
                      MapMarker(
                        id: 'dropoff',
                        coords: widget.destination,
                        kind: MarkerKind.dropoff,
                      ),
                    ],
                  ),
                ),
                SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.all(Spacing.sm),
                    child: GestureDetector(
                      onTap: () => Navigator.of(context).pop(),
                      child: Container(
                        height: 40,
                        width: 40,
                        decoration: BoxDecoration(
                          color: AppColors.background.withValues(alpha: 0.86),
                          shape: BoxShape.circle,
                          border: Border.all(color: AppColors.border),
                        ),
                        child: const Icon(Icons.arrow_back, color: AppColors.text, size: 20),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),

          // ---------- 60% inferiores: lista de opcoes de viagem ----------
          Expanded(
            flex: 6,
            child: SheetSurface(
              padding: const EdgeInsets.fromLTRB(Spacing.lg, Spacing.lg, Spacing.lg, Spacing.lg),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(ride.agendarPara == null ? 'Confirmar viagem' : 'Agendar viagem', style: SheetText.title),
                            if (ride.agendarPara != null) ...[
                              const SizedBox(height: 2),
                              Row(
                                children: [
                                  const Icon(Icons.event, size: 16, color: AppColors.brand),
                                  const SizedBox(width: Spacing.xs),
                                  Expanded(
                                    child: Text(
                                      'Para ${horarioAgendado(ride.agendarPara!)}',
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: SheetText.body.copyWith(fontWeight: FontWeight.w600, color: AppColors.brand),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                            const SizedBox(height: Spacing.xs),
                            Row(
                              children: [
                                const Icon(Icons.circle, size: 10, color: AppColors.primary),
                                const SizedBox(width: Spacing.sm),
                                Expanded(
                                  child: Text(
                                    _embarque ?? 'Embarque: sua localização atual',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: SheetText.muted,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 2),
                            Row(
                              children: [
                                const Icon(Icons.stop, size: 12, color: AppColors.danger),
                                const SizedBox(width: Spacing.sm),
                                Expanded(
                                  child: Text(
                                    widget.address,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: SheetText.muted,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      TextButton(
                        onPressed: () => Navigator.of(context).pop(),
                        style: TextButton.styleFrom(foregroundColor: AppColors.sheetText),
                        child: const Text('Trocar'),
                      ),
                    ],
                  ),
                  const SizedBox(height: Spacing.sm),

                  // Card unico com o preco da bandeira vigente.
                  Expanded(
                    child: SingleChildScrollView(
                      padding: EdgeInsets.zero,
                      child: ride.estimating || quote == null
                          ? const Padding(
                              padding: EdgeInsets.symmetric(vertical: Spacing.xl),
                              child: Center(child: CircularProgressIndicator()),
                            )
                          : _PriceCard(quote: quote),
                    ),
                  ),
                  const SizedBox(height: Spacing.sm),

                  // Cupom: escolhido na tela Cupons ou aqui mesmo.
                  _LinhaCupom(
                    codigo: ride.cupomCodigo,
                    descontoCents: quote?.discountCents ?? 0,
                    aPagarCents: quote?.aPagarCents,
                    aoTocar: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(builder: (_) => const CuponsScreen(naConfirmacao: true)),
                    ),
                    aoTirar: () => context.read<RideState>().aplicarCupom(null, refazerPreco: true),
                  ),
                  const SizedBox(height: Spacing.sm),

                  // Forma de pagamento
                  GestureDetector(
                    onTap: _choosePayment,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: Spacing.md,
                        vertical: Spacing.md,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.sheetField,
                        borderRadius: BorderRadius.circular(Radii.sm),
                      ),
                      child: Row(
                        children: [
                          Icon(_iconePagamento(_payment.type), size: 20, color: AppColors.sheetText),
                          const SizedBox(width: Spacing.md),
                          Expanded(
                            child: Text(
                              _payment.label,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: SheetText.body.copyWith(fontWeight: FontWeight.w600),
                            ),
                          ),
                          const Icon(Icons.keyboard_arrow_right, color: AppColors.sheetMuted),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: Spacing.md),

                  // Botao de acao principal: preto, texto branco em negrito,
                  // largura total, na extremidade inferior com padding confortavel.
                  AppButton(
                    label: ride.agendarPara == null ? 'Confirmar corrida' : 'Agendar corrida',
                    variant: AppButtonVariant.primary,
                    loading: _submitting,
                    enabled: quote != null,
                    onPressed: _confirm,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _choosePayment() async {
    final chosen = await showModalBottomSheet<PaymentOption>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => SheetSurface(
        padding: const EdgeInsets.fromLTRB(Spacing.lg, Spacing.md, Spacing.lg, Spacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
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
            const SizedBox(height: Spacing.lg),
            Text('Forma de pagamento', style: SheetText.title),
            const SizedBox(height: Spacing.md),
            Text('Você paga direto ao motorista, no fim da corrida.', style: SheetText.muted),
            const SizedBox(height: Spacing.sm),
            for (final method in kFormasDePagamento)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(_iconePagamento(method.type), color: AppColors.sheetText),
                title: Text(method.label, style: SheetText.body.copyWith(fontWeight: FontWeight.w600)),
                subtitle: Text(method.detail, style: SheetText.muted),
                trailing: method.id == _payment.id
                    ? const Icon(Icons.check, color: AppColors.primary)
                    : null,
                onTap: () => Navigator.of(context).pop(method),
              ),
          ],
        ),
      ),
    );

    if (chosen != null) setState(() => _payment = chosen);
  }
}

IconData _iconePagamento(String tipo) => switch (tipo) {
      'PIX' => Icons.qr_code_2,
      'CREDIT_CARD' || 'DEBIT_CARD' => Icons.credit_card,
      _ => Icons.payments_outlined,
    };

/// Card unico com o preco da viagem.
///
/// Mostra a bandeira vigente e abre a conta: a bandeirada e, quando a
/// viagem passa da franquia, quanto foi somado por distancia. O passageiro
/// consegue conferir o valor em vez de so aceitar um numero.
class _PriceCard extends StatelessWidget {
  const _PriceCard({required this.quote});

  final RideQuote quote;

  @override
  Widget build(BuildContext context) {
    final noturna = quote.flag == FareFlag.noturna;

    return Container(
      padding: const EdgeInsets.all(Spacing.lg),
      decoration: BoxDecoration(
        color: AppColors.sheet,
        borderRadius: BorderRadius.circular(Radii.sm),
        border: Border.all(color: AppColors.sheetText, width: 2),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(
                noturna ? Icons.nightlight_round : Icons.wb_sunny_outlined,
                size: 18,
                color: AppColors.sheetMuted,
              ),
              const SizedBox(width: Spacing.sm),
              Expanded(
                child: Text(
                  'Bandeira ${quote.flag.label} - ${quote.flag.faixa}',
                  style: SheetText.muted,
                ),
              ),
            ],
          ),
          const SizedBox(height: Spacing.md),

          // Evandro (09/10/2026): o valor do pedido e so aproximado; quem
          // fecha a conta e o taximetro do motorista (distancia + tempo parado).
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Text(formatMoney(quote.priceCents), style: SheetText.price),
              const SizedBox(width: Spacing.sm),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: quote.taximetro ? AppColors.brandSoft : AppColors.primarySoft,
                  borderRadius: BorderRadius.circular(Radii.pill),
                ),
                child: Text(
                  quote.taximetro ? 'APROXIMADO' : 'PREÇO FECHADO',
                  style: AppText.label.copyWith(
                    fontSize: 10,
                    color: quote.taximetro ? AppColors.brand : AppColors.primaryDark,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: Spacing.xs),
          Text(
            '${formatDistance(quote.distanceMeters.toDouble())} - cerca de '
            '${(quote.durationSeconds / 60).round()} min',
            style: SheetText.muted,
          ),

          const SizedBox(height: Spacing.md),
          const Divider(height: 1, color: AppColors.sheetBorder),
          const SizedBox(height: Spacing.md),

          _LinhaConta(
            rotulo: 'Bandeirada (até 1,5 km inclusos)',
            valor: formatMoney(quote.baseFareCents),
          ),
          if (!quote.somenteBandeirada) ...[
            const SizedBox(height: Spacing.xs),
            _LinhaConta(
              rotulo: 'Distância além da franquia '
                  '(${formatDistance(quote.chargedDistanceMeters.toDouble())})',
              valor: formatMoney(quote.distanceCents),
            ),
          ],

          const SizedBox(height: Spacing.md),
          Text(
            quote.somenteBandeirada
                ? 'A viagem cabe na franquia: paga só a bandeirada.'
                : 'Tempo parado (espera no embarque e paradas que você pedir) só entra na conta depois de 3 minutos.',
            style: SheetText.muted,
          ),
          if (quote.taximetro) ...[
            const SizedBox(height: Spacing.xs),
            Text(
              'O valor final é o do taxímetro do motorista, pelo trajeto feito: km rodado e tempo parado.',
              style: SheetText.muted,
            ),
          ],
        ],
      ),
    );
  }
}

class _LinhaConta extends StatelessWidget {
  const _LinhaConta({required this.rotulo, required this.valor});

  final String rotulo;
  final String valor;

  @override
  Widget build(BuildContext context) => Row(
        children: [
          Expanded(child: Text(rotulo, style: SheetText.muted)),
          const SizedBox(width: Spacing.sm),
          Text(valor, style: SheetText.body.copyWith(fontWeight: FontWeight.w600)),
        ],
      );
}


/// "Adicionar cupom" ou "Cupom X  -R$ 3,00  (voce paga R$ 12,00)".
class _LinhaCupom extends StatelessWidget {
  const _LinhaCupom({
    required this.codigo,
    required this.descontoCents,
    required this.aPagarCents,
    required this.aoTocar,
    required this.aoTirar,
  });

  final String? codigo;
  final int descontoCents;
  final int? aPagarCents;
  final VoidCallback aoTocar;
  final VoidCallback aoTirar;

  @override
  Widget build(BuildContext context) {
    final temCupom = codigo != null;
    return Material(
      color: AppColors.sheetField,
      borderRadius: BorderRadius.circular(Radii.sm),
      child: InkWell(
        borderRadius: BorderRadius.circular(Radii.sm),
        onTap: aoTocar,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: Spacing.md, vertical: Spacing.sm),
          child: Row(
            children: [
              const Icon(Icons.confirmation_number, size: 20, color: AppColors.sheetText),
              const SizedBox(width: Spacing.md),
              Expanded(
                child: temCupom
                    ? Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            descontoCents > 0 ? 'Cupom $codigo: -${formatMoney(descontoCents)}' : 'Cupom $codigo',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: SheetText.body.copyWith(fontWeight: FontWeight.w600),
                          ),
                          if (aPagarCents != null && descontoCents > 0)
                            Text('Você paga ${formatMoney(aPagarCents!)}', style: SheetText.muted),
                        ],
                      )
                    : Text('Adicionar cupom', style: SheetText.body.copyWith(fontWeight: FontWeight.w600)),
              ),
              if (temCupom)
                TextButton(onPressed: aoTirar, child: const Text('Tirar'))
              else
                const Icon(Icons.keyboard_arrow_right, color: AppColors.sheetMuted),
            ],
          ),
        ),
      ),
    );
  }
}
