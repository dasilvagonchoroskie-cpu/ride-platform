import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/central_theme.dart';
import '../data/painel.dart';
import '../widgets/ui.dart';
import 'cadastrar_motorista.dart' show TipoDeVeiculo;
import 'carros.dart';
import 'comuns.dart';
import 'painel_state.dart';

/// Frota na Central: as telas "Motos" e "Carros" (Evandro, 12/11/2026).
///
/// Sao duas visoes administrativas dos MESMOS veiculos (tabela `vehicles`, sem
/// tabela nova): uma lista os veiculos de categoria MOTO, a outra os demais.
/// Cadastro do veiculo NAO e autorizacao de entrega: suspender ou reativar o
/// veiculo nao muda as permissoes da cidade (Entregas, Moto em Goiatuba etc.).
///
/// Lista, busca, situacao, motorista, documentos enviados e o detalhe; as
/// acoes (aprovar/recusar, corrigir, fotos, suspender/reativar) sao as do
/// cadastro do motorista (`CarrosDoMotorista`), reaproveitadas.
class FrotaTela extends StatefulWidget {
  const FrotaTela({super.key, required this.moto});

  /// true = tela Motos; false = tela Carros.
  final bool moto;

  @override
  State<FrotaTela> createState() => _FrotaTelaState();
}

class _FrotaTelaState extends State<FrotaTela> {
  static const _situacoes = <(String?, String)>[
    (null, 'Todos'),
    ('EM_USO', 'Em uso'),
    ('GUARDADO', 'Guardados'),
    ('PENDENTE', 'Para conferir'),
    ('RECUSADO', 'Recusados'),
    ('SUSPENSO', 'Suspensos'),
  ];

  final _busca = TextEditingController();
  String? _situacao;
  late Future<FrotaLista> _lista;

  PainelApi get _api => Provider.of<PainelState>(context, listen: false).api;

  String get _tipo => widget.moto ? 'MOTO' : 'CARRO';
  String get _plural => widget.moto ? 'motos' : 'carros';

  @override
  void initState() {
    super.initState();
    _lista = _api.frota(tipo: _tipo);
  }

  @override
  void dispose() {
    _busca.dispose();
    super.dispose();
  }

  void _recarregar() => setState(() {
        _lista = _api.frota(tipo: _tipo, busca: _busca.text, situacao: _situacao);
      });

  /// Cadastra um veiculo novo para um motorista que ja existe (pedido do
  /// Evandro, 13/11/2026): escolhe o motorista e preenche o veiculo; ja entra
  /// conferido pela Central, na categoria desta tela (Moto, ou Carro/Utilitario).
  Future<void> _cadastrar() async {
    final api = _api;
    final motorista = await escolherMotorista(context, api);
    if (motorista == null || !mounted) return;
    final tipos = widget.moto ? const [TipoDeVeiculo.moto] : const [TipoDeVeiculo.carro, TipoDeVeiculo.utilitario];
    final dados = await formularioDoCarro(
      context,
      titulo: widget.moto ? 'Cadastrar moto de ${motorista.nome}' : 'Cadastrar veículo de ${motorista.nome}',
      tipos: tipos,
    );
    if (dados == null || !mounted) return;
    try {
      await api.cadastrarCarro(motorista.id, dados);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${widget.moto ? 'Moto cadastrada' : 'Veículo cadastrado'} para ${motorista.nome}.')));
      _recarregar();
    } catch (e) {
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Não foi possível cadastrar'),
          content: Text(mensagemDe(e)),
          actions: [TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('OK'))],
        ),
      );
    }
  }

  Future<void> _abrir(VeiculoDaFrota v) async {
    await Navigator.of(context).push<void>(MaterialPageRoute(builder: (_) => DetalheDoVeiculo(veiculo: v, api: _api)));
    if (mounted) _recarregar();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(Spacing.md, Spacing.md, Spacing.md, 0),
          child: Align(
            alignment: Alignment.centerLeft,
            child: FilledButton.icon(
              key: const Key('cadastrar-veiculo'),
              onPressed: _cadastrar,
              icon: Icon(widget.moto ? Icons.two_wheeler : Icons.directions_car_outlined),
              label: Text(widget.moto ? 'Cadastrar moto' : 'Cadastrar carro'),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(Spacing.md, Spacing.md, Spacing.md, 0),
          child: TextField(
            controller: _busca,
            textInputAction: TextInputAction.search,
            onSubmitted: (_) => _recarregar(),
            decoration: InputDecoration(
              hintText: 'Buscar por placa, marca, modelo ou motorista',
              prefixIcon: const Icon(Icons.search),
              suffixIcon: IconButton(tooltip: 'Buscar', icon: const Icon(Icons.arrow_forward), onPressed: _recarregar),
            ),
          ),
        ),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.all(Spacing.md),
          child: Row(
            children: [
              for (final s in _situacoes)
                Padding(
                  padding: const EdgeInsets.only(right: Spacing.sm),
                  child: ChoiceChip(
                    label: Text(s.$2),
                    selected: _situacao == s.$1,
                    onSelected: (_) {
                      _situacao = s.$1;
                      _recarregar();
                    },
                  ),
                ),
            ],
          ),
        ),
        Expanded(
          child: FutureBuilder<FrotaLista>(
            future: _lista,
            builder: (context, s) {
              if (s.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
              if (s.hasError) return Aviso(texto: 'Não foi possível carregar as $_plural: ${mensagemDe(s.error!)}', tentarDeNovo: _recarregar);
              final r = s.data!;
              if (r.itens.isEmpty) {
                return Aviso(texto: 'Nenhuma ${widget.moto ? 'moto' : 'carro'} encontrada neste filtro.', icone: widget.moto ? Icons.two_wheeler : Icons.directions_car_outlined);
              }
              return RefreshIndicator(
                onRefresh: () async => _recarregar(),
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(Spacing.md, 0, Spacing.md, Spacing.xl),
                  children: [
                    Padding(
                      padding: const EdgeInsets.only(bottom: Spacing.sm),
                      child: Text(
                        r.cortada ? 'Mostrando ${r.itens.length} de ${r.total}. Use a busca para achar os outros.' : '${r.total} ${r.total == 1 ? (widget.moto ? 'moto' : 'carro') : _plural}',
                        style: AppText.caption.copyWith(color: AppColors.textMuted),
                      ),
                    ),
                    for (final v in r.itens) _CartaoDoVeiculo(veiculo: v, aoTocar: () => _abrir(v)),
                  ],
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

AppBadgeTone _tomDa(String situacao) => switch (situacao) {
      'EM_USO' => AppBadgeTone.success,
      'PENDENTE' => AppBadgeTone.warning,
      'RECUSADO' || 'SUSPENSO' => AppBadgeTone.danger,
      _ => AppBadgeTone.neutral,
    };

class _CartaoDoVeiculo extends StatelessWidget {
  const _CartaoDoVeiculo({required this.veiculo, required this.aoTocar});

  final VeiculoDaFrota veiculo;
  final VoidCallback aoTocar;

  @override
  Widget build(BuildContext context) {
    final v = veiculo;
    return Padding(
      padding: const EdgeInsets.only(bottom: Spacing.sm),
      child: Material(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(Radii.md),
        child: InkWell(
          borderRadius: BorderRadius.circular(Radii.md),
          onTap: aoTocar,
          child: Padding(
            padding: const EdgeInsets.all(Spacing.md),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(v.moto ? Icons.two_wheeler : Icons.directions_car_outlined, color: AppColors.textMuted),
                const SizedBox(width: Spacing.sm),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('${v.placaBonita} · ${v.nome.isEmpty ? v.tipo : v.nome}', maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.bodyStrong),
                      Text('${v.ano} · ${v.cor} · ${v.motoristaNome}', maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.caption.copyWith(color: AppColors.textMuted)),
                      const SizedBox(height: 4),
                      Wrap(
                        spacing: Spacing.xs,
                        runSpacing: 4,
                        children: [
                          AppBadge(text: v.rotuloSituacao, tone: _tomDa(v.situacao)),
                          AppBadge(text: v.fotoUrl != null ? 'Foto ✓' : 'Sem foto'),
                          AppBadge(text: v.crlvUrl != null ? 'CRLV ✓' : 'Sem CRLV'),
                          if (v.cnhVencida == true) const AppBadge(text: 'CNH vencida', tone: AppBadgeTone.danger),
                          if (v.crlvVencido == true) const AppBadge(text: 'CRLV vencido', tone: AppBadgeTone.danger),
                        ],
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right, color: AppColors.textFaint),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Detalhe do veiculo: dono, dados, documentos enviados, motivo e as acoes.
class DetalheDoVeiculo extends StatefulWidget {
  const DetalheDoVeiculo({super.key, required this.veiculo, required this.api});

  final VeiculoDaFrota veiculo;
  final PainelApi api;

  @override
  State<DetalheDoVeiculo> createState() => _DetalheDoVeiculoState();
}

/// AAAA-MM-DD -> DD/MM/AAAA ('Não registrada' quando nao ha data).
String diaBonito(String? iso) {
  if (iso == null || iso.length != 10) return 'Não registrada';
  return '${iso.substring(8, 10)}/${iso.substring(5, 7)}/${iso.substring(0, 4)}';
}

/// DD/MM/AAAA -> AAAA-MM-DD (null se a data nao existir no calendario).
String? diaParaServidor(String texto) {
  final m = RegExp(r'^(\d{2})/(\d{2})/(\d{4})$').firstMatch(texto.trim());
  if (m == null) return null;
  final d = int.parse(m[1]!), mes = int.parse(m[2]!), a = int.parse(m[3]!);
  final data = DateTime.utc(a, mes, d);
  if (data.year != a || data.month != mes || data.day != d) return null;
  return '${m[3]}-${m[2]}-${m[1]}';
}

class _DetalheDoVeiculoState extends State<DetalheDoVeiculo> {
  late String? _crlvValidade = widget.veiculo.crlvValidade;
  late bool? _crlvVencido = widget.veiculo.crlvVencido;
  bool _gravando = false;
  String? _erro;

  VeiculoDaFrota get veiculo => widget.veiculo;
  PainelApi get api => widget.api;

  Future<void> _anotarValidade() async {
    final controle = TextEditingController(text: _crlvValidade == null ? '' : diaBonito(_crlvValidade));
    final resposta = await showDialog<String?>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Validade do CRLV'),
        content: TextField(
          key: const Key('campo-validade-crlv'),
          controller: controle,
          keyboardType: TextInputType.datetime,
          decoration: const InputDecoration(labelText: 'Data (DD/MM/AAAA)', hintText: '31/12/2027'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
          if (_crlvValidade != null) TextButton(onPressed: () => Navigator.pop(ctx, ''), child: const Text('Limpar')),
          FilledButton(onPressed: () => Navigator.pop(ctx, controle.text), child: const Text('Salvar')),
        ],
      ),
    );
    if (resposta == null || !mounted) return;
    final iso = resposta.trim().isEmpty ? null : diaParaServidor(resposta);
    if (resposta.trim().isNotEmpty && iso == null) {
      setState(() => _erro = 'Data inválida. Use DD/MM/AAAA, por exemplo 31/12/2027.');
      return;
    }
    setState(() {
      _gravando = true;
      _erro = null;
    });
    try {
      await api.validadeDoCrlv(veiculo.id, iso);
      if (!mounted) return;
      final hoje = DateTime.now().toUtc().subtract(const Duration(hours: 3)).toIso8601String().substring(0, 10);
      setState(() {
        _crlvValidade = iso;
        _crlvVencido = iso == null ? null : iso.compareTo(hoje) < 0;
      });
    } catch (e) {
      if (mounted) setState(() => _erro = 'Não foi possível salvar a validade. Confira a internet e tente de novo.');
    } finally {
      if (mounted) setState(() => _gravando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final v = veiculo;
    return Scaffold(
      appBar: AppBar(title: Text('${v.tipo} ${v.placaBonita}')),
      body: ListView(
        padding: const EdgeInsets.all(Spacing.lg),
        children: [
          Text(v.nome.isEmpty ? v.tipo : v.nome, style: AppText.heading),
          const SizedBox(height: Spacing.sm),
          Linha('Situação', v.rotuloSituacao, destaque: true),
          if (v.motivo != null) Linha('Motivo', v.motivo!),
          Linha('Tipo', v.tipo),
          Linha('Placa', v.placaBonita),
          Linha('Marca / modelo', v.nome.isEmpty ? '-' : v.nome),
          Linha('Ano', v.ano == 0 ? '-' : '${v.ano}'),
          Linha('Cor', v.cor.isEmpty ? '-' : v.cor),
          Linha('Categoria', v.categoria),
          Linha('Motorista', v.motoristaNome),
          Linha('Telefone', telefoneBonito(v.motoristaTelefone)),
          Linha('Cadastro do motorista', switch (v.motoristaStatus) {
            'APPROVED' => 'Aprovado',
            'PENDING' => 'Aguardando aprovação',
            'SUSPENDED' => 'Suspenso',
            'BLOCKED' => 'Bloqueado',
            _ => '-',
          }),
          Linha('Veículo cadastrado em', dataHora(v.criadoEm)),
          const Divider(color: AppColors.border),
          Text('Documentação', style: AppText.bodyStrong),
          const SizedBox(height: Spacing.xs),
          Linha('Foto do veículo', v.fotoUrl != null ? 'Enviada' : 'Não enviada'),
          Linha('CRLV', v.crlvUrl != null ? 'Enviado' : 'Não enviado'),
          Linha('Último envio', dataHora(v.enviadoEm)),
          Linha('Validade da CNH do motorista', v.cnhValidade == null ? 'Não registrada' : '${diaBonito(v.cnhValidade)}${v.cnhVencida == true ? ' · VENCIDA' : ''}', destaque: v.cnhVencida == true),
          Linha('Validade do CRLV', _crlvValidade == null ? 'Não registrada' : '${diaBonito(_crlvValidade)}${_crlvVencido == true ? ' · VENCIDO' : ''}', destaque: _crlvVencido == true),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              key: const Key('anotar-validade-crlv'),
              onPressed: _gravando ? null : _anotarValidade,
              icon: const Icon(Icons.event_available_outlined),
              label: Text(_crlvValidade == null ? 'Anotar validade do CRLV' : 'Mudar validade do CRLV'),
            ),
          ),
          if (_erro != null) Text(_erro!, key: const Key('erro-validade-crlv'), style: AppText.caption.copyWith(color: AppColors.danger)),
          Text(
            'A validade do CRLV é anotada por quem conferiu a foto do documento. É só um registro: o sistema avisa quando vence, mas não bloqueia o veículo sozinho.',
            style: AppText.caption.copyWith(color: AppColors.textMuted),
          ),
          if (v.fotoUrl != null || v.crlvUrl != null) ...[
            const SizedBox(height: Spacing.sm),
            Wrap(
              spacing: Spacing.sm,
              children: [
                if (v.fotoUrl != null) FotoDoServidor(caminho: v.fotoUrl!, largura: 120, altura: 90),
                if (v.crlvUrl != null) FotoDoServidor(caminho: v.crlvUrl!, largura: 120, altura: 90),
              ],
            ),
          ],
          const Divider(color: AppColors.border),
          Text('Aprovar, recusar, corrigir, suspender ou reativar', style: AppText.bodyStrong),
          const SizedBox(height: Spacing.xs),
          Text(
            'O cadastro do veículo não autoriza entregas: as permissões da cidade continuam em Entregas.',
            style: AppText.caption.copyWith(color: AppColors.textMuted),
          ),
          const SizedBox(height: Spacing.sm),
          CarrosDoMotorista(driverId: v.motoristaId, api: api),
        ],
      ),
    );
  }
}

/// Escolhe um motorista ja cadastrado (ativos e pendentes), com busca por
/// nome, telefone ou placa. null = cancelou.
Future<MotoristaCadastro?> escolherMotorista(BuildContext context, PainelApi api) {
  return showDialog<MotoristaCadastro>(
    context: context,
    builder: (ctx) => _EscolherMotorista(api: api),
  );
}

class _EscolherMotorista extends StatefulWidget {
  const _EscolherMotorista({required this.api});

  final PainelApi api;

  @override
  State<_EscolherMotorista> createState() => _EscolherMotoristaState();
}

class _EscolherMotoristaState extends State<_EscolherMotorista> {
  final _busca = TextEditingController();
  late final Future<List<MotoristaCadastro>> _todos = _carregar();

  Future<List<MotoristaCadastro>> _carregar() async {
    final ativos = await widget.api.motoristas('APPROVED');
    final pendentes = await widget.api.motoristas('PENDING');
    return [...ativos, ...pendentes];
  }

  @override
  void dispose() {
    _busca.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('De qual motorista é o veículo?'),
      content: SizedBox(
        width: 420,
        height: 420,
        child: FutureBuilder<List<MotoristaCadastro>>(
          future: _todos,
          builder: (context, s) {
            if (s.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
            if (s.hasError) return Text('Não foi possível carregar os motoristas: ${mensagemDe(s.error!)}');
            final q = _busca.text.trim().toLowerCase();
            final qd = q.replaceAll(RegExp(r'\D'), '');
            final lista = [
              for (final m in s.data!)
                if (q.isEmpty ||
                    m.nome.toLowerCase().contains(q) ||
                    m.placa.toLowerCase().contains(q) ||
                    (qd.isNotEmpty && m.telefone.replaceAll(RegExp(r'\D'), '').contains(qd)))
                  m,
            ];
            return Column(
              children: [
                TextField(
                  controller: _busca,
                  onChanged: (_) => setState(() {}),
                  decoration: const InputDecoration(hintText: 'Buscar por nome, telefone ou placa', prefixIcon: Icon(Icons.search)),
                ),
                const SizedBox(height: Spacing.sm),
                Expanded(
                  child: lista.isEmpty
                      ? const Center(child: Text('Nenhum motorista encontrado.'))
                      : ListView(
                          children: [
                            for (final m in lista)
                              ListTile(
                                title: Text(m.nome),
                                subtitle: Text('${m.telefone} · ${nomeDoStatusMotorista(m.status)}'),
                                onTap: () => Navigator.of(context).pop(m),
                              ),
                          ],
                        ),
                ),
              ],
            );
          },
        ),
      ),
      actions: [TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancelar'))],
    );
  }
}
