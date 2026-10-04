import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/avisos.dart';
import '../core/central.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../core/utils/geo.dart';
import '../data/models/driver_models.dart';
import '../state/driver_state.dart';
import '../widgets/deslizar.dart';
import '../widgets/ride_map.dart';
import 'sos_screen.dart';

/// Execucao da corrida em 3 etapas:
/// 1. A caminho do passageiro (navegar, ligar, "Cheguei ao local");
/// 2. Viagem (deslizar INICIAR VIAGEM, rota ate o destino, SOS);
/// 3. Finalizacao (deslizar FINALIZAR VIAGEM, resumo financeiro, nota do
///    passageiro e Concluir).
/// Se o aplicativo fechar no meio, ao abrir de novo ele volta para a etapa
/// certa (a corrida e conferida no servidor).
class RideScreen extends StatelessWidget {
  const RideScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final d = context.watch<DriverState>();
    final ride = d.activeRide;
    if (ride == null) return const SizedBox.shrink();
    final offer = ride.offer;
    final fase = ride.phase;
    final indoBuscar = fase == RidePhase.toPickup || fase == RidePhase.waitingPassenger;
    final rota = fase == RidePhase.toPickup ? d.routeToPickup : (fase == RidePhase.inProgress ? d.tripRoute : const <Coords>[]);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: Column(
        children: [
          Expanded(
            child: Stack(
              children: [
                Positioned.fill(
                  child: RideMap(
                    center: indoBuscar ? offer.pickupCoords : offer.dropoffCoords,
                    span: 0.04,
                    rounded: false,
                    route: rota,
                    markers: [
                      MapMarker(id: 'me', coords: d.position, kind: MarkerKind.car),
                      MapMarker(id: 'pickup', coords: offer.pickupCoords, kind: MarkerKind.pickup),
                      MapMarker(id: 'dropoff', coords: offer.dropoffCoords, kind: MarkerKind.dropoff),
                    ],
                  ),
                ),
                SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.all(Spacing.lg),
                    child: Row(
                      children: [
                        _Etapa(fase: fase),
                        const Spacer(),
                        if (fase != RidePhase.completed)
                          FloatingActionButton(
                            heroTag: 'sos-corrida',
                            backgroundColor: AppColors.danger,
                            tooltip: 'SOS',
                            onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const SosScreen())),
                            child: const Text('SOS', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
                          ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          Container(
            decoration: const BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.vertical(top: Radius.circular(Radii.lg)),
              boxShadow: [BoxShadow(color: Color(0x26000000), blurRadius: 18, offset: Offset(0, -4))],
            ),
            constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.62),
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(Spacing.lg),
              child: switch (fase) {
                RidePhase.toPickup => _ACaminho(d: d, ride: ride),
                RidePhase.waitingPassenger => _Esperando(d: d, ride: ride),
                RidePhase.inProgress => _Viagem(d: d, ride: ride),
                RidePhase.completed => _Resumo(d: d, ride: ride),
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _Etapa extends StatelessWidget {
  const _Etapa({required this.fase});

  final RidePhase fase;

  @override
  Widget build(BuildContext context) {
    final (n, texto) = switch (fase) {
      RidePhase.toPickup => (1, 'A caminho'),
      RidePhase.waitingPassenger => (1, 'No embarque'),
      RidePhase.inProgress => (2, 'Em viagem'),
      RidePhase.completed => (3, 'Finalizada'),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: Spacing.md, vertical: Spacing.sm),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(Radii.pill),
        boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 8)],
      ),
      child: Text('Etapa $n de 3 · $texto', style: AppText.bodyStrong),
    );
  }
}

// ---------------------------------------------------------------------------
// Pecas comuns
// ---------------------------------------------------------------------------

Future<void> _navegar(Coords destino, {bool waze = false}) async {
  final uri = waze
      ? Uri.parse('https://waze.com/ul?ll=${destino.latitude},${destino.longitude}&navigate=yes')
      : Uri.parse('https://www.google.com/maps/dir/?api=1&destination=${destino.latitude},${destino.longitude}&travelmode=driving');
  final abriu = await launchUrl(uri, mode: LaunchMode.externalApplication);
  if (!abriu) avisar('Não foi possível abrir o aplicativo de mapas.');
}

class _Passageiro extends StatelessWidget {
  const _Passageiro({required this.d, required this.offer});

  final DriverState d;
  final RideOffer offer;

  @override
  Widget build(BuildContext context) {
    final tel = d.telefonePassageiro;
    return Row(
      children: [
        CircleAvatar(
          radius: 22,
          backgroundColor: AppColors.brandSoft,
          child: Text(offer.passengerInitials, style: AppText.bodyStrong.copyWith(color: AppColors.brand)),
        ),
        const SizedBox(width: Spacing.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(offer.passengerName, style: AppText.heading, maxLines: 1, overflow: TextOverflow.ellipsis),
              Text(
                '★ ${offer.passengerRating.toStringAsFixed(1)} · ${offer.paymentMethod}',
                style: AppText.caption.copyWith(color: AppColors.textMuted),
              ),
            ],
          ),
        ),
        if (tel != null && tel.isNotEmpty) ...[
          IconButton.filledTonal(
            tooltip: 'Ligar',
            onPressed: () => launchUrl(Uri.parse('tel:$tel')),
            icon: const Icon(Icons.call),
          ),
          IconButton.filledTonal(
            tooltip: 'WhatsApp',
            onPressed: () => abrirWhatsApp(tel, 'Olá! Sou o motorista da Fortaleza Mov.'),
            icon: const Icon(Icons.chat),
          ),
        ],
      ],
    );
  }
}

class _Endereco extends StatelessWidget {
  const _Endereco({required this.rotulo, required this.texto, required this.cor});

  final String rotulo;
  final String texto;
  final Color cor;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: Spacing.sm),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.place, color: cor, size: 22),
          const SizedBox(width: Spacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(rotulo, style: AppText.caption.copyWith(color: AppColors.textMuted)),
                Text(texto, style: AppText.body),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _BotoesNavegar extends StatelessWidget {
  const _BotoesNavegar({required this.destino});

  final Coords destino;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: OutlinedButton.icon(
            onPressed: () => _navegar(destino),
            icon: const Icon(Icons.navigation_outlined),
            label: const Text('Google Maps'),
          ),
        ),
        const SizedBox(width: Spacing.sm),
        Expanded(
          child: OutlinedButton.icon(
            onPressed: () => _navegar(destino, waze: true),
            icon: const Icon(Icons.directions_car_outlined),
            label: const Text('Waze'),
          ),
        ),
      ],
    );
  }
}

Future<void> _cancelar(BuildContext context, DriverState d) async {
  const motivos = [
    'Passageiro não apareceu',
    'Passageiro pediu para cancelar',
    'Problema com o carro',
    'Endereço errado ou perigoso',
    'Outro motivo',
  ];
  final motivo = await showModalBottomSheet<String>(
    context: context,
    backgroundColor: AppColors.surface,
    isScrollControlled: true,
    builder: (ctx) => SafeArea(
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(padding: EdgeInsets.all(Spacing.lg), child: Text('Por que vai cancelar?', style: AppText.heading)),
            for (final m in motivos) ListTile(title: Text(m), onTap: () => Navigator.of(ctx).pop(m)),
            TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Voltar')),
          ],
        ),
      ),
    ),
  );
  if (motivo == null) return;
  await d.cancelarCorrida(motivo);
}

// ---------------------------------------------------------------------------
// Etapa 1: a caminho e esperando no embarque
// ---------------------------------------------------------------------------

class _ACaminho extends StatelessWidget {
  const _ACaminho({required this.d, required this.ride});

  final DriverState d;
  final DriverRide ride;

  @override
  Widget build(BuildContext context) {
    final offer = ride.offer;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text('A caminho do passageiro', style: AppText.title),
        const SizedBox(height: Spacing.md),
        _Passageiro(d: d, offer: offer),
        _Endereco(rotulo: 'Buscar em', texto: offer.pickupAddress, cor: AppColors.primary),
        _BotoesNavegar(destino: offer.pickupCoords),
        const SizedBox(height: Spacing.md),
        SizedBox(
          height: 56,
          child: FilledButton.icon(
            onPressed: d.enviandoEtapa ? null : d.markArrived,
            icon: const Icon(Icons.flag),
            label: Text(d.enviandoEtapa ? 'Enviando...' : 'Cheguei ao local', style: AppText.button.copyWith(color: Colors.white)),
          ),
        ),
        TextButton(
          onPressed: () => _cancelar(context, d),
          child: const Text('Cancelar corrida', style: TextStyle(color: AppColors.danger)),
        ),
      ],
    );
  }
}

class _Esperando extends StatefulWidget {
  const _Esperando({required this.d, required this.ride});

  final DriverState d;
  final DriverRide ride;

  @override
  State<_Esperando> createState() => _EsperandoState();
}

class _EsperandoState extends State<_Esperando> {
  Timer? _relogio;

  @override
  void initState() {
    super.initState();
    _relogio = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _relogio?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.d;
    final offer = widget.ride.offer;
    final espera = DateTime.now().difference(d.chegouEm ?? DateTime.now());
    final mm = espera.inMinutes.toString().padLeft(2, '0');
    final ss = (espera.inSeconds % 60).toString().padLeft(2, '0');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            const Expanded(child: Text('Esperando o passageiro', style: AppText.title)),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: Spacing.md, vertical: Spacing.xs),
              decoration: BoxDecoration(color: AppColors.warningSoft, borderRadius: BorderRadius.circular(Radii.pill)),
              child: Text('$mm:$ss', style: AppText.heading.copyWith(color: AppColors.warning)),
            ),
          ],
        ),
        const SizedBox(height: Spacing.md),
        _Passageiro(d: d, offer: offer),
        _Endereco(rotulo: 'Embarque', texto: offer.pickupAddress, cor: AppColors.primary),
        Container(
          padding: const EdgeInsets.all(Spacing.md),
          decoration: BoxDecoration(color: AppColors.surfaceElevated, borderRadius: BorderRadius.circular(Radii.sm)),
          child: Text('Confira o código do passageiro: ${widget.ride.pin}', style: AppText.bodyStrong),
        ),
        const SizedBox(height: Spacing.lg),
        Deslizar(texto: 'INICIAR VIAGEM', ocupado: d.enviandoEtapa, aoConfirmar: d.startRide),
        TextButton(
          onPressed: () => _cancelar(context, d),
          child: const Text('Cancelar corrida', style: TextStyle(color: AppColors.danger)),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Etapa 2: viagem
// ---------------------------------------------------------------------------

class _Viagem extends StatelessWidget {
  const _Viagem({required this.d, required this.ride});

  final DriverState d;
  final DriverRide ride;

  @override
  Widget build(BuildContext context) {
    final offer = ride.offer;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text('Viagem em andamento', style: AppText.title),
        const SizedBox(height: Spacing.md),
        _Passageiro(d: d, offer: offer),
        _Endereco(rotulo: 'Destino', texto: offer.dropoffAddress, cor: AppColors.danger),
        _BotoesNavegar(destino: offer.dropoffCoords),
        const SizedBox(height: Spacing.lg),
        Deslizar(texto: 'FINALIZAR VIAGEM', cor: AppColors.danger, ocupado: d.enviandoEtapa, aoConfirmar: d.finishRide),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Etapa 3: resumo financeiro, nota do passageiro e Concluir
// ---------------------------------------------------------------------------

class _Resumo extends StatelessWidget {
  const _Resumo({required this.d, required this.ride});

  final DriverState d;
  final DriverRide ride;

  int _v(String chave, int padrao) => (d.resumoFinal?[chave] as num?)?.toInt() ?? padrao;

  @override
  Widget build(BuildContext context) {
    final offer = ride.offer;
    final total = _v('finalFareCents', d.valorFinalCents ?? offer.fareCents);
    final desconto = _v('discountCents', 0);
    final cobrar = _v('toCollectCents', total - desconto);
    final taxa = _v('commissionCents', offer.fareCents - offer.earningCents);
    final liquido = _v('driverEarningCents', total - taxa);
    final percentual = total > 0 ? (taxa * 100 / total) : 0;
    final pagoNoApp = offer.paymentMethod == 'Carteira';
    final saldo = d.carteira?.balanceCents;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text('Viagem finalizada', style: AppText.title),
        const SizedBox(height: Spacing.md),
        Container(
          padding: const EdgeInsets.all(Spacing.lg),
          decoration: BoxDecoration(color: AppColors.primarySoft, borderRadius: BorderRadius.circular(Radii.md)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                pagoNoApp ? 'Corrida paga via app' : 'Cobrar do passageiro (${offer.paymentMethod})',
                style: AppText.bodyStrong.copyWith(color: AppColors.primaryDark),
              ),
              Text(formatMoney(pagoNoApp ? 0 : cobrar), style: AppText.display.copyWith(color: AppColors.primaryDark)),
              if (desconto > 0)
                Text(
                  'Cupom de ${formatMoney(desconto)}: a Central paga essa diferença na sua carteira.',
                  style: AppText.caption.copyWith(color: AppColors.textMuted),
                ),
            ],
          ),
        ),
        const SizedBox(height: Spacing.md),
        _Linha('Valor total da corrida', formatMoney(total)),
        _Linha('Taxa da Central (${percentual.toStringAsFixed(0)}%)', '- ${formatMoney(taxa)}', cor: AppColors.danger),
        _Linha('Seu ganho líquido', formatMoney(liquido), forte: true),
        Text('A taxa foi descontada automaticamente do saldo da sua carteira.', style: AppText.caption.copyWith(color: AppColors.textMuted)),
        if (saldo != null) _Linha('Saldo da carteira agora', formatMoney(saldo), cor: saldo <= 0 ? AppColors.danger : AppColors.text),
        if (saldo != null && saldo <= 0)
          Text('Saldo insuficiente — solicite recarga à Central.', style: AppText.caption.copyWith(color: AppColors.danger)),
        const SizedBox(height: Spacing.lg),
        const Text('Como foi o passageiro?', style: AppText.heading),
        _Estrelas(nota: d.notaPassageiro, aoEscolher: d.notaPassageiro == null ? (n) => d.avaliarPassageiro(n) : null),
        const SizedBox(height: Spacing.lg),
        SizedBox(
          height: 56,
          child: FilledButton(
            onPressed: d.closeRide,
            child: Text('Concluir', style: AppText.button.copyWith(color: Colors.white)),
          ),
        ),
      ],
    );
  }
}

class _Linha extends StatelessWidget {
  const _Linha(this.rotulo, this.valor, {this.cor = AppColors.text, this.forte = false});

  final String rotulo;
  final String valor;
  final Color cor;
  final bool forte;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(child: Text(rotulo, style: AppText.body.copyWith(color: AppColors.textMuted))),
          Text(valor, style: (forte ? AppText.heading : AppText.bodyStrong).copyWith(color: cor)),
        ],
      ),
    );
  }
}

class _Estrelas extends StatelessWidget {
  const _Estrelas({required this.nota, required this.aoEscolher});

  final int? nota;
  final ValueChanged<int>? aoEscolher;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      alignment: WrapAlignment.center,
      children: [
        for (var i = 1; i <= 5; i++)
          IconButton(
            iconSize: 36,
            tooltip: '$i estrela${i > 1 ? 's' : ''}',
            onPressed: aoEscolher == null ? null : () => aoEscolher!(i),
            icon: Icon((nota ?? 0) >= i ? Icons.star : Icons.star_border, color: AppColors.gold),
          ),
      ],
    );
  }
}
