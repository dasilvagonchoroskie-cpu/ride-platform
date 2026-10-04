import 'package:flutter/material.dart';

import '../core/avisos.dart';
import '../core/permissoes_nativas.dart';
import '../core/theme/app_theme.dart';
import '../data/models/models.dart';

/// Cartao do motorista: nome, nota, carro, placa e botoes de contato.
class CartaoMotorista extends StatelessWidget {
  const CartaoMotorista({super.key, required this.motorista});

  final DriverInfo motorista;

  Future<void> _ligar() async {
    final t = (motorista.telefone ?? '').replaceAll(RegExp(r'[^\d+]'), '');
    if (t.isEmpty) return;
    if (!await PermissoesNativas.abrirLink('tel:$t')) avisar('Não foi possível abrir o telefone. Número: $t');
  }

  Future<void> _whatsapp() async {
    final d = (motorista.telefone ?? '').replaceAll(RegExp(r'\D'), '');
    if (d.isEmpty) return;
    if (!await PermissoesNativas.abrirLink('https://wa.me/$d')) avisar('Não foi possível abrir o WhatsApp.');
  }

  @override
  Widget build(BuildContext context) {
    final carro = [motorista.vehicle, motorista.color].where((p) => p.trim().isNotEmpty).join(' · ');
    final temTelefone = (motorista.telefone ?? '').isNotEmpty;
    return Row(
      children: [
        Container(
          width: 56,
          height: 56,
          alignment: Alignment.center,
          decoration: const BoxDecoration(color: AppColors.brand, shape: BoxShape.circle),
          child: Text(
            motorista.initials,
            style: AppText.heading.copyWith(color: Colors.white),
          ),
        ),
        const SizedBox(width: Spacing.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                motorista.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppText.heading.copyWith(color: AppColors.text),
              ),
              const SizedBox(height: 2),
              Row(
                children: [
                  const Icon(Icons.star, size: 16, color: AppColors.gold),
                  const SizedBox(width: 2),
                  Text(motorista.rating.toStringAsFixed(1).replaceAll('.', ','), style: AppText.caption),
                  if (carro.isNotEmpty) ...[
                    const SizedBox(width: Spacing.sm),
                    Flexible(
                      child: Text(carro, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.caption),
                    ),
                  ],
                ],
              ),
              if (motorista.plate.isNotEmpty) ...[
                const SizedBox(height: Spacing.xs),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: Spacing.sm, vertical: 2),
                  decoration: BoxDecoration(
                    border: Border.all(color: AppColors.text, width: 1.4),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    motorista.plate.toUpperCase(),
                    style: AppText.bodyStrong.copyWith(letterSpacing: 2, color: AppColors.text),
                  ),
                ),
              ],
            ],
          ),
        ),
        if (temTelefone) ...[
          _BotaoContato(icone: Icons.call, rotulo: 'Ligar', aoTocar: _ligar),
          const SizedBox(width: Spacing.sm),
          _BotaoContato(icone: Icons.chat, rotulo: 'WhatsApp', aoTocar: _whatsapp),
        ],
      ],
    );
  }
}

class _BotaoContato extends StatelessWidget {
  const _BotaoContato({required this.icone, required this.rotulo, required this.aoTocar});

  final IconData icone;
  final String rotulo;
  final VoidCallback aoTocar;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: rotulo,
      child: Material(
        color: AppColors.brandSoft,
        shape: const CircleBorder(),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: aoTocar,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Icon(icone, color: AppColors.brand, size: 22),
          ),
        ),
      ),
    );
  }
}

/// Linha "rotulo ......... valor".
class LinhaValor extends StatelessWidget {
  const LinhaValor({super.key, required this.rotulo, required this.valor, this.destaque = false});

  final String rotulo;
  final String valor;
  final bool destaque;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(child: Text(rotulo, style: AppText.body.copyWith(color: AppColors.textMuted))),
          const SizedBox(width: Spacing.sm),
          Flexible(
            child: Text(
              valor,
              textAlign: TextAlign.right,
              style: destaque
                  ? AppText.price.copyWith(color: AppColors.brand, fontSize: 20)
                  : AppText.bodyStrong.copyWith(color: AppColors.text),
            ),
          ),
        ],
      ),
    );
  }
}

/// Alca cinza no topo da folha de baixo.
class AlcaFolha extends StatelessWidget {
  const AlcaFolha({super.key});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        width: 40,
        height: 4,
        margin: const EdgeInsets.only(bottom: Spacing.md),
        decoration: BoxDecoration(color: AppColors.sheetBorder, borderRadius: BorderRadius.circular(2)),
      ),
    );
  }
}

/// Pergunta antes de cancelar. Devolve true se a pessoa confirmou.
Future<bool> confirmarCancelamento(BuildContext context, {required bool motoristaJaVem}) async {
  final r = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      backgroundColor: AppColors.surface,
      title: Text('Cancelar a corrida?', style: AppText.heading),
      content: Text(
        motoristaJaVem
            ? 'O motorista já está a caminho. Pode haver taxa de cancelamento, paga direto a ele.'
            : 'Ainda nenhum motorista aceitou. Cancelar agora não custa nada.',
        style: AppText.body,
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Voltar')),
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(true),
          child: const Text('Cancelar corrida', style: TextStyle(color: AppColors.danger)),
        ),
      ],
    ),
  );
  return r == true;
}
