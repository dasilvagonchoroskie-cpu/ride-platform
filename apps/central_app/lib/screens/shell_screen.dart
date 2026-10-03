import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/central_theme.dart';
import '../painel/alertas.dart';
import '../painel/carteiras.dart';
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

class _ShellScreenState extends State<ShellScreen> {
  int _index = 0;

  /// Abas ja abertas: so carregam quando a pessoa entra nelas.
  final Set<int> _abertas = {0};

  /// Alertas que ja abriram a janela de SOS sozinhos.
  final Set<String> _abertosAutomatico = {};

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
    _painel.iniciar();
  }

  @override
  void dispose() {
    _painel.removeListener(_sosNovo);
    _painel.parar();
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
        badge: central.pendingCount == 0 ? null : central.pendingCount,
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
