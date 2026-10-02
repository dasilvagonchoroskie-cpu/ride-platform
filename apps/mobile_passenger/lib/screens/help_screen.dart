import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/contato.dart';
import '../core/theme/app_theme.dart';
import '../state/config_state.dart';
import '../widgets/form_ui.dart';
import '../widgets/painel_ui.dart';
import 'legal_screen.dart';

/// Perguntas comuns, conversa com a Central e os textos legais.
class HelpScreen extends StatelessWidget {
  const HelpScreen({super.key});

  static const List<(String, String)> _perguntas = [
    (
      'Como peço uma corrida?',
      'Na tela Início, toque em Buscar destino e escolha o lugar. O valor aparece antes de você confirmar. '
          'Depois de confirmar, o motorista mais perto recebe o chamado.',
    ),
    (
      'Como eu pago?',
      'Direto ao motorista, no fim da corrida: dinheiro, Pix ou cartão na maquininha dele. '
          'O aplicativo não cobra nada de você.',
    ),
    (
      'Como sei que é o motorista certo?',
      'Confira o nome, o carro e a placa que aparecem na tela. Ao entrar, diga ao motorista o PIN de embarque '
          'mostrado na sua corrida.',
    ),
    (
      'Como é calculado o valor?',
      'Bandeirada mais os quilômetros rodados. Das 6h às 22h vale a bandeira diurna; das 22h às 6h, a noturna.',
    ),
    (
      'Como cancelo?',
      'Enquanto o aplicativo procura motorista, toque em Cancelar na tela da corrida.',
    ),
    (
      'Esqueci um objeto no carro',
      'Fale com a Central pelo WhatsApp, informando o dia e o horário da corrida.',
    ),
  ];

  void _abrir(BuildContext context, Widget tela) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => tela));

  @override
  Widget build(BuildContext context) {
    final whatsapp = context.watch<ConfigState>().whatsapp;

    return TelaFormulario(
      titulo: 'Ajuda',
      child: ListView(
        padding: const EdgeInsets.only(bottom: Spacing.xxl),
        children: [
          for (final p in _perguntas) ...[
            Theme(
              data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
              child: ExpansionTile(
                tilePadding: const EdgeInsets.symmetric(horizontal: Spacing.xl, vertical: 4),
                childrenPadding: const EdgeInsets.fromLTRB(Spacing.xl, 0, Spacing.xl, Spacing.lg),
                iconColor: AppColors.brand,
                collapsedIconColor: AppColors.text,
                title: Text(p.$1, style: AppText.bodyStrong.copyWith(fontSize: 17)),
                children: [
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Text(p.$2, style: AppText.body.copyWith(fontSize: 16, color: AppColors.textMuted, height: 1.45)),
                  ),
                ],
              ),
            ),
            const Divider(height: 1, indent: Spacing.xl, endIndent: Spacing.xl, color: AppColors.border),
          ],
          Padding(
            padding: const EdgeInsets.fromLTRB(Spacing.xl, Spacing.xl, Spacing.xl, Spacing.lg),
            child: BotaoPrincipal(
              texto: 'Falar com a Central no WhatsApp',
              aoTocar: () => falarComCentral(whatsapp),
            ),
          ),
          MenuLinha(titulo: 'Termos de Uso', onTap: () => _abrir(context, const LegalScreen())),
          MenuLinha(
            titulo: 'Política de Privacidade',
            onTap: () => _abrir(context, const LegalScreen(privacidade: true)),
          ),
        ],
      ),
    );
  }
}
