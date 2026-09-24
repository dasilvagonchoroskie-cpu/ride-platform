import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/config/app_config.dart';
import '../core/theme/app_theme.dart';
import '../data/models/driver_models.dart';
import '../state/driver_state.dart';
import '../widgets/ui.dart';

class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final driver = context.watch<DriverState>();
    final profile = driver.profile;
    final vehicle = driver.vehicle;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Conta')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(Spacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AppCard(
                child: Row(
                  children: [
                    AppAvatar(initials: profile?.initials ?? 'M', size: 58),
                    const SizedBox(width: Spacing.lg),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(profile?.name ?? 'Motorista', style: AppText.heading),
                          const SizedBox(height: Spacing.xs),
                          Row(
                            children: [
                              AppStars(value: profile?.rating ?? 5),
                              const SizedBox(width: Spacing.xs),
                              Text(
                                '${profile?.totalRides ?? 0} corridas',
                                style: AppText.caption.copyWith(color: AppColors.textMuted),
                              ),
                            ],
                          ),
                          const SizedBox(height: Spacing.xs),
                          AppBadge(
                            text: (profile?.approval ?? DriverApproval.pending).label.toUpperCase(),
                            tone: profile?.approval == DriverApproval.approved
                                ? AppBadgeTone.success
                                : profile?.approval == DriverApproval.rejected
                                    ? AppBadgeTone.danger
                                    : AppBadgeTone.info,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: Spacing.lg),
              const SectionTitle(text: 'Veiculo'),
              AppCard(
                child: vehicle == null
                    ? Text(
                        'Nenhum veiculo cadastrado.',
                        style: AppText.body.copyWith(color: AppColors.textMuted),
                      )
                    : Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              const VehicleIcon(slug: 'ride', onLight: false, size: 42),
                              const SizedBox(width: Spacing.md),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(vehicle.description, style: AppText.bodyStrong),
                                    Text(
                                      vehicle.color,
                                      style: AppText.caption.copyWith(color: AppColors.textMuted),
                                    ),
                                  ],
                                ),
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: Spacing.md,
                                  vertical: Spacing.sm,
                                ),
                                decoration: BoxDecoration(
                                  color: AppColors.surfaceElevated,
                                  border: Border.all(color: AppColors.border),
                                  borderRadius: BorderRadius.circular(Radii.sm),
                                ),
                                child: Text(
                                  vehicle.plate,
                                  style: AppText.bodyStrong.copyWith(letterSpacing: 1),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
              ),

              const SizedBox(height: Spacing.lg),
              const SectionTitle(text: 'Documentos'),
              AppCard(
                child: Column(
                  children: [
                    for (final document in driver.documents)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: Spacing.xs),
                        child: Row(
                          children: [
                            Icon(
                              document.isApproved
                                  ? Icons.check_circle
                                  : document.isRejected
                                      ? Icons.cancel
                                      : Icons.schedule,
                              size: 18,
                              color: document.isApproved
                                  ? AppColors.primary
                                  : document.isRejected
                                      ? AppColors.danger
                                      : AppColors.textMuted,
                            ),
                            const SizedBox(width: Spacing.md),
                            Expanded(child: Text(document.type.label, style: AppText.body)),
                            Text(
                              document.status.name.toUpperCase(),
                              style: AppText.label.copyWith(
                                fontSize: 9,
                                color: document.isApproved
                                    ? AppColors.primary
                                    : document.isRejected
                                        ? AppColors.danger
                                        : AppColors.textMuted,
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),

              const SizedBox(height: Spacing.lg),
              const SectionTitle(text: 'Diagnostico'),
              AppCard(
                child: Column(
                  children: [
                    _InfoRow(label: 'Versao do app', value: AppConfig.appVersion),
                    const AppDivider(),
                    _InfoRow(label: 'Stack', value: 'Flutter / Dart'),
                    const AppDivider(),
                    _InfoRow(label: 'Mapa', value: 'OpenStreetMap'),
                    const AppDivider(),
                    _InfoRow(label: 'Posicao atual', value: driver.position.toString()),
                  ],
                ),
              ),

              const SizedBox(height: Spacing.lg),
              AppButton(
                label: 'Sair da conta',
                variant: AppButtonVariant.danger,
                onPressed: () async {
                  await context.read<DriverState>().logout();
                  if (context.mounted) Navigator.of(context).pop();
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Expanded(child: Text(label, style: AppText.caption.copyWith(color: AppColors.textMuted))),
        Text(value, style: AppText.caption),
      ],
    );
  }
}
