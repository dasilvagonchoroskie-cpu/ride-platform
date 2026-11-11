import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/central.dart';
import '../core/config/app_config.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../state/driver_state.dart';
import '../widgets/painel_ui.dart';
import 'activity_screen.dart';
import 'clube_screen.dart';
import 'legal_screen.dart';
import 'permissions_screen.dart';
import 'registration_screen.dart';
import 'meus_dados_screen.dart';
import 'perfil_screen.dart';
import 'rides_history_screen.dart';
import 'sos_screen.dart';
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
      'Olá! Sou o motorista ${driver.profile?.name ?? ''} da Fortaleza Move e preciso de ajuda.',
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
                fotoUrl: perfil?.avatarUrl,
              ),
            ),
          ),
          const Divider(height: Spacing.xl),
          MenuLinha(icone: Icons.badge_outlined, titulo: 'Perfil e documentos', onTap: () => _ir(context, const PerfilScreen())),
          MenuLinha(icone: Icons.person_outline, titulo: 'Meus dados', onTap: () => _ir(context, const MeusDadosScreen())),
          MenuLinha(icone: Icons.assignment_outlined, titulo: 'Cadastro', onTap: () => _ir(context, const RegistrationScreen())),
          MenuLinha(icone: Icons.directions_car_outlined, titulo: 'Meus veículos', onTap: () => _ir(context, const VehiclesScreen())),
          const Divider(height: Spacing.lg),
          MenuLinha(icone: Icons.insights_outlined, titulo: 'Atividades', onTap: () => _ir(context, const ActivityScreen())),
          MenuLinha(
            icone: Icons.account_balance_wallet_outlined,
            titulo: 'Carteira',
            valor: carteira == null ? null : dinheiro(carteira.balanceCents, oculto: driver.ocultarValores),
            onTap: () => _ir(context, const WalletScreen()),
          ),
          MenuLinha(icone: Icons.history, titulo: 'Histórico de corridas', onTap: () => _ir(context, const RidesHistoryScreen())),
          MenuLinha(icone: Icons.workspace_premium_outlined, titulo: 'Clube de Vantagens', onTap: () => _ir(context, const ClubeScreen())),
          MenuLinha(icone: Icons.shield_outlined, titulo: 'Segurança / SOS', cor: AppColors.danger, onTap: () => _ir(context, const SosScreen())),
          const Divider(height: Spacing.lg),
          MenuLinha(
            icone: Icons.tune,
            titulo: 'Configurações',
            selo: driver.permissoesOk == false ? 'Pendente' : null,
            onTap: () => _ir(context, const PermissionsScreen(podeVoltar: true)),
          ),
          MenuLinha(icone: Icons.headset_mic_outlined, titulo: 'Fale conosco', onTap: () => _faleConosco(context)),
          MenuLinha(icone: Icons.description_outlined, titulo: 'Termos de uso', onTap: () => _ir(context, const LegalScreen(privacidade: false))),
          MenuLinha(icone: Icons.privacy_tip_outlined, titulo: 'Política de Privacidade', onTap: () => _ir(context, const LegalScreen(privacidade: true))),
          const Divider(height: Spacing.lg),
          MenuLinha(
            icone: Icons.logout,
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
