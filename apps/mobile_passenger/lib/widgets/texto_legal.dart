import 'package:flutter/material.dart';

import '../core/theme/app_theme.dart';

/// Renderizacao simples do texto legal: sem depender de pacote de
/// markdown, so distinguindo titulos (linhas com #) do corpo.
class TextoLegal extends StatelessWidget {
  const TextoLegal({super.key, required this.texto});

  final String texto;

  @override
  Widget build(BuildContext context) {
    final linhas = texto.split('\n');

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(Spacing.lg, Spacing.md, Spacing.lg, Spacing.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final linha in linhas) _linha(linha),
        ],
      ),
    );
  }

  Widget _linha(String bruta) {
    final s = bruta.trim();
    if (s.isEmpty) return const SizedBox(height: Spacing.sm);
    if (s.startsWith('# ')) {
      return Padding(
        padding: const EdgeInsets.only(top: Spacing.md, bottom: Spacing.xs),
        child: Text(s.substring(2), style: AppText.title),
      );
    }
    if (s.startsWith('## ')) {
      return Padding(
        padding: const EdgeInsets.only(top: Spacing.md, bottom: Spacing.xs),
        child: Text(s.substring(3), style: AppText.heading),
      );
    }
    if (s == '---') {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: Spacing.sm),
        child: Divider(color: AppColors.border, height: 1),
      );
    }
    return Padding(
      padding: const EdgeInsets.only(bottom: Spacing.xs),
      child: Text(s, style: AppText.body.copyWith(color: AppColors.textMuted, height: 1.5)),
    );
  }
}
