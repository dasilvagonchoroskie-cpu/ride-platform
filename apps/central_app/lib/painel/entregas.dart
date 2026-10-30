import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api/api_client.dart';
import '../core/theme/central_theme.dart';
import '../widgets/ui.dart';
import 'comuns.dart';
import 'painel_state.dart';

/// Entregas de encomendas (Etapa 5, 30/10/2026 — Fase 1).
///
/// - Liga e desliga por cidade e por tipo de veiculo (carro, moto ou os
///   dois). Comeca DESLIGADA em todas. So o dono grava.
/// - Pedidos da cidade escolhida no topo, com o status. Codigo errado 5
///   vezes: "Liberar codigo" (a Central confere com quem recebe).
/// - A tarifa da entrega fica em Tarifas (categoria "Entrega").

int _int(Object? v) => v is num ? v.toInt() : int.tryParse('$v') ?? 0;

class CidadeDaEntrega {
  CidadeDaEntrega({required this.praca, required this.nome, required this.uf, required this.ligada, required this.veiculos});

  final String praca;
  final String nome;
  final String uf;
  bool ligada;
  String veiculos;

  String get rotulo => uf.isEmpty ? nome : '$nome - $uf';

  factory CidadeDaEntrega.fromJson(Map<String, dynamic> j) => CidadeDaEntrega(
        praca: j['praca'] as String? ?? '',
        nome: j['nome'] as String? ?? '',
        uf: j['uf'] as String? ?? '',
        ligada: j['ligada'] == true,
        veiculos: j['veiculos'] as String? ?? 'TODOS',
      );
}

class PedidoDeEntrega {
  PedidoDeEntrega(this.j);

  final Map<String, dynamic> j;
  String get id => j['id'] as String? ?? '';
  String get codigoDaCorrida => j['code'] as String? ?? '';
  String get status => j['status'] as String? ?? '';
  String get coleta => j['coleta'] as String? ?? '';
  String get entrega => j['entrega'] as String? ?? '';
  int get valorCents => _int(j['valorCents']);
  Map<String, dynamic> get detalhe => (j['detalhe'] as Map?)?.cast<String, dynamic>() ?? const {};
  String get descricao => detalhe['descricao'] as String? ?? '';
  String get quemRecebe => detalhe['destinatarioNome'] as String? ?? '';
  String get telefoneDeQuemRecebe => detalhe['destinatarioTelefone'] as String? ?? '';
  String get codigo => detalhe['codigo'] as String? ?? '';
  int get tentativas => _int(detalhe['tentativas']);
  String? get motorista => (j['motorista'] as Map?)?['nome'] as String?;
  String get cliente => (j['cliente'] as Map?)?['nome'] as String? ?? '';
  DateTime? get pedidaEm => DateTime.tryParse(j['pedidaEm'] as String? ?? '')?.toLocal();

  String get situacao => switch (status) {
        'REQUESTED' || 'SEARCHING' => 'Procurando motorista',
        'DRIVER_ASSIGNED' || 'DRIVER_ARRIVING' => 'Indo coletar',
        'DRIVER_WAITING' => 'Na coleta',
        'IN_PROGRESS' => 'Levando',
        'COMPLETED' => 'Entregue',
        'EXPIRED' => 'Ninguém aceitou',
        _ => status.startsWith('CANCELLED') ? 'Cancelada' : status,
      };

  Color get cor => switch (status) {
        'COMPLETED' => AppColors.success,
        'IN_PROGRESS' || 'DRIVER_WAITING' || 'DRIVER_ASSIGNED' || 'DRIVER_ARRIVING' => AppColors.brand,
        'REQUESTED' || 'SEARCHING' => AppColors.warning,
        _ => AppColors.textMuted,
      };
}

class _EntregasApi {
  _EntregasApi(this._c, this._praca);

  final ApiClient _c;
  final String? _praca;

  Future<List<CidadeDaEntrega>> config() async {
    final r = await _c.request('GET', '/admin/entregas-config') as Map<String, dynamic>;
    return [for (final c in (r['cidades'] as List? ?? const []).whereType<Map<String, dynamic>>()) CidadeDaEntrega.fromJson(c)];
  }

  Future<void> gravar(CidadeDaEntrega c) async {
    await _c.request('PUT', '/admin/entregas-config', body: {'praca': c.praca, 'ligada': c.ligada, 'veiculos': c.veiculos});
  }

  Future<List<PedidoDeEntrega>> pedidos() async {
    final praca = _praca;
    final r = await _c.request('GET', '/admin/entregas', query: praca == null ? null : {'praca': praca}) as Map<String, dynamic>;
    return [for (final p in (r['itens'] as List? ?? const []).whereType<Map<String, dynamic>>()) PedidoDeEntrega(p)];
  }

  Future<void> liberar(String rideId) async {
    await _c.request('POST', '/admin/entregas/$rideId/liberar');
  }
}

class EntregasTela extends StatefulWidget {
  const EntregasTela({super.key});

  @override
  State<EntregasTela> createState() => _EntregasTelaState();
}

class _EntregasTelaState extends State<EntregasTela> {
  late Future<(List<CidadeDaEntrega>, List<PedidoDeEntrega>)> _dados;
  String? _praca;

  _EntregasApi get _api {
    final api = Provider.of<PainelState>(context, listen: false).api;
    return _EntregasApi(api.cliente, api.praca);
  }

  Future<(List<CidadeDaEntrega>, List<PedidoDeEntrega>)> _buscar() async {
    final api = _api;
    final r = await Future.wait<Object>([api.config(), api.pedidos()]);
    return (r[0] as List<CidadeDaEntrega>, r[1] as List<PedidoDeEntrega>);
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

  Future<void> _editar(CidadeDaEntrega c) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => _EditarCidade(cidade: c),
    );
    if (ok != true || !mounted) return;
    final salvou = await tentar(context, () => _api.gravar(c), sucesso: c.ligada ? 'Entrega ligada em ${c.rotulo}.' : 'Entrega desligada em ${c.rotulo}.');
    if (salvou && mounted) _recarregar();
  }

  Future<void> _liberar(PedidoDeEntrega p) async {
    final ok = await tentar(context, () => _api.liberar(p.id), sucesso: 'Liberado: o motorista pode digitar o código de novo.');
    if (ok && mounted) _recarregar();
  }

  @override
  Widget build(BuildContext context) {
    final painel = Provider.of<PainelState>(context);
    // Trocou a cidade no topo: carrega a dela.
    if (painel.api.praca != _praca) {
      _praca = painel.api.praca;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _recarregar();
      });
    }
    final dono = painel.dono;
    return FutureBuilder<(List<CidadeDaEntrega>, List<PedidoDeEntrega>)>(
      future: _dados,
      builder: (context, s) {
        if (s.hasError) return Aviso(texto: 'Não foi possível carregar as entregas: ${mensagemDe(s.error!)}', tentarDeNovo: _recarregar);
        if (!s.hasData) return const Center(child: CircularProgressIndicator());
        final (cidades, pedidos) = s.data!;
        final daTela = _praca == null ? cidades : cidades.where((c) => c.praca == _praca).toList();
        return RefreshIndicator(
          onRefresh: () async => _recarregar(),
          child: ListView(
            padding: const EdgeInsets.all(Spacing.md),
            children: [
              Text(
                'Entrega de encomendas. Começa desligada em todas as cidades. A tarifa fica em Tarifas → "Entrega".',
                style: AppText.caption.copyWith(color: AppColors.textMuted),
              ),
              const SizedBox(height: Spacing.sm),
              for (final c in daTela)
                Padding(
                  padding: const EdgeInsets.only(bottom: Spacing.xs),
                  child: CartaoDeLista(
                    child: ListTile(
                      leading: Icon(Icons.inventory_2_outlined, color: c.ligada ? AppColors.success : AppColors.textFaint),
                      title: Text(c.rotulo, style: AppText.bodyStrong),
                      subtitle: Text(
                        c.ligada ? 'Ligada · ${_veiculos(c.veiculos)}' : 'Desligada',
                        style: AppText.caption.copyWith(color: c.ligada ? AppColors.success : AppColors.textMuted),
                      ),
                      trailing: dono ? const Icon(Icons.edit_outlined) : null,
                      onTap: dono ? () => _editar(c) : null,
                    ),
                  ),
                ),
              const SizedBox(height: Spacing.md),
              Text('Pedidos de entrega (${pedidos.length})', style: AppText.heading),
              const SizedBox(height: Spacing.sm),
              if (pedidos.isEmpty) const Aviso(texto: 'Nenhuma entrega pedida ainda.'),
              for (final p in pedidos) _CartaoDoPedido(p: p, aoLiberar: () => _liberar(p)),
              const SizedBox(height: Spacing.xl),
            ],
          ),
        );
      },
    );
  }
}

String _veiculos(String v) => switch (v) {
      'CARRO' => 'só carro',
      'MOTO' => 'só moto',
      _ => 'carro e moto',
    };

class _EditarCidade extends StatefulWidget {
  const _EditarCidade({required this.cidade});

  final CidadeDaEntrega cidade;

  @override
  State<_EditarCidade> createState() => _EditarCidadeState();
}

class _EditarCidadeState extends State<_EditarCidade> {
  late bool _ligada = widget.cidade.ligada;
  late String _veiculos = widget.cidade.veiculos;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text('Entrega em ${widget.cidade.rotulo}'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: _ligada,
            title: const Text('Entrega ligada nesta cidade'),
            onChanged: (v) => setState(() => _ligada = v),
          ),
          const SizedBox(height: Spacing.sm),
          const Text('Quem pode levar'),
          const SizedBox(height: Spacing.xs),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'CARRO', label: Text('Carro')),
              ButtonSegment(value: 'MOTO', label: Text('Moto')),
              ButtonSegment(value: 'TODOS', label: Text('Os dois')),
            ],
            selected: {_veiculos},
            onSelectionChanged: (s) => setState(() => _veiculos = s.first),
          ),
          const SizedBox(height: Spacing.sm),
          Text(
            'Antes de ligar: confira a tarifa "Entrega" em Tarifas e as regras provisórias dos Termos (item 7-A).',
            style: AppText.caption.copyWith(color: AppColors.textMuted),
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Voltar')),
        FilledButton(
          onPressed: () {
            widget.cidade
              ..ligada = _ligada
              ..veiculos = _veiculos;
            Navigator.of(context).pop(true);
          },
          child: const Text('Salvar'),
        ),
      ],
    );
  }
}

class _CartaoDoPedido extends StatelessWidget {
  const _CartaoDoPedido({required this.p, required this.aoLiberar});

  final PedidoDeEntrega p;
  final VoidCallback aoLiberar;

  @override
  Widget build(BuildContext context) {
    final travada = p.tentativas >= 5 && p.status == 'IN_PROGRESS';
    return Padding(
      padding: const EdgeInsets.only(bottom: Spacing.xs),
      child: CartaoDeLista(
        child: Padding(
          padding: const EdgeInsets.all(Spacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(child: Text('${p.codigoDaCorrida} · ${dataHora(p.pedidaEm)}', style: AppText.bodyStrong)),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: Spacing.sm, vertical: 2),
                    decoration: BoxDecoration(color: p.cor.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(Radii.pill)),
                    child: Text(p.situacao, style: AppText.caption.copyWith(color: p.cor, fontWeight: FontWeight.w700)),
                  ),
                ],
              ),
              const SizedBox(height: Spacing.xs),
              Text('Item: ${p.descricao}', style: AppText.body),
              Text('Coleta: ${p.coleta}', style: AppText.caption, maxLines: 2, overflow: TextOverflow.ellipsis),
              Text('Entrega: ${p.entrega}', style: AppText.caption, maxLines: 2, overflow: TextOverflow.ellipsis),
              Text('Quem pediu: ${p.cliente} · Quem recebe: ${p.quemRecebe} ${telefoneBonito(p.telefoneDeQuemRecebe)}', style: AppText.caption),
              Text(
                '${p.motorista == null ? 'Sem motorista ainda' : 'Motorista: ${p.motorista}'} · ${reais(p.valorCents)} · código ${p.codigo}',
                style: AppText.caption.copyWith(color: AppColors.textMuted),
              ),
              if (travada) ...[
                const SizedBox(height: Spacing.sm),
                Text(
                  'Código errado 5 vezes. Ligue para quem recebe, confira e libere.',
                  style: AppText.caption.copyWith(color: AppColors.danger, fontWeight: FontWeight.w700),
                ),
                OutlinedButton(onPressed: aoLiberar, child: const Text('Liberar código')),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
