import 'package:flutter/material.dart';

import '../core/theme/app_theme.dart';

/// Figura de cada categoria (a mesma do app do passageiro).
IconData iconeDaCategoria(String? icone) {
  switch (icone) {
    case 'moto':
      return Icons.two_wheeler;
    case 'conforto':
      return Icons.directions_car_filled;
    case 'premium':
      return Icons.workspace_premium;
    case 'van':
      return Icons.airport_shuttle;
    default:
      return Icons.directions_car;
  }
}

/// Nome da categoria pelo codigo (CARRO = Popular), com a lista do servidor.
String nomeDaCategoria(List<Map<String, dynamic>> categorias, String? codigo) {
  final c = (codigo ?? 'CARRO').toUpperCase();
  for (final x in categorias) {
    if ('${x['codigo']}'.toUpperCase() == c) return '${x['nome'] ?? c}';
  }
  if (c == 'CARRO') return 'Popular';
  return c.isEmpty ? 'Popular' : '${c[0]}${c.substring(1).toLowerCase()}';
}

/// Categoria do carro (Evandro, 29/10/2026): o motorista escolhe e a Central
/// aprova. Popular, Conforto, Premium... com a figura e o texto curto.
class EscolhaDeCategoria extends StatelessWidget {
  const EscolhaDeCategoria({
    super.key,
    required this.categorias,
    required this.escolhida,
    required this.aoEscolher,
  });

  final List<Map<String, dynamic>> categorias;
  final String escolhida;
  final ValueChanged<String> aoEscolher;

  @override
  Widget build(BuildContext context) {
    final lista = categorias.isEmpty
        ? const [
            {'codigo': 'CARRO', 'nome': 'Popular', 'icone': 'carro', 'descricao': 'Econômico'},
          ]
        : categorias;
    Map<String, dynamic>? atual;
    for (final c in lista) {
      if ('${c['codigo']}' == escolhida) atual = c;
    }
    final descricao = '${atual?['descricao'] ?? ''}';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Categoria do carro', style: AppText.label),
        const SizedBox(height: Spacing.xs),
        Wrap(
          spacing: Spacing.sm,
          runSpacing: Spacing.xs,
          children: [
            for (final c in lista)
              ChoiceChip(
                avatar: Icon(iconeDaCategoria(c['icone'] as String?), size: 18),
                label: Text('${c['nome'] ?? c['codigo']}'),
                selected: '${c['codigo']}' == escolhida,
                onSelected: (_) => aoEscolher('${c['codigo']}'),
              ),
          ],
        ),
        const SizedBox(height: Spacing.xs),
        Text(
          '${descricao.isNotEmpty ? '$descricao. ' : ''}A Central confere e aprova a categoria; até lá você recebe chamados do Popular.',
          style: AppText.caption.copyWith(color: AppColors.textMuted),
        ),
      ],
    );
  }
}
