import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/avisos.dart';
import '../core/theme/app_theme.dart';
import '../data/models/models.dart';
import '../state/ride_state.dart';

/// Conta > Motoristas: favoritos (recebem suas corridas primeiro) e
/// bloqueados (nunca recebem suas corridas).
class MotoristasSalvosScreen extends StatefulWidget {
  const MotoristasSalvosScreen({super.key});

  @override
  State<MotoristasSalvosScreen> createState() => _MotoristasSalvosScreenState();
}

class _MotoristasSalvosScreenState extends State<MotoristasSalvosScreen> {
  late Future<(List<MotoristaFavorito>, List<MotoristaBloqueado>)> _dados;

  @override
  void initState() {
    super.initState();
    _carregar();
  }

  void _carregar() {
    final estado = context.read<RideState>();
    _dados = (() async => (await estado.favoritos(), await estado.bloqueados()))();
  }

  Future<void> _tirarFavorito(MotoristaFavorito m) async {
    try {
      await context.read<RideState>().favoritarPorId(m.driverId, sim: false);
      avisar('${m.name} saiu dos favoritos.');
    } catch (_) {
      avisar('Não foi possível agora. Tente de novo.');
    }
    if (mounted) setState(_carregar);
  }

  Future<void> _desbloquear(MotoristaBloqueado m) async {
    try {
      await context.read<RideState>().bloquearPorId(m.driverId, sim: false);
      avisar('${m.name} foi desbloqueado.');
    } catch (_) {
      avisar('Não foi possível agora. Tente de novo.');
    }
    if (mounted) setState(_carregar);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Motoristas')),
      body: FutureBuilder<(List<MotoristaFavorito>, List<MotoristaBloqueado>)>(
        future: _dados,
        builder: (context, s) {
          if (s.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
          if (s.hasError || s.data == null) {
            return Center(
              child: TextButton(onPressed: () => setState(_carregar), child: const Text('Sem conexão. Tentar de novo')),
            );
          }
          final (favoritos, bloqueados) = s.data!;
          return ListView(
            padding: const EdgeInsets.all(Spacing.lg),
            children: [
              Text('Favoritos', style: AppText.heading),
              Text(
                'Quando estão livres por perto, recebem suas corridas primeiro.',
                style: AppText.caption.copyWith(color: AppColors.textMuted),
              ),
              const SizedBox(height: Spacing.sm),
              if (favoritos.isEmpty)
                Text(
                  'Nenhum ainda. Toque em Favoritar na tela do motorista durante a corrida.',
                  style: AppText.body.copyWith(color: AppColors.textMuted),
                ),
              for (final m in favoritos)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.favorite, color: AppColors.danger),
                  title: Text(m.name, style: AppText.bodyStrong),
                  subtitle: Text(
                    [m.vehicle, m.color, m.plate].where((p) => p.isNotEmpty).join(' · '),
                    style: AppText.caption,
                  ),
                  trailing: TextButton(onPressed: () => _tirarFavorito(m), child: const Text('Tirar')),
                ),
              const SizedBox(height: Spacing.xl),
              Text('Bloqueados', style: AppText.heading),
              Text(
                'Nunca recebem as suas corridas.',
                style: AppText.caption.copyWith(color: AppColors.textMuted),
              ),
              const SizedBox(height: Spacing.sm),
              if (bloqueados.isEmpty)
                Text('Nenhum motorista bloqueado.', style: AppText.body.copyWith(color: AppColors.textMuted)),
              for (final m in bloqueados)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.block, color: AppColors.textMuted),
                  title: Text(m.name, style: AppText.bodyStrong),
                  subtitle: Text([m.vehicle, m.plate].where((p) => p.isNotEmpty).join(' · '), style: AppText.caption),
                  trailing: TextButton(onPressed: () => _desbloquear(m), child: const Text('Desbloquear')),
                ),
            ],
          );
        },
      ),
    );
  }
}
