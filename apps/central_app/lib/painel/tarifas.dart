import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/central_theme.dart';
import '../core/utils/geo.dart';
import '../data/painel.dart';
import 'comuns.dart';
import 'painel_state.dart';

/// Precificacao: cada categoria com as duas bandeiras (diurna e noturna) e
/// o multiplicador dinamico (cidade toda ou zonas).
class TarifasTela extends StatefulWidget {
  const TarifasTela({super.key});

  @override
  State<TarifasTela> createState() => _TarifasTelaState();
}

class _TarifasTelaState extends State<TarifasTela> {
  Tarifas? _t;
  String? _erro;
  String _codigo = 'CARRO';
  bool _noturna = false;
  bool _salvando = false;
  Categoria? _nova;

  PainelApi get _api => Provider.of<PainelState>(context, listen: false).api;

  @override
  void initState() {
    super.initState();
    _carregar();
  }

  Future<void> _carregar() async {
    setState(() => _erro = null);
    try {
      final t = await _api.tarifas();
      if (mounted) setState(() => _t = t);
    } catch (e) {
      if (mounted) setState(() => _erro = '$e');
    }
  }

  Categoria? get _atual => _nova ?? _t?.categorias.where((c) => c.codigo == _codigo).firstOrNull;

  void _novaCategoria() {
    final base = _t!.categorias.firstWhere((c) => c.codigo == 'CARRO');
    setState(() {
      _nova = Categoria(
        codigo: 'NOVA',
        nome: '',
        ativa: true,
        diurna: Bandeira(base.diurna.toJson()),
        noturna: Bandeira(base.noturna.toJson()),
      );
      _noturna = false;
    });
  }

  Future<void> _salvarCategoria() async {
    final c = _atual!;
    if (c.nome.trim().length < 2) {
      avisar(context, 'Dê um nome para a categoria (ex.: Moto, Premium).', erro: true);
      return;
    }
    setState(() => _salvando = true);
    try {
      final t = await _api.salvarCategoria(c.codigo, c);
      if (!mounted) return;
      final nome = c.nome.trim().toLowerCase();
      setState(() {
        _t = t;
        _codigo = t.categorias.firstWhere((x) => x.nome.toLowerCase() == nome, orElse: () => t.categorias.first).codigo;
        _nova = null;
      });
      avisar(context, 'Tarifas de ${c.nome} salvas. Valem a partir da próxima corrida.');
    } catch (e) {
      if (mounted) avisar(context, mensagemDe(e), erro: true);
    } finally {
      if (mounted) setState(() => _salvando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_erro != null) return Aviso(texto: 'Não foi possível carregar as tarifas: $_erro', tentarDeNovo: _carregar);
    final t = _t;
    if (t == null) return const Center(child: CircularProgressIndicator());
    final c = _atual!;
    final b = _noturna ? c.noturna : c.diurna;
    final k = '${c.codigo}-${_noturna ? 'n' : 'd'}-${_nova == null ? 'x' : 'novo'}';

    return ListView(
      padding: const EdgeInsets.all(Spacing.md),
      children: [
        Wrap(
          spacing: Spacing.sm,
          runSpacing: Spacing.xs,
          children: [
            for (final cat in t.categorias)
              ChoiceChip(
                label: Text(cat.ativa ? cat.nome : '${cat.nome} (desligada)'),
                selected: _nova == null && _codigo == cat.codigo,
                onSelected: (_) => setState(() {
                  _codigo = cat.codigo;
                  _nova = null;
                }),
              ),
            ActionChip(avatar: const Icon(Icons.add, size: 18), label: const Text('Nova categoria'), onPressed: _novaCategoria),
          ],
        ),
        const SizedBox(height: Spacing.md),
        Container(
          padding: const EdgeInsets.all(Spacing.md),
          decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(Radii.md)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextFormField(
                key: ValueKey('nome-$k'),
                initialValue: c.nome,
                style: AppText.body,
                decoration: const InputDecoration(labelText: 'Nome da categoria (ex.: Carro Popular, Moto, Premium)'),
                onChanged: (v) => c.nome = v,
              ),
              if (c.codigo != 'CARRO')
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  value: c.ativa,
                  title: const Text('Categoria ligada (aparece para pedir)', style: AppText.body),
                  onChanged: (v) => setState(() => c.ativa = v),
                ),
              const SizedBox(height: Spacing.sm),
              SegmentedButton<bool>(
                segments: const [
                  ButtonSegment(value: false, icon: Icon(Icons.wb_sunny_outlined), label: Text('Diurna')),
                  ButtonSegment(value: true, icon: Icon(Icons.nightlight_outlined), label: Text('Noturna')),
                ],
                selected: {_noturna},
                onSelectionChanged: (s) => setState(() => _noturna = s.first),
              ),
              const SizedBox(height: Spacing.md),
              Row(
                children: [
                  Expanded(child: _Hora(key: ValueKey('$k-ini'), rotulo: 'Começa às', valor: b.inicio, aoMudar: (h) => setState(() => b.inicio = h))),
                  const SizedBox(width: Spacing.md),
                  Expanded(child: _Hora(key: ValueKey('$k-fim'), rotulo: 'Termina às', valor: b.fim, aoMudar: (h) => setState(() => b.fim = h))),
                ],
              ),
              _Dinheiro(k: '$k-band', rotulo: 'Tarifa base (bandeirada)', cents: b.bandeiradaCents, aoMudar: (v) => b.bandeiradaCents = v),
              Row(
                children: [
                  Expanded(
                    child: _Numero(
                      k: '$k-fkm',
                      rotulo: 'Km inclusos na base',
                      valor: (b.franquiaMetros / 1000).toString().replaceAll('.', ','),
                      aoMudar: (v) => b.franquiaMetros = (v * 1000).round(),
                    ),
                  ),
                  const SizedBox(width: Spacing.md),
                  Expanded(
                    child: _Numero(
                      k: '$k-fmin',
                      rotulo: 'Min. parado inclusos',
                      valor: (b.franquiaSegundos / 60).round().toString(),
                      aoMudar: (v) => b.franquiaSegundos = (v * 60).round(),
                    ),
                  ),
                ],
              ),
              _Dinheiro(k: '$k-km', rotulo: 'Valor por km', cents: b.porKmCents, aoMudar: (v) => b.porKmCents = v),
              _Dinheiro(k: '$k-min', rotulo: 'Valor por minuto de viagem', cents: b.porMinutoCents, aoMudar: (v) => b.porMinutoCents = v),
              _Dinheiro(k: '$k-par', rotulo: 'Valor por minuto parado (após o incluso)', cents: b.paradoCents, aoMudar: (v) => b.paradoCents = v),
              _Dinheiro(k: '$k-minimo', rotulo: 'Valor mínimo por corrida', cents: b.minimoCents, aoMudar: (v) => b.minimoCents = v),
              _Dinheiro(k: '$k-multa', rotulo: 'Multa de cancelamento', cents: b.multaCents, aoMudar: (v) => b.multaCents = v),
              _Numero(
                k: '$k-com',
                rotulo: 'Comissão retida pela Central (%)',
                valor: b.comissao.toString().replaceAll('.', ','),
                aoMudar: (v) => b.comissao = v,
              ),
              const SizedBox(height: Spacing.md),
              Text(
                'As duas bandeiras são salvas juntas e precisam cobrir as 24 horas: a diurna termina quando a noturna começa.',
                style: AppText.caption.copyWith(color: AppColors.textMuted),
              ),
              const SizedBox(height: Spacing.sm),
              FilledButton(
                onPressed: _salvando ? null : _salvarCategoria,
                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                child: Text(_salvando ? 'Salvando...' : (_nova != null ? 'Criar categoria' : 'Salvar ${c.nome}')),
              ),
              if (_nova != null)
                TextButton(onPressed: () => setState(() => _nova = null), child: const Text('Desistir da nova categoria')),
            ],
          ),
        ),
        const SizedBox(height: Spacing.lg),
        _Multiplicador(t: t, api: _api, aoSalvar: (novo) => setState(() => _t = novo)),
        const SizedBox(height: Spacing.xl),
      ],
    );
  }
}

class _Hora extends StatelessWidget {
  const _Hora({super.key, required this.rotulo, required this.valor, required this.aoMudar});

  final String rotulo;
  final int valor;
  final ValueChanged<int> aoMudar;

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<int>(
      initialValue: valor,
      decoration: InputDecoration(labelText: rotulo),
      items: [for (var h = 0; h < 24; h++) DropdownMenuItem(value: h, child: Text('${h.toString().padLeft(2, '0')}h'))],
      onChanged: (v) => aoMudar(v ?? valor),
    );
  }
}

class _Dinheiro extends StatelessWidget {
  const _Dinheiro({required this.k, required this.rotulo, required this.cents, required this.aoMudar});

  final String k;
  final String rotulo;
  final int cents;
  final ValueChanged<int> aoMudar;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: Spacing.sm),
      child: TextFormField(
        key: ValueKey(k),
        initialValue: paraReais(cents),
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        style: AppText.body,
        decoration: InputDecoration(labelText: '$rotulo (R\$)'),
        onChanged: (t) {
          final c = centavos(t);
          if (c != null && c >= 0) aoMudar(c);
        },
      ),
    );
  }
}

class _Numero extends StatelessWidget {
  const _Numero({required this.k, required this.rotulo, required this.valor, required this.aoMudar});

  final String k;
  final String rotulo;
  final String valor;
  final ValueChanged<double> aoMudar;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: Spacing.sm),
      child: TextFormField(
        key: ValueKey(k),
        initialValue: valor,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        style: AppText.body,
        decoration: InputDecoration(labelText: rotulo),
        onChanged: (t) {
          final v = double.tryParse(t.trim().replaceAll(',', '.'));
          if (v != null && v >= 0) aoMudar(v);
        },
      ),
    );
  }
}

/// Multiplicador dinamico: cidade toda e zonas (circulos no mapa).
class _Multiplicador extends StatefulWidget {
  const _Multiplicador({required this.t, required this.api, required this.aoSalvar});

  final Tarifas t;
  final PainelApi api;
  final ValueChanged<Tarifas> aoSalvar;

  @override
  State<_Multiplicador> createState() => _MultiplicadorState();
}

class _MultiplicadorState extends State<_Multiplicador> {
  late double _cidade = widget.t.multiplicadorCidade;
  late final List<Zona> _zonas = [...widget.t.zonas];
  bool _salvando = false;

  Future<void> _salvar() async {
    setState(() => _salvando = true);
    try {
      final t = await widget.api.salvarMultiplicador(_cidade, _zonas);
      widget.aoSalvar(t);
      if (mounted) avisar(context, 'Multiplicador salvo. Vale a partir da próxima corrida.');
    } catch (e) {
      if (mounted) avisar(context, mensagemDe(e), erro: true);
    } finally {
      if (mounted) setState(() => _salvando = false);
    }
  }

  Future<void> _novaZona() async {
    final zona = await showModalBottomSheet<Zona>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      builder: (_) => _NovaZona(api: widget.api, perto: Provider.of<PainelState>(context, listen: false).centro),
    );
    if (zona != null) setState(() => _zonas.add(zona));
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(Spacing.md),
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(Radii.md)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Multiplicador dinâmico', style: AppText.heading),
          Text(
            'Multiplica o preço da corrida. 1,0x é o normal. Use em chuva forte, eventos ou horários de pico. '
            'Se o embarque estiver dentro de uma zona, vale o multiplicador da zona.',
            style: AppText.caption.copyWith(color: AppColors.textMuted),
          ),
          const SizedBox(height: Spacing.md),
          Text('Cidade toda: ${_cidade.toStringAsFixed(1).replaceAll('.', ',')}x', style: AppText.bodyStrong),
          Slider(
            value: _cidade.clamp(0.5, 3.0).toDouble(),
            min: 0.5,
            max: 3.0,
            divisions: 25,
            label: '${_cidade.toStringAsFixed(1)}x',
            onChanged: (v) => setState(() => _cidade = double.parse(v.toStringAsFixed(1))),
          ),
          for (var i = 0; i < _zonas.length; i++)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.radio_button_checked, color: AppColors.warning),
              title: Text('${_zonas[i].nome} · ${_zonas[i].multiplicador.toStringAsFixed(1)}x', style: AppText.body),
              subtitle: Text('Raio de ${_zonas[i].raioKm.toStringAsFixed(1)} km', style: AppText.caption.copyWith(color: AppColors.textMuted)),
              trailing: IconButton(
                icon: const Icon(Icons.delete_outline, color: AppColors.danger),
                onPressed: () => setState(() => _zonas.removeAt(i)),
              ),
            ),
          OutlinedButton.icon(onPressed: _novaZona, icon: const Icon(Icons.add_location_alt), label: const Text('Adicionar zona')),
          const SizedBox(height: Spacing.sm),
          FilledButton(onPressed: _salvando ? null : _salvar, child: Text(_salvando ? 'Salvando...' : 'Salvar multiplicador')),
        ],
      ),
    );
  }
}

class _NovaZona extends StatefulWidget {
  const _NovaZona({required this.api, required this.perto});

  final PainelApi api;
  final Coords perto;

  @override
  State<_NovaZona> createState() => _NovaZonaState();
}

class _NovaZonaState extends State<_NovaZona> {
  final _nome = TextEditingController();
  final _busca = TextEditingController();
  List<Lugar> _achados = const [];
  Lugar? _centro;
  double _raio = 1;
  double _mult = 1.5;

  @override
  void dispose() {
    _nome.dispose();
    _busca.dispose();
    super.dispose();
  }

  Future<void> _buscar() async {
    try {
      final r = await widget.api.buscarEndereco(_busca.text, widget.perto);
      if (mounted) setState(() => _achados = r);
    } catch (e) {
      if (mounted) avisar(context, 'Falha na busca: $e', erro: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(Spacing.lg, Spacing.lg, Spacing.lg, MediaQuery.of(context).viewInsets.bottom + Spacing.lg),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('Nova zona', style: AppText.heading),
              TextField(controller: _nome, style: AppText.body, decoration: const InputDecoration(labelText: 'Nome (ex.: Centro, Rodoviária)')),
              const SizedBox(height: Spacing.sm),
              if (_centro == null) ...[
                TextField(
                  controller: _busca,
                  style: AppText.body,
                  decoration: InputDecoration(
                    labelText: 'Centro da zona (endereço ou lugar)',
                    suffixIcon: IconButton(icon: const Icon(Icons.search), onPressed: _buscar),
                  ),
                  onSubmitted: (_) => _buscar(),
                ),
                for (final l in _achados)
                  ListTile(
                    dense: true,
                    title: Text(l.endereco, style: AppText.body),
                    subtitle: Text(l.detalhe, style: AppText.caption.copyWith(color: AppColors.textMuted)),
                    onTap: () => setState(() => _centro = l),
                  ),
              ] else
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.place, color: AppColors.success),
                  title: Text(_centro!.endereco, style: AppText.body),
                  trailing: IconButton(icon: const Icon(Icons.edit), onPressed: () => setState(() => _centro = null)),
                ),
              Text('Raio: ${_raio.toStringAsFixed(1)} km', style: AppText.body),
              Slider(value: _raio, min: 0.2, max: 10, divisions: 49, onChanged: (v) => setState(() => _raio = v)),
              Text('Multiplicador: ${_mult.toStringAsFixed(1)}x', style: AppText.body),
              Slider(value: _mult, min: 0.5, max: 3, divisions: 25, onChanged: (v) => setState(() => _mult = double.parse(v.toStringAsFixed(1)))),
              FilledButton(
                onPressed: () {
                  if (_nome.text.trim().isEmpty || _centro == null) {
                    avisar(context, 'Dê um nome e escolha o centro da zona.', erro: true);
                    return;
                  }
                  Navigator.of(context).pop(
                    Zona(nome: _nome.text.trim(), centro: _centro!.coords, raioKm: _raio, multiplicador: _mult),
                  );
                },
                child: const Text('Adicionar'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
