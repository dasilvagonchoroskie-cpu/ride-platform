import 'package:flutter/material.dart';

import '../core/avisos.dart';
import '../core/marca.dart';
import '../core/permissoes_nativas.dart';
import '../core/theme/app_theme.dart';
import '../data/models/models.dart';

/// Cartao da entrega na tela da corrida (Etapa 5, 30/10/2026): o que vai,
/// quem recebe e o codigo de 4 numeros, com o botao de mandar o codigo pelo
/// WhatsApp para quem recebe (ainda nao temos envio de SMS).
class CartaoDaEntrega extends StatelessWidget {
  const CartaoDaEntrega({super.key, required this.entrega});

  final EntregaDaCorrida entrega;

  Future<void> _mandar() async {
    final numero = entrega.destinatarioTelefone.replaceAll(RegExp(r'\D'), '');
    final texto = entrega.mensagemParaQuemRecebe(Marca.nome);
    final abriu = await PermissoesNativas.abrirLink('https://wa.me/$numero?text=${Uri.encodeComponent(texto)}');
    if (!abriu) avisar('Não foi possível abrir o WhatsApp. Passe o código ${entrega.codigo} para quem recebe.');
  }

  @override
  Widget build(BuildContext context) {
    final codigo = entrega.codigo;
    return Container(
      key: const ValueKey('cartao-entrega'),
      padding: const EdgeInsets.all(Spacing.md),
      decoration: BoxDecoration(color: AppColors.brandSoft, borderRadius: BorderRadius.circular(Radii.md)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(Icons.inventory_2_outlined, color: AppColors.brand),
              const SizedBox(width: Spacing.sm),
              Expanded(
                child: Text(
                  'Entrega: ${entrega.descricao}',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.bodyStrong,
                ),
              ),
            ],
          ),
          const SizedBox(height: Spacing.xs),
          Text('Quem recebe: ${entrega.destinatarioNome}', style: AppText.body.copyWith(color: AppColors.textMuted)),
          if (entrega.entregueEm != null)
            Padding(
              padding: const EdgeInsets.only(top: Spacing.sm),
              child: Text('Entregue.', style: AppText.bodyStrong.copyWith(color: AppColors.primary)),
            )
          else if (codigo != null && codigo.isNotEmpty) ...[
            const SizedBox(height: Spacing.sm),
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Na entrega, quem recebe diz este código ao motorista:',
                    style: AppText.body.copyWith(color: AppColors.text),
                  ),
                ),
                const SizedBox(width: Spacing.md),
                Text(codigo, style: AppText.title.copyWith(color: AppColors.brand, letterSpacing: 6)),
              ],
            ),
            const SizedBox(height: Spacing.sm),
            OutlinedButton.icon(
              onPressed: _mandar,
              icon: const Icon(Icons.send_outlined),
              label: const Text('Mandar o código pelo WhatsApp'),
            ),
          ],
        ],
      ),
    );
  }
}
