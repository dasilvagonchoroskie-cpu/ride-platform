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
  const PermissionsScreen({super.key, this.podeVoltar = false});

  /// Aberta pelo menu (Configuracoes): mostra a seta de voltar.
  final bool podeVoltar;

  @override
  State<PermissionsScreen> createState() => _PermissionsScreenState();
}

class _Item {
  const _Item(this.chave, this.titulo, this.porque);
  final String chave;
  final String titulo;
  final String porque;
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
      'Para a chamada acender a tela e abrir em tela cheia, com o botão de deslizar para aceitar, mesmo com o celular bloqueado.'),
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
        automaticallyImplyLeading: widget.podeVoltar,
        title: Text(widget.podeVoltar ? 'Configurações' : 'Autorizações'),
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
          // Evandro, 08/10/2026: "os aplicativos nao estao alarmando". O
          // motorista confere aqui se o som do chamado sai (volume maximo).
          AppButton(
            label: 'Testar o alarme de corrida',
            icon: Icons.notifications_active,
            variant: AppButtonVariant.secondary,
            onPressed: () {
              CorridasNativo.testarAlarme();
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Tocando por 5 segundos no volume máximo. É assim que a corrida nova toca.')),
              );
            },
          ),
          const SizedBox(height: Spacing.sm),
          // Evandro, 09/10/2026: "com o telefone parado e a tela desligada,
          // tem que abrir a tela cheia com o chamado". Toque, bloqueie o
          // celular e espere: em 5 s a tela de chamado tem que acender.
          AppButton(
            label: 'Testar a tela de chamado (em 5 s)',
            icon: Icons.phone_in_talk,
            variant: AppButtonVariant.secondary,
            onPressed: () {
              CorridasNativo.testarChamado();
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Bloqueie o celular agora. Em 5 segundos a tela de chamado tem que acender sozinha.')),
              );
            },
          ),
          const SizedBox(height: Spacing.sm),
          // Xiaomi, Oppo, Vivo, Samsung: sem isto o aparelho fecha o
          // aplicativo em segundo plano e o chamado nao chega.
          AppButton(
            label: 'Deixar o aplicativo iniciar sozinho',
            icon: Icons.play_circle_outline,
            variant: AppButtonVariant.secondary,
            onPressed: () => CorridasNativo.pedir('iniciarSozinho'),
          ),
          Padding(
            padding: const EdgeInsets.only(top: Spacing.xs),
            child: Text(
              'Em celulares Xiaomi, Redmi, Poco, Oppo, Vivo e Samsung: ligue o Fortaleza Mov em "Início automático" '
              'e deixe a bateria em "Sem restrições". Sem isso o aparelho fecha o aplicativo e o chamado não chega.',
              style: AppText.caption.copyWith(color: AppColors.textMuted),
            ),
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
        : AppColors.danger;

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
                liberada ? 'liberada' : 'obrigatória',
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
