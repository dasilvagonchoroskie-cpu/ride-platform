import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/avisos.dart';
import '../core/config/app_config.dart';
import '../core/fotos.dart';
import '../core/theme/app_theme.dart';
import '../state/auth_state.dart';
import '../state/config_state.dart';
import '../state/ride_state.dart';
import '../widgets/painel_ui.dart';
import 'agendadas_screen.dart';
import 'avisos_screen.dart';
import 'contatos_emergencia_screen.dart';
import 'cupons_screen.dart';
import 'motoristas_salvos_screen.dart';
import 'help_screen.dart';
import 'my_data_screen.dart';
import 'wallet_screen.dart';

/// Aba Conta: foto e nome, como a pessoa paga, menu e sair.
class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key});

  void _abrir(BuildContext context, Widget tela) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => tela));

  Future<void> _trocarFoto(BuildContext context) async {
    final foto = await escolherFoto(context, titulo: 'Foto de perfil');
    if (foto == null || !context.mounted) return;
    final ok = await context.read<AuthState>().trocarFoto(foto.mime, foto.base64);
    if (ok) avisar('Foto de perfil atualizada.');
  }

  Future<void> _sair(BuildContext context) async {
    final sair = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: Text('Sair da conta?', style: AppText.heading),
        content: Text(
          'Para voltar, é só entrar de novo com o seu telefone ou e-mail.',
          style: AppText.body,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancelar')),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Sair', style: TextStyle(color: AppColors.danger)),
          ),
        ],
      ),
    );
    if (sair != true || !context.mounted) return;
    final corridas = context.read<RideState>();
    await context.read<AuthState>().logout();
    await corridas.limpar();
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthState>().user;
    final avisoNovo = context.watch<ConfigState>().temAvisoNovo;
    final agendadas = context.watch<RideState>().agendadas.length;
    const faixa = SizedBox(height: 10, child: ColoredBox(color: AppColors.faixa));
    const separador = Divider(height: 1, indent: Spacing.xl, endIndent: Spacing.xl, color: AppColors.border);
    final iniciais = Container(
      width: 72,
      height: 72,
      alignment: Alignment.center,
      decoration: const BoxDecoration(color: AppColors.brand, shape: BoxShape.circle),
      child: Text(
        user?.iniciais ?? 'P',
        style: AppText.title.copyWith(color: Colors.white, fontSize: 26),
      ),
    );

    return Scaffold(
      backgroundColor: AppColors.surface,
      body: SafeArea(
        child: ListView(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(Spacing.xl, Spacing.xl, Spacing.xl, Spacing.xl),
              child: Row(
                children: [
                  // Foto com o lapis (modelo Du Goias): toque para trocar.
                  Tooltip(
                    message: 'Trocar foto',
                    child: InkWell(
                      customBorder: const CircleBorder(),
                      onTap: () => _trocarFoto(context),
                      child: SizedBox(
                        width: 78,
                        height: 78,
                        child: Stack(
                          children: [
                            if (user?.avatarUrl != null)
                              FotoDoServidor(caminho: user!.avatarUrl!, tamanho: 72, reserva: iniciais)
                            else
                              iniciais,
                            Positioned(
                              right: 0,
                              bottom: 0,
                              child: Container(
                                width: 30,
                                height: 30,
                                decoration: BoxDecoration(
                                  color: AppColors.surface,
                                  shape: BoxShape.circle,
                                  boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 4)],
                                ),
                                child: const Icon(Icons.edit, size: 17, color: AppColors.text),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: Spacing.lg),
                  Expanded(
                    child: InkWell(
                      onTap: () => _abrir(context, const MyDataScreen()),
                      child: Text(
                        user?.name ?? 'Passageiro',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: AppText.title.copyWith(fontSize: 24, fontWeight: FontWeight.w600),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            faixa,
            Padding(
              padding: const EdgeInsets.fromLTRB(Spacing.xl, Spacing.lg, Spacing.xl, Spacing.lg),
              child: Material(
                color: AppColors.surfaceElevated,
                borderRadius: BorderRadius.circular(Radii.md),
                child: InkWell(
                  borderRadius: BorderRadius.circular(Radii.md),
                  onTap: () => _abrir(context, const WalletScreen()),
                  child: Padding(
                    padding: const EdgeInsets.all(Spacing.xl),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Pagamento', style: AppText.body.copyWith(fontSize: 17, color: AppColors.textMuted)),
                              const SizedBox(height: Spacing.xs),
                              Text('Direto ao motorista', style: AppText.title.copyWith(fontSize: 25)),
                              const SizedBox(height: 2),
                              Text(
                                'Dinheiro, Pix ou cartão na maquininha',
                                style: AppText.body.copyWith(color: AppColors.textMuted),
                              ),
                            ],
                          ),
                        ),
                        const Icon(Icons.chevron_right, size: 30, color: AppColors.text),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            faixa,
            MenuLinha(
              icone: Icons.account_circle,
              corIcone: AppColors.text,
              titulo: 'Meus dados',
              onTap: () => _abrir(context, const MyDataScreen()),
            ),
            separador,
            MenuLinha(
              icone: Icons.confirmation_number,
              corIcone: AppColors.text,
              titulo: 'Cupons',
              onTap: () => _abrir(context, const CuponsScreen()),
            ),
            separador,
            MenuLinha(
              icone: Icons.event,
              corIcone: AppColors.text,
              titulo: 'Corridas agendadas',
              selo: agendadas > 0 ? '$agendadas' : null,
              onTap: () => _abrir(context, const AgendadasScreen()),
            ),
            separador,
            MenuLinha(
              icone: Icons.favorite,
              corIcone: AppColors.text,
              titulo: 'Motoristas favoritos e bloqueados',
              onTap: () => _abrir(context, const MotoristasSalvosScreen()),
            ),
            separador,
            MenuLinha(
              icone: Icons.health_and_safety,
              corIcone: AppColors.text,
              titulo: 'Contatos de emergência',
              onTap: () => _abrir(context, const ContatosEmergenciaScreen()),
            ),
            separador,
            MenuLinha(
              icone: Icons.notifications,
              corIcone: AppColors.text,
              titulo: 'Avisos',
              selo: avisoNovo ? 'novo' : null,
              onTap: () => _abrir(context, const AvisosScreen()),
            ),
            separador,
            MenuLinha(
              icone: Icons.support,
              corIcone: AppColors.text,
              titulo: 'Ajuda',
              onTap: () => _abrir(context, const HelpScreen()),
            ),
            faixa,
            MenuLinha(titulo: 'Sair da conta', cor: AppColors.danger, onTap: () => _sair(context)),
            Padding(
              padding: const EdgeInsets.fromLTRB(Spacing.xl, Spacing.md, Spacing.xl, Spacing.xl),
              child: Text(
                'Versão ${AppConfig.appVersion}',
                style: AppText.body.copyWith(color: AppColors.textMuted),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
