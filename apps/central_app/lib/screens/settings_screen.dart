import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api/api_client.dart';
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
          const SectionTitle(text: 'Conexoes'),
          const _StatusDasConexoes(),
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
                  value: central.isDemo ? 'Demonstracao local' : 'Servidor real (PostgreSQL)',
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

/// Estado REAL das conexoes, perguntado ao servidor quando a tela abre.
///
/// Substitui a antiga linha fixa do Firebase: esta plataforma nao usa
/// Firebase. Os dados moram no PostgreSQL (Supabase) e so o servidor fala
/// com o banco — nenhum aplicativo acessa o banco direto.
class _StatusDasConexoes extends StatefulWidget {
  const _StatusDasConexoes();

  @override
  State<_StatusDasConexoes> createState() => _StatusDasConexoesState();
}

class _StatusDasConexoesState extends State<_StatusDasConexoes> {
  bool _carregando = true;
  bool _servidor = false;
  bool _banco = false;
  bool _cache = false;

  @override
  void initState() {
    super.initState();
    _verificar();
  }

  Future<void> _verificar() async {
    setState(() => _carregando = true);
    var servidor = false;
    var banco = false;
    var cache = false;
    try {
      final r = await ApiClient().request('GET', '/health');
      final Map<dynamic, dynamic> m =
          (r is Map && r['data'] is Map) ? r['data'] as Map : (r as Map? ?? const {});
      final dep = (m['dependencies'] as Map?) ?? const {};
      servidor = true;
      banco = dep['database'] == 'up';
      cache = dep['redis'] == 'up';
    } catch (_) {
      // Sem resposta: tudo aparece como fora do ar, que e a verdade.
    }
    if (!mounted) return;
    setState(() {
      _carregando = false;
      _servidor = servidor;
      _banco = banco;
      _cache = cache;
    });
  }

  String _texto(bool ok, String quandoOk) =>
      _carregando ? 'Verificando...' : (ok ? quandoOk : 'Sem resposta');

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        children: [
          _IntegrationRow(
            icon: Icons.cloud_outlined,
            title: 'Servidor (API)',
            subtitle: _texto(_servidor, AppConfig.apiUrl),
            connected: _servidor,
          ),
          const AppDivider(),
          _IntegrationRow(
            icon: Icons.storage_outlined,
            title: 'Banco de dados',
            subtitle: _texto(_banco, 'PostgreSQL + PostGIS (Supabase)'),
            connected: _banco,
          ),
          const AppDivider(),
          _IntegrationRow(
            icon: Icons.bolt_outlined,
            title: 'Cache e tempo real',
            subtitle: _texto(_cache, 'Redis'),
            connected: _cache,
          ),
          const AppDivider(),
          _IntegrationRow(
            icon: Icons.map_outlined,
            title: 'Mapa',
            subtitle: 'OpenStreetMap público (tile.openstreetmap.org), sem chave',
            connected: true,
          ),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              onPressed: _carregando ? null : _verificar,
              child: const Text('Verificar de novo'),
            ),
          ),
        ],
      ),
    );
  }
}
