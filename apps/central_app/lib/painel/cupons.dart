import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/central_theme.dart';
import '../data/painel.dart';
import 'comuns.dart';
import 'painel_state.dart';

/// Cupons de desconto. O desconto e pago pela Central: o passageiro paga
/// menos ao motorista e a diferenca entra como credito na carteira dele.
class CuponsTela extends StatefulWidget {
  const CuponsTela({super.key});

  @override
  State<CuponsTela> createState() => _CuponsTelaState();
}

class _CuponsTelaState extends State<CuponsTela> {
  late Future<List<Cupom>> _lista;

  PainelApi get _api => Provider.of<PainelState>(context, listen: false).api;

  @override
  void initState() {
    super.initState();
    _lista = _api.cupons();
  }

  void _recarregar() => setState(() { _lista = _api.cupons(); });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Cupons de desconto')),
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'novo-cupom',
        icon: const Icon(Icons.add),
        label: const Text('Novo cupom'),
        onPressed: () async {
          final criado = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => _NovoCupom(api: _api)));
          if (criado == true) _recarregar();
        },
      ),
      body: FutureBuilder<List<Cupom>>(
        future: _lista,
        builder: (context, s) {
          if (s.hasError) return Aviso(texto: 'Não foi possível carregar: ${s.error}', tentarDeNovo: _recarregar);
          if (!s.hasData) return const Center(child: CircularProgressIndicator());
          if (s.data!.isEmpty) return const Aviso(texto: 'Nenhum cupom criado.');
          return ListView(
            padding: const EdgeInsets.fromLTRB(Spacing.md, Spacing.md, Spacing.md, 96),
            children: [
              for (final c in s.data!)
                SwitchListTile(
                  value: c.ativo,
                  title: Text('${c.codigo} · ${c.percentual ? '${c.valor}%' : reais(c.valor)}', style: AppText.bodyStrong),
                  subtitle: Text(
                    '${c.descricao.isEmpty ? '' : '${c.descricao}\n'}Usado ${c.usados} de ${c.limite} · ${c.porPessoa} por pessoa'
                    '${c.minimoCents > 0 ? ' · mínimo ${reais(c.minimoCents)}' : ''}'
                    '${c.validoAte != null ? ' · até ${dataHora(c.validoAte)}' : ''}',
                    style: AppText.caption.copyWith(color: AppColors.textMuted),
                  ),
                  onChanged: (v) async {
                    final ok = await tentar(context, () => _api.ligarCupom(c.id, v), sucesso: v ? 'Cupom ligado.' : 'Cupom desligado.');
                    if (ok) _recarregar();
                  },
                ),
            ],
          );
        },
      ),
    );
  }
}

class _NovoCupom extends StatefulWidget {
  const _NovoCupom({required this.api});

  final PainelApi api;

  @override
  State<_NovoCupom> createState() => _NovoCupomState();
}

class _NovoCupomState extends State<_NovoCupom> {
  final _codigo = TextEditingController();
  final _descricao = TextEditingController();
  final _valor = TextEditingController();
  final _teto = TextEditingController();
  final _minimo = TextEditingController();
  final _usos = TextEditingController(text: '100');
  final _porPessoa = TextEditingController(text: '1');
  bool _percentual = false;
  DateTime? _ate;
  bool _salvando = false;

  @override
  void dispose() {
    for (final c in [_codigo, _descricao, _valor, _teto, _minimo, _usos, _porPessoa]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _salvar() async {
    final codigo = _codigo.text.trim().toUpperCase();
    final valor = _percentual ? int.tryParse(_valor.text.trim()) : centavos(_valor.text);
    if (!RegExp(r'^[A-Z0-9]{3,30}$').hasMatch(codigo)) {
      avisar(context, 'Código com 3 a 30 letras e números, sem espaço.', erro: true);
      return;
    }
    if (valor == null || valor <= 0 || (_percentual && valor > 100)) {
      avisar(context, _percentual ? 'Percentual de 1 a 100.' : 'Valor do desconto em reais.', erro: true);
      return;
    }
    setState(() => _salvando = true);
    final ok = await tentar(
      context,
      () => widget.api.criarCupom({
        'code': codigo,
        if (_descricao.text.trim().isNotEmpty) 'description': _descricao.text.trim(),
        'discountType': _percentual ? 'PERCENT' : 'FIXED',
        'discountValue': valor,
        if (_percentual && centavos(_teto.text) != null) 'maxDiscountCents': centavos(_teto.text),
        'minFareCents': centavos(_minimo.text) ?? 0,
        'maxUses': int.tryParse(_usos.text) ?? 100,
        'maxUsesPerUser': int.tryParse(_porPessoa.text) ?? 1,
        if (_ate != null) 'expiresAt': _ate!.toUtc().toIso8601String(),
      }),
      sucesso: 'Cupom $codigo criado.',
    );
    if (!mounted) return;
    setState(() => _salvando = false);
    if (ok) Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Novo cupom')),
      body: ListView(
        padding: const EdgeInsets.all(Spacing.lg),
        children: [
          TextField(controller: _codigo, style: AppText.body, textCapitalization: TextCapitalization.characters, decoration: const InputDecoration(labelText: 'Código (ex.: BEMVINDO)')),
          TextField(controller: _descricao, style: AppText.body, decoration: const InputDecoration(labelText: 'Descrição (aparece para o passageiro)')),
          const SizedBox(height: Spacing.md),
          SegmentedButton<bool>(
            segments: const [ButtonSegment(value: false, label: Text('Valor em R\$')), ButtonSegment(value: true, label: Text('Percentual'))],
            selected: {_percentual},
            onSelectionChanged: (s) => setState(() => _percentual = s.first),
          ),
          TextField(
            controller: _valor,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            style: AppText.body,
            decoration: InputDecoration(labelText: _percentual ? 'Desconto (%)' : 'Desconto (R\$)'),
          ),
          if (_percentual)
            TextField(
              controller: _teto,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              style: AppText.body,
              decoration: const InputDecoration(labelText: 'Desconto máximo (R\$, opcional)'),
            ),
          TextField(
            controller: _minimo,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            style: AppText.body,
            decoration: const InputDecoration(labelText: 'Corrida mínima para usar (R\$, opcional)'),
          ),
          Row(
            children: [
              Expanded(child: TextField(controller: _usos, keyboardType: TextInputType.number, style: AppText.body, decoration: const InputDecoration(labelText: 'Total de usos'))),
              const SizedBox(width: Spacing.md),
              Expanded(child: TextField(controller: _porPessoa, keyboardType: TextInputType.number, style: AppText.body, decoration: const InputDecoration(labelText: 'Usos por pessoa'))),
            ],
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(_ate == null ? 'Sem data para acabar' : 'Vale até ${dataHora(_ate)}', style: AppText.body),
            trailing: const Icon(Icons.event),
            onTap: () async {
              final d = await showDatePicker(
                context: context,
                initialDate: DateTime.now().add(const Duration(days: 30)),
                firstDate: DateTime.now(),
                lastDate: DateTime.now().add(const Duration(days: 730)),
              );
              if (d != null) setState(() => _ate = DateTime(d.year, d.month, d.day, 23, 59));
            },
          ),
          const SizedBox(height: Spacing.lg),
          FilledButton(onPressed: _salvando ? null : _salvar, child: Text(_salvando ? 'Salvando...' : 'Criar cupom')),
        ],
      ),
    );
  }
}
