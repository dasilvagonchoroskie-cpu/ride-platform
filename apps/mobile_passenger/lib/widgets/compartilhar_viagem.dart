import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../core/avisos.dart';
import '../core/permissoes_nativas.dart';
import '../core/theme/app_theme.dart';
import '../state/ride_state.dart';

/// Compartilhar a viagem (Evandro, 10/10/2026): o passageiro manda um link
/// e a familia acompanha no mapa, ao vivo, ate ele chegar. O link mostra so
/// a situacao, o primeiro nome do motorista, o carro e a placa — nenhum
/// telefone. Vale ate 30 minutos depois do fim da corrida.
class BotaoCompartilharViagem extends StatelessWidget {
  const BotaoCompartilharViagem({super.key});

  Future<void> _abrir(BuildContext context) async {
    final estado = context.read<RideState>();
    final link = await estado.linkDeAcompanhar();
    if (link == null || !context.mounted) return;
    final mensagem = 'Acompanhe a minha viagem na Fortaleza Mov, ao vivo no mapa: $link';
    await compartilharTexto(
      context,
      titulo: 'Compartilhar viagem',
      explicacao: 'Quem receber o link vê no mapa onde o carro está, até você chegar. Não aparece telefone de ninguém.',
      texto: mensagem,
    );
  }

  @override
  Widget build(BuildContext context) {
    return TextButton.icon(
      onPressed: () => _abrir(context),
      icon: const Icon(Icons.share_location, color: AppColors.brand),
      label: Text('Compartilhar viagem', style: AppText.bodyStrong.copyWith(color: AppColors.brand)),
    );
  }
}

/// Janela de compartilhar: WhatsApp (escolhe o contato) ou copiar.
Future<void> compartilharTexto(
  BuildContext context, {
  required String titulo,
  required String explicacao,
  required String texto,
}) {
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: AppColors.surface,
    builder: (ctx) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(Spacing.lg, Spacing.lg, Spacing.lg, Spacing.md),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(titulo, style: AppText.title.copyWith(color: AppColors.text)),
            const SizedBox(height: Spacing.xs),
            Text(explicacao, style: AppText.body.copyWith(color: AppColors.textMuted)),
            const SizedBox(height: Spacing.lg),
            FilledButton.icon(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
              icon: const Icon(Icons.chat),
              label: const Text('Mandar pelo WhatsApp'),
              onPressed: () async {
                Navigator.of(ctx).pop();
                final abriu = await PermissoesNativas.abrirLink('https://wa.me/?text=${Uri.encodeComponent(texto)}');
                if (!abriu) {
                  await Clipboard.setData(ClipboardData(text: texto));
                  avisar('WhatsApp não abriu: o texto foi copiado. Cole na conversa.');
                }
              },
            ),
            const SizedBox(height: Spacing.sm),
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(50)),
              icon: const Icon(Icons.copy),
              label: const Text('Copiar'),
              onPressed: () async {
                Navigator.of(ctx).pop();
                await Clipboard.setData(ClipboardData(text: texto));
                avisar('Copiado. Cole onde quiser.');
              },
            ),
          ],
        ),
      ),
    ),
  );
}
