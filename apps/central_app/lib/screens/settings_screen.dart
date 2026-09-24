import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/config/app_config.dart';
import '../core/theme/central_theme.dart';
import '../state/central_state.dart';
import '../widgets/ui.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final central = context.watch<CentralState>();
    final admin = central.admin;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(Spacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AppCard(
            child: Row(
              children: [
                AppAvatar(initials: admin?.initials ?? 'A', size: 56),
                const SizedBox(width: Spacing.lg),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(admin?.name ?? 'Administrador', style: AppText.heading),
                      Text(
                        admin?.email ?? '-',
                        style: AppText.caption.copyWith(color: AppColors.textMuted),
                      ),
                      const SizedBox(height: Spacing.xs),
                      const AppBadge(text: 'ADMIN', tone: AppBadgeTone.info),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: Spacing.lg),
          const SectionTitle(text: 'Integracoes'),
          AppCard(
            child: Column(
              children: [
                _IntegrationRow(
                  icon: Icons.local_fire_department,
                  title: 'Firebase Firestore',
                  subtitle: AppConfig.hasFirebase
                      ? 'Projeto ${AppConfig.firebaseProjectId}'
                      : 'Nao configurado - rodando com dados locais',
                  connected: AppConfig.hasFirebase,
                ),
                const AppDivider(),
                _IntegrationRow(
                  icon: Icons.cloud_outlined,
                  title: 'Backend (API)',
                  subtitle: AppConfig.hasApi ? AppConfig.apiUrl : 'Nao configurado',
                  connected: AppConfig.hasApi,
                ),
                const AppDivider(),
                _IntegrationRow(
                  icon: Icons.map_outlined,
                  title: 'OpenStreetMap',
                  subtitle: 'Tiles CARTO Dark Matter - sem chave de API',
                  connected: true,
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
                _InfoRow(
                  label: 'Fonte de dados',
                  value: central.isDemo ? 'Demonstracao local' : 'API / Firestore',
                ),
                const AppDivider(),
                _InfoRow(label: 'Motoristas na fila', value: '${central.pendingCount}'),
                const AppDivider(),
                _InfoRow(label: 'Corridas ativas', value: '${central.activeRidesCount}'),
              ],
            ),
          ),
          const SizedBox(height: Spacing.lg),
          AppButton(
            label: 'Recarregar dados',
            variant: AppButtonVariant.secondary,
            icon: Icons.refresh,
            loading: central.loading,
            onPressed: () => central.loadAll(),
          ),
          const SizedBox(height: Spacing.sm),
          AppButton(
            label: 'Sair da Central',
            variant: AppButtonVariant.danger,
            onPressed: () => central.logout(),
          ),
          const SizedBox(height: Spacing.lg),
        ],
      ),
    );
  }
}

class _IntegrationRow extends StatelessWidget {
  const _IntegrationRow({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.connected,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final bool connected;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, color: connected ? AppColors.primary : AppColors.textFaint, size: 22),
        const SizedBox(width: Spacing.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: AppText.bodyStrong),
              Text(
                subtitle,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppText.caption.copyWith(color: AppColors.textMuted),
              ),
            ],
          ),
        ),
        AppBadge(
          text: connected ? 'ATIVO' : 'INATIVO',
          tone: connected ? AppBadgeTone.success : AppBadgeTone.neutral,
        ),
      ],
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
