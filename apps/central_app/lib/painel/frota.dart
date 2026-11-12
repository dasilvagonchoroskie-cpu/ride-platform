import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/central_theme.dart';
import '../data/painel.dart';
import '../widgets/ui.dart';
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
class DetalheDoVeiculo extends StatelessWidget {
  const DetalheDoVeiculo({super.key, required this.veiculo, required this.api});

  final VeiculoDaFrota veiculo;
  final PainelApi api;

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
          Text(
            'A validade do documento ainda não é registrada pelo sistema: confira a data na foto do CRLV.',
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
