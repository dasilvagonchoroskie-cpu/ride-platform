import 'package:flutter/material.dart';

import '../core/theme/central_theme.dart';
import '../data/painel.dart';
import '../widgets/ui.dart';
import 'comuns.dart';
import 'tarifas.dart' show iconeDaCategoria;

/// Pedidos de categoria dos motoristas (Evandro, 29/10/2026: "o motorista
/// escolhe a categoria no cadastro do veiculo, com aprovacao da Central").
/// Aprovar: a categoria passa a valer no carro e ele recebe os chamados dela.
/// Recusar: o motorista ve o motivo e continua na categoria de antes.
class PedidosDeCategoriaScreen extends StatefulWidget {
  const PedidosDeCategoriaScreen({super.key, required this.api});

  final PainelApi api;

  @override
  State<PedidosDeCategoriaScreen> createState() => _PedidosDeCategoriaScreenState();
}

class _PedidosDeCategoriaScreenState extends State<PedidosDeCategoriaScreen> {
  late Future<(List<PedidoDeCategoria>, List<Categoria>)> _dados = _buscar();

  Future<(List<PedidoDeCategoria>, List<Categoria>)> _buscar() async {
    final pedidos = await widget.api.pedidosDeCategoria();
    List<Categoria> categorias = const [];
    try {
      categorias = (await widget.api.tarifas()).categorias;
    } catch (_) {
      // Sem as tarifas: mostra o codigo (CONFORTO...).
    }
    return (pedidos, categorias);
  }

  void _recarregar() => setState(() => _dados = _buscar());

  Future<void> _recusar(PedidoDeCategoria p, List<Categoria> cats) async {
    final motivo = await pedirTexto(
      context,
      titulo: 'Recusar ${nomeDaCategoria(cats, p.pedida)} para ${p.nome}',
      rotulo: 'Motivo (o motorista vê)',
      explicacao: 'Ex.: o carro não é do padrão da categoria, falta ar-condicionado.',
      confirmar: 'Recusar',
    );
    if (motivo == null || !mounted) return;
    final feito = await tentar(context, () => widget.api.revisarCategoria(p.carroId, false, motivo),
        sucesso: 'Categoria recusada. O motorista vê o motivo.');
    if (feito && mounted) _recarregar();
  }

  Future<void> _aprovar(PedidoDeCategoria p, List<Categoria> cats) async {
    final nome = nomeDaCategoria(cats, p.pedida);
    final feito = await tentar(context, () => widget.api.revisarCategoria(p.carroId, true),
        sucesso: 'Aprovado: ${p.nome} agora recebe chamados do $nome.');
    if (feito && mounted) _recarregar();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Pedidos de categoria')),
      body: FutureBuilder<(List<PedidoDeCategoria>, List<Categoria>)>(
        future: _dados,
        builder: (context, s) {
          if (s.hasError) return Aviso(texto: 'Não foi possível carregar: ${s.error}', tentarDeNovo: _recarregar);
          if (!s.hasData) return const Center(child: CircularProgressIndicator());
          final (lista, cats) = s.data!;
          if (lista.isEmpty) return const Aviso(texto: 'Nenhum pedido de categoria esperando.', icone: Icons.check_circle_outline);
          return ListView(
            padding: const EdgeInsets.all(Spacing.lg),
            children: [
              Text(
                'Confira se o carro é do padrão da categoria. Até você aprovar, o motorista recebe chamados da categoria de antes.',
                style: AppText.body.copyWith(color: AppColors.textMuted),
              ),
              const SizedBox(height: Spacing.md),
              for (final p in lista)
                Padding(
                  padding: const EdgeInsets.only(bottom: Spacing.md),
                  child: AppCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(p.nome, style: AppText.heading),
                        Text('${p.carro} · ${p.placaBonita}', style: AppText.caption.copyWith(color: AppColors.textMuted)),
                        const SizedBox(height: Spacing.sm),
                        Wrap(
                          crossAxisAlignment: WrapCrossAlignment.center,
                          spacing: Spacing.xs,
                          children: [
                            Text(nomeDaCategoria(cats, p.atual), style: AppText.body),
                            const Icon(Icons.arrow_forward, size: 18, color: AppColors.textMuted),
                            Icon(iconeDaCategoria(_icone(cats, p.pedida)), size: 18, color: AppColors.brand),
                            Text(nomeDaCategoria(cats, p.pedida), style: AppText.bodyStrong.copyWith(color: AppColors.brand)),
                          ],
                        ),
                        Text('Pedido em ${dataHora(p.quando)}', style: AppText.caption.copyWith(color: AppColors.textMuted)),
                        const SizedBox(height: Spacing.sm),
                        Wrap(
                          spacing: Spacing.sm,
                          children: [
                            FilledButton(onPressed: () => _aprovar(p, cats), child: const Text('Aprovar categoria')),
                            TextButton(
                              onPressed: () => _recusar(p, cats),
                              child: const Text('Recusar', style: TextStyle(color: AppColors.danger)),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

String _icone(List<Categoria> cats, String codigo) {
  for (final c in cats) {
    if (c.codigo == codigo) return c.icone;
  }
  return codigo.contains('MOTO') ? 'moto' : 'carro';
}
