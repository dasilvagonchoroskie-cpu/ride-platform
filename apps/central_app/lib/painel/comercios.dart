import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api/api_client.dart';
import '../core/theme/central_theme.dart';
import '../widgets/ui.dart';
import 'comuns.dart';
import 'painel_state.dart';

/// Comercios (4o aplicativo, Fortaleza Move Comercio).
///
/// - Lista os estabelecimentos que se cadastraram e a situacao de cada um.
/// - Quem decide (aprovar, rejeitar, suspender, reativar) e SO o dono; o
///   operador de uma cidade ve os da cidade dele. Toda decisao fica no registro
///   de auditoria do servidor.
/// - Aprovar o cadastro NAO liga entrega em cidade nenhuma: isso continua em
///   Entregas. Tarifas, comissoes e carteiras tambem ficam como estao.
/// - Em baixo, as entregas pedidas pelo aplicativo Comercio (origem
///   identificada) com o andamento.

int _int(Object? v) => v is num ? v.toInt() : int.tryParse('$v') ?? 0;

class Comercio {
  Comercio(this.j);

  final Map<String, dynamic> j;

  String get id => j['id'] as String? ?? '';
  String get nome => j['nomeFantasia'] as String? ?? '';
  String get razaoSocial => j['razaoSocial'] as String? ?? '';
  String get cnpj => _cnpj(j['cnpj'] as String? ?? '');
  String get responsavel => j['responsavelNome'] as String? ?? '';
  String get cpf => j['responsavelCpf'] as String? ?? '';
  String get telefone => j['telefone'] as String? ?? '';
  String get email => j['email'] as String? ?? '';
  Map<String, dynamic> get endereco => (j['endereco'] as Map?)?.cast<String, dynamic>() ?? const {};
  String get enderecoCompleto => endereco['porExtenso'] as String? ?? '';
  String get cidade => '${endereco['cidade'] ?? ''}${(endereco['uf'] ?? '') == '' ? '' : ' - ${endereco['uf']}'}';
  bool get temLocalizacao => endereco['temLocalizacao'] == true;
  String get situacao => j['situacao'] as String? ?? '';
  String get motivo => j['motivo'] as String? ?? '';
  String get termosVersao => j['termosVersao'] as String? ?? '';
  DateTime? get criadoEm => DateTime.tryParse(j['criadoEm'] as String? ?? '')?.toLocal();
  Map<String, dynamic>? get gastos => (j['gastos'] as Map?)?.cast<String, dynamic>();

  String get situacaoTexto => switch (situacao) {
        'AGUARDANDO' => 'Aguardando aprovação',
        'APROVADO' => 'Aprovado',
        'SUSPENSO' => 'Suspenso',
        'REJEITADO' => 'Rejeitado',
        _ => situacao,
      };

  AppBadgeTone get tom => switch (situacao) {
        'APROVADO' => AppBadgeTone.success,
        'AGUARDANDO' => AppBadgeTone.warning,
        'SUSPENSO' || 'REJEITADO' => AppBadgeTone.danger,
        _ => AppBadgeTone.neutral,
      };

  /// Ações possíveis a partir da situação (o servidor valida de novo).
  List<String> get acoes => switch (situacao) {
        'AGUARDANDO' => ['APROVAR', 'REJEITAR'],
        'APROVADO' => ['SUSPENDER'],
        'SUSPENSO' => ['REATIVAR'],
        'REJEITADO' => ['APROVAR'],
        _ => const [],
      };
}

String _cnpj(String s) {
  final d = s.replaceAll(RegExp(r'\D'), '');
  if (d.length != 14) return s;
  return '${d.substring(0, 2)}.${d.substring(2, 5)}.${d.substring(5, 8)}/${d.substring(8, 12)}-${d.substring(12)}';
}

class PedidoDoComercio {
  PedidoDoComercio(this.j);

  final Map<String, dynamic> j;

  String get codigo => j['codigo'] as String? ?? '';
  String get comercio => j['comercio'] as String? ?? '';
  String get situacao => j['situacao'] as String? ?? '';
  String get etapa => j['etapa'] as String? ?? '';
  bool get final_ => j['final'] == true;
  String get encomenda => j['encomenda'] as String? ?? '';
  String get coleta => j['enderecoDeColeta'] as String? ?? '';
  String get entrega => j['enderecoDeEntrega'] as String? ?? '';
  String get quemRecebe => ((j['destinatario'] as Map?)?['nome'] as String?) ?? '';
  String get veiculo => (j['veiculo'] as String? ?? '') == 'MOTO' ? 'Moto' : 'Carro';
  String get motorista => j['motoristaNome'] as String? ?? '';
  int get valorCents => etapa == 'ENTREGUE' ? _int(j['valorCobradoCents']) : _int(j['valorEstimadoCents']);
  DateTime? get criadaEm => DateTime.tryParse(j['criadaEm'] as String? ?? '')?.toLocal();

  /// APP (a loja pediu) ou MOTORISTA (lancada manualmente pelo motorista).
  bool get lancadaPeloMotorista => j['lancamento'] == 'MOTORISTA';
  String get lancadoPor => j['lancadoPor'] as String? ?? '';
  DateTime? get lancadoEm => DateTime.tryParse(j['lancadoEm'] as String? ?? '')?.toLocal();

  AppBadgeTone get tom => switch (etapa) {
        'ENTREGUE' => AppBadgeTone.success,
        'CANCELADA' || 'FALHA_NA_ENTREGA' || 'SEM_MOTORISTA' => AppBadgeTone.danger,
        _ => AppBadgeTone.info,
      };
}

class ComerciosApi {
  ComerciosApi(this._c, this._praca);

  final ApiClient _c;
  final String? _praca;

  Map<String, String>? _q([Map<String, String> extra = const {}]) {
    final praca = _praca;
    final m = <String, String>{...extra, if (praca != null) 'praca': praca};
    return m.isEmpty ? null : m;
  }

  Future<List<Comercio>> lista(String? situacao) async {
    final r = await _c.request('GET', '/admin/comercios', query: _q({if (situacao != null) 'situacao': situacao})) as Map<String, dynamic>;
    return [for (final x in (r['itens'] as List? ?? const []).whereType<Map<String, dynamic>>()) Comercio(x)];
  }

  Future<List<PedidoDoComercio>> pedidos() async {
    final r = await _c.request('GET', '/admin/comercios/entregas', query: _q()) as Map<String, dynamic>;
    return [for (final x in (r['itens'] as List? ?? const []).whereType<Map<String, dynamic>>()) PedidoDoComercio(x)];
  }

  /// Chave geral do Comercio (nasce desligada; so o dono liga).
  Future<bool> config() async {
    final r = await _c.request('GET', '/admin/comercios/config') as Map<String, dynamic>;
    return r['ativo'] == true;
  }

  Future<bool> gravarConfig(bool ativo) async {
    final r = await _c.request('PUT', '/admin/comercios/config', body: {'ativo': ativo}) as Map<String, dynamic>;
    return r['ativo'] == true;
  }

  Future<Comercio> detalhe(String id) async => Comercio(await _c.request('GET', '/admin/comercios/$id') as Map<String, dynamic>);

  Future<Comercio> decidir(String id, String acao, {String? motivo}) async {
    final r = await _c.request('POST', '/admin/comercios/$id/decisao', body: {'acao': acao, if (motivo != null && motivo.isNotEmpty) 'motivo': motivo});
    return Comercio(r as Map<String, dynamic>);
  }
}

class ComerciosTela extends StatefulWidget {
  const ComerciosTela({super.key});

  @override
  State<ComerciosTela> createState() => _ComerciosTelaState();
}

class _ComerciosTelaState extends State<ComerciosTela> {
  static const _filtros = <(String?, String)>[
    (null, 'Todos'),
    ('AGUARDANDO', 'Aguardando'),
    ('APROVADO', 'Aprovados'),
    ('SUSPENSO', 'Suspensos'),
    ('REJEITADO', 'Rejeitados'),
  ];

  late Future<(List<Comercio>, List<PedidoDoComercio>, bool)> _dados;
  String? _situacao;
  String? _praca;

  ComerciosApi get _api {
    final api = Provider.of<PainelState>(context, listen: false).api;
    return ComerciosApi(api.cliente, api.praca);
  }

  Future<(List<Comercio>, List<PedidoDoComercio>, bool)> _buscar() async {
    final api = _api;
    final r = await Future.wait<Object>([api.lista(_situacao), api.pedidos(), api.config()]);
    return (r[0] as List<Comercio>, r[1] as List<PedidoDoComercio>, r[2] as bool);
  }

  void _recarregar() => setState(() {
        _dados = _buscar();
      });

  @override
  void initState() {
    super.initState();
    _praca = Provider.of<PainelState>(context, listen: false).api.praca;
    _dados = _buscar();
  }

  Future<void> _mudarChave(bool ligar) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: Text(ligar ? 'Liberar as entregas do Comércio?' : 'Bloquear as entregas do Comércio?'),
        content: Text(ligar
            ? 'Lojas aprovadas poderão pedir entregas a motoristas de verdade, mas só nas cidades onde a Entrega está ligada em Entregas. Tarifas, comissões e carteiras não mudam.'
            : 'Nenhuma loja consegue consultar preço nem pedir entrega. Entregas já pedidas continuam e podem ser canceladas.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(d).pop(false), child: const Text('Voltar')),
          FilledButton(onPressed: () => Navigator.of(d).pop(true), child: Text(ligar ? 'Liberar' : 'Bloquear')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final feito = await tentar(context, () async {
      await _api.gravarConfig(ligar);
    }, sucesso: ligar ? 'Entregas do Comércio liberadas.' : 'Entregas do Comércio bloqueadas.');
    if (feito && mounted) _recarregar();
  }

  Future<void> _abrir(Comercio c) async {
    final mudou = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => _DetalheDoComercio(api: _api, comercio: c, dono: Provider.of<PainelState>(context, listen: false).dono)));
    if (mudou == true && mounted) _recarregar();
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
    return FutureBuilder<(List<Comercio>, List<PedidoDoComercio>, bool)>(
      future: _dados,
      builder: (context, s) {
        if (s.hasError) return Aviso(texto: 'Não foi possível carregar os comércios: ${mensagemDe(s.error!)}', tentarDeNovo: _recarregar);
        if (!s.hasData) return const Center(child: CircularProgressIndicator());
        final (lista, pedidos, liberadas) = s.data!;
        return RefreshIndicator(
          onRefresh: () async => _recarregar(),
          child: ListView(
            padding: const EdgeInsets.all(Spacing.md),
            children: [
              Text(
                'Lojas que pedem coleta e entrega pelo aplicativo Comércio. Aprovar o cadastro não liga a entrega: isso continua em Entregas, por cidade.',
                style: AppText.caption.copyWith(color: AppColors.textMuted),
              ),
              const SizedBox(height: Spacing.sm),
              _ChaveGeral(liberadas: liberadas, dono: Provider.of<PainelState>(context, listen: false).dono, aoMudar: _mudarChave),
              const SizedBox(height: Spacing.sm),
              Wrap(
                spacing: Spacing.xs,
                runSpacing: Spacing.xs,
                children: [
                  for (final f in _filtros)
                    ChoiceChip(
                      label: Text(f.$2),
                      selected: _situacao == f.$1,
                      onSelected: (_) {
                        _situacao = f.$1;
                        _recarregar();
                      },
                    ),
                ],
              ),
              const SizedBox(height: Spacing.sm),
              if (lista.isEmpty) const Aviso(texto: 'Nenhum estabelecimento neste filtro.'),
              for (final c in lista)
                Padding(
                  padding: const EdgeInsets.only(bottom: Spacing.xs),
                  child: CartaoDeLista(
                    child: ListTile(
                      leading: Icon(Icons.storefront_outlined, color: c.situacao == 'APROVADO' ? AppColors.success : AppColors.textFaint),
                      title: Text(c.nome, style: AppText.bodyStrong),
                      subtitle: Text('${c.cnpj} · ${c.cidade}', style: AppText.caption),
                      trailing: AppBadge(text: c.situacaoTexto, tone: c.tom),
                      onTap: () => _abrir(c),
                    ),
                  ),
                ),
              const SizedBox(height: Spacing.md),
              Text('Entregas do Comércio (${pedidos.length})', style: AppText.heading),
              const SizedBox(height: Spacing.sm),
              if (pedidos.isEmpty) const Aviso(texto: 'Nenhuma entrega pedida pelo aplicativo Comércio.'),
              for (final p in pedidos) _CartaoDoPedido(p: p),
              const SizedBox(height: Spacing.xl),
            ],
          ),
        );
      },
    );
  }
}

/// Chave geral: nasce BLOQUEADA. So o dono liga; o operador de cidade so ve.
class _ChaveGeral extends StatelessWidget {
  const _ChaveGeral({required this.liberadas, required this.dono, required this.aoMudar});

  final bool liberadas;
  final bool dono;
  final Future<void> Function(bool ligar) aoMudar;

  @override
  Widget build(BuildContext context) {
    return CartaoDeLista(
      child: SwitchListTile(
        value: liberadas,
        onChanged: dono ? (v) => aoMudar(v) : null,
        title: Text('Entregas do Comércio liberadas', style: AppText.bodyStrong),
        subtitle: Text(
          liberadas
              ? 'Lojas aprovadas podem pedir entrega nas cidades com Entrega ligada.${dono ? '' : ' Só o dono muda isto.'}'
              : 'Bloqueado: nenhuma loja consulta preço nem pede entrega.${dono ? '' : ' Só o dono muda isto.'}',
          style: AppText.caption,
        ),
      ),
    );
  }
}

class _CartaoDoPedido extends StatelessWidget {
  const _CartaoDoPedido({required this.p});

  final PedidoDoComercio p;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: Spacing.xs),
      child: CartaoDeLista(
        child: Padding(
          padding: const EdgeInsets.all(Spacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${p.codigo} · ${dataHora(p.criadaEm)}', style: AppText.bodyStrong),
              const SizedBox(height: Spacing.xs),
              Wrap(children: [AppBadge(text: p.situacao, tone: p.tom)]),
              const SizedBox(height: Spacing.xs),
              Text('Comércio: ${p.comercio}', style: AppText.body),
              Text(
                p.lancadaPeloMotorista
                    ? 'Origem: lançada pelo motorista${p.lancadoPor.isEmpty ? '' : ' ${p.lancadoPor}'}${p.lancadoEm == null ? '' : ' em ${dataHora(p.lancadoEm)}'}'
                    : 'Origem: pedida pelo aplicativo do estabelecimento',
                style: AppText.caption.copyWith(color: AppColors.comercio, fontWeight: FontWeight.w600),
              ),
              Text('Item: ${p.encomenda}', style: AppText.caption),
              Text('Coleta: ${p.coleta}', style: AppText.caption, maxLines: 2, overflow: TextOverflow.ellipsis),
              Text('Entrega: ${p.entrega}', style: AppText.caption, maxLines: 2, overflow: TextOverflow.ellipsis),
              Text(
                '${p.quemRecebe.isEmpty ? '' : 'Recebe: ${p.quemRecebe} · '}${p.veiculo} · ${p.motorista.isEmpty ? 'sem motorista' : 'Motorista: ${p.motorista}'} · ${reais(p.valorCents)}',
                style: AppText.caption.copyWith(color: AppColors.textMuted),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DetalheDoComercio extends StatefulWidget {
  const _DetalheDoComercio({required this.api, required this.comercio, required this.dono});

  final ComerciosApi api;
  final Comercio comercio;
  final bool dono;

  @override
  State<_DetalheDoComercio> createState() => _DetalheDoComercioState();
}

class _DetalheDoComercioState extends State<_DetalheDoComercio> {
  late Comercio _c = widget.comercio;
  bool _mudou = false;
  String? _falha;

  @override
  void initState() {
    super.initState();
    _carregar();
  }

  Future<void> _carregar() async {
    try {
      final novo = await widget.api.detalhe(_c.id);
      if (mounted) setState(() => _c = novo);
    } catch (e) {
      if (mounted) setState(() => _falha = mensagemDe(e));
    }
  }

  static String _rotulo(String a) => switch (a) {
        'APROVAR' => 'Aprovar',
        'REJEITAR' => 'Rejeitar',
        'SUSPENDER' => 'Suspender',
        'REATIVAR' => 'Reativar',
        _ => a,
      };

  Future<void> _decidir(String acao) async {
    String? motivo;
    if (acao == 'REJEITAR' || acao == 'SUSPENDER') {
      motivo = await pedirTexto(
        context,
        titulo: '${_rotulo(acao)} ${_c.nome}?',
        rotulo: 'Motivo (o estabelecimento vê)',
        confirmar: _rotulo(acao),
      );
      if (motivo == null || !mounted) return;
    } else {
      final ok = await showDialog<bool>(
        context: context,
        builder: (d) => AlertDialog(
          title: Text('${_rotulo(acao)} ${_c.nome}?'),
          content: Text(acao == 'APROVAR'
              ? 'O estabelecimento poderá pedir entregas só depois de você liberar as entregas do Comércio (chave no alto desta tela) e só onde a entrega estiver ligada em Entregas. Nenhuma tarifa ou comissão muda.'
              : 'O estabelecimento volta a poder pedir entregas.'),
          actions: [
            TextButton(onPressed: () => Navigator.of(d).pop(false), child: const Text('Voltar')),
            FilledButton(onPressed: () => Navigator.of(d).pop(true), child: Text(_rotulo(acao))),
          ],
        ),
      );
      if (ok != true || !mounted) return;
    }
    final feito = await tentar(context, () async {
      final novo = await widget.api.decidir(_c.id, acao, motivo: motivo);
      if (mounted) setState(() => _c = novo);
    }, sucesso: 'Pronto: ${_c.nome} — ${_rotulo(acao).toLowerCase()}.');
    if (feito) {
      _mudou = true;
      await _carregar();
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = _c;
    final g = c.gastos;
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) Navigator.of(context).pop(_mudou);
      },
      child: Scaffold(
        appBar: AppBar(title: Text(c.nome)),
        body: ListView(
          padding: const EdgeInsets.all(Spacing.md),
          children: [
            Row(children: [AppBadge(text: c.situacaoTexto, tone: c.tom)]),
            if (c.motivo.isNotEmpty) ...[
              const SizedBox(height: Spacing.sm),
              Text('Motivo: ${c.motivo}', style: AppText.body.copyWith(color: AppColors.danger)),
            ],
            const SizedBox(height: Spacing.sm),
            CartaoDeLista(
              child: Padding(
                padding: const EdgeInsets.all(Spacing.md),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Linha('CNPJ', c.cnpj, destaque: true),
                    if (c.razaoSocial.isNotEmpty) Linha('Razão social', c.razaoSocial),
                    Linha('Responsável', c.responsavel),
                    if (c.cpf.isNotEmpty) Linha('CPF', c.cpf),
                    Linha('Telefone', telefoneBonito(c.telefone)),
                    Linha('E-mail', c.email),
                    Linha('Endereço', c.enderecoCompleto),
                    Linha('No mapa', c.temLocalizacao ? 'Sim' : 'Ainda não'),
                    Linha('Cadastrado em', dataHora(c.criadoEm)),
                    if (c.termosVersao.isNotEmpty) Linha('Termos aceitos', c.termosVersao),
                  ],
                ),
              ),
            ),
            if (g != null) ...[
              const SizedBox(height: Spacing.md),
              Text('Entregas no mês', style: AppText.heading),
              const SizedBox(height: Spacing.xs),
              CartaoDeLista(
                child: Padding(
                  padding: const EdgeInsets.all(Spacing.md),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Linha('Realizadas', '${_int(g['realizadas'])}'),
                      Linha('Canceladas', '${_int(g['canceladas'])}'),
                      Linha('Em andamento', '${_int(g['emAndamento'])}'),
                      Linha('Total gasto', reais(_int(g['totalCents'])), destaque: true),
                    ],
                  ),
                ),
              ),
            ],
            if (_falha != null) ...[
              const SizedBox(height: Spacing.sm),
              Text(_falha!, style: AppText.caption.copyWith(color: AppColors.danger)),
            ],
            const SizedBox(height: Spacing.lg),
            if (!widget.dono)
              Text('Só o dono da Central aprova, rejeita ou suspende estabelecimentos.', style: AppText.caption.copyWith(color: AppColors.textMuted))
            else
              for (final a in c.acoes)
                Padding(
                  padding: const EdgeInsets.only(bottom: Spacing.xs),
                  child: a == 'APROVAR' || a == 'REATIVAR'
                      ? FilledButton(onPressed: () => _decidir(a), child: Text(_rotulo(a)))
                      : OutlinedButton(onPressed: () => _decidir(a), child: Text(_rotulo(a))),
                ),
            const SizedBox(height: Spacing.xl),
          ],
        ),
      ),
    );
  }
}
