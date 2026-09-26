import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/central.dart';
import '../core/config/app_config.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../state/driver_state.dart';
import '../widgets/painel_ui.dart';
import 'activity_screen.dart';
import 'legal_screen.dart';
import 'permissions_screen.dart';
import 'registration_screen.dart';
import 'rides_history_screen.dart';
import 'vehicles_screen.dart';
import 'wallet_screen.dart';

/// Menu do motorista: lista simples, letra grande, uma seta por linha.
class MenuScreen extends StatelessWidget {
  const MenuScreen({super.key});

  void _ir(BuildContext context, Widget tela) {
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => tela));
  }

  Future<void> _faleConosco(BuildContext context) async {
    final driver = context.read<DriverState>();
    final contato = await driver.contatoCentral();
    await abrirWhatsApp(
      contato?.whatsapp,
      'Olá! Sou o motorista ${driver.profile?.name ?? ''} da Fortaleza Mov e preciso de ajuda.',
    );
  }

  Future<void> _sair(BuildContext context) async {
    final confirmou = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sair da conta?'),
        content: const Text('Você vai precisar entrar de novo com o seu telefone.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancelar')),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Sair', style: TextStyle(color: AppColors.danger)),
          ),
        ],
      ),
    );
    if (confirmou != true || !context.mounted) return;
    final driver = context.read<DriverState>();
    if (driver.isOnline) await driver.goOffline();
    await driver.logout();
    if (context.mounted) Navigator.of(context).popUntil((r) => r.isFirst);
  }

  @override
  Widget build(BuildContext context) {
    final driver = context.watch<DriverState>();
    final perfil = driver.profile;
    final carteira = driver.carteira;

    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(title: const Text('Menu')),
      body: ListView(
        children: [
          InkWell(
            onTap: () => _ir(context, const RegistrationScreen()),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(Spacing.xl, Spacing.lg, Spacing.xl, Spacing.sm),
              child: DriverHeader(
                name: perfil?.name ?? 'Motorista',
                initials: perfil?.initials ?? 'M',
                rating: perfil?.rating ?? 5,
              ),
            ),
          ),
          const Divider(height: Spacing.xl),
          MenuLinha(titulo: 'Cadastro', onTap: () => _ir(context, const RegistrationScreen())),
          MenuLinha(titulo: 'Meus veículos', onTap: () => _ir(context, const VehiclesScreen())),
          const Divider(height: Spacing.lg),
          MenuLinha(titulo: 'Atividades', onTap: () => _ir(context, const ActivityScreen())),
          MenuLinha(
            titulo: 'Carteira',
            valor: carteira == null ? null : dinheiro(carteira.balanceCents, oculto: driver.ocultarValores),
            onTap: () => _ir(context, const WalletScreen()),
          ),
          MenuLinha(titulo: 'Histórico de corridas', onTap: () => _ir(context, const RidesHistoryScreen())),
          const Divider(height: Spacing.lg),
          MenuLinha(
            titulo: 'Configurações',
            selo: driver.permissoesOk == false ? 'Pendente' : null,
            onTap: () => _ir(context, const PermissionsScreen(podeVoltar: true)),
          ),
          MenuLinha(titulo: 'Fale conosco', onTap: () => _faleConosco(context)),
          MenuLinha(titulo: 'Termos de uso', onTap: () => _ir(context, const LegalScreen(privacidade: false))),
          MenuLinha(titulo: 'Política de Privacidade', onTap: () => _ir(context, const LegalScreen(privacidade: true))),
          const Divider(height: Spacing.lg),
          MenuLinha(
            titulo: 'Sair',
            cor: AppColors.danger,
            mostrarSeta: false,
            onTap: () => _sair(context),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(Spacing.xl, Spacing.sm, Spacing.xl, Spacing.xxl),
            child: Text(
              'Versão ${AppConfig.appVersion}',
              style: AppText.body.copyWith(color: AppColors.textFaint),
            ),
          ),
        ],
      ),
    );
  }
}
