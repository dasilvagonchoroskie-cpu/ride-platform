import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../core/theme/app_theme.dart';
import '../state/config_state.dart';
import '../widgets/form_ui.dart';
import '../widgets/ui.dart';

/// Avisos publicados pela Central (sino da tela Inicio).
class AvisosScreen extends StatefulWidget {
  const AvisosScreen({super.key});

  @override
  State<AvisosScreen> createState() => _AvisosScreenState();
}

class _AvisosScreenState extends State<AvisosScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _atualizar());
  }

  Future<void> _atualizar() async {
    final config = context.read<ConfigState>();
    await config.carregar();
    await config.marcarAvisosVistos();
  }

  String _data(String iso) {
    try {
      return DateFormat('dd/MM/yyyy HH:mm').format(DateTime.parse(iso).toLocal());
    } catch (_) {
      return '';
    }
  }

  @override
  Widget build(BuildContext context) {
    final config = context.watch<ConfigState>();
    final avisos = config.avisos;

    return TelaFormulario(
      titulo: 'Avisos',
      child: RefreshIndicator(
        onRefresh: _atualizar,
        child: avisos.isEmpty
            ? ListView(
                padding: const EdgeInsets.all(Spacing.xl),
                children: [
                  if (config.carregando && !config.carregado)
                    const Center(child: CircularProgressIndicator(color: AppColors.brand))
                  else
                    const EmptyState(
                      title: 'Nenhum aviso por enquanto',
                      description: 'Quando a Central publicar uma novidade, ela aparece aqui.',
                    ),
                ],
              )
            : ListView.separated(
                padding: const EdgeInsets.symmetric(vertical: Spacing.md),
                itemCount: avisos.length,
                separatorBuilder: (context, index) => const Divider(height: 1, color: AppColors.border),
                itemBuilder: (context, index) {
                  final a = avisos[index];
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: Spacing.xl, vertical: Spacing.lg),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(a.titulo, style: AppText.bodyStrong.copyWith(fontSize: 18)),
                        const SizedBox(height: Spacing.xs),
                        Text(a.texto, style: AppText.body.copyWith(fontSize: 16, height: 1.4)),
                        const SizedBox(height: Spacing.sm),
                        Text(_data(a.criadoEm), style: AppText.caption.copyWith(color: AppColors.textFaint)),
                      ],
                    ),
                  );
                },
              ),
      ),
    );
  }
}
