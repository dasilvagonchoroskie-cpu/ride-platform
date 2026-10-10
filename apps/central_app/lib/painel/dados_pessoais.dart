import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/theme/central_theme.dart';
import '../data/painel.dart';
import '../widgets/ui.dart';
import 'comuns.dart';

/// Dados pessoais (Evandro, 10/10/2026): a Central muda os dados do
/// passageiro ou do motorista quando a pessoa pede, e aprova (ou recusa) os
/// pedidos de mudanca que o motorista manda pelo app.

/// Abre a tela de editar. Devolve true se salvou. [id] = conta ou motorista.
Future<bool> editarDadosDaPessoa(BuildContext context, PainelApi api, String id, {required String nome}) async {
  final salvou = await Navigator.of(context).push<bool>(
    MaterialPageRoute(builder: (_) => EditarDadosScreen(api: api, id: id, nome: nome)),
  );
  return salvou == true;
}

/// (chave, rotulo, teclado, so motorista)
const _campos = [
  ('name', 'Nome completo', TextInputType.name, false),
  ('phone', 'Telefone (com DDD)', TextInputType.phone, false),
  ('email', 'E-mail', TextInputType.emailAddress, false),
  ('endereco', 'Endereço (rua, número e bairro)', TextInputType.streetAddress, false),
  ('cpf', 'CPF (só números)', TextInputType.number, false),
  ('pixKey', 'Chave PIX', TextInputType.text, true),
  ('cnhNumber', 'Número da CNH', TextInputType.number, true),
  ('cnhCategory', 'Categoria da CNH (ex.: B, AB)', TextInputType.text, true),
];

String _dataBr(String? iso) {
  if (iso == null || iso.length < 10) return '-';
  return '${iso.substring(8, 10)}/${iso.substring(5, 7)}/${iso.substring(0, 4)}';
}

String _iso(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

class EditarDadosScreen extends StatefulWidget {
  const EditarDadosScreen({super.key, required this.api, required this.id, required this.nome});

  final PainelApi api;
  final String id;
  final String nome;

  @override
  State<EditarDadosScreen> createState() => _EditarDadosScreenState();
}

class _EditarDadosScreenState extends State<EditarDadosScreen> {
  final Map<String, TextEditingController> _c = {for (final f in _campos) f.$1: TextEditingController()};
  DadosPessoais? _atual;
  String? _nascimento;
  String? _validadeCnh;
  String? _erro;
  bool _salvando = false;

  @override
  void initState() {
    super.initState();
    _carregar();
  }

  @override
  void dispose() {
    for (final c in _c.values) {
      c.dispose();
    }
    super.dispose();
  }

  static String _semPais(String? t) => (t ?? '').replaceFirst(RegExp(r'^\+55'), '');

  Future<void> _carregar() async {
    setState(() => _erro = null);
    try {
      final d = await widget.api.dadosDaPessoa(widget.id);
      if (!mounted) return;
      setState(() {
        _atual = d;
        for (final f in _campos) {
          final v = d.dados[f.$1];
          _c[f.$1]!.text = f.$1 == 'phone' ? _semPais(v) : (v ?? '');
        }
        _nascimento = d.dados['birthDate'];
        _validadeCnh = d.dados['cnhExpiresAt'];
      });
    } catch (e) {
      if (mounted) setState(() => _erro = mensagemDe(e));
    }
  }

  Future<String?> _escolherData(String? atual, String titulo) async {
    final d = await showDatePicker(
      context: context,
      initialDate: DateTime.tryParse(atual ?? '') ?? DateTime(1990),
      firstDate: DateTime(1920),
      lastDate: DateTime(DateTime.now().year + 15),
      helpText: titulo,
    );
    return d == null ? null : _iso(d);
  }

  Map<String, String> _mudou() {
    final atual = _atual;
    if (atual == null) return const {};
    final r = <String, String>{};
    for (final f in _campos) {
      if (f.$4 && !atual.motorista) continue;
      final novo = _c[f.$1]!.text.trim();
      final antes = f.$1 == 'phone' ? _semPais(atual.dados['phone']) : (atual.dados[f.$1] ?? '');
      if (novo.isNotEmpty && novo != antes) r[f.$1] = novo;
    }
    if (_nascimento != null && _nascimento != atual.dados['birthDate']) r['birthDate'] = _nascimento!;
    if (atual.motorista && _validadeCnh != null && _validadeCnh != atual.dados['cnhExpiresAt']) {
      r['cnhExpiresAt'] = _validadeCnh!;
    }
    return r;
  }

  Future<void> _salvar() async {
    final mudou = _mudou();
    if (mudou.isEmpty) {
      setState(() => _erro = 'Nada mudou.');
      return;
    }
    setState(() {
      _salvando = true;
      _erro = null;
    });
    try {
      await widget.api.editarDados(widget.id, mudou);
      if (!mounted) return;
      avisar(context, 'Dados de ${widget.nome} atualizados.');
      Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) setState(() => _erro = mensagemDe(e));
    } finally {
      if (mounted) setState(() => _salvando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final atual = _atual;
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: Text('Editar dados · ${widget.nome}')),
      body: atual == null
          ? (_erro != null ? Aviso(texto: 'Não foi possível carregar: $_erro', tentarDeNovo: _carregar) : const Center(child: CircularProgressIndicator()))
          : ListView(
              padding: const EdgeInsets.all(Spacing.lg),
              children: [
                Text(
                  'Mude só o que a pessoa pediu. Telefone, e-mail, CPF e CNH não podem estar em outro cadastro.',
                  style: AppText.caption.copyWith(color: AppColors.textMuted),
                ),
                const SizedBox(height: Spacing.md),
                for (final f in _campos)
                  if (!f.$4 || atual.motorista) ...[
                    TextField(
                      controller: _c[f.$1],
                      enabled: !_salvando,
                      keyboardType: f.$3,
                      textCapitalization: f.$1 == 'name' || f.$1 == 'endereco' ? TextCapitalization.words : TextCapitalization.none,
                      inputFormatters: f.$1 == 'phone' || f.$1 == 'cpf' || f.$1 == 'cnhNumber'
                          ? [FilteringTextInputFormatter.digitsOnly]
                          : null,
                      decoration: InputDecoration(labelText: f.$2),
                    ),
                    const SizedBox(height: Spacing.md),
                  ],
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.cake_outlined),
                  title: const Text('Data de nascimento'),
                  subtitle: Text(_dataBr(_nascimento)),
                  trailing: const Icon(Icons.edit_calendar),
                  onTap: _salvando
                      ? null
                      : () async {
                          final d = await _escolherData(_nascimento, 'Data de nascimento');
                          if (d != null && mounted) setState(() => _nascimento = d);
                        },
                ),
                if (atual.motorista)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.event),
                    title: const Text('Validade da CNH'),
                    subtitle: Text(_dataBr(_validadeCnh)),
                    trailing: const Icon(Icons.edit_calendar),
                    onTap: _salvando
                        ? null
                        : () async {
                            final d = await _escolherData(_validadeCnh, 'Validade da CNH');
                            if (d != null && mounted) setState(() => _validadeCnh = d);
                          },
                  ),
                if (_erro != null) ...[
                  const SizedBox(height: Spacing.sm),
                  Text(_erro!, style: AppText.body.copyWith(color: AppColors.danger)),
                ],
                const SizedBox(height: Spacing.lg),
                AppButton(label: 'Salvar', loading: _salvando, onPressed: _salvar),
              ],
            ),
    );
  }
}

/// Lista dos pedidos de mudanca dos motoristas, com Aprovar e Recusar.
class PedidosDeAlteracaoScreen extends StatefulWidget {
  const PedidosDeAlteracaoScreen({super.key, required this.api});

  final PainelApi api;

  @override
  State<PedidosDeAlteracaoScreen> createState() => _PedidosDeAlteracaoScreenState();
}

class _PedidosDeAlteracaoScreenState extends State<PedidosDeAlteracaoScreen> {
  late Future<List<PedidoDeAlteracao>> _pedidos = widget.api.alteracoesPendentes();

  void _recarregar() => setState(() {
        _pedidos = widget.api.alteracoesPendentes();
      });

  Future<void> _aprovar(PedidoDeAlteracao p) async {
    final ok = await tentar(context, () => widget.api.aprovarAlteracao(p.userId), sucesso: 'Dados de ${p.nome} atualizados.');
    if (ok && mounted) _recarregar();
  }

  Future<void> _recusar(PedidoDeAlteracao p) async {
    final motivo = await pedirTexto(
      context,
      titulo: 'Recusar o pedido de ${p.nome}',
      explicacao: 'Ele vê o motivo no app. Nada muda nos dados.',
      confirmar: 'Recusar',
    );
    if (motivo == null || !mounted) return;
    final ok = await tentar(context, () => widget.api.recusarAlteracao(p.userId, motivo), sucesso: 'Pedido recusado.');
    if (ok && mounted) _recarregar();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Mudanças de dados para aprovar')),
      body: FutureBuilder<List<PedidoDeAlteracao>>(
        future: _pedidos,
        builder: (context, s) {
          if (s.hasError) return Aviso(texto: 'Não foi possível carregar: ${s.error}', tentarDeNovo: _recarregar);
          if (!s.hasData) return const Center(child: CircularProgressIndicator());
          final lista = s.data!;
          if (lista.isEmpty) return const Aviso(texto: 'Nenhum pedido esperando.', icone: Icons.check_circle_outline);
          return ListView(
            padding: const EdgeInsets.all(Spacing.lg),
            children: [
              for (final p in lista)
                Padding(
                  padding: const EdgeInsets.only(bottom: Spacing.md),
                  child: AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(p.nome, style: AppText.heading),
                      Text(
                        '${telefoneBonito(p.telefone)}${p.pedidaEm == null ? '' : ' · pedido em ${dataHora(p.pedidaEm!)}'}',
                        style: AppText.caption.copyWith(color: AppColors.textMuted),
                      ),
                      const SizedBox(height: Spacing.sm),
                      for (final m in p.mudancas)
                        Padding(
                          padding: const EdgeInsets.only(bottom: Spacing.xs),
                          child: Text.rich(TextSpan(children: [
                            TextSpan(text: '${m.rotulo}: ', style: AppText.bodyStrong),
                            TextSpan(text: '${m.de ?? '-'}  →  ', style: AppText.body.copyWith(color: AppColors.textMuted)),
                            TextSpan(text: m.para ?? '-', style: AppText.bodyStrong.copyWith(color: AppColors.brandDark)),
                          ])),
                        ),
                      const SizedBox(height: Spacing.sm),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              style: OutlinedButton.styleFrom(foregroundColor: AppColors.danger),
                              onPressed: () => _recusar(p),
                              child: const Text('Recusar'),
                            ),
                          ),
                          const SizedBox(width: Spacing.sm),
                          Expanded(
                            child: FilledButton.icon(
                              icon: const Icon(Icons.check),
                              label: const Text('Aprovar'),
                              onPressed: () => _aprovar(p),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                ),
            ],
          );
        },
      ),
    );
  }
}

/// Faixa laranja no topo de Motoristas quando ha pedidos esperando.
class FaixaPedidosDeAlteracao extends StatefulWidget {
  const FaixaPedidosDeAlteracao({super.key, required this.api});

  final PainelApi api;

  @override
  State<FaixaPedidosDeAlteracao> createState() => _FaixaPedidosDeAlteracaoState();
}

class _FaixaPedidosDeAlteracaoState extends State<FaixaPedidosDeAlteracao> {
  int _quantos = 0;

  @override
  void initState() {
    super.initState();
    _contar();
  }

  Future<void> _contar() async {
    try {
      final l = await widget.api.alteracoesPendentes();
      if (mounted) setState(() => _quantos = l.length);
    } catch (_) {
      // Sem conexao: a faixa so nao aparece agora.
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_quantos == 0) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(Spacing.md, Spacing.md, Spacing.md, 0),
      child: Material(
        color: AppColors.warning.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(Radii.md),
        child: ListTile(
          leading: const Icon(Icons.edit_note, color: AppColors.warning),
          title: Text(
            _quantos == 1 ? '1 motorista pediu para mudar os dados' : '$_quantos motoristas pediram para mudar os dados',
            style: AppText.bodyStrong,
          ),
          subtitle: const Text('Toque para conferir e aprovar.'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () async {
            await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => PedidosDeAlteracaoScreen(api: widget.api)));
            _contar();
          },
        ),
      ),
    );
  }
}
