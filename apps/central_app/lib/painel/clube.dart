import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../core/api/api_client.dart';
import '../core/theme/central_theme.dart';
import '../widgets/ui.dart';
import 'comuns.dart';
import 'foto.dart';
import 'painel_state.dart';

/// Clube de Vantagens Fortaleza Move (Evandro, 05/11/2026): estabelecimentos
/// parceiros e os beneficios para os motoristas. O dono cadastra, edita,
/// liga/desliga e exclui; o operador so consulta (o servidor tambem barra).
/// Nada de percentual fixo: cada parceiro tem as condicoes que o dono escrever.

String _txt(Object? v) => v == null ? '' : '$v';

class BeneficioDoClube {
  BeneficioDoClube({this.id = '', this.titulo = '', this.descricao = '', this.condicoes = '', this.ativo = true, this.ordem = 0});

  final String id;
  String titulo;
  String descricao;
  String condicoes;
  bool ativo;
  int ordem;

  factory BeneficioDoClube.fromJson(Map<String, dynamic> j) => BeneficioDoClube(
        id: _txt(j['id']),
        titulo: _txt(j['titulo']),
        descricao: _txt(j['descricao']),
        condicoes: _txt(j['condicoes']),
        ativo: j['ativo'] != false,
        ordem: j['ordem'] is num ? (j['ordem'] as num).toInt() : 0,
      );

  Map<String, dynamic> toJson() => {'titulo': titulo, 'descricao': descricao, 'condicoes': condicoes, 'ativo': ativo, 'ordem': ordem};
}

class ParceiroDoClube {
  ParceiroDoClube({
    this.id = '',
    this.nome = '',
    this.categoria = '',
    this.descricao = '',
    this.endereco = '',
    this.telefone,
    this.whatsapp,
    this.horario = '',
    this.vantagens = '',
    this.condicoes = '',
    this.logoUrl,
    this.ativo = true,
    this.cadastradoEm,
    this.beneficios = const [],
  });

  final String id;
  String nome;
  String categoria;
  String descricao;
  String endereco;
  String? telefone;
  String? whatsapp;
  String horario;
  String vantagens;
  String condicoes;
  String? logoUrl;
  bool ativo;
  DateTime? cadastradoEm;
  List<BeneficioDoClube> beneficios;

  factory ParceiroDoClube.fromJson(Map<String, dynamic> j) => ParceiroDoClube(
        id: _txt(j['id']),
        nome: _txt(j['nome']),
        categoria: _txt(j['categoria']),
        descricao: _txt(j['descricao']),
        endereco: _txt(j['endereco']),
        telefone: j['telefone'] as String?,
        whatsapp: j['whatsapp'] as String?,
        horario: _txt(j['horario']),
        vantagens: _txt(j['vantagens']),
        condicoes: _txt(j['condicoes']),
        logoUrl: j['logoUrl'] as String?,
        ativo: j['ativo'] != false,
        cadastradoEm: DateTime.tryParse(_txt(j['cadastradoEm']))?.toLocal(),
        beneficios: [
          for (final b in (j['beneficios'] as List<dynamic>? ?? const [])) BeneficioDoClube.fromJson(b as Map<String, dynamic>),
        ],
      );

  Map<String, dynamic> toJson() => {
        'nome': nome,
        'categoria': categoria,
        'descricao': descricao,
        'endereco': endereco,
        'telefone': telefone ?? '',
        'whatsapp': whatsapp ?? '',
        'horario': horario,
        'vantagens': vantagens,
        'condicoes': condicoes,
        'ativo': ativo,
      };
}

/// Chamadas do Clube no servidor (/admin/clube/...).
class ClubeApi {
  ClubeApi(this._c);

  final ApiClient _c;

  List<ParceiroDoClube> _lista(Object? d) =>
      [for (final j in (d is List ? d : const [])) if (j is Map<String, dynamic>) ParceiroDoClube.fromJson(j)];

  ParceiroDoClube _um(Object? d) => ParceiroDoClube.fromJson(d as Map<String, dynamic>);

  Future<List<ParceiroDoClube>> parceiros({String? situacao}) async =>
      _lista(await _c.request('GET', '/admin/clube/parceiros', query: situacao == null ? const {} : {'situacao': situacao}));

  Future<ParceiroDoClube> criar(ParceiroDoClube p) async => _um(await _c.request('POST', '/admin/clube/parceiros', body: p.toJson()));

  Future<ParceiroDoClube> editar(ParceiroDoClube p) async => _um(await _c.request('PUT', '/admin/clube/parceiros/${p.id}', body: p.toJson()));

  Future<ParceiroDoClube> ativar(String id, bool ativo) async =>
      _um(await _c.request('PATCH', '/admin/clube/parceiros/$id/ativo', body: {'ativo': ativo}));

  Future<void> excluir(String id) => _c.request('DELETE', '/admin/clube/parceiros/$id');

  Future<ParceiroDoClube> logo(String id, String mime, String base64) async =>
      _um(await _c.request('POST', '/admin/clube/parceiros/$id/logo', body: {'mime': mime, 'dados': base64}));

  Future<ParceiroDoClube> salvarBeneficio(String parceiroId, BeneficioDoClube b) async => _um(b.id.isEmpty
      ? await _c.request('POST', '/admin/clube/parceiros/$parceiroId/beneficios', body: b.toJson())
      : await _c.request('PUT', '/admin/clube/parceiros/$parceiroId/beneficios/${b.id}', body: b.toJson()));

  Future<ParceiroDoClube> excluirBeneficio(String parceiroId, String id) async =>
      _um(await _c.request('DELETE', '/admin/clube/parceiros/$parceiroId/beneficios/$id'));

  Future<List<String>> categorias() async => [for (final c in (await _c.request('GET', '/admin/clube/categorias') as List<dynamic>? ?? const [])) '$c'];

  Future<List<String>> gravarCategorias(List<String> lista) async =>
      [for (final c in (await _c.request('PUT', '/admin/clube/categorias', body: {'categorias': lista}) as List<dynamic>? ?? const [])) '$c'];
}

Future<bool> _confirmar(BuildContext context, String titulo, String texto, {String sim = 'Excluir'}) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(titulo),
      content: Text(texto),
      actions: [
        TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancelar')),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
          onPressed: () => Navigator.of(ctx).pop(true),
          child: Text(sim),
        ),
      ],
    ),
  );
  return ok == true;
}

class _Logo extends StatelessWidget {
  const _Logo({required this.url, this.tamanho = 48});

  final String? url;
  final double tamanho;

  @override
  Widget build(BuildContext context) {
    if (url != null && url!.isNotEmpty) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(Radii.sm),
        child: FotoDoServidor(caminho: url!, largura: tamanho, altura: tamanho),
      );
    }
    return Container(
      width: tamanho,
      height: tamanho,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: AppColors.goldSoft, borderRadius: BorderRadius.circular(Radii.sm)),
      child: const Icon(Icons.storefront_outlined, color: Color(0xFFB7860B)),
    );
  }
}

/// Menu "Clube de Vantagens" da Central.
class ClubeTela extends StatefulWidget {
  const ClubeTela({super.key});

  @override
  State<ClubeTela> createState() => _ClubeTelaState();
}

class _ClubeTelaState extends State<ClubeTela> {
  late final ClubeApi _api = ClubeApi(Provider.of<PainelState>(context, listen: false).api.cliente);
  late Future<List<ParceiroDoClube>> _lista;
  String _filtro = 'todos';

  @override
  void initState() {
    super.initState();
    _lista = _api.parceiros();
  }

  void _recarregar() => setState(() {
        _lista = _api.parceiros();
      });

  Future<void> _abrir(ParceiroDoClube? p) async {
    final mudou = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => _FormParceiro(api: _api, parceiro: p)));
    if (mudou == true && mounted) _recarregar();
  }

  Future<void> _ligar(ParceiroDoClube p, bool v) async {
    final ok = await tentar(context, () => _api.ativar(p.id, v),
        sucesso: v ? '${p.nome} ativo: já aparece para os motoristas.' : '${p.nome} desativado: saiu do aplicativo do motorista.');
    if (ok && mounted) _recarregar();
  }

  Future<void> _categorias() async {
    final atuais = await _api.categorias().catchError((Object e) {
      if (mounted) avisar(context, 'Não foi possível carregar as categorias: ${mensagemDe(e)}', erro: true);
      return <String>[];
    });
    if (!mounted || atuais.isEmpty) return;
    final nova = await showDialog<List<String>>(context: context, builder: (_) => _EditarCategorias(atuais: atuais));
    if (nova == null || !mounted) return;
    await tentar(context, () => _api.gravarCategorias(nova), sucesso: 'Categorias salvas.');
  }

  @override
  Widget build(BuildContext context) {
    final dono = Provider.of<PainelState>(context).dono;
    return Scaffold(
      backgroundColor: AppColors.background,
      floatingActionButton: dono
          ? FloatingActionButton.extended(
              heroTag: 'novo-parceiro',
              icon: const Icon(Icons.add_business_outlined),
              label: const Text('Novo parceiro'),
              onPressed: () => _abrir(null),
            )
          : null,
      body: FutureBuilder<List<ParceiroDoClube>>(
        future: _lista,
        builder: (context, s) {
          if (s.hasError) return Aviso(texto: 'Não foi possível carregar o clube: ${mensagemDe(s.error!)}', icone: Icons.cloud_off, tentarDeNovo: _recarregar);
          if (!s.hasData) return const Center(child: CircularProgressIndicator());
          final todos = s.data!;
          final ativos = todos.where((p) => p.ativo).length;
          final lista = switch (_filtro) {
            'ativos' => todos.where((p) => p.ativo).toList(),
            'inativos' => todos.where((p) => !p.ativo).toList(),
            _ => todos,
          };
          return RefreshIndicator(
            onRefresh: () async => _recarregar(),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(Spacing.md, Spacing.md, Spacing.md, 96),
              children: [
                Text(
                  'Estabelecimentos com vantagens para os motoristas parceiros. Ativo = aparece no aplicativo do motorista.',
                  style: AppText.caption.copyWith(color: AppColors.textMuted),
                ),
                const SizedBox(height: Spacing.sm),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      SegmentedButton<String>(
                        segments: [
                          ButtonSegment(value: 'todos', label: Text('Todos (${todos.length})')),
                          ButtonSegment(value: 'ativos', label: Text('Ativos ($ativos)')),
                          ButtonSegment(value: 'inativos', label: Text('Inativos (${todos.length - ativos})')),
                        ],
                        selected: {_filtro},
                        showSelectedIcon: false,
                        onSelectionChanged: (v) => setState(() => _filtro = v.first),
                      ),
                      if (dono) ...[
                        const SizedBox(width: Spacing.sm),
                        OutlinedButton.icon(onPressed: _categorias, icon: const Icon(Icons.sell_outlined, size: 18), label: const Text('Categorias')),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: Spacing.md),
                if (lista.isEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: Spacing.xl),
                    child: Aviso(
                      icone: Icons.storefront_outlined,
                      texto: todos.isEmpty
                          ? 'Nenhum parceiro cadastrado ainda.${dono ? ' Toque em "Novo parceiro" para cadastrar o primeiro.' : ''}'
                          : 'Nenhum parceiro ${_filtro == 'ativos' ? 'ativo' : 'inativo'}.',
                    ),
                  ),
                for (final p in lista)
                  Padding(
                    padding: const EdgeInsets.only(bottom: Spacing.sm),
                    child: CartaoDeLista(
                      destaque: p.ativo ? null : AppColors.textFaint,
                      child: ListTile(
                        key: ValueKey('parceiro-${p.id}'),
                        contentPadding: const EdgeInsets.symmetric(horizontal: Spacing.md, vertical: Spacing.xs),
                        leading: _Logo(url: p.logoUrl),
                        title: Text(p.nome, style: AppText.bodyStrong, maxLines: 1, overflow: TextOverflow.ellipsis),
                        subtitle: Text(
                          '${p.categoria} · ${p.beneficios.length} benefício(s)\n${p.endereco}',
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: AppText.caption.copyWith(color: AppColors.textMuted),
                        ),
                        isThreeLine: true,
                        trailing: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Switch(value: p.ativo, onChanged: dono ? (v) => _ligar(p, v) : null),
                            Text(p.ativo ? 'Ativo' : 'Inativo',
                                style: AppText.caption.copyWith(color: p.ativo ? AppColors.success : AppColors.textFaint, fontSize: 11)),
                          ],
                        ),
                        onTap: () => _abrir(p),
                      ),
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _EditarCategorias extends StatefulWidget {
  const _EditarCategorias({required this.atuais});

  final List<String> atuais;

  @override
  State<_EditarCategorias> createState() => _EditarCategoriasState();
}

class _EditarCategoriasState extends State<_EditarCategorias> {
  late final List<String> _lista = [...widget.atuais];
  final _nova = TextEditingController();

  @override
  void dispose() {
    _nova.dispose();
    super.dispose();
  }

  void _somar() {
    final t = _nova.text.trim();
    if (t.length < 2 || _lista.contains(t)) return;
    setState(() {
      _lista.add(t);
      _nova.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Categorias do clube'),
      content: SizedBox(
        width: 420,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Wrap(
                spacing: Spacing.xs,
                runSpacing: Spacing.xs,
                children: [
                  for (final c in _lista) InputChip(label: Text(c), onDeleted: () => setState(() => _lista.remove(c))),
                ],
              ),
              const SizedBox(height: Spacing.md),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      key: const ValueKey('nova-categoria'),
                      controller: _nova,
                      maxLength: 60,
                      decoration: const InputDecoration(labelText: 'Nova categoria', counterText: ''),
                      onSubmitted: (_) => _somar(),
                    ),
                  ),
                  IconButton(onPressed: _somar, icon: const Icon(Icons.add_circle_outline), tooltip: 'Acrescentar'),
                ],
              ),
              const SizedBox(height: Spacing.xs),
              Text('Tirar uma categoria daqui não muda os parceiros que já usam ela.', style: AppText.caption.copyWith(color: AppColors.textMuted)),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancelar')),
        FilledButton(onPressed: _lista.isEmpty ? null : () => Navigator.of(context).pop(_lista), child: const Text('Salvar')),
      ],
    );
  }
}

/// Cadastro e edicao de um parceiro, com logotipo e beneficios.
class _FormParceiro extends StatefulWidget {
  const _FormParceiro({required this.api, this.parceiro});

  final ClubeApi api;
  final ParceiroDoClube? parceiro;

  @override
  State<_FormParceiro> createState() => _FormParceiroState();
}

class _FormParceiroState extends State<_FormParceiro> {
  late ParceiroDoClube? _p = widget.parceiro;
  late final _nome = TextEditingController(text: _p?.nome);
  late final _descricao = TextEditingController(text: _p?.descricao);
  late final _endereco = TextEditingController(text: _p?.endereco);
  late final _telefone = TextEditingController(text: _p?.telefone == null ? '' : telefoneBonito(_p!.telefone));
  late final _whatsapp = TextEditingController(text: _p?.whatsapp == null ? '' : telefoneBonito(_p!.whatsapp));
  late final _horario = TextEditingController(text: _p?.horario);
  late final _vantagens = TextEditingController(text: _p?.vantagens);
  late final _condicoes = TextEditingController(text: _p?.condicoes);
  late String _categoria = _p?.categoria ?? '';
  late bool _ativo = _p?.ativo ?? true;
  List<String> _categorias = const [];
  bool _salvando = false;
  bool _enviandoLogo = false;

  /// Algo foi gravado: a lista recarrega ao voltar.
  bool _mudou = false;

  bool get _dono => Provider.of<PainelState>(context, listen: false).dono;

  @override
  void initState() {
    super.initState();
    widget.api.categorias().then((c) {
      if (mounted) setState(() => _categorias = c);
    }).catchError((Object _) {});
  }

  @override
  void dispose() {
    for (final c in [_nome, _descricao, _endereco, _telefone, _whatsapp, _horario, _vantagens, _condicoes]) {
      c.dispose();
    }
    super.dispose();
  }

  String? _telefoneValido(String t) {
    final d = t.replaceAll(RegExp(r'\D'), '');
    if (d.isEmpty) return '';
    final n = d.startsWith('55') && d.length > 11 ? d.substring(2) : d;
    return n.length == 10 || n.length == 11 ? d : null;
  }

  Future<void> _salvar() async {
    final tel = _telefoneValido(_telefone.text);
    final zap = _telefoneValido(_whatsapp.text);
    String? erro;
    if (_nome.text.trim().length < 2) {
      erro = 'Informe o nome comercial.';
    } else if (_categoria.trim().length < 2) {
      erro = 'Escolha a categoria.';
    } else if (_endereco.text.trim().length < 5) {
      erro = 'Informe o endereço completo.';
    } else if (_vantagens.text.trim().length < 3) {
      erro = 'Descreva as vantagens para os motoristas.';
    } else if (tel == null || zap == null) {
      erro = 'Telefone e WhatsApp com DDD (10 ou 11 números).';
    }
    if (erro != null) {
      avisar(context, erro, erro: true);
      return;
    }
    final dados = ParceiroDoClube(
      id: _p?.id ?? '',
      nome: _nome.text.trim(),
      categoria: _categoria.trim(),
      descricao: _descricao.text.trim(),
      endereco: _endereco.text.trim(),
      telefone: tel,
      whatsapp: zap,
      horario: _horario.text.trim(),
      vantagens: _vantagens.text.trim(),
      condicoes: _condicoes.text.trim(),
      ativo: _ativo,
    );
    setState(() => _salvando = true);
    ParceiroDoClube? salvo;
    final novo = _p == null;
    final ok = await tentar(
      context,
      () async => salvo = novo ? await widget.api.criar(dados) : await widget.api.editar(dados),
      sucesso: novo ? 'Parceiro cadastrado. Agora você pode pôr o logotipo e os benefícios.' : 'Parceiro salvo.',
    );
    if (!mounted) return;
    setState(() {
      _salvando = false;
      if (ok && salvo != null) {
        _p = salvo;
        _mudou = true;
      }
    });
    if (ok && !novo) Navigator.of(context).pop(true);
  }

  Future<void> _logo() async {
    final p = _p;
    if (p == null) return;
    final XFile? arq;
    try {
      arq = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 600, maxHeight: 600, imageQuality: 80);
    } catch (_) {
      if (mounted) avisar(context, 'Não foi possível abrir a galeria. Confira a permissão do aplicativo.', erro: true);
      return;
    }
    if (arq == null) return;
    final bytes = await arq.readAsBytes();
    final mime = mimeDaImagem(bytes);
    if (!mounted) return;
    if (mime == null) {
      avisar(context, 'Escolha uma imagem em JPG, PNG ou WEBP.', erro: true);
      return;
    }
    if (bytes.length > 500 * 1024) {
      avisar(context, 'Imagem muito grande (até 500 KB).', erro: true);
      return;
    }
    setState(() => _enviandoLogo = true);
    ParceiroDoClube? salvo;
    final ok = await tentar(context, () async => salvo = await widget.api.logo(p.id, mime, base64Encode(bytes)), sucesso: 'Logotipo salvo.');
    if (!mounted) return;
    setState(() {
      _enviandoLogo = false;
      if (ok && salvo != null) {
        _p = salvo;
        _mudou = true;
      }
    });
  }

  Future<void> _beneficio([BeneficioDoClube? b]) async {
    final p = _p;
    if (p == null) return;
    final editado = await showDialog<BeneficioDoClube>(context: context, builder: (_) => _EditarBeneficio(beneficio: b, ordem: p.beneficios.length));
    if (editado == null || !mounted) return;
    ParceiroDoClube? salvo;
    final ok = await tentar(context, () async => salvo = await widget.api.salvarBeneficio(p.id, editado), sucesso: 'Benefício salvo.');
    if (ok && salvo != null && mounted) {
      setState(() {
        _p = salvo;
        _mudou = true;
      });
    }
  }

  Future<void> _excluirBeneficio(BeneficioDoClube b) async {
    final p = _p;
    if (p == null) return;
    if (!await _confirmar(context, 'Excluir benefício?', '"${b.titulo}" sai do clube.')) return;
    if (!mounted) return;
    ParceiroDoClube? salvo;
    final ok = await tentar(context, () async => salvo = await widget.api.excluirBeneficio(p.id, b.id), sucesso: 'Benefício excluído.');
    if (ok && salvo != null && mounted) {
      setState(() {
        _p = salvo;
        _mudou = true;
      });
    }
  }

  Future<void> _excluir() async {
    final p = _p;
    if (p == null) return;
    final ok = await _confirmar(
      context,
      'Excluir ${p.nome}?',
      'O parceiro, os ${p.beneficios.length} benefício(s) e o logotipo são apagados. Para só tirar do aplicativo do motorista, desative em vez de excluir.',
    );
    if (!ok || !mounted) return;
    final excluiu = await tentar(context, () => widget.api.excluir(p.id), sucesso: '${p.nome} excluído.');
    if (excluiu && mounted) Navigator.of(context).pop(true);
  }

  Widget _campo(TextEditingController c, String rotulo, {int linhas = 1, int max = 300, TextInputType? teclado, String? dica, Key? chave}) => Padding(
        padding: const EdgeInsets.only(bottom: Spacing.sm),
        child: TextField(
          key: chave,
          controller: c,
          enabled: _dono,
          minLines: linhas,
          maxLines: linhas == 1 ? 1 : linhas + 3,
          maxLength: max,
          keyboardType: teclado ?? (linhas > 1 ? TextInputType.multiline : null),
          style: AppText.body,
          decoration: InputDecoration(labelText: rotulo, helperText: dica, counterText: ''),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final p = _p;
    final dono = _dono;
    final opcoes = {..._categorias, if (_categoria.isNotEmpty) _categoria}.toList();
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) Navigator.of(context).pop(_mudou);
      },
      child: Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(
          title: Text(p == null ? 'Novo parceiro' : p.nome),
          actions: [
            if (p != null && dono) IconButton(tooltip: 'Excluir parceiro', icon: const Icon(Icons.delete_outline), onPressed: _excluir),
          ],
        ),
        body: ListView(
          padding: const EdgeInsets.all(Spacing.lg),
          children: [
            if (p != null)
              Row(
                children: [
                  _Logo(url: p.logoUrl, tamanho: 64),
                  const SizedBox(width: Spacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Cadastrado em ${dataHora(p.cadastradoEm)}', style: AppText.caption.copyWith(color: AppColors.textMuted)),
                        if (dono)
                          TextButton.icon(
                            onPressed: _enviandoLogo ? null : _logo,
                            icon: _enviandoLogo
                                ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                                : const Icon(Icons.image_outlined),
                            label: Text(p.logoUrl == null ? 'Pôr logotipo' : 'Trocar logotipo'),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            const SizedBox(height: Spacing.sm),
            _campo(_nome, 'Nome comercial *', max: 120, chave: const ValueKey('clube-nome')),
            Padding(
              padding: const EdgeInsets.only(bottom: Spacing.sm),
              child: DropdownButtonFormField<String>(
                key: const ValueKey('clube-categoria'),
                initialValue: _categoria.isEmpty ? null : _categoria,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Categoria *'),
                items: [for (final c in opcoes) DropdownMenuItem(value: c, child: Text(c))],
                onChanged: dono ? (v) => setState(() => _categoria = v ?? '') : null,
              ),
            ),
            _campo(_descricao, 'Descrição do estabelecimento', linhas: 2, max: 1000),
            _campo(_endereco, 'Endereço completo *', max: 300, dica: 'Rua, número, bairro e cidade (abre no mapa do motorista).', chave: const ValueKey('clube-endereco')),
            Row(
              children: [
                Expanded(child: _campo(_telefone, 'Telefone', max: 20, teclado: TextInputType.phone)),
                const SizedBox(width: Spacing.md),
                Expanded(child: _campo(_whatsapp, 'WhatsApp', max: 20, teclado: TextInputType.phone, chave: const ValueKey('clube-whatsapp'))),
              ],
            ),
            _campo(_horario, 'Horário de funcionamento', linhas: 2, max: 300),
            _campo(_vantagens, 'Vantagens para os motoristas *', linhas: 3, max: 1500, chave: const ValueKey('clube-vantagens')),
            _campo(_condicoes, 'Condições para usar', linhas: 2, max: 1500, dica: 'Ex.: apresentar a identificação digital do aplicativo.'),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: _ativo,
              title: const Text('Ativo'),
              subtitle: Text(_ativo ? 'Aparece no aplicativo do motorista' : 'Não aparece para os motoristas'),
              onChanged: dono ? (v) => setState(() => _ativo = v) : null,
            ),
            if (dono) ...[
              const SizedBox(height: Spacing.sm),
              FilledButton(
                key: const ValueKey('clube-salvar'),
                onPressed: _salvando ? null : _salvar,
                child: Text(_salvando ? 'Salvando...' : (p == null ? 'Cadastrar parceiro' : 'Salvar alterações')),
              ),
            ] else
              Padding(
                padding: const EdgeInsets.only(top: Spacing.sm),
                child: Text('Só o dono cadastra ou altera parceiros.', style: AppText.caption.copyWith(color: AppColors.textMuted)),
              ),
            if (p != null) ...[
              const SizedBox(height: Spacing.xl),
              Row(
                children: [
                  Expanded(child: Text('Benefícios', style: AppText.heading)),
                  if (dono) TextButton.icon(onPressed: () => _beneficio(), icon: const Icon(Icons.add), label: const Text('Novo benefício')),
                ],
              ),
              if (p.beneficios.isEmpty)
                Text('Nenhum benefício extra. As vantagens acima já aparecem para o motorista.', style: AppText.caption.copyWith(color: AppColors.textMuted)),
              for (final b in p.beneficios)
                Padding(
                  padding: const EdgeInsets.only(top: Spacing.xs),
                  child: CartaoDeLista(
                    destaque: b.ativo ? AppColors.success : AppColors.textFaint,
                    child: ListTile(
                      title: Text(b.titulo, style: AppText.bodyStrong),
                      subtitle: Text(
                        [if (b.descricao.isNotEmpty) b.descricao, if (b.condicoes.isNotEmpty) 'Condições: ${b.condicoes}', if (!b.ativo) 'Desativado'].join('\n'),
                        style: AppText.caption.copyWith(color: AppColors.textMuted),
                      ),
                      onTap: dono ? () => _beneficio(b) : null,
                      trailing: dono ? IconButton(tooltip: 'Excluir benefício', icon: const Icon(Icons.delete_outline), onPressed: () => _excluirBeneficio(b)) : null,
                    ),
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

class _EditarBeneficio extends StatefulWidget {
  const _EditarBeneficio({this.beneficio, required this.ordem});

  final BeneficioDoClube? beneficio;
  final int ordem;

  @override
  State<_EditarBeneficio> createState() => _EditarBeneficioState();
}

class _EditarBeneficioState extends State<_EditarBeneficio> {
  late final _titulo = TextEditingController(text: widget.beneficio?.titulo);
  late final _descricao = TextEditingController(text: widget.beneficio?.descricao);
  late final _condicoes = TextEditingController(text: widget.beneficio?.condicoes);
  late bool _ativo = widget.beneficio?.ativo ?? true;

  @override
  void dispose() {
    for (final c in [_titulo, _descricao, _condicoes]) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.beneficio == null ? 'Novo benefício' : 'Editar benefício'),
      content: SizedBox(
        width: 420,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                key: const ValueKey('beneficio-titulo'),
                controller: _titulo,
                maxLength: 120,
                decoration: const InputDecoration(labelText: 'Benefício *', counterText: ''),
              ),
              TextField(controller: _descricao, maxLength: 1000, minLines: 1, maxLines: 4, decoration: const InputDecoration(labelText: 'Detalhes', counterText: '')),
              TextField(controller: _condicoes, maxLength: 1000, minLines: 1, maxLines: 4, decoration: const InputDecoration(labelText: 'Condições', counterText: '')),
              SwitchListTile(contentPadding: EdgeInsets.zero, value: _ativo, title: const Text('Ativo'), onChanged: (v) => setState(() => _ativo = v)),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancelar')),
        FilledButton(
          onPressed: () {
            if (_titulo.text.trim().length < 2) {
              avisar(context, 'Informe o benefício.', erro: true);
              return;
            }
            Navigator.of(context).pop(BeneficioDoClube(
              id: widget.beneficio?.id ?? '',
              titulo: _titulo.text.trim(),
              descricao: _descricao.text.trim(),
              condicoes: _condicoes.text.trim(),
              ativo: _ativo,
              ordem: widget.beneficio?.ordem ?? widget.ordem,
            ));
          },
          child: const Text('Salvar'),
        ),
      ],
    );
  }
}
