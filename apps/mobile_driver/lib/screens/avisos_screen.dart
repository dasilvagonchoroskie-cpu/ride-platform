import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../state/driver_state.dart';
import 'permissions_screen.dart';
import 'wallet_screen.dart';

/// Um aviso para o motorista (sino da tela inicial).
class AvisoMotorista {
  const AvisoMotorista({
    required this.titulo,
    required this.texto,
    required this.icone,
    required this.cor,
    this.abrir,
  });

  final String titulo;
  final String texto;
  final IconData icone;
  final Color cor;
  final WidgetBuilder? abrir;
}

/// O que merece a atencao do motorista agora. Tudo calculado com o que o
/// aplicativo ja sabe — nada inventado.
List<AvisoMotorista> avisosDo(DriverState d) {
  final lista = <AvisoMotorista>[];

  final c = d.carteira;
  if (c != null && c.isInsufficient) {
    lista.add(AvisoMotorista(
      titulo: c.blocking ? 'Você não está recebendo corridas' : 'Saldo abaixo do mínimo',
      texto: c.blocking
          ? 'Sua carteira está com ${formatMoney(c.balanceCents)}, abaixo do mínimo. Recarregue para voltar a receber chamados.'
          : 'Sua carteira está com ${formatMoney(c.balanceCents)}. Adicione créditos para continuar recebendo corridas.',
      icone: Icons.account_balance_wallet,
      cor: AppColors.danger,
      abrir: (_) => const WalletScreen(),
    ));
  } else if (c != null && c.isLow) {
    lista.add(AvisoMotorista(
      titulo: 'Saldo se esgotando',
      texto: 'Sua carteira está com ${formatMoney(c.balanceCents)}. Recarregue antes que acabe.',
      icone: Icons.account_balance_wallet,
      cor: AppColors.warning,
      abrir: (_) => const WalletScreen(),
    ));
  }

  if (d.permissoesOk == false) {
    lista.add(AvisoMotorista(
      titulo: 'Autorizações pendentes',
      texto: 'Sem elas o alarme de corrida pode falhar com o celular no bolso.',
      icone: Icons.shield_outlined,
      cor: AppColors.danger,
      abrir: (_) => const PermissionsScreen(podeVoltar: true),
    ));
  }

  if (d.locationDenied) {
    lista.add(const AvisoMotorista(
      titulo: 'GPS desligado ou sem permissão',
      texto: 'Ligue a localização do celular para aparecer para os passageiros.',
      icone: Icons.location_off,
      cor: AppColors.danger,
    ));
  }

  final validade = DateTime.tryParse(d.profile?.cnhExpiresAt ?? '');
  if (validade != null) {
    final dias = validade.difference(DateTime.now()).inDays;
    if (dias <= 30) {
      lista.add(AvisoMotorista(
        titulo: dias < 0 ? 'CNH vencida' : 'CNH perto de vencer',
        texto: dias < 0
            ? 'Sua CNH venceu em ${dataCurta(validade)}. Procure a Central para atualizar.'
            : 'Sua CNH vence em ${dataCurta(validade)}. Renove e avise a Central.',
        icone: Icons.badge_outlined,
        cor: dias < 0 ? AppColors.danger : AppColors.warning,
      ));
    }
  }

  return lista;
}

class AvisosScreen extends StatelessWidget {
  const AvisosScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final avisos = avisosDo(context.watch<DriverState>());

    return Scaffold(
      appBar: AppBar(title: const Text('Avisos')),
      body: avisos.isEmpty
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(Spacing.xxl),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.notifications_none, size: 56, color: AppColors.textFaint),
                    const SizedBox(height: Spacing.md),
                    Text('Tudo certo por aqui', style: AppText.heading),
                    const SizedBox(height: Spacing.xs),
                    Text(
                      'Quando houver algo que precise da sua atenção, aparece aqui.',
                      textAlign: TextAlign.center,
                      style: AppText.body.copyWith(color: AppColors.textMuted),
                    ),
                  ],
                ),
              ),
            )
          : ListView.separated(
              padding: const EdgeInsets.all(Spacing.lg),
              itemCount: avisos.length,
              separatorBuilder: (_, __) => const SizedBox(height: Spacing.md),
              itemBuilder: (context, i) {
                final a = avisos[i];
                return Material(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(Radii.sm),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(Radii.sm),
                    onTap: a.abrir == null
                        ? null
                        : () => Navigator.of(context).push(MaterialPageRoute<void>(builder: a.abrir!)),
                    child: Padding(
                      padding: const EdgeInsets.all(Spacing.lg),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            width: 44,
                            height: 44,
                            decoration: BoxDecoration(color: a.cor.withValues(alpha: 0.12), shape: BoxShape.circle),
                            child: Icon(a.icone, color: a.cor),
                          ),
                          const SizedBox(width: Spacing.md),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(a.titulo, style: AppText.bodyStrong.copyWith(fontSize: 16)),
                                const SizedBox(height: 2),
                                Text(a.texto, style: AppText.body.copyWith(color: AppColors.textMuted)),
                              ],
                            ),
                          ),
                          if (a.abrir != null) const Icon(Icons.chevron_right, color: AppColors.textMuted),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
    );
  }
}
