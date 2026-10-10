import 'package:flutter/material.dart';

import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../core/utils/geo.dart';
import '../data/models/models.dart';
import '../widgets/compartilhar_viagem.dart';
import '../widgets/map_canvas.dart';
import '../widgets/ui.dart';

class HistoryDetailScreen extends StatelessWidget {
  const HistoryDetailScreen({super.key, required this.ride});

  final Ride ride;

  @override
  Widget build(BuildContext context) {
    final center = Coords(
      (ride.pickup.coords.latitude + ride.dropoff.coords.latitude) / 2,
      (ride.pickup.coords.longitude + ride.dropoff.coords.longitude) / 2,
    );

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: Text('Corrida ${ride.code}'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: Spacing.lg),
            child: Center(
              child: AppBadge(
                text: ride.status == RideStatus.completed ? 'CONCLUÍDA' : 'CANCELADA',
                tone: ride.status == RideStatus.completed
                    ? AppBadgeTone.success
                    : AppBadgeTone.danger,
              ),
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(Spacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              RideMap(
                center: center,
                height: 210,
                span: 0.09,
                enquadrar: [ride.pickup.coords, ride.dropoff.coords],
                enquadrarMargem: const EdgeInsets.all(36),
                markers: [
                  MapMarker(id: 'pickup', coords: ride.pickup.coords, kind: MarkerKind.pickup),
                  MapMarker(id: 'dropoff', coords: ride.dropoff.coords, kind: MarkerKind.dropoff),
                ],
                route: [ride.pickup.coords, ride.dropoff.coords],
              ),
              const SizedBox(height: Spacing.lg),
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      formatDateTime(ride.finishedAt ?? ride.createdAt),
                      style: const TextStyle(
                        color: AppColors.text,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const AppDivider(),
                    _DetailRow(label: 'Embarque', value: ride.pickup.address),
                    _DetailRow(label: 'Destino', value: ride.dropoff.address),
                    _DetailRow(
                      label: 'Distância',
                      value: formatDistance(ride.distanceMeters.toDouble()),
                    ),
                    _DetailRow(label: 'Duração', value: formatDuration(ride.durationSeconds)),
                    _DetailRow(label: 'Bandeira', value: ride.fareFlag.label),
                    _DetailRow(label: 'Pagamento', value: ride.paymentMethod),
                    if (ride.discountCents > 0) ...[
                      _DetailRow(label: 'Valor da corrida', value: formatMoney(ride.fareCents)),
                      _DetailRow(label: 'Desconto (cupom)', value: '- ${formatMoney(ride.discountCents)}'),
                    ],
                    const AppDivider(),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'Total',
                          style: TextStyle(color: AppColors.text, fontSize: 19, fontWeight: FontWeight.w600),
                        ),
                        Text(
                          formatMoney(ride.aPagarCents),
                          style: const TextStyle(
                            color: AppColors.primary,
                            fontSize: 19,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              if (ride.driver != null) ...[
                const SizedBox(height: Spacing.md),
                AppCard(
                  child: Row(
                    children: [
                      AppAvatar(initials: ride.driver!.initials),
                      const SizedBox(width: Spacing.md),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              ride.driver!.name,
                              style: const TextStyle(
                                color: AppColors.text,
                                fontSize: 15,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            Text(
                              '${ride.driver!.vehicle} - ${ride.driver!.plate}',
                              style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
                            ),
                          ],
                        ),
                      ),
                      if (ride.rating != null) AppStars(value: ride.rating!.toDouble()),
                    ],
                  ),
                ),
              ],
              // Recibo (Evandro, 10/10/2026): para mandar a quem quiser.
              if (ride.status == RideStatus.completed) ...[
                const SizedBox(height: Spacing.md),
                OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                  icon: const Icon(Icons.receipt_long),
                  label: const Text('Compartilhar recibo'),
                  onPressed: () => compartilharTexto(
                    context,
                    titulo: 'Recibo da corrida',
                    explicacao: 'Data, trajeto, motorista, placa e valor desta corrida.',
                    texto: textoDoRecibo(ride),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: Spacing.xs),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(color: AppColors.textMuted, fontSize: 15)),
          const SizedBox(width: Spacing.md),
          // Endereco comprido quebra a linha em vez de estourar a tela.
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: const TextStyle(color: AppColors.text, fontSize: 15, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}

/// Recibo em texto (vai pelo WhatsApp ou copiado).
String textoDoRecibo(Ride ride) {
  final b = StringBuffer()
    ..writeln('Recibo Fortaleza Mov - corrida ${ride.code}')
    ..writeln('Data: ${formatDateTime(ride.finishedAt ?? ride.createdAt)}')
    ..writeln('Embarque: ${ride.pickup.address}')
    ..writeln('Destino: ${ride.dropoff.address}')
    ..writeln('Distância: ${formatDistance(ride.distanceMeters.toDouble())} - ${formatDuration(ride.durationSeconds)}');
  final m = ride.driver;
  if (m != null) {
    b.writeln('Motorista: ${m.name}${m.vehicle.isEmpty ? '' : ' - ${m.vehicle}'}${m.plate.isEmpty ? '' : ' - placa ${m.plate}'}');
  }
  if (ride.discountCents > 0) {
    b
      ..writeln('Valor da corrida: ${formatMoney(ride.fareCents)}')
      ..writeln('Desconto (cupom): ${formatMoney(ride.discountCents)}');
  }
  b.write('Total: ${formatMoney(ride.aPagarCents)} (${ride.paymentMethod}, pago ao motorista)');
  return b.toString();
}
