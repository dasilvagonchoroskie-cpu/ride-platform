import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/central_theme.dart';
import '../data/painel.dart';
import 'comuns.dart';
import 'painel_state.dart';

/// Cidades e equipe (so o dono) — Evandro, 08/10/2026: "se eu abrir em
/// Goiatuba e a minha sobrinha cuidar de Teutonia, como fica a Central?"
///
/// Uma Central so, o mesmo servidor e os mesmos aplicativos. Cada cidade
/// tem um centro no mapa e um raio: a corrida e da cidade onde o passageiro
/// embarca; o motorista, da cidade onde trabalha. Cada cidade pode ter o
/// operador dela, que entra nesta mesma Central (e-mail e senha) e ve so a
/// cidade dele: motoristas, despacho, SOS, recargas e relatorios.
class CidadesEquipeTela extends StatefulWidget {
  const CidadesEquipeTela({super.key});

  @override
  State<CidadesEquipeTela> createState() => _CidadesEquipeTelaState();
}

class _CidadesEquipeTelaState extends State<CidadesEquipeTela> {
  List<Praca>? _cidades;
  List<ContaDaEquipe>? _equipe;
  String? _erro;

  PainelApi get _api => context.read<PainelState>().api;

  @override
  void initState() {
    super.initState();
    _carregar();
  }

  Future<void> _carregar() async {
    setState(() => _erro = null);
    try {
      final r = await Future.wait([_api.pracas(), _api.equipe()]);
      if (!mounted) return;
      setState(() {
        _cidades = r[0] as List<Praca>;
        _equipe = r[1] as List<ContaDaEquipe>;
      });
    } catch (e) {
      if (mounted) setState(() => _erro = mensagemDe(e));
    }
  }

  Future<void> _depoisDeMudarCidades(List<Praca> lista) async {
    setState(() => _cidades = lista);
    // O topo da Central passa a oferecer a cidade nova.
    await context.read<PainelState>().carregarEu();
  }

  Future<void> _novaCidade() async {
    final dados = await showDialog<Map<String, dynamic>>(context: context, builder: (_) => _NovaCidade(api: _api));
    if (dados == null || !mounted) return;
    try {
      final lista = await _api.criarPraca(dados);
      if (!mounted) return;
      await _depoisDeMudarCidades(lista);
      if (mounted) avisar(context, '${dados['nome']} - ${dados['uf']} aberta. Os motoristas e corridas de lá já aparecem nela.');
    } catch (e) {
      if (mounted) avisar(context, mensagemDe(e), erro: true);
    }
  }

  Future<void> _editarCidade(Praca c) async {
    final dados = await showDialog<Map<String, dynamic>>(context: context, builder: (_) => _EditarCidade(cidade: c));
    if (dados == null || !mounted) return;
    try {
      final lista = await _api.alterarPraca(c.id, dados);
      if (mounted) await _depoisDeMudarCidades(lista);
      if (mounted) avisar(context, '${c.rotulo} atualizada.');
    } catch (e) {
      if (mounted) avisar(context, mensagemDe(e), erro: true);
    }
  }

  Future<void> _novoOperador() async {
    final cidades = _cidades ?? const <Praca>[];
    final dados = await showDialog<Map<String, dynamic>>(context: context, builder: (_) => _NovoOperador(cidades: cidades));
    if (dados == null || !mounted) return;
    final ok = await tentar(context, () => _api.criarOperador(dados), sucesso: 'Conta criada. Passe o e-mail e a senha para a pessoa entrar na Central.');
    if (ok) await _carregar();
  }

  Future<void> _acaoOperador(ContaDaEquipe c, String acao) async {
    try {
      List<ContaDaEquipe>? nova;
      switch (acao) {
        case 'senha':
          final senha = await pedirTexto(
            context,
            titulo: 'Nova senha de ${c.nome}',
            rotulo: 'Senha (8 ou mais, com letra e número)',
            confirmar: 'Trocar senha',
          );
          if (senha == null || !mounted) return;
          nova = await _api.mudarOperador(c.id, {'password': senha.trim()});
        case 'bloquear':
          nova = await _api.mudarOperador(c.id, {'ativo': !c.ativo});
        case 'cidade':
          final cidade = await showDialog<String>(
            context: context,
            builder: (ctx) => SimpleDialog(
              title: Text('Cidade de ${c.nome}'),
              children: [
                for (final p in _cidades ?? const <Praca>[])
                  SimpleDialogOption(onPressed: () => Navigator.of(ctx).pop(p.id), child: Text(p.rotulo)),
              ],
            ),
          );
          if (cidade == null || !mounted) return;
          nova = await _api.mudarOperador(c.id, {'praca': cidade});
        case 'apagar':
          final sim = await confirmar(context, 'Apagar a conta de ${c.nome}?', 'A pessoa não entra mais na Central. Os registros do que ela fez ficam.');
          if (!sim || !mounted) return;
          nova = await _api.apagarOperador(c.id);
      }
      if (!mounted) return;
      setState(() => _equipe = nova ?? _equipe);
      avisar(context, 'Pronto.');
    } catch (e) {
      if (mounted) avisar(context, mensagemDe(e), erro: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_erro != null) return Aviso(texto: 'Não foi possível carregar: $_erro', tentarDeNovo: _carregar);
    final cidades = _cidades;
    final equipe = _equipe;
    if (cidades == null || equipe == null) return const Center(child: CircularProgressIndicator());

    return RefreshIndicator(
      onRefresh: _carregar,
      child: ListView(
        padding: const EdgeInsets.all(Spacing.md),
        children: [
          Text(
            'Uma Central só para todas as cidades. A corrida é da cidade onde o passageiro embarca; o motorista, da cidade onde trabalha. '
            'Você vê tudo e escolhe a cidade no topo. O operador de uma cidade entra nesta mesma Central e vê só a cidade dele.',
            style: AppText.caption.copyWith(color: AppColors.textMuted),
          ),
          const SizedBox(height: Spacing.md),
          Row(
            children: [
              const Expanded(child: Text('Cidades', style: AppText.heading)),
              FilledButton.icon(onPressed: _novaCidade, icon: const Icon(Icons.add_location_alt_outlined), label: const Text('Abrir cidade')),
            ],
          ),
          const SizedBox(height: Spacing.sm),
          for (final c in cidades)
            Card(
              color: AppColors.surface,
              child: ListTile(
                leading: Icon(Icons.location_city, color: c.ativa ? AppColors.primary : AppColors.textMuted),
                title: Text(c.rotulo, style: AppText.bodyStrong),
                subtitle: Text(
                  '${c.ativa ? 'Atendendo' : 'Desligada'} · raio de ${c.raioKm.round()} km'
                  '${c.whatsapp == null ? '' : ' · WhatsApp ${telefoneBonito(c.whatsapp)}'}',
                  style: AppText.caption.copyWith(color: AppColors.textMuted),
                ),
                trailing: const Icon(Icons.edit_outlined),
                onTap: () => _editarCidade(c),
              ),
            ),
          const SizedBox(height: Spacing.lg),
          Row(
            children: [
              const Expanded(child: Text('Equipe da Central', style: AppText.heading)),
              FilledButton.icon(onPressed: _novoOperador, icon: const Icon(Icons.person_add_alt_1), label: const Text('Operador')),
            ],
          ),
          const SizedBox(height: Spacing.xs),
          Text(
            'O operador aprova motoristas, despacha corridas, atende SOS, faz recargas e tira relatórios da cidade dele. '
            'Tarifas, cupons, comissão, cidades e limpeza só você muda.',
            style: AppText.caption.copyWith(color: AppColors.textMuted),
          ),
          const SizedBox(height: Spacing.sm),
          for (final c in equipe)
            Card(
              color: AppColors.surface,
              child: ListTile(
                leading: Icon(c.dono ? Icons.verified_user : Icons.support_agent, color: c.ativo ? AppColors.primary : AppColors.danger),
                title: Text(c.nome, style: AppText.bodyStrong),
                subtitle: Text(
                  '${c.dono ? 'Dono · todas as cidades' : 'Operador · ${c.pracaNome ?? c.praca ?? ''}'}${c.ativo ? '' : ' · BLOQUEADO'}\n${c.email}',
                  style: AppText.caption.copyWith(color: AppColors.textMuted),
                ),
                isThreeLine: true,
                trailing: c.dono
                    ? null
                    : PopupMenuButton<String>(
                        tooltip: 'Ações',
                        onSelected: (a) => _acaoOperador(c, a),
                        itemBuilder: (_) => [
                          const PopupMenuItem(value: 'senha', child: Text('Trocar a senha')),
                          const PopupMenuItem(value: 'cidade', child: Text('Mudar a cidade')),
                          PopupMenuItem(value: 'bloquear', child: Text(c.ativo ? 'Bloquear' : 'Liberar')),
                          const PopupMenuItem(value: 'apagar', child: Text('Apagar a conta')),
                        ],
                      ),
              ),
            ),
          const SizedBox(height: Spacing.xl),
        ],
      ),
    );
  }
}

/// "Sim ou nao" simples.
Future<bool> confirmar(BuildContext context, String titulo, String texto, {String sim = 'Confirmar', bool perigo = false}) async {
  final r = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(titulo),
      content: Text(texto),
      actions: [
        TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Voltar')),
        FilledButton(
          style: perigo ? FilledButton.styleFrom(backgroundColor: AppColors.danger) : null,
          onPressed: () => Navigator.of(ctx).pop(true),
          child: Text(sim),
        ),
      ],
    ),
  );
  return r == true;
}

// ---------------------------------------------------------------------------
// Dialogos
// ---------------------------------------------------------------------------

class _NovaCidade extends StatefulWidget {
  const _NovaCidade({required this.api});

  final PainelApi api;

  @override
  State<_NovaCidade> createState() => _NovaCidadeState();
}

class _NovaCidadeState extends State<_NovaCidade> {
  final _busca = TextEditingController();
  final _nome = TextEditingController();
  final _uf = TextEditingController();
  final _raio = TextEditingController(text: '30');
  List<Lugar> _achados = const [];
  Lugar? _escolhido;
  bool _buscando = false;
  String? _erro;

  @override
  void dispose() {
    for (final c in [_busca, _nome, _uf, _raio]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _buscar() async {
    final t = _busca.text.trim();
    if (t.length < 3) return;
    setState(() {
      _buscando = true;
      _erro = null;
    });
    try {
      final r = await widget.api.buscarEndereco(t, context.read<PainelState>().centro);
      if (mounted) setState(() => _achados = r.take(6).toList());
    } catch (e) {
      if (mounted) setState(() => _erro = mensagemDe(e));
    } finally {
      if (mounted) setState(() => _buscando = false);
    }
  }

  void _escolher(Lugar l) {
    final partes = '${l.endereco}, ${l.detalhe}'.split(',').map((p) => p.trim()).where((p) => p.isNotEmpty).toList();
    final uf = RegExp(r'\b([A-Z]{2})\b').allMatches(l.detalhe).map((m) => m.group(1)!).where((s) => s != 'BR').firstOrNull;
    setState(() {
      _escolhido = l;
      _nome.text = partes.isEmpty ? _busca.text.trim() : partes.first;
      if (uf != null) _uf.text = uf;
    });
  }

  void _salvar() {
    final l = _escolhido;
    final raio = double.tryParse(_raio.text.replaceAll(',', '.')) ?? 0;
    if (l == null) { setState(() => _erro = 'Busque e toque na cidade para marcar o centro no mapa.'); return; }
    if (_nome.text.trim().length < 2) { setState(() => _erro = 'Digite o nome da cidade.'); return; }
    if (!RegExp(r'^[A-Za-z]{2}$').hasMatch(_uf.text.trim())) { setState(() => _erro = 'UF com 2 letras (ex.: GO, RS).'); return; }
    if (raio < 5 || raio > 300) { setState(() => _erro = 'Raio de 5 a 300 km.'); return; }
    Navigator.of(context).pop({
      'nome': _nome.text.trim(),
      'uf': _uf.text.trim().toUpperCase(),
      'latitude': l.coords.latitude,
      'longitude': l.coords.longitude,
      'raioKm': raio,
    });
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Abrir cidade nova'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: _busca,
              textInputAction: TextInputAction.search,
              onSubmitted: (_) => _buscar(),
              decoration: InputDecoration(
                labelText: 'Cidade (ex.: Teutônia RS)',
                suffixIcon: IconButton(
                  icon: _buscando ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.search),
                  onPressed: _buscar,
                ),
              ),
            ),
            for (final l in _achados)
              ListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
                leading: Icon(
                  identical(l, _escolhido) ? Icons.radio_button_checked : Icons.radio_button_unchecked,
                  color: identical(l, _escolhido) ? AppColors.primary : AppColors.textMuted,
                ),
                onTap: () => _escolher(l),
                title: Text(l.endereco, maxLines: 1, overflow: TextOverflow.ellipsis),
                subtitle: Text(l.detalhe, maxLines: 2, overflow: TextOverflow.ellipsis),
              ),
            const SizedBox(height: Spacing.sm),
            TextField(controller: _nome, decoration: const InputDecoration(labelText: 'Nome da cidade')),
            TextField(controller: _uf, maxLength: 2, textCapitalization: TextCapitalization.characters, decoration: const InputDecoration(labelText: 'UF')),
            TextField(
              controller: _raio,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(labelText: 'Raio atendido (km)', helperText: 'Até onde vão as corridas desta cidade, a partir do centro.'),
            ),
            if (_erro != null) ...[
              const SizedBox(height: Spacing.sm),
              Text(_erro!, style: AppText.caption.copyWith(color: AppColors.danger)),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Voltar')),
        FilledButton(onPressed: _salvar, child: const Text('Abrir cidade')),
      ],
    );
  }
}

class _EditarCidade extends StatefulWidget {
  const _EditarCidade({required this.cidade});

  final Praca cidade;

  @override
  State<_EditarCidade> createState() => _EditarCidadeState();
}

class _EditarCidadeState extends State<_EditarCidade> {
  late final _raio = TextEditingController(text: widget.cidade.raioKm.round().toString());
  late final _whatsapp = TextEditingController(text: widget.cidade.whatsapp ?? '');
  late bool _ativa = widget.cidade.ativa;
  String? _erro;

  @override
  void dispose() {
    _raio.dispose();
    _whatsapp.dispose();
    super.dispose();
  }

  void _salvar() {
    final raio = double.tryParse(_raio.text.replaceAll(',', '.')) ?? 0;
    final zap = _whatsapp.text.replaceAll(RegExp(r'\D'), '');
    if (raio < 5 || raio > 300) { setState(() => _erro = 'Raio de 5 a 300 km.'); return; }
    if (zap.isNotEmpty && (zap.length < 10 || zap.length > 13)) { setState(() => _erro = 'WhatsApp com DDD (só números).'); return; }
    Navigator.of(context).pop({
      'raioKm': raio,
      'ativa': _ativa,
      'whatsapp': zap.isEmpty ? null : (zap.length <= 11 ? '55$zap' : zap),
    });
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.cidade.rotulo),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: _ativa,
              title: const Text('Atendendo nesta cidade'),
              onChanged: (v) => setState(() => _ativa = v),
            ),
            TextField(controller: _raio, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Raio atendido (km)')),
            TextField(
              controller: _whatsapp,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(labelText: 'WhatsApp da Central desta cidade (opcional)', helperText: 'Sem ele, vale o WhatsApp geral.'),
            ),
            if (_erro != null) ...[
              const SizedBox(height: Spacing.sm),
              Text(_erro!, style: AppText.caption.copyWith(color: AppColors.danger)),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Voltar')),
        FilledButton(onPressed: _salvar, child: const Text('Salvar')),
      ],
    );
  }
}

class _NovoOperador extends StatefulWidget {
  const _NovoOperador({required this.cidades});

  final List<Praca> cidades;

  @override
  State<_NovoOperador> createState() => _NovoOperadorState();
}

class _NovoOperadorState extends State<_NovoOperador> {
  final _nome = TextEditingController();
  final _email = TextEditingController();
  final _telefone = TextEditingController();
  final _senha = TextEditingController();
  String? _cidade;
  String? _erro;

  @override
  void initState() {
    super.initState();
    if (widget.cidades.length == 1) _cidade = widget.cidades.first.id;
  }

  @override
  void dispose() {
    for (final c in [_nome, _email, _telefone, _senha]) {
      c.dispose();
    }
    super.dispose();
  }

  void _salvar() {
    final tel = _telefone.text.replaceAll(RegExp(r'\D'), '');
    final senha = _senha.text.trim();
    if (_nome.text.trim().split(RegExp(r'\s+')).length < 2) { setState(() => _erro = 'Nome e sobrenome.'); return; }
    if (!RegExp(r'^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$').hasMatch(_email.text.trim())) { setState(() => _erro = 'E-mail inválido.'); return; }
    if (tel.length < 10 || tel.length > 11) { setState(() => _erro = 'Telefone com DDD.'); return; }
    if (senha.length < 8 || !RegExp(r'[A-Za-z]').hasMatch(senha) || !RegExp(r'\d').hasMatch(senha)) {
      setState(() => _erro = 'Senha com 8 ou mais, com letra e número.');
      return;
    }
    if (_cidade == null) { setState(() => _erro = 'Escolha a cidade.'); return; }
    Navigator.of(context).pop({
      'name': _nome.text.trim(),
      'email': _email.text.trim().toLowerCase(),
      'phone': tel,
      'password': senha,
      'praca': _cidade,
    });
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Operador de uma cidade'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Entra nesta mesma Central com o e-mail e a senha e vê só a cidade escolhida.',
                style: AppText.caption.copyWith(color: AppColors.textMuted)),
            TextField(controller: _nome, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Nome completo')),
            TextField(controller: _email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'E-mail')),
            TextField(controller: _telefone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Telefone com DDD')),
            TextField(controller: _senha, decoration: const InputDecoration(labelText: 'Senha (8 ou mais, com letra e número)')),
            const SizedBox(height: Spacing.sm),
            Text('Cidade', style: AppText.caption.copyWith(color: AppColors.textMuted)),
            Wrap(
              spacing: Spacing.sm,
              children: [
                for (final c in widget.cidades)
                  ChoiceChip(label: Text(c.rotulo), selected: _cidade == c.id, onSelected: (_) => setState(() => _cidade = c.id)),
              ],
            ),
            if (_erro != null) ...[
              const SizedBox(height: Spacing.sm),
              Text(_erro!, style: AppText.caption.copyWith(color: AppColors.danger)),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Voltar')),
        FilledButton(onPressed: _salvar, child: const Text('Criar conta')),
      ],
    );
  }
}
