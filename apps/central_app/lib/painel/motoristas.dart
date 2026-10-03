import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/central_theme.dart';
import '../data/painel.dart';
import 'comuns.dart';
import 'painel_state.dart';

/// Gestao de Motoristas: Pendente, Ativo, Suspenso, Bloqueado.
class Motoristas extends StatefulWidget {
  const Motoristas({super.key});

  @override
  State<Motoristas> createState() => _MotoristasState();
}

class _MotoristasState extends State<Motoristas> {
  static const _situacoes = [('PENDING', 'Pendentes'), ('APPROVED', 'Ativos'), ('SUSPENDED', 'Suspensos'), ('BLOCKED', 'Bloqueados')];
  String _situacao = 'PENDING';
  late Future<List<MotoristaCadastro>> _lista;

  PainelApi get _api => Provider.of<PainelState>(context, listen: false).api;

  @override
  void initState() {
    super.initState();
    _lista = _api.motoristas(_situacao);
  }

  void _recarregar() => setState(() => _lista = _api.motoristas(_situacao));

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
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
          child: FutureBuilder<List<MotoristaCadastro>>(
            future: _lista,
            builder: (context, s) {
              if (s.hasError) return Aviso(texto: 'Não foi possível carregar: ${s.error}', tentarDeNovo: _recarregar);
              if (!s.hasData) return const Center(child: CircularProgressIndicator());
              final lista = s.data!;
              if (lista.isEmpty) return const Aviso(texto: 'Nenhum motorista nesta situação.');
              return RefreshIndicator(
                onRefresh: () async => _recarregar(),
                child: ListView.separated(
                  padding: const EdgeInsets.fromLTRB(Spacing.md, 0, Spacing.md, Spacing.xl),
                  itemCount: lista.length,
                  separatorBuilder: (context, index) => const SizedBox(height: Spacing.sm),
                  itemBuilder: (context, i) {
                    final m = lista[i];
                    final pendentes = m.documentos.where((d) => d.status == 'PENDING').length;
                    return Material(
                      color: AppColors.surface,
                      borderRadius: BorderRadius.circular(Radii.md),
                      child: ListTile(
                        title: Text(m.nome, style: AppText.bodyStrong),
                        subtitle: Text(
                          '${telefoneBonito(m.telefone)}\n${m.veiculo.isEmpty ? 'Sem veículo' : '${m.veiculo} · ${m.placa}'} · ${m.categoria}'
                          '${m.documentos.isEmpty ? '\nSem fotos de documentos' : '\n${m.documentos.length} foto(s) de documento${pendentes > 0 ? ', $pendentes para conferir' : ''}'}',
                          style: AppText.caption.copyWith(color: AppColors.textMuted),
                        ),
                        isThreeLine: true,
                        trailing: m.online ? const Icon(Icons.circle, color: AppColors.success, size: 12) : null,
                        onTap: () async {
                          await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => DetalheMotorista(id: m.id)));
                          _recarregar();
                        },
                      ),
                    );
                  },
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class DetalheMotorista extends StatefulWidget {
  const DetalheMotorista({super.key, required this.id});

  final String id;

  @override
  State<DetalheMotorista> createState() => _DetalheMotoristaState();
}

class _DetalheMotoristaState extends State<DetalheMotorista> {
  late Future<MotoristaDetalhe> _dados;
  List<Categoria> _categorias = const [];

  PainelApi get _api => Provider.of<PainelState>(context, listen: false).api;

  @override
  void initState() {
    super.initState();
    _dados = _api.motorista(widget.id);
    _api.tarifas().then((t) {
      if (mounted) setState(() => _categorias = t.categorias);
    }).catchError((_) {});
  }

  void _recarregar() => setState(() => _dados = _api.motorista(widget.id));

  Future<void> _mudarStatus(MotoristaDetalhe d, String status, String titulo, String explicacao) async {
    final motivo = await pedirTexto(
      context,
      titulo: titulo,
      rotulo: status == 'APPROVED' ? 'Anotação da conferência' : 'Justificativa',
      explicacao: explicacao,
      confirmar: titulo,
    );
    if (motivo == null || !mounted) return;
    if (status == 'APPROVED' && motivo.length < 10) {
      avisar(context, 'Descreva o que conferiu pessoalmente (pelo menos 10 letras).', erro: true);
      return;
    }
    final ok = await tentar(context, () => _api.mudarStatusMotorista(d.base.id, status, motivo), sucesso: 'Pronto: ${nomeDoStatusMotorista(status)}.');
    if (ok) _recarregar();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Motorista')),
      body: FutureBuilder<MotoristaDetalhe>(
        future: _dados,
        builder: (context, s) {
          if (s.hasError) return Aviso(texto: 'Não foi possível carregar: ${s.error}', tentarDeNovo: _recarregar);
          if (!s.hasData) return const Center(child: CircularProgressIndicator());
          final d = s.data!;
          final m = d.base;
          return ListView(
            padding: const EdgeInsets.all(Spacing.lg),
            children: [
              Row(
                children: [
                  if (d.avatarUrl != null)
                    Padding(
                      padding: const EdgeInsets.only(right: Spacing.md),
                      child: FotoDoServidor(caminho: d.avatarUrl!, largura: 64, altura: 64, redonda: true),
                    ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(m.nome, style: AppText.title),
                        Text(
                          '${nomeDoStatusMotorista(m.status)}${m.online ? ' · online' : ''} · nota ${d.nota.toStringAsFixed(1)} · ${d.corridas} corridas',
                          style: AppText.caption.copyWith(color: AppColors.textMuted),
                        ),
                      ],
                    ),
                  ),
                  BotoesContato(telefone: m.telefone),
                ],
              ),
              if (m.motivo != null && m.status != 'APPROVED')
                Padding(
                  padding: const EdgeInsets.only(top: Spacing.sm),
                  child: Text('Motivo: ${m.motivo}', style: AppText.caption.copyWith(color: AppColors.warning)),
                ),
              const SizedBox(height: Spacing.lg),
              _Bloco(
                titulo: 'Dados',
                filhos: [
                  Linha('Telefone', telefoneBonito(m.telefone)),
                  Linha('E-mail', m.email.isEmpty ? '-' : m.email),
                  Linha('CPF', d.cpf),
                  Linha('CNH', '${d.cnh} · categoria ${d.categoriaCnh}'),
                  Linha('Validade da CNH', d.validadeCnh == null ? '-' : '${d.validadeCnh!.day.toString().padLeft(2, '0')}/${d.validadeCnh!.month.toString().padLeft(2, '0')}/${d.validadeCnh!.year}'),
                  Linha('Veículo', m.veiculo.isEmpty ? '-' : '${m.veiculo} · ${m.placa}'),
                  Linha('Cadastro', dataHora(m.cadastradoEm)),
                ],
              ),
              _Bloco(
                titulo: 'Documentos',
                filhos: [
                  if (m.documentos.isEmpty)
                    Text(
                      'O motorista ainda não enviou fotos. Confira os originais pessoalmente (CNH com EAR, CRLV em dia, antecedentes criminais).',
                      style: AppText.caption.copyWith(color: AppColors.textMuted),
                    ),
                  for (final doc in m.documentos) _Documento(doc: doc, api: _api, depois: _recarregar),
                ],
              ),
              _Bloco(
                titulo: 'Categoria do veículo',
                filhos: [
                  DropdownButtonFormField<String>(
                    isExpanded: true,
                    initialValue: _categorias.any((c) => c.codigo == m.categoria) ? m.categoria : null,
                    hint: Text(m.categoria),
                    decoration: const InputDecoration(labelText: 'Recebe chamados de'),
                    items: [for (final c in _categorias) DropdownMenuItem(value: c.codigo, child: Text(c.nome))],
                    onChanged: (v) async {
                      if (v == null) return;
                      final ok = await tentar(context, () => _api.categoriaDoVeiculo(m.id, v), sucesso: 'Categoria alterada.');
                      if (ok) _recarregar();
                    },
                  ),
                ],
              ),
              _Financeiro(d: d, api: _api, depois: _recarregar),
              _Carteira(d: d, api: _api, depois: _recarregar),
              const SizedBox(height: Spacing.md),
              Wrap(
                spacing: Spacing.sm,
                runSpacing: Spacing.sm,
                children: [
                  if (m.status != 'APPROVED')
                    FilledButton.icon(
                      icon: const Icon(Icons.verified),
                      label: Text(m.status == 'PENDING' ? 'Aprovar' : 'Reativar'),
                      onPressed: () => _mudarStatus(
                        d,
                        'APPROVED',
                        m.status == 'PENDING' ? 'Aprovar' : 'Reativar',
                        'Confirme que conferiu os documentos originais e o veículo.',
                      ),
                    ),
                  if (m.status == 'PENDING')
                    OutlinedButton(
                      onPressed: () => _mudarStatus(d, 'REJECTED', 'Recusar cadastro', 'O motorista vê o motivo no aplicativo.'),
                      child: const Text('Recusar cadastro'),
                    ),
                  if (m.status == 'APPROVED')
                    OutlinedButton(
                      onPressed: () => _mudarStatus(d, 'SUSPENDED', 'Suspender', 'Ele fica sem receber corridas até ser reativado.'),
                      child: const Text('Suspender'),
                    ),
                  if (m.status != 'BLOCKED')
                    OutlinedButton(
                      style: OutlinedButton.styleFrom(foregroundColor: AppColors.danger),
                      onPressed: () => _mudarStatus(d, 'BLOCKED', 'Bloquear', 'Bloqueio por falta grave. Ele não recebe corridas.'),
                      child: const Text('Bloquear'),
                    ),
                ],
              ),
              const SizedBox(height: Spacing.xl),
            ],
          );
        },
      ),
    );
  }
}

class _Bloco extends StatelessWidget {
  const _Bloco({required this.titulo, required this.filhos});

  final String titulo;
  final List<Widget> filhos;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: Spacing.md),
      padding: const EdgeInsets.all(Spacing.md),
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(Radii.md)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [Text(titulo, style: AppText.heading), const SizedBox(height: Spacing.sm), ...filhos],
      ),
    );
  }
}

class _Documento extends StatelessWidget {
  const _Documento({required this.doc, required this.api, required this.depois});

  final DocumentoFoto doc;
  final PainelApi api;
  final VoidCallback depois;

  @override
  Widget build(BuildContext context) {
    final cor = switch (doc.status) {
      'APPROVED' => AppColors.success,
      'REJECTED' => AppColors.danger,
      _ => AppColors.warning,
    };
    final rotulo = switch (doc.status) {
      'APPROVED' => 'Aprovado',
      'REJECTED' => 'Rejeitado',
      _ => 'Para conferir',
    };
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: Spacing.sm),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (doc.url != null) FotoDoServidor(caminho: doc.url!, largura: 96, altura: 72) else const SizedBox(width: 96, height: 72),
          const SizedBox(width: Spacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(doc.nome, style: AppText.bodyStrong),
                Text(rotulo, style: AppText.caption.copyWith(color: cor)),
                if (doc.motivo != null) Text(doc.motivo!, style: AppText.caption.copyWith(color: AppColors.textMuted)),
                if (doc.status == 'PENDING')
                  Wrap(
                    children: [
                      TextButton(
                        onPressed: () async {
                          final ok = await tentar(context, () => api.avaliarDocumento(doc.id, true, null), sucesso: 'Documento aprovado.');
                          if (ok) depois();
                        },
                        child: const Text('Aprovar'),
                      ),
                      TextButton(
                        onPressed: () async {
                          final motivo = await pedirTexto(
                            context,
                            titulo: 'Rejeitar ${doc.nome}',
                            rotulo: 'Justificativa',
                            explicacao: 'O motorista vê o motivo e manda outra foto.',
                            confirmar: 'Rejeitar',
                          );
                          if (motivo == null || !context.mounted) return;
                          final ok = await tentar(context, () => api.avaliarDocumento(doc.id, false, motivo), sucesso: 'Documento rejeitado.');
                          if (ok) depois();
                        },
                        child: const Text('Rejeitar', style: TextStyle(color: AppColors.danger)),
                      ),
                    ],
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Modelo financeiro: comissao padrao, % proprio, taxa fixa ou mensalidade.
class _Financeiro extends StatefulWidget {
  const _Financeiro({required this.d, required this.api, required this.depois});

  final MotoristaDetalhe d;
  final PainelApi api;
  final VoidCallback depois;

  @override
  State<_Financeiro> createState() => _FinanceiroState();
}

class _FinanceiroState extends State<_Financeiro> {
  late String _modelo = widget.d.modelo;
  late final _valor = TextEditingController(text: _valorInicial());
  bool _salvando = false;

  String _valorInicial() {
    final d = widget.d;
    return switch (d.modelo) {
      'PERCENTUAL' => d.comissaoPercent?.toStringAsFixed(1).replaceAll('.', ',') ?? '',
      'TAXA_FIXA' => d.taxaFixaCents == null ? '' : paraReais(d.taxaFixaCents!),
      'MENSALIDADE' => d.mensalidadeCents == null ? '' : paraReais(d.mensalidadeCents!),
      _ => '',
    };
  }

  @override
  void dispose() {
    _valor.dispose();
    super.dispose();
  }

  Future<void> _salvar() async {
    final dados = <String, dynamic>{'financeModel': _modelo};
    if (_modelo == 'PERCENTUAL') {
      final v = double.tryParse(_valor.text.replaceAll(',', '.'));
      if (v == null || v < 0 || v > 100) {
        avisar(context, 'Comissão de 0 a 100%.', erro: true);
        return;
      }
      dados['commissionPercent'] = v;
    } else if (_modelo != 'PADRAO') {
      final c = centavos(_valor.text);
      if (c == null || c <= 0) {
        avisar(context, 'Informe o valor em reais.', erro: true);
        return;
      }
      dados[_modelo == 'TAXA_FIXA' ? 'fixedFeeCents' : 'monthlyFeeCents'] = c;
    }
    setState(() => _salvando = true);
    final ok = await tentar(context, () => widget.api.modeloFinanceiro(widget.d.base.id, dados), sucesso: 'Modelo financeiro salvo.');
    if (!mounted) return;
    setState(() => _salvando = false);
    if (ok) widget.depois();
  }

  @override
  Widget build(BuildContext context) {
    final rotulo = switch (_modelo) {
      'PERCENTUAL' => 'Comissão deste motorista (%)',
      'TAXA_FIXA' => 'Taxa fixa por corrida (R\$)',
      'MENSALIDADE' => 'Mensalidade (R\$)',
      _ => '',
    };
    return _Bloco(
      titulo: 'Modelo financeiro',
      filhos: [
        DropdownButtonFormField<String>(
          isExpanded: true,
          initialValue: _modelo,
          decoration: const InputDecoration(labelText: 'Como ele paga a plataforma'),
          items: const [
            DropdownMenuItem(value: 'PADRAO', child: Text('Comissão da categoria (padrão)')),
            DropdownMenuItem(value: 'PERCENTUAL', child: Text('Comissão própria (%)')),
            DropdownMenuItem(value: 'TAXA_FIXA', child: Text('Taxa fixa por corrida')),
            DropdownMenuItem(value: 'MENSALIDADE', child: Text('Mensalidade (sem comissão)')),
          ],
          onChanged: (v) => setState(() {
            _modelo = v ?? 'PADRAO';
            _valor.text = '';
          }),
        ),
        if (_modelo != 'PADRAO') ...[
          const SizedBox(height: Spacing.sm),
          TextField(
            controller: _valor,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            style: AppText.body,
            decoration: InputDecoration(labelText: rotulo),
          ),
        ],
        if (_modelo == 'MENSALIDADE')
          Padding(
            padding: const EdgeInsets.only(top: Spacing.xs),
            child: Text(
              widget.d.mensalidadePagaAte == null
                  ? 'A primeira mensalidade é descontada da carteira logo depois de salvar.'
                  : 'Paga até ${dataHora(widget.d.mensalidadePagaAte)}. A próxima é descontada da carteira no vencimento.',
              style: AppText.caption.copyWith(color: AppColors.textMuted),
            ),
          ),
        const SizedBox(height: Spacing.sm),
        FilledButton(onPressed: _salvando ? null : _salvar, child: Text(_salvando ? 'Salvando...' : 'Salvar modelo')),
      ],
    );
  }
}

class _Carteira extends StatelessWidget {
  const _Carteira({required this.d, required this.api, required this.depois});

  final MotoristaDetalhe d;
  final PainelApi api;
  final VoidCallback depois;

  @override
  Widget build(BuildContext context) {
    return _Bloco(
      titulo: 'Carteira pré-paga',
      filhos: [
        Text(reais(d.saldoCents), style: AppText.metric.copyWith(color: d.saldoCents < 0 ? AppColors.danger : AppColors.text)),
        const SizedBox(height: Spacing.sm),
        OutlinedButton.icon(
          icon: const Icon(Icons.add),
          label: const Text('Lançar crédito (venda de créditos)'),
          onPressed: () async {
            final texto = await pedirTexto(
              context,
              titulo: 'Crédito para ${d.base.nome}',
              rotulo: 'Valor em reais (ex.: 50,00)',
              explicacao: 'Use quando o motorista comprar créditos com a Central.',
              confirmar: 'Lançar',
              obrigatorio: false,
            );
            if (texto == null || !context.mounted) return;
            final c = centavos(texto);
            if (c == null || c <= 0) {
              avisar(context, 'Valor inválido.', erro: true);
              return;
            }
            final ok = await tentar(context, () => api.creditarCarteira(d.base.id, c, 'Compra de créditos na Central'), sucesso: 'Crédito lançado.');
            if (ok) depois();
          },
        ),
      ],
    );
  }
}
