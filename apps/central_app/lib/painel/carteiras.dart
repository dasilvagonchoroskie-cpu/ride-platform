import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api/api_client.dart';
import '../core/theme/central_theme.dart';
import 'comuns.dart';
import 'painel_state.dart';

// ---------------------------------------------------------------------------
// Dados da carteira (formato do servidor: /admin/wallets e
// /admin/drivers/:id/wallet). Dinheiro em centavos inteiros.
// ---------------------------------------------------------------------------

int _int(Object? v) => v is num ? v.toInt() : int.tryParse('$v') ?? 0;

class SaldoMotorista {
  const SaldoMotorista({
    required this.id,
    required this.nome,
    required this.telefone,
    required this.status,
    required this.online,
    required this.saldoCents,
    required this.bloqueado,
  });

  final String id;
  final String nome;
  final String? telefone;
  final String status;
  final bool online;
  final int saldoCents;
  final bool bloqueado;

  factory SaldoMotorista.fromJson(Map<String, dynamic> j) => SaldoMotorista(
        id: '${j['driverId']}',
        nome: '${j['name'] ?? 'Motorista'}',
        telefone: j['phone'] as String?,
        status: '${j['status'] ?? ''}',
        online: j['isOnline'] == true,
        saldoCents: _int(j['balanceCents']),
        bloqueado: j['blocking'] == true,
      );
}

class Lancamento {
  const Lancamento({
    required this.credito,
    required this.valorCents,
    required this.saldoDepoisCents,
    required this.descricao,
    required this.quando,
    required this.corrida,
  });

  final bool credito;
  final int valorCents;
  final int saldoDepoisCents;
  final String descricao;
  final DateTime? quando;
  final String? corrida;

  factory Lancamento.fromJson(Map<String, dynamic> j) {
    final valor = _int(j['amountCents']);
    return Lancamento(
      credito: (j['kind'] ?? (valor >= 0 ? 'CREDIT' : 'DEBIT')) == 'CREDIT',
      valorCents: valor,
      saldoDepoisCents: _int(j['balanceAfterCents']),
      descricao: '${j['description'] ?? ''}',
      quando: DateTime.tryParse('${j['createdAt']}')?.toLocal(),
      corrida: j['rideCode'] as String?,
    );
  }
}

class Carteira {
  const Carteira({
    required this.saldoCents,
    required this.minimoCents,
    required this.bloqueado,
    required this.bloqueioLigado,
    required this.lancamentos,
  });

  final int saldoCents;
  final int minimoCents;
  final bool bloqueado;
  final bool bloqueioLigado;
  final List<Lancamento> lancamentos;

  factory Carteira.fromJson(Map<String, dynamic> j) => Carteira(
        saldoCents: _int(j['balanceCents']),
        minimoCents: _int(j['minimumCents']),
        bloqueado: j['blocking'] == true,
        bloqueioLigado: j['blockEnabled'] == true,
        lancamentos: [
          for (final t in (j['transactions'] as List? ?? const []).whereType<Map<String, dynamic>>()) Lancamento.fromJson(t),
        ],
      );
}

class _CarteiraApi {
  _CarteiraApi(this._c, this._praca);

  final ApiClient _c;

  /// Cidade escolhida pelo dono no topo (null = todas).
  final String? _praca;

  Future<(List<SaldoMotorista>, int, bool)> todas() async {
    final r = await _c.request('GET', '/admin/wallets', query: _praca == null ? null : {'praca': _praca}) as Map<String, dynamic>;
    return (
      [for (final j in (r['items'] as List? ?? const []).whereType<Map<String, dynamic>>()) SaldoMotorista.fromJson(j)],
      _int(r['minimumCents']),
      r['blockEnabled'] == true,
    );
  }

  Future<Carteira> carteira(String id) async =>
      Carteira.fromJson(await _c.request('GET', '/admin/drivers/$id/wallet') as Map<String, dynamic>);

  Future<Carteira> lancar(String id, {required bool adicionar, required int cents, required String observacao}) async =>
      Carteira.fromJson(await _c.request('POST', '/admin/drivers/$id/wallet/credit', body: {
        'amountCents': cents,
        'operation': adicionar ? 'CREDIT' : 'DEBIT',
        if (observacao.trim().isNotEmpty) 'description': observacao.trim(),
      }) as Map<String, dynamic>);

  Future<Map<String, dynamic>> regras() async => await _c.request('GET', '/admin/settings/central') as Map<String, dynamic>;

  Future<Map<String, dynamic>> salvarRegras(Map<String, dynamic> dados) async =>
      await _c.request('PUT', '/admin/settings/central', body: dados) as Map<String, dynamic>;
}

_CarteiraApi _api(BuildContext context) {
  final api = Provider.of<PainelState>(context, listen: false).api;
  return _CarteiraApi(api.cliente, api.praca);
}

// ---------------------------------------------------------------------------
// Aba "Carteiras / Recargas": regras + lista de motoristas com o saldo
// ---------------------------------------------------------------------------

class CarteirasTela extends StatefulWidget {
  const CarteirasTela({super.key});

  @override
  State<CarteirasTela> createState() => _CarteirasTelaState();
}

class _CarteirasTelaState extends State<CarteirasTela> {
  late Future<(List<SaldoMotorista>, int, bool)> _lista;
  String _busca = '';
  bool _soBloqueados = false;

  @override
  void initState() {
    super.initState();
    _lista = _api(context).todas();
  }

  void _recarregar() => setState(() { _lista = _api(context).todas(); });

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<(List<SaldoMotorista>, int, bool)>(
      future: _lista,
      builder: (context, s) {
        if (s.hasError) return Aviso(texto: 'Não foi possível carregar: ${s.error}', tentarDeNovo: _recarregar);
        if (!s.hasData) return const Center(child: CircularProgressIndicator());
        final (todos, minimo, ligado) = s.data!;
        // Sem saldo = igual ou menor que o minimo: nao consegue ficar online.
        bool semSaldo(SaldoMotorista m) => m.saldoCents <= minimo;
        final termo = _busca.trim().toLowerCase();
        final lista = todos
            .where((m) => !_soBloqueados || semSaldo(m))
            .where((m) => termo.isEmpty || m.nome.toLowerCase().contains(termo) || (m.telefone ?? '').contains(termo))
            .toList();
        final quantosSemSaldo = todos.where(semSaldo).length;
        return RefreshIndicator(
          onRefresh: () async => _recarregar(),
          child: ListView(
            padding: const EdgeInsets.all(Spacing.md),
            children: [
              _Regras(minimoCents: minimo, ligado: ligado, depois: _recarregar),
              const SizedBox(height: Spacing.md),
              TextField(
                style: AppText.body,
                decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Buscar motorista por nome ou telefone'),
                onChanged: (v) => setState(() => _busca = v),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _soBloqueados,
                title: Text('Só quem está sem saldo ($quantosSemSaldo)', style: AppText.body),
                onChanged: (v) => setState(() => _soBloqueados = v),
              ),
              if (lista.isEmpty) const Aviso(texto: 'Nenhum motorista encontrado.'),
              for (final m in lista)
                Padding(
                  padding: const EdgeInsets.only(bottom: Spacing.xs),
                  child: Material(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(Radii.md),
                    child: ListTile(
                      leading: Icon(
                        semSaldo(m) ? Icons.money_off : Icons.account_balance_wallet_outlined,
                        color: semSaldo(m) ? AppColors.danger : AppColors.success,
                      ),
                      title: Text(m.nome, style: AppText.bodyStrong),
                      subtitle: Text(
                        '${telefoneBonito(m.telefone)}${semSaldo(m) ? '\nSem saldo: não consegue ficar online' : ''}',
                        style: AppText.caption.copyWith(color: semSaldo(m) ? AppColors.danger : AppColors.textMuted),
                      ),
                      trailing: Text(
                        reais(m.saldoCents),
                        style: AppText.bodyStrong.copyWith(color: m.saldoCents <= 0 ? AppColors.danger : AppColors.text),
                      ),
                      onTap: () async {
                        await Navigator.of(context).push(MaterialPageRoute<void>(
                          builder: (_) => CarteiraMotoristaTela(driverId: m.id, nome: m.nome),
                        ));
                        _recarregar();
                      },
                    ),
                  ),
                ),
              const SizedBox(height: Spacing.xl),
            ],
          ),
        );
      },
    );
  }
}

/// Regras da carteira e dados do PIX da Central (onde o motorista paga a recarga).
class _Regras extends StatefulWidget {
  const _Regras({required this.minimoCents, required this.ligado, required this.depois});

  final int minimoCents;
  final bool ligado;
  final VoidCallback depois;

  @override
  State<_Regras> createState() => _RegrasState();
}

class _RegrasState extends State<_Regras> {
  final _minimo = TextEditingController();
  final _pix = TextEditingController();
  final _titular = TextEditingController();
  final _whats = TextEditingController();
  late bool _ligado = widget.ligado;
  bool _aberto = false;
  bool _salvando = false;

  @override
  void initState() {
    super.initState();
    _minimo.text = paraReais(widget.minimoCents);
    _api(context).regras().then((r) {
      if (!mounted) return;
      final c = r['central'] is Map ? r['central'] as Map : const {};
      setState(() {
        _pix.text = '${c['pixKey'] ?? ''}';
        _titular.text = '${c['pixHolder'] ?? ''}';
        _whats.text = '${c['whatsapp'] ?? ''}';
      });
    }).catchError((_) {});
  }

  @override
  void dispose() {
    for (final c in [_minimo, _pix, _titular, _whats]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _salvar() async {
    final minimo = centavos(_minimo.text);
    if (minimo == null || minimo < 0) {
      avisar(context, 'Saldo mínimo inválido.', erro: true);
      return;
    }
    final whats = _whats.text.replaceAll(RegExp(r'\D'), '');
    setState(() => _salvando = true);
    final ok = await tentar(
      context,
      () => _api(context).salvarRegras({
        'minimumCents': minimo,
        'blockWhenInsufficient': _ligado,
        'pixKey': _pix.text.trim().isEmpty ? null : _pix.text.trim(),
        'pixHolder': _titular.text.trim().isEmpty ? null : _titular.text.trim(),
        'whatsapp': whats.isEmpty ? null : whats,
      }),
      sucesso: 'Regras da carteira salvas.',
    );
    if (!mounted) return;
    setState(() => _salvando = false);
    if (ok) widget.depois();
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(Radii.md),
      child: Padding(
        padding: const EdgeInsets.all(Spacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            InkWell(
              onTap: () => setState(() => _aberto = !_aberto),
              child: Row(
                children: [
                  const Expanded(child: Text('Regras da carteira pré-paga', style: AppText.heading)),
                  Icon(_aberto ? Icons.expand_less : Icons.expand_more, color: AppColors.textMuted),
                ],
              ),
            ),
            Text(
              'Para ficar online o motorista precisa de saldo acima de ${reais(widget.minimoCents)}. '
              '${_ligado ? 'Se o saldo acabar no meio do turno, ele também deixa de receber corridas.' : 'Se o saldo acabar no meio do turno, ele continua recebendo e o débito fica registrado.'}',
              style: AppText.caption.copyWith(color: _ligado ? AppColors.warning : AppColors.textMuted),
            ),
            if (_aberto) ...[
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _ligado,
                title: const Text('Cortar chamados de quem ficar sem saldo no meio do turno', style: AppText.body),
                onChanged: (v) => setState(() => _ligado = v),
              ),
              TextField(
                controller: _minimo,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                style: AppText.body,
                decoration: const InputDecoration(labelText: 'Saldo mínimo (R\$) — para ficar online precisa ter mais que isto'),
              ),
              TextField(controller: _pix, style: AppText.body, decoration: const InputDecoration(labelText: 'Chave PIX da Central (para recargas)')),
              TextField(controller: _titular, style: AppText.body, decoration: const InputDecoration(labelText: 'Nome do titular do PIX')),
              TextField(
                controller: _whats,
                keyboardType: TextInputType.phone,
                style: AppText.body,
                decoration: const InputDecoration(labelText: 'WhatsApp da Central (com 55 e DDD)'),
              ),
              const SizedBox(height: Spacing.sm),
              FilledButton(onPressed: _salvando ? null : _salvar, child: Text(_salvando ? 'Salvando...' : 'Salvar regras')),
            ],
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Carteira de um motorista: saldo, recarga manual e extrato
// ---------------------------------------------------------------------------

class CarteiraMotoristaTela extends StatefulWidget {
  const CarteiraMotoristaTela({super.key, required this.driverId, required this.nome});

  final String driverId;
  final String nome;

  @override
  State<CarteiraMotoristaTela> createState() => _CarteiraMotoristaTelaState();
}

class _CarteiraMotoristaTelaState extends State<CarteiraMotoristaTela> {
  final _valor = TextEditingController();
  final _obs = TextEditingController();
  bool _adicionar = true;
  bool _enviando = false;
  Carteira? _c;
  String? _erro;

  @override
  void initState() {
    super.initState();
    _carregar();
  }

  @override
  void dispose() {
    _valor.dispose();
    _obs.dispose();
    super.dispose();
  }

  Future<void> _carregar() async {
    setState(() => _erro = null);
    try {
      final c = await _api(context).carteira(widget.driverId);
      if (mounted) setState(() => _c = c);
    } catch (e) {
      if (mounted) setState(() => _erro = mensagemDe(e));
    }
  }

  Future<void> _confirmar() async {
    final c = _c;
    final cents = centavos(_valor.text);
    if (c == null) return;
    if (cents == null || cents <= 0) {
      avisar(context, 'Digite o valor em reais (ex.: 50,00).', erro: true);
      return;
    }
    final novo = c.saldoCents + (_adicionar ? cents : -cents);
    final certo = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: Text(_adicionar ? 'Adicionar saldo' : 'Remover saldo'),
        content: Text(
          '${_adicionar ? 'Adicionar' : 'Remover'} ${reais(cents)} ${_adicionar ? 'na' : 'da'} carteira de ${widget.nome}?\n\n'
          'Saldo atual: ${reais(c.saldoCents)}\nSaldo depois: ${reais(novo)}',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Voltar')),
          FilledButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Confirmar')),
        ],
      ),
    );
    if (certo != true || !mounted) return;
    setState(() => _enviando = true);
    try {
      final atual = await _api(context).lancar(widget.driverId, adicionar: _adicionar, cents: cents, observacao: _obs.text);
      if (!mounted) return;
      setState(() {
        _c = atual;
        _valor.clear();
        _obs.clear();
      });
      avisar(
        context,
        '${_adicionar ? 'Recarga' : 'Remoção'} confirmada. Saldo: ${reais(atual.saldoCents)}. '
        'O aplicativo do motorista atualiza em até 20 segundos.',
      );
    } catch (e) {
      if (mounted) avisar(context, mensagemDe(e), erro: true);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = _c;
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: Text('Carteira de ${widget.nome}')),
      body: _erro != null
          ? Aviso(texto: 'Não foi possível carregar: $_erro', tentarDeNovo: _carregar)
          : c == null
              ? const Center(child: CircularProgressIndicator())
              : RefreshIndicator(
                  onRefresh: _carregar,
                  child: ListView(
                    padding: const EdgeInsets.all(Spacing.md),
                    children: [
                      // 1. Saldo
                      Material(
                        color: AppColors.surface,
                        borderRadius: BorderRadius.circular(Radii.md),
                        child: Padding(
                          padding: const EdgeInsets.all(Spacing.lg),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Saldo atual', style: AppText.caption.copyWith(color: AppColors.textMuted)),
                              Text(
                                reais(c.saldoCents),
                                style: AppText.display.copyWith(color: c.saldoCents <= 0 ? AppColors.danger : AppColors.success),
                              ),
                              const SizedBox(height: Spacing.xs),
                              Text(
                                c.saldoCents <= c.minimoCents
                                    ? 'Sem saldo: não consegue ficar online até a recarga.'
                                    : 'Pode ficar online. Com ${reais(c.minimoCents)} ou menos, precisa de recarga.',
                                style: AppText.caption.copyWith(
                                  color: c.saldoCents <= c.minimoCents ? AppColors.danger : AppColors.textMuted,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: Spacing.md),
                      // 2. Recarga manual
                      Material(
                        color: AppColors.surface,
                        borderRadius: BorderRadius.circular(Radii.md),
                        child: Padding(
                          padding: const EdgeInsets.all(Spacing.md),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              const Text('Recarga manual', style: AppText.heading),
                              const SizedBox(height: Spacing.sm),
                              SegmentedButton<bool>(
                                segments: const [
                                  ButtonSegment(value: true, label: Text('Adicionar saldo (+)')),
                                  ButtonSegment(value: false, label: Text('Remover saldo (-)')),
                                ],
                                showSelectedIcon: false,
                                selected: {_adicionar},
                                onSelectionChanged: (s) => setState(() => _adicionar = s.first),
                              ),
                              TextField(
                                controller: _valor,
                                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                                style: AppText.body,
                                decoration: const InputDecoration(labelText: 'Valor (R\$)', hintText: '50,00'),
                              ),
                              TextField(
                                controller: _obs,
                                maxLength: 200,
                                style: AppText.body,
                                decoration: const InputDecoration(labelText: 'Observação', hintText: 'Recarga PIX comprovante #1234'),
                              ),
                              FilledButton.icon(
                                style: FilledButton.styleFrom(
                                  minimumSize: const Size.fromHeight(48),
                                  backgroundColor: _adicionar ? AppColors.success : AppColors.danger,
                                ),
                                onPressed: _enviando ? null : _confirmar,
                                icon: Icon(_adicionar ? Icons.check : Icons.remove_circle_outline),
                                label: Text(_enviando ? 'Enviando...' : 'Confirmar Recarga'),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: Spacing.md),
                      // 3. Extrato
                      Text('Extrato (${c.lancamentos.length} últimos)', style: AppText.heading),
                      const SizedBox(height: Spacing.xs),
                      if (c.lancamentos.isEmpty)
                        Text('Nenhuma movimentação ainda.', style: AppText.body.copyWith(color: AppColors.textMuted)),
                      for (final l in c.lancamentos) _LinhaExtrato(l: l),
                      const SizedBox(height: Spacing.xl),
                    ],
                  ),
                ),
    );
  }
}

/// Uma linha do extrato: Data, Tipo, Valor, Descricao e Saldo restante.
class _LinhaExtrato extends StatelessWidget {
  const _LinhaExtrato({required this.l});

  final Lancamento l;

  @override
  Widget build(BuildContext context) {
    final cor = l.credito ? AppColors.success : AppColors.danger;
    return Container(
      margin: const EdgeInsets.only(bottom: Spacing.xs),
      padding: const EdgeInsets.all(Spacing.md),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(Radii.sm),
        border: Border(left: BorderSide(color: cor, width: 3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Data e tipo podem quebrar linha no celular; o valor fica sempre a direita.
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Wrap(
                  spacing: Spacing.sm,
                  runSpacing: 2,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text(dataHora(l.quando), style: AppText.caption.copyWith(color: AppColors.textMuted)),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                      decoration: BoxDecoration(color: cor.withValues(alpha: 0.18), borderRadius: BorderRadius.circular(Radii.sm)),
                      child: Text(l.credito ? 'Crédito' : 'Débito', style: AppText.caption.copyWith(color: cor)),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: Spacing.sm),
              Text(
                '${l.credito ? '+' : '-'} ${reais(l.valorCents.abs())}',
                style: AppText.bodyStrong.copyWith(color: cor),
              ),
            ],
          ),
          const SizedBox(height: 2),
          Text(
            l.corrida == null ? l.descricao : '${l.descricao} (corrida ${l.corrida})',
            style: AppText.body,
          ),
          Text('Saldo restante: ${reais(l.saldoDepoisCents)}', style: AppText.caption.copyWith(color: AppColors.textMuted)),
        ],
      ),
    );
  }
}
