import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../core/api/api_client.dart';
import '../core/avisos.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../state/driver_state.dart';

/// Meus dados (Evandro, 10/10/2026): o motorista confere e pede para mudar
/// nome, telefone, e-mail, endereco, chave PIX e CNH. A mudanca so vale
/// depois que a Central aprova. CPF e nascimento: so a Central muda.
class MeusDadosScreen extends StatefulWidget {
  const MeusDadosScreen({super.key});

  @override
  State<MeusDadosScreen> createState() => _MeusDadosScreenState();
}

/// Campos que o motorista pode pedir para mudar: (chave, rotulo, teclado).
const _campos = [
  ('name', 'Nome completo', TextInputType.name),
  ('phone', 'Telefone (com DDD)', TextInputType.phone),
  ('email', 'E-mail', TextInputType.emailAddress),
  ('endereco', 'Endereço (rua, número e bairro)', TextInputType.streetAddress),
  ('pixKey', 'Chave PIX', TextInputType.text),
  ('cnhNumber', 'Número da CNH', TextInputType.number),
  ('cnhCategory', 'Categoria da CNH (ex.: B, AB)', TextInputType.text),
];

class _MeusDadosScreenState extends State<MeusDadosScreen> {
  final Map<String, TextEditingController> _c = {for (final f in _campos) f.$1: TextEditingController()};
  Map<String, dynamic> _atual = const {};
  Map<String, dynamic>? _pendente;
  Map<String, dynamic>? _recusa;
  String? _validadeCnh;
  bool _carregando = true;
  bool _enviando = false;
  String? _erro;

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

  static String _telefoneSemPais(String? t) => (t ?? '').replaceFirst(RegExp(r'^\+55'), '');

  /// Telefone do pedido em +55... aparece como (64) 99999-0001.
  static String _valorBonito(Object? campo, Object? valor) {
    if (valor == null || '$valor'.isEmpty) return '-';
    if (campo == 'phone') return telefoneBonito('$valor');
    return '$valor';
  }

  static String _dataBr(String? iso) {
    if (iso == null || iso.length < 10) return '-';
    return '${iso.substring(8, 10)}/${iso.substring(5, 7)}/${iso.substring(0, 4)}';
  }

  Future<void> _carregar() async {
    setState(() {
      _carregando = true;
      _erro = null;
    });
    try {
      final r = await context.read<DriverState>().api.request('GET', '/driver/meus-dados') as Map<String, dynamic>;
      _aplicar(r);
    } catch (e) {
      if (mounted) setState(() => _erro = e is ApiException ? e.message : 'Sem conexão. Puxe para baixo para tentar de novo.');
    } finally {
      if (mounted) setState(() => _carregando = false);
    }
  }

  void _aplicar(Map<String, dynamic> r) {
    final dados = (r['dados'] as Map?)?.cast<String, dynamic>() ?? const {};
    if (!mounted) return;
    setState(() {
      _atual = dados;
      _pendente = (r['pendente'] as Map?)?.cast<String, dynamic>();
      _recusa = (r['ultimaRecusa'] as Map?)?.cast<String, dynamic>();
      for (final f in _campos) {
        final v = dados[f.$1] as String?;
        _c[f.$1]!.text = f.$1 == 'phone' ? _telefoneSemPais(v) : (v ?? '');
      }
      _validadeCnh = dados['cnhExpiresAt'] as String?;
    });
  }

  Future<void> _escolherValidade() async {
    final atual = DateTime.tryParse(_validadeCnh ?? '') ?? DateTime.now();
    final d = await showDatePicker(
      context: context,
      initialDate: atual,
      firstDate: DateTime(2000),
      lastDate: DateTime(DateTime.now().year + 15),
      helpText: 'Validade da CNH',
    );
    if (d != null && mounted) {
      setState(() => _validadeCnh =
          '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}');
    }
  }

  /// So o que mudou (comparado com o que esta valendo).
  Map<String, String> _mudou() {
    final r = <String, String>{};
    for (final f in _campos) {
      final novo = _c[f.$1]!.text.trim();
      final antes = f.$1 == 'phone' ? _telefoneSemPais(_atual['phone'] as String?) : (_atual[f.$1] as String? ?? '');
      if (novo.isNotEmpty && novo != antes) r[f.$1] = novo;
    }
    if (_validadeCnh != null && _validadeCnh != _atual['cnhExpiresAt']) r['cnhExpiresAt'] = _validadeCnh!;
    return r;
  }

  Future<void> _enviar() async {
    final mudou = _mudou();
    if (mudou.isEmpty) {
      setState(() => _erro = 'Você não mudou nada. Edite o que precisa e toque em enviar.');
      return;
    }
    final api = context.read<DriverState>().api;
    setState(() {
      _enviando = true;
      _erro = null;
    });
    try {
      final r = await api.request('POST', '/driver/meus-dados/alteracao', body: mudou) as Map<String, dynamic>;
      _aplicar(r);
      avisar('Pedido enviado. Vale depois que a Central aprovar.');
    } catch (e) {
      if (mounted) setState(() => _erro = e is ApiException ? e.message : 'Sem conexão. Tente de novo.');
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  Future<void> _desistir() async {
    final api = context.read<DriverState>().api;
    setState(() => _enviando = true);
    try {
      final r = await api.request('DELETE', '/driver/meus-dados/alteracao') as Map<String, dynamic>;
      _aplicar(r);
    } catch (e) {
      if (mounted) setState(() => _erro = e is ApiException ? e.message : 'Sem conexão. Tente de novo.');
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final pendente = _pendente;
    final recusa = _recusa;
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Meus dados')),
      body: RefreshIndicator(
        onRefresh: _carregar,
        child: ListView(
          padding: const EdgeInsets.all(Spacing.lg),
          children: [
            Text(
              'Mudou alguma coisa? Edite aqui e envie. A mudança só vale depois que a Central conferir e aprovar.',
              style: AppText.body.copyWith(color: AppColors.textMuted),
            ),
            const SizedBox(height: Spacing.md),
            if (_carregando) const LinearProgressIndicator(),
            if (pendente != null) _Aviso(
              cor: AppColors.warning,
              icone: Icons.hourglass_top,
              titulo: 'Esperando a Central aprovar',
              linhas: [
                for (final m in (pendente['mudancas'] as List? ?? const []))
                  if (m is Map) '${m['rotulo']}: ${_valorBonito(m['campo'], m['para'])}',
              ],
              acao: TextButton(onPressed: _enviando ? null : _desistir, child: const Text('Desistir do pedido')),
            ),
            if (pendente == null && recusa != null) _Aviso(
              cor: AppColors.danger,
              icone: Icons.error_outline,
              titulo: 'A Central recusou o último pedido',
              linhas: ['Motivo: ${recusa['motivo']}'],
            ),
            const SizedBox(height: Spacing.sm),
            for (final f in _campos) ...[
              TextField(
                controller: _c[f.$1],
                enabled: !_carregando && !_enviando,
                keyboardType: f.$3,
                textCapitalization: f.$1 == 'name' || f.$1 == 'endereco' ? TextCapitalization.words : TextCapitalization.none,
                inputFormatters: f.$1 == 'phone' || f.$1 == 'cnhNumber' ? [FilteringTextInputFormatter.digitsOnly] : null,
                decoration: InputDecoration(labelText: f.$2, filled: true, fillColor: AppColors.surface),
              ),
              const SizedBox(height: Spacing.md),
            ],
            ListTile(
              tileColor: AppColors.surface,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.md)),
              leading: const Icon(Icons.event),
              title: const Text('Validade da CNH'),
              subtitle: Text(_dataBr(_validadeCnh)),
              trailing: const Icon(Icons.edit_calendar),
              onTap: _carregando || _enviando ? null : _escolherValidade,
            ),
            const SizedBox(height: Spacing.md),
            ListTile(
              tileColor: AppColors.surface,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.md)),
              leading: const Icon(Icons.lock_outline),
              title: Text(
                'CPF: ${(_atual['cpf'] as String?)?.isNotEmpty == true ? _atual['cpf'] : 'não informado'}\n'
                'Nascimento: ${_atual['birthDate'] == null ? 'não informado' : _dataBr(_atual['birthDate'] as String?)}',
              ),
              subtitle: const Text('Para corrigir, fale com a Central.'),
            ),
            if (_erro != null) ...[
              const SizedBox(height: Spacing.md),
              Text(_erro!, style: AppText.body.copyWith(color: AppColors.danger)),
            ],
            const SizedBox(height: Spacing.lg),
            FilledButton.icon(
              onPressed: _carregando || _enviando ? null : _enviar,
              icon: _enviando
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.send),
              label: Text(pendente == null ? 'Enviar para a Central aprovar' : 'Trocar o pedido'),
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
            ),
          ],
        ),
      ),
    );
  }
}

class _Aviso extends StatelessWidget {
  const _Aviso({required this.cor, required this.icone, required this.titulo, required this.linhas, this.acao});

  final Color cor;
  final IconData icone;
  final String titulo;
  final List<String> linhas;
  final Widget? acao;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: Spacing.sm),
      padding: const EdgeInsets.all(Spacing.md),
      decoration: BoxDecoration(
        color: cor.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(Radii.md),
        border: Border.all(color: cor.withValues(alpha: 0.4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icone, color: cor),
              const SizedBox(width: Spacing.sm),
              Expanded(child: Text(titulo, style: AppText.bodyStrong.copyWith(color: cor))),
            ],
          ),
          for (final l in linhas)
            Padding(padding: const EdgeInsets.only(top: Spacing.xs), child: Text(l, style: AppText.body)),
          if (acao != null) Align(alignment: Alignment.centerRight, child: acao),
        ],
      ),
    );
  }
}
