import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/alarme.dart';
import '../core/config/app_config.dart';
import '../core/theme/central_theme.dart';
import '../data/painel.dart';
import '../painel/alertas.dart';
import '../painel/carteiras.dart';
import '../painel/comuns.dart';
import '../painel/cupons.dart';
import '../painel/despacho.dart';
import '../painel/financeiro.dart';
import '../painel/motoristas.dart';
import '../painel/painel_state.dart';
import '../painel/passageiros.dart';
import '../painel/tarifas.dart';
import '../painel/visao_geral.dart';
import '../state/central_state.dart';
import '../widgets/responsive.dart';
import '../widgets/ui.dart';
import 'settings_screen.dart';

/// Casca da Central: menu lateral com uma aba para cada assunto. A tela
/// inicial e o mapa em tela cheia (Visao Geral).
class ShellScreen extends StatefulWidget {
  const ShellScreen({super.key});

  @override
  State<ShellScreen> createState() => _ShellScreenState();
}

class _ShellScreenState extends State<ShellScreen> with WidgetsBindingObserver {
  int _index = 0;

  /// Abas ja abertas: so carregam quando a pessoa entra nelas.
  final Set<int> _abertas = {0};

  /// Alertas que ja abriram a janela de SOS sozinhos.
  final Set<String> _abertosAutomatico = {};

  /// Cadastro novo cuja janela de aviso esta aberta agora.
  String? _avisoPendenteAberto;

  late final PainelState _painel;

  static const _titulos = [
    'Visão Geral',
    'Despacho',
    'Motoristas',
    'Passageiros',
    'Tarifas',
    'Financeiro',
    'Alertas e Segurança',
    'Cupons',
    'Carteiras / Recargas',
    'Configurações',
  ];

  @override
  void initState() {
    super.initState();
    _painel = context.read<PainelState>();
    _painel.addListener(_sosNovo);
    _painel.addListener(_motoristaNovo);
    _painel.iniciar();
    // Alarme do SOS e cadastro novo tambem com a Central minimizada.
    WidgetsBinding.instance.addObserver(this);
    if (AppConfig.hasApi) VigiaCentral.iniciar(AppConfig.apiUrl);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Voltou para a Central: garante o vigia de pe (o Android pode ter derrubado).
    if (state == AppLifecycleState.resumed && AppConfig.hasApi) VigiaCentral.iniciar(AppConfig.apiUrl);
  }

  @override
  void dispose() {
    _painel.removeListener(_sosNovo);
    _painel.removeListener(_motoristaNovo);
    _painel.parar();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// SOS novo: abre a janela fixa na hora, por cima de qualquer aba.
  void _sosNovo() {
    for (final a in _painel.alertasNovos) {
      if (_abertosAutomatico.add(a.id) && mounted) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) abrirSos(context, a);
        });
        break;
      }
    }
  }

  /// Motorista novo esperando aprovacao: janela por cima de qualquer aba
  /// (o SOS tem prioridade e abre antes).
  void _motoristaNovo() {
    final novo = _painel.pendenteNovo;
    if (novo == null || novo.id == _avisoPendenteAberto || _painel.alertasNovos.isNotEmpty) return;
    _avisoPendenteAberto = novo.id;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _abrirAvisoPendente(novo);
    });
  }

  Future<void> _abrirAvisoPendente(MotoristaPendenteResumo novo) async {
    final outros = _painel.indicadores.pendentes - 1;
    final ver = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        icon: const Icon(Icons.person_add_alt_1, color: AppColors.primary, size: 36),
        title: const Text('Motorista aguardando aprovação'),
        content: Text(
          '${novo.nome}${novo.telefone.isEmpty ? '' : ' · ${telefoneBonito(novo.telefone)}'} terminou o cadastro no aplicativo do motorista.'
          '${outros > 0 ? '\n\nHá mais $outros cadastro(s) na fila.' : ''}'
          '\n\nConfira os dados (e as fotos, se enviou) e aprove ou recuse.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Depois')),
          FilledButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Ver cadastro')),
        ],
      ),
    );
    _avisoPendenteAberto = null;
    await _painel.marcarPendenteVisto();
    if (ver != true || !mounted) return;
    _ir(2);
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => DetalheMotorista(id: novo.id)));
    if (mounted) await context.read<CentralState>().loadAll();
  }

  void _ir(int i) => setState(() {
        _index = i;
        _abertas.add(i);
      });

  Widget _aba(int i) {
    if (!_abertas.contains(i)) return const SizedBox.shrink();
    switch (i) {
      case 0:
        return VisaoGeral(abrirDespacho: () => _ir(1));
      case 1:
        return const Despacho();
      case 2:
        return const Motoristas();
      case 3:
        return const Passageiros();
      case 4:
        return const TarifasTela();
      case 5:
        return const Financeiro();
      case 6:
        return const Alertas();
      case 7:
        return const CuponsTela();
      case 8:
        return const CarteirasTela();
      default:
        return const SettingsScreen();
    }
  }

  int _pendentes(PainelState p, CentralState c) => p.atualizadoEm == null ? c.pendingCount : p.indicadores.pendentes;

  @override
  Widget build(BuildContext context) {
    final p = context.watch<PainelState>();
    final central = context.watch<CentralState>();
    final fila = p.corridas.where((c) => c.naFila).length;

    final destinos = <ShellDestination>[
      const ShellDestination(icon: Icons.map_outlined, label: 'Visão Geral'),
      ShellDestination(icon: Icons.support_agent, label: 'Despacho', badge: fila == 0 ? null : fila),
      ShellDestination(
        icon: Icons.badge_outlined,
        label: 'Motoristas',
        // Ao vivo (a cada 5 s), nao so quando a Central abre.
        badge: _pendentes(p, central) == 0 ? null : _pendentes(p, central),
      ),
      const ShellDestination(icon: Icons.people_outline, label: 'Passageiros'),
      const ShellDestination(icon: Icons.price_change_outlined, label: 'Tarifas'),
      const ShellDestination(icon: Icons.payments_outlined, label: 'Financeiro'),
      ShellDestination(icon: Icons.sos_outlined, label: 'Alertas', badge: p.alertas.isEmpty ? null : p.alertas.length),
      const ShellDestination(icon: Icons.local_offer_outlined, label: 'Cupons'),
      const ShellDestination(icon: Icons.account_balance_wallet_outlined, label: 'Carteiras / Recargas'),
      const ShellDestination(icon: Icons.settings_outlined, label: 'Configurações'),
    ];

    return ResponsiveShell(
      title: _titulos[_index],
      destinationIndex: _index,
      onDestinationSelected: _ir,
      destinations: destinos,
      actions: [
        IconButton(
          tooltip: 'Atualizar',
          onPressed: () {
            p.atualizar();
            central.loadAll();
          },
          icon: const Icon(Icons.refresh),
        ),
        Padding(
          padding: const EdgeInsets.only(right: Spacing.md),
          child: Center(
            child: AppBadge(
              text: p.erro == null ? 'AO VIVO' : 'SEM SINAL',
              tone: p.erro == null ? AppBadgeTone.success : AppBadgeTone.danger,
            ),
          ),
        ),
      ],
      child: Stack(
        children: [
          Positioned.fill(
            child: IndexedStack(
              index: _index,
              children: [for (var i = 0; i < _titulos.length; i++) _aba(i)],
            ),
          ),
          if (p.alertas.isNotEmpty)
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: Material(
                color: AppColors.danger,
                child: InkWell(
                  onTap: () => abrirSos(context, p.alertas.first),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: Spacing.lg, vertical: Spacing.md),
                    child: Row(
                      children: [
                        const Icon(Icons.sos, color: Colors.white, size: 28),
                        const SizedBox(width: Spacing.md),
                        Expanded(
                          child: Text(
                            p.alertas.length == 1
                                ? 'SOS: ${p.alertas.first.papelNome} ${p.alertas.first.quem} pediu socorro'
                                : '${p.alertas.length} pedidos de SOS abertos',
                            style: AppText.bodyStrong.copyWith(color: Colors.white),
                          ),
                        ),
                        const Text('ABRIR', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
                      ],
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
