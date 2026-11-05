import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/central_theme.dart';
import '../data/painel.dart';
import '../widgets/ui.dart';
import 'comuns.dart';
import 'painel_state.dart';

/// Menu "Categorias" (Evandro, 05/11/2026): liga e desliga cada categoria
/// de carro na cidade escolhida no topo. Ligada = aparece para o passageiro
/// escolher em "Confirmar viagem". Os valores de cada uma ficam em Tarifas;
/// a Entrega liga no menu Entregas.
class CategoriasTela extends StatefulWidget {
  const CategoriasTela({super.key});

  @override
  State<CategoriasTela> createState() => _CategoriasTelaState();
}

class _CategoriasTelaState extends State<CategoriasTela> {
  late Future<Tarifas> _dados;
  String? _praca;
  String? _salvando;

  PainelApi get _api => Provider.of<PainelState>(context, listen: false).api;

  void _recarregar() => setState(() {
        _dados = _api.tarifas(cidade: _api.praca);
      });

  @override
  void initState() {
    super.initState();
    _praca = _api.praca;
    _dados = _api.tarifas(cidade: _praca);
  }

  Future<void> _ligar(Tarifas t, Categoria c, bool ligar) async {
    final antes = c.ativa;
    setState(() {
      c.ativa = ligar;
      _salvando = c.codigo;
    });
    final nome = c.nome.isEmpty ? c.codigo : c.nome;
    final onde = _praca == null ? 'em todas as cidades' : 'nesta cidade';
    final ok = await tentar(
      context,
      () => _api.salvarCategoria(c.codigo, c, cidade: _praca, versao: t.versao),
      sucesso: ligar ? '$nome ligada $onde: já aparece para o passageiro.' : '$nome desligada $onde.',
    );
    if (!mounted) return;
    setState(() {
      _salvando = null;
      if (!ok) c.ativa = antes;
    });
    if (ok) _recarregar();
  }

  @override
  Widget build(BuildContext context) {
    final painel = Provider.of<PainelState>(context);
    if (painel.api.praca != _praca) {
      _praca = painel.api.praca;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _recarregar();
      });
    }
    final dono = painel.dono;
    return FutureBuilder<Tarifas>(
      future: _dados,
      builder: (context, s) {
        if (s.hasError) return Aviso(texto: 'Não foi possível carregar as categorias: ${mensagemDe(s.error!)}', tentarDeNovo: _recarregar);
        if (!s.hasData) return const Center(child: CircularProgressIndicator());
        final t = s.data!;
        final lista = t.categorias.where((c) => c.codigo.toUpperCase() != 'ENTREGA').toList();
        return RefreshIndicator(
          onRefresh: () async => _recarregar(),
          child: ListView(
            padding: const EdgeInsets.all(Spacing.md),
            children: [
              Text(
                _praca == null
                    ? 'Ligada = aparece para o passageiro escolher. Sem cidade escolhida no topo, vale para todas as cidades.'
                    : 'Ligada = aparece para o passageiro escolher nesta cidade.',
                style: AppText.caption.copyWith(color: AppColors.textMuted),
              ),
              const SizedBox(height: Spacing.xs),
              Text(
                'Carro de categoria mais alta também recebe os pedidos das mais baixas (Conforto e Premium levam Popular). Valores em Tarifas; a Entrega liga no menu Entregas.',
                style: AppText.caption.copyWith(color: AppColors.textMuted),
              ),
              const SizedBox(height: Spacing.sm),
              for (final c in lista)
                Padding(
                  padding: const EdgeInsets.only(bottom: Spacing.xs),
                  child: CartaoDeLista(
                    child: SwitchListTile(
                      key: ValueKey('categoria-${c.codigo}'),
                      value: c.ativa,
                      title: Text(c.nome.isEmpty ? c.codigo : c.nome, style: AppText.bodyStrong),
                      subtitle: Text(
                        [
                          if (c.descricao.isNotEmpty) c.descricao,
                          '${c.capacidade} lugares',
                          c.ativa ? 'aparece para o passageiro' : 'não aparece',
                        ].join(' · '),
                        style: AppText.caption.copyWith(color: c.ativa ? AppColors.success : AppColors.textMuted),
                      ),
                      secondary: _salvando == c.codigo
                          ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2))
                          : Icon(Icons.directions_car_outlined, color: c.ativa ? AppColors.success : AppColors.textFaint),
                      onChanged: dono && _salvando == null ? (v) => _ligar(t, c, v) : null,
                    ),
                  ),
                ),
              if (!dono)
                Padding(
                  padding: const EdgeInsets.only(top: Spacing.sm),
                  child: Text('Só o dono liga ou desliga categorias.', style: AppText.caption.copyWith(color: AppColors.textMuted)),
                ),
            ],
          ),
        );
      },
    );
  }
}
