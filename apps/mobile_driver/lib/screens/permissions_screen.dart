import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/native/ajustes_aparelho.dart';
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
  // Aviso claro exigido pela Google Play para localizacao com o app fechado.
  _Item('localizacao', 'Localização',
      'A Fortaleza Move Motorista usa a sua localização para mandar corridas perto de você e mostrar ao passageiro onde o carro está — '
      'também com o aplicativo fechado ou a tela desligada, enquanto você estiver Disponível ou em corrida (fica um aviso fixo na barra do celular). '
      'Ao ficar Offline, para.'),
  _Item('gps', 'GPS do celular ligado',
      'Sem o GPS ligado o celular não sabe onde você está.'),
  _Item('notificacao', 'Notificações',
      'Para o aviso de corrida aparecer e o Android manter o aplicativo ativo.'),
  _Item('sobrepor', 'Aparecer sobre outros apps',
      'Para a chamada abrir em tela cheia por cima do que estiver aberto — GPS, WhatsApp, qualquer coisa.'),
  _Item('bateria', 'Sem restrição de bateria',
      'Para o Android não desligar o aplicativo com o celular no bolso. Na tela que abrir, toque em Bateria e escolha "Sem restrições".'),
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
    final perfil = driver.aparelho;
    final familia = (perfil['familia'] ?? '').toString();
    final extras = ((perfil['extras'] as List?) ?? const []).map((e) => e.toString()).toList();
    final ajustes = ajustesDoAparelho(familia, extras);
    final nome = nomeDoAparelho(perfil);
    // Xiaomi: a bateria do Android e coberta pelo ajuste "Nenhuma restricao"
    // da Xiaomi (o Android nao enxerga esse ajuste); um cartao so.
    final itens = [for (final i in _itens) if (!(familia == 'xiaomi' && i.chave == 'bateria')) i];
    final faltam = itens.where((i) => p[i.chave] != true).length +
        ajustes.where((a) => a.obrigatorio && p['x_${a.chave}'] != true).length;

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
          if (nome.isNotEmpty) ...[
            const SizedBox(height: Spacing.sm),
            Row(
              children: [
                const Icon(Icons.smartphone, size: 18, color: AppColors.textMuted),
                const SizedBox(width: Spacing.xs),
                Expanded(
                  child: Text('Seu celular: $nome', key: const ValueKey('nome-aparelho'), style: AppText.caption.copyWith(color: AppColors.textMuted)),
                ),
              ],
            ),
          ],
          const SizedBox(height: Spacing.sm),
          Text(
            faltam == 0 ? 'Tudo pronto para receber corridas.' : 'Falta${faltam == 1 ? '' : 'm'} $faltam para você poder ficar Disponível.',
            key: const ValueKey('faltam-autorizacoes'),
            style: AppText.heading.copyWith(color: faltam == 0 ? AppColors.primary : AppColors.danger),
          ),
          const SizedBox(height: Spacing.lg),
          for (final item in itens) ...[
            _Linha(item: item, liberada: p[item.chave] == true),
            const SizedBox(height: Spacing.md),
          ],
          if (ajustes.isNotEmpty) ...[
            const SizedBox(height: Spacing.sm),
            Text('Ajustes do seu ${_marca(familia)}', style: AppText.heading),
            const SizedBox(height: Spacing.xs),
            Text(
              'Este celular tem ajustes próprios que fecham o aplicativo ou escondem a chamada. O Android não '
              'avisa o aplicativo quando você muda estes ajustes: abra cada um, deixe como está explicado e toque em "Já fiz".',
              style: AppText.body.copyWith(color: AppColors.textMuted),
            ),
            const SizedBox(height: Spacing.md),
            for (final a in ajustes) ...[
              _LinhaFabricante(ajuste: a, feito: p['x_${a.chave}'] == true),
              const SizedBox(height: Spacing.md),
            ],
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
          // Marca sem lista propria: o botao generico de iniciar sozinho.
          if (ajustes.isEmpty && familia != 'motorola') ...[
          AppButton(
            label: 'Deixar o aplicativo iniciar sozinho',
            icon: Icons.play_circle_outline,
            variant: AppButtonVariant.secondary,
            onPressed: () => CorridasNativo.pedir('iniciarSozinho'),
          ),
          Padding(
            padding: const EdgeInsets.only(top: Spacing.xs),
            child: Text(
              'Se o seu celular tiver "Início automático" (ou "Inicialização automática"), ligue o Fortaleza Move Motorista '
              'e deixe a bateria em "Sem restrições". Sem isso o aparelho pode fechar o aplicativo e o chamado não chega.',
              style: AppText.caption.copyWith(color: AppColors.textMuted),
            ),
          ),
          ],
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

String _marca(String familia) => switch (familia) {
      'xiaomi' => 'Xiaomi',
      'samsung' => 'Samsung',
      'oppo' => 'Oppo / Realme / OnePlus',
      'vivo' => 'Vivo',
      'huawei' => 'Huawei',
      'honor' => 'Honor',
      'asus' => 'Asus',
      _ => 'celular',
    };

/// Ajuste do fabricante: abre a tela certa e o motorista confirma.
class _LinhaFabricante extends StatelessWidget {
  const _LinhaFabricante({required this.ajuste, required this.feito});

  final AjusteAparelho ajuste;
  final bool feito;

  Future<void> _confirmar(BuildContext context, bool sim) async {
    final driver = context.read<DriverState>();
    await CorridasNativo.confirmarAjuste(ajuste.chave, sim);
    driver.marcarAjuste(ajuste.chave, sim);
  }

  @override
  Widget build(BuildContext context) {
    final cor = feito ? AppColors.primary : (ajuste.obrigatorio ? AppColors.danger : AppColors.textMuted);
    return Container(
      key: ValueKey('ajuste-${ajuste.chave}'),
      padding: const EdgeInsets.all(Spacing.lg),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border.all(color: feito || !ajuste.obrigatorio ? AppColors.border : cor),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(feito ? Icons.check_circle : Icons.error_outline, color: cor, size: 20),
              const SizedBox(width: Spacing.sm),
              Expanded(child: Text(ajuste.titulo, style: AppText.heading)),
              Text(
                feito ? 'feito' : (ajuste.obrigatorio ? 'obrigatório' : 'recomendado'),
                style: AppText.body.copyWith(color: cor),
              ),
            ],
          ),
          const SizedBox(height: Spacing.xs),
          Text(ajuste.passos, style: AppText.body.copyWith(color: AppColors.textMuted)),
          const SizedBox(height: Spacing.md),
          if (!feito) ...[
            if (ajuste.temTela) ...[
              AppButton(
                key: ValueKey('abrir-${ajuste.chave}'),
                label: 'Abrir ajuste',
                variant: AppButtonVariant.primary,
                onPressed: () => CorridasNativo.abrirAjuste(ajuste.chave),
              ),
              const SizedBox(height: Spacing.sm),
            ],
            AppButton(
              key: ValueKey('feito-${ajuste.chave}'),
              label: 'Já fiz',
              variant: AppButtonVariant.secondary,
              onPressed: () => _confirmar(context, true),
            ),
          ] else
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                key: ValueKey('refazer-${ajuste.chave}'),
                onPressed: () async {
                  await _confirmar(context, false);
                  if (ajuste.temTela) await CorridasNativo.abrirAjuste(ajuste.chave);
                },
                child: const Text('Conferir de novo'),
              ),
            ),
        ],
      ),
    );
  }
}
