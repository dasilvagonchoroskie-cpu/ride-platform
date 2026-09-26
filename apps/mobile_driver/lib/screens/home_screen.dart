import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/config/app_config.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../state/driver_state.dart';
import '../widgets/painel_ui.dart';
import '../widgets/ride_map.dart';
import 'activity_screen.dart';
import 'avisos_screen.dart';
import 'menu_screen.dart';
import 'rides_history_screen.dart';
import 'wallet_screen.dart';

/// Tela principal do motorista.
///
/// Mapa em tela cheia; no alto, o logo com o menu e o ganho do dia; embaixo,
/// o painel com "Mapa | Conectado | Corridas" e o botao grande de
/// Conectar/Desconectar. Limpa de proposito: o motorista olha de relance,
/// com o carro andando.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  bool _ocupado = false;
  Timer? _relogio;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.read<DriverState>().atualizarPainel();
    });
    // Ganho do dia e saldo em dia, sem o motorista precisar abrir nada.
    _relogio = Timer.periodic(const Duration(minutes: 2), (_) {
      if (!mounted) return;
      final d = context.read<DriverState>();
      d.carregarHoje();
      d.carregarCarteira();
    });
  }

  @override
  void dispose() {
    _relogio?.cancel();
    super.dispose();
  }

  Future<void> _abrir(Widget tela) async {
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => tela));
    if (mounted) unawaited(context.read<DriverState>().atualizarPainel());
  }

  Future<void> _alternar() async {
    final driver = context.read<DriverState>();
    if (driver.isOnline) {
      final sair = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Desconectar?'),
          content: const Text('Você deixa de receber corridas até conectar de novo.'),
          actions: [
            TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Continuar conectado')),
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              child: const Text('Desconectar', style: TextStyle(color: AppColors.danger)),
            ),
          ],
        ),
      );
      if (sair != true) return;
    }

    setState(() => _ocupado = true);
    if (driver.isOnline) {
      await driver.goOffline();
    } else {
      await driver.goOnline();
    }
    if (!mounted) return;
    setState(() => _ocupado = false);
    driver.error = null;
  }

  @override
  Widget build(BuildContext context) {
    final driver = context.watch<DriverState>();
    final carteira = driver.carteira;
    final avisos = avisosDo(driver);

    return Scaffold(
      body: Stack(
        children: [
          Positioned.fill(
            child: RideMap(
              center: driver.position,
              markers: [MapMarker(id: 'me', coords: driver.position, kind: MarkerKind.car)],
              span: 0.02,
              rounded: false,
            ),
          ),

          // ---- Topo: logo + menu | ganho do dia e sino ----
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(Spacing.lg, Spacing.md, Spacing.lg, 0),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _PilulaMenu(onTap: () => _abrir(const MenuScreen())),
                  const Spacer(),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      _PilulaGanhos(
                        valor: dinheiro(driver.ganhosHojeCents, oculto: driver.ocultarValores),
                        onTap: () => _abrir(const ActivityScreen()),
                      ),
                      const SizedBox(height: Spacing.md),
                      BotaoRedondo(
                        icone: Icons.notifications,
                        marcado: avisos.isNotEmpty,
                        onTap: () => _abrir(const AvisosScreen()),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),

          // ---- Base: aviso de saldo + painel ----
          Align(
            alignment: Alignment.bottomCenter,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (carteira != null && (carteira.isLow || carteira.isInsufficient))
                  Padding(
                    padding: const EdgeInsets.fromLTRB(Spacing.lg, 0, Spacing.lg, Spacing.md),
                    child: _AvisoSaldo(
                      critico: carteira.isInsufficient,
                      saldo: formatMoney(carteira.balanceCents),
                      onTap: () => _abrir(const WalletScreen()),
                    ),
                  ),
                _PainelInferior(
                  online: driver.isOnline,
                  ocupado: _ocupado,
                  onAlternar: _alternar,
                  onCorridas: () => _abrir(const RidesHistoryScreen()),
                  onSimular: !AppConfig.hasApi && driver.isOnline ? () => driver.receiveOffer() : null,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Logo + tres risquinhos: abre o menu.
class _PilulaMenu extends StatelessWidget {
  const _PilulaMenu({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      elevation: 3,
      shadowColor: const Color(0x55000000),
      borderRadius: BorderRadius.circular(Radii.pill),
      child: InkWell(
        borderRadius: BorderRadius.circular(Radii.pill),
        onTap: onTap,
        child: const Padding(
          padding: EdgeInsets.fromLTRB(6, 6, 16, 6),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              BrandLogo(size: 48),
              SizedBox(width: Spacing.md),
              Icon(Icons.menu, size: 30, color: AppColors.text),
            ],
          ),
        ),
      ),
    );
  }
}

/// "R$ 8,28 >": ganho de hoje; abre Atividades.
class _PilulaGanhos extends StatelessWidget {
  const _PilulaGanhos({required this.valor, required this.onTap});

  final String valor;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      elevation: 3,
      shadowColor: const Color(0x55000000),
      borderRadius: BorderRadius.circular(Radii.pill),
      child: InkWell(
        borderRadius: BorderRadius.circular(Radii.pill),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(22, 14, 14, 14),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(valor, style: AppText.heading.copyWith(fontSize: 21, fontWeight: FontWeight.w700)),
              const SizedBox(width: Spacing.sm),
              const Icon(Icons.chevron_right, color: AppColors.text),
            ],
          ),
        ),
      ),
    );
  }
}

class _AvisoSaldo extends StatelessWidget {
  const _AvisoSaldo({required this.critico, required this.saldo, required this.onTap});

  final bool critico;
  final String saldo;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cor = critico ? AppColors.danger : AppColors.warning;
    return Material(
      color: AppColors.surface,
      elevation: 3,
      shadowColor: const Color(0x44000000),
      borderRadius: BorderRadius.circular(Radii.sm),
      child: InkWell(
        borderRadius: BorderRadius.circular(Radii.sm),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: Spacing.lg, vertical: Spacing.md),
          child: Row(
            children: [
              Icon(Icons.error, color: cor),
              const SizedBox(width: Spacing.md),
              Expanded(
                child: Text(
                  critico
                      ? 'Saldo insuficiente ($saldo). Recarregue para receber corridas.'
                      : 'Saldo se esgotando ($saldo). Recarregue a carteira.',
                  style: AppText.body.copyWith(fontWeight: FontWeight.w600),
                ),
              ),
              const Icon(Icons.chevron_right, color: AppColors.textMuted),
            ],
          ),
        ),
      ),
    );
  }
}

class _PainelInferior extends StatelessWidget {
  const _PainelInferior({
    required this.online,
    required this.ocupado,
    required this.onAlternar,
    required this.onCorridas,
    this.onSimular,
  });

  final bool online;
  final bool ocupado;
  final VoidCallback onAlternar;
  final VoidCallback onCorridas;
  final VoidCallback? onSimular;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(Radii.lg)),
        boxShadow: [BoxShadow(color: Color(0x26000000), blurRadius: 18, offset: Offset(0, -4))],
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Spacing.lg, Spacing.md, Spacing.lg, Spacing.xl),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(2)),
              ),
              const SizedBox(height: Spacing.lg),
              Row(
                children: [
                  const _Aba(icone: Icons.location_on, rotulo: 'Mapa', ativa: true),
                  Expanded(
                    child: Text(
                      online ? 'Conectado' : 'Desconectado',
                      textAlign: TextAlign.center,
                      style: AppText.title.copyWith(
                        fontSize: 26,
                        color: online ? AppColors.primary : AppColors.textMuted,
                      ),
                    ),
                  ),
                  _Aba(icone: Icons.directions_car, rotulo: 'Corridas', onTap: onCorridas),
                ],
              ),
              const SizedBox(height: Spacing.xl),
              SizedBox(
                width: 250,
                height: 60,
                child: FilledButton(
                  onPressed: ocupado ? null : onAlternar,
                  style: FilledButton.styleFrom(
                    backgroundColor: online ? AppColors.danger : AppColors.primary,
                    disabledBackgroundColor: (online ? AppColors.danger : AppColors.primary).withValues(alpha: 0.5),
                    foregroundColor: Colors.white,
                    shape: const StadiumBorder(),
                    elevation: 2,
                  ),
                  child: ocupado
                      ? const SizedBox(
                          width: 24,
                          height: 24,
                          child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white),
                        )
                      : Text(
                          online ? 'Desconectar' : 'Conectar',
                          style: AppText.title.copyWith(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w600),
                        ),
                ),
              ),
              if (!online) ...[
                const SizedBox(height: Spacing.md),
                Text(
                  'Conecte-se para receber corridas.',
                  style: AppText.body.copyWith(color: AppColors.textMuted),
                ),
              ],
              if (onSimular != null)
                TextButton(onPressed: onSimular, child: const Text('Simular chamada (demonstração)')),
            ],
          ),
        ),
      ),
    );
  }
}

class _Aba extends StatelessWidget {
  const _Aba({required this.icone, required this.rotulo, this.ativa = false, this.onTap});

  final IconData icone;
  final String rotulo;
  final bool ativa;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final cor = ativa ? AppColors.brand : AppColors.text;
    return InkWell(
      borderRadius: BorderRadius.circular(Radii.sm),
      onTap: onTap,
      child: SizedBox(
        width: 84,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: Spacing.xs),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icone, color: cor, size: 30),
              const SizedBox(height: 2),
              Text(rotulo, style: AppText.body.copyWith(color: cor, fontSize: 17)),
            ],
          ),
        ),
      ),
    );
  }
}
