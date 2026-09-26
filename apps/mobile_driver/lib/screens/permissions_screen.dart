import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/native/corridas_nativo.dart';
import '../core/theme/app_theme.dart';
import '../state/driver_state.dart';
import '../widgets/ui.dart';

/// Autorizacoes do Android — obrigatorias antes de ficar disponivel.
///
/// Cada uma explica POR QUE e necessaria: autorizacao pedida sem motivo o
/// motorista nega, e ai o alarme falha no meio da rua.
class PermissionsScreen extends StatefulWidget {
  const PermissionsScreen({super.key});

  @override
  State<PermissionsScreen> createState() => _PermissionsScreenState();
}

class _Item {
  const _Item(this.chave, this.titulo, this.porque, {this.essencial = true});
  final String chave;
  final String titulo;
  final String porque;
  final bool essencial;
}

const _itens = [
  _Item('localizacao', 'Localização',
      'Para o sistema saber que você está perto do passageiro e mandar a corrida certa.'),
  _Item('gps', 'GPS do celular ligado',
      'Sem o GPS ligado o celular não sabe onde você está.'),
  _Item('notificacao', 'Notificações',
      'Para o aviso de corrida aparecer e o Android manter o aplicativo ativo.'),
  _Item('sobrepor', 'Aparecer sobre outros apps',
      'Para a chamada abrir em tela cheia por cima do que estiver aberto — GPS, WhatsApp, qualquer coisa.'),
  _Item('bateria', 'Sem restrição de bateria',
      'Para o Android não desligar o aplicativo com o celular no bolso.'),
  _Item('telaCheia', 'Tela cheia com o celular bloqueado',
      'Para a chamada acender e cobrir a tela bloqueada. Recomendada.',
      essencial: false),
];

class _PermissionsScreenState extends State<PermissionsScreen> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Volta dos ajustes do Android: confere o que mudou.
    if (state == AppLifecycleState.resumed) {
      context.read<DriverState>().checarPermissoes();
    }
  }

  @override
  Widget build(BuildContext context) {
    final driver = context.watch<DriverState>();
    final p = driver.permissoes;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        automaticallyImplyLeading: false,
        title: Text('Autorizações', style: AppText.title),
      ),
      body: ListView(
        padding: const EdgeInsets.all(Spacing.lg),
        children: [
          Text(
            'Para receber corrida com o celular no bolso e a tela apagada, o '
            'aplicativo precisa destas autorizações. Toque em cada uma.',
            style: AppText.body.copyWith(color: AppColors.textMuted),
          ),
          const SizedBox(height: Spacing.lg),
          for (final item in _itens) ...[
            _Linha(item: item, liberada: p[item.chave] == true),
            const SizedBox(height: Spacing.md),
          ],
          const SizedBox(height: Spacing.sm),
          Text(
            'Se o Android disser que a configuração é restrita: abra os ajustes '
            'do aplicativo, toque nos três pontinhos (⋮) no canto e em '
            '"Permitir configurações restritas". Depois volte aqui.',
            style: AppText.body.copyWith(color: AppColors.textMuted),
          ),
          const SizedBox(height: Spacing.md),
          AppButton(
            label: 'Abrir ajustes do aplicativo',
            variant: AppButtonVariant.secondary,
            onPressed: () => CorridasNativo.pedir('ajustes'),
          ),
          const SizedBox(height: Spacing.sm),
          AppButton(
            label: 'Verificar de novo',
            variant: AppButtonVariant.ghost,
            onPressed: () => driver.checarPermissoes(),
          ),
        ],
      ),
    );
  }
}

class _Linha extends StatelessWidget {
  const _Linha({required this.item, required this.liberada});

  final _Item item;
  final bool liberada;

  @override
  Widget build(BuildContext context) {
    final cor = liberada
        ? AppColors.primary
        : (item.essencial ? AppColors.danger : AppColors.warning);

    return Container(
      padding: const EdgeInsets.all(Spacing.lg),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border.all(color: liberada ? AppColors.border : cor),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(liberada ? Icons.check_circle : Icons.error_outline, color: cor, size: 20),
              const SizedBox(width: Spacing.sm),
              Expanded(child: Text(item.titulo, style: AppText.heading)),
              Text(
                liberada ? 'liberada' : (item.essencial ? 'obrigatória' : 'recomendada'),
                style: AppText.body.copyWith(color: cor),
              ),
            ],
          ),
          const SizedBox(height: Spacing.xs),
          Text(item.porque, style: AppText.body.copyWith(color: AppColors.textMuted)),
          if (!liberada) ...[
            const SizedBox(height: Spacing.md),
            AppButton(
              label: 'Liberar',
              variant: AppButtonVariant.primary,
              onPressed: () => CorridasNativo.pedir(item.chave),
            ),
          ],
        ],
      ),
    );
  }
}
