import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../core/api/api_client.dart';
import '../core/theme/central_theme.dart';
import 'comuns.dart';
import 'painel_state.dart';

/// Cadastro de motorista feito pela Central (pedido do Evandro, 08/10/2026):
/// dados, CNH e carro, ja aprovado se a Central conferiu pessoalmente.
/// Depois o motorista so entra no app do motorista com o telefone e o
/// codigo — o cadastro ja esta pronto. Se o telefone ja for de um passageiro,
/// o cadastro de motorista entra nessa mesma conta.
class CadastrarMotoristaTela extends StatefulWidget {
  const CadastrarMotoristaTela({super.key});

  @override
  State<CadastrarMotoristaTela> createState() => _CadastrarMotoristaTelaState();
}

/// Coloca a mascara enquanto digita: so os digitos passam por [formatar].
class _Mascara extends TextInputFormatter {
  _Mascara(this.formatar);

  final String Function(String digitos) formatar;

  @override
  TextEditingValue formatEditUpdate(TextEditingValue antes, TextEditingValue depois) {
    final t = formatar(depois.text.replaceAll(RegExp(r'\D'), ''));
    return TextEditingValue(text: t, selection: TextSelection.collapsed(offset: t.length));
  }
}

String _comSeparadores(String d, List<(int, String)> marcas, int maximo) {
  final s = d.length > maximo ? d.substring(0, maximo) : d;
  final b = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    for (final (pos, sep) in marcas) {
      if (i == pos) b.write(sep);
    }
    b.write(s[i]);
  }
  return b.toString();
}

final _mascaraTelefone = _Mascara((d) {
  final s = d.length > 11 ? d.substring(0, 11) : d;
  if (s.length <= 2) return s.isEmpty ? '' : '($s';
  final meio = s.length == 11 ? 7 : 6;
  if (s.length <= meio) return '(${s.substring(0, 2)}) ${s.substring(2)}';
  return '(${s.substring(0, 2)}) ${s.substring(2, meio)}-${s.substring(meio)}';
});
final _mascaraCpf = _Mascara((d) => _comSeparadores(d, [(3, '.'), (6, '.'), (9, '-')], 11));
final _mascaraData = _Mascara((d) => _comSeparadores(d, [(2, '/'), (4, '/')], 8));

/// "18/06/2031" -> "2031-06-18"; data que nao existe -> null.
String? dataParaServidor(String texto) {
  final d = texto.replaceAll(RegExp(r'\D'), '');
  if (d.length != 8) return null;
  final dia = int.parse(d.substring(0, 2));
  final mes = int.parse(d.substring(2, 4));
  final ano = int.parse(d.substring(4));
  final data = DateTime(ano, mes, dia);
  if (ano < 1900 || data.year != ano || data.month != mes || data.day != dia) return null;
  return '${d.substring(4)}-${d.substring(2, 4)}-${d.substring(0, 2)}';
}

class _CadastrarMotoristaTelaState extends State<CadastrarMotoristaTela> {
  final _nome = TextEditingController();
  final _telefone = TextEditingController();
  final _email = TextEditingController();
  final _cpf = TextEditingController();
  final _nascimento = TextEditingController();
  final _cnh = TextEditingController();
  final _validade = TextEditingController();
  final _marca = TextEditingController();
  final _modelo = TextEditingController();
  final _ano = TextEditingController();
  final _cor = TextEditingController();
  final _placa = TextEditingController();
  final _saldo = TextEditingController();
  String _categoria = 'B';
  bool _aprovar = true;
  bool _enviando = false;
  String? _erro;

  static const _categorias = ['A', 'B', 'AB', 'C', 'D', 'E', 'AC', 'AD', 'AE'];

  @override
  void dispose() {
    for (final c in [_nome, _telefone, _email, _cpf, _nascimento, _cnh, _validade, _marca, _modelo, _ano, _cor, _placa, _saldo]) {
      c.dispose();
    }
    super.dispose();
  }

  /// Confere tudo antes de mandar, com a mensagem certa para cada campo.
  String? _problema() {
    if (_nome.text.trim().split(RegExp(r'\s+')).where((p) => p.length >= 2).length < 2) {
      return 'Informe o nome completo do motorista (igual ao da CNH).';
    }
    final fone = _telefone.text.replaceAll(RegExp(r'\D'), '');
    if (fone.length < 10 || fone.length > 11) return 'Telefone com DDD: ex. (64) 99999-1234.';
    final email = _email.text.trim();
    if (email.isNotEmpty && !RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(email)) return 'E-mail inválido (ou deixe em branco).';
    if (_cpf.text.replaceAll(RegExp(r'\D'), '').length != 11) return 'CPF com 11 dígitos.';
    if (dataParaServidor(_nascimento.text) == null) return 'Data de nascimento: DD/MM/AAAA.';
    if (_cnh.text.replaceAll(RegExp(r'\D'), '').length != 11) return 'Número da CNH com 11 dígitos.';
    final validade = dataParaServidor(_validade.text);
    if (validade == null) return 'Validade da CNH: DD/MM/AAAA.';
    if (!DateTime.parse(validade).isAfter(DateTime.now())) return 'A CNH está vencida.';
    if (_marca.text.trim().isEmpty || _modelo.text.trim().isEmpty || _cor.text.trim().isEmpty) {
      return 'Preencha marca, modelo e cor do carro.';
    }
    final ano = int.tryParse(_ano.text.trim());
    if (ano == null || ano < 1990 || ano > DateTime.now().year + 1) return 'Ano do carro inválido.';
    final placa = _placa.text.toUpperCase().replaceAll(RegExp(r'[^A-Z0-9]'), '');
    if (!RegExp(r'^[A-Z]{3}\d[A-Z0-9]\d{2}$').hasMatch(placa)) return 'Placa inválida (ABC1234 ou ABC1D23).';
    return null;
  }

  int _centavos(String texto) {
    final limpo = texto.trim().replaceAll('.', '').replaceAll(',', '.');
    final v = double.tryParse(limpo);
    return v == null || v <= 0 ? 0 : (v * 100).round();
  }

  Future<void> _cadastrar() async {
    final problema = _problema();
    setState(() => _erro = problema);
    if (problema != null) return;
    setState(() => _enviando = true);
    final api = Provider.of<PainelState>(context, listen: false).api;
    final telefone = '+55${_telefone.text.replaceAll(RegExp(r'\D'), '')}';
    try {
      final r = await api.cadastrarMotorista({
        'name': _nome.text.trim().replaceAll(RegExp(r'\s+'), ' '),
        'phone': telefone,
        if (_email.text.trim().isNotEmpty) 'email': _email.text.trim().toLowerCase(),
        'cpf': _cpf.text.replaceAll(RegExp(r'\D'), ''),
        'birthDate': dataParaServidor(_nascimento.text),
        'cnhNumber': _cnh.text.replaceAll(RegExp(r'\D'), ''),
        'cnhCategory': _categoria,
        'cnhExpiresAt': dataParaServidor(_validade.text),
        'vehicle': {
          'plate': _placa.text.toUpperCase().replaceAll(RegExp(r'[^A-Z0-9]'), ''),
          'brand': _marca.text.trim(),
          'model': _modelo.text.trim(),
          'year': int.parse(_ano.text.trim()),
          'color': _cor.text.trim(),
        },
        'aprovar': _aprovar,
      });
      final saldo = _centavos(_saldo.text);
      if (saldo > 0) await api.creditarCarteira(r.id, saldo, 'Saldo inicial no cadastro pela Central');
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Motorista cadastrado'),
          content: Text(
            '${r.contaExistente ? 'Este telefone já tinha conta de passageiro: o cadastro de motorista entrou nessa mesma conta.\n\n' : ''}'
            'O motorista entra no app do motorista com o telefone ${telefoneBonito(telefone)} '
            'e o código que chega no celular. O cadastro e o carro já estão prontos'
            '${_aprovar ? ' e aprovados.' : '; falta aprovar em Motoristas → Pendentes.'}'
            '${saldo > 0 ? '\n\nSaldo inicial: ${reais(saldo)}.' : ''}',
          ),
          actions: [TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('OK'))],
        ),
      );
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _erro = e.message);
    } catch (_) {
      if (mounted) setState(() => _erro = 'Sem conexão com o servidor. O motorista não foi cadastrado.');
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  Widget _campo(
    String rotulo,
    TextEditingController c, {
    String? dica,
    TextInputType? teclado,
    TextInputFormatter? mascara,
    TextCapitalization maiusculas = TextCapitalization.none,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: Spacing.md),
      child: TextField(
        controller: c,
        keyboardType: teclado,
        textCapitalization: maiusculas,
        inputFormatters: mascara == null ? null : [mascara],
        decoration: InputDecoration(labelText: rotulo, hintText: dica),
      ),
    );
  }

  Widget _titulo(String texto) => Padding(
        padding: const EdgeInsets.only(top: Spacing.md, bottom: Spacing.sm),
        child: Text(texto, style: AppText.bodyStrong.copyWith(color: AppColors.textMuted)),
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Cadastrar motorista')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(Spacing.lg),
          children: [
            Text(
              'O motorista só vai precisar entrar no app do motorista com este telefone e o código. '
              'Fotos de documentos não são obrigatórias quando você confere pessoalmente.',
              style: AppText.caption.copyWith(color: AppColors.textMuted),
            ),
            _titulo('Dados'),
            _campo('Nome completo', _nome, maiusculas: TextCapitalization.words),
            _campo('Telefone com DDD', _telefone, dica: '(64) 99999-1234', teclado: TextInputType.phone, mascara: _mascaraTelefone),
            _campo('E-mail (opcional)', _email, teclado: TextInputType.emailAddress),
            _campo('CPF', _cpf, dica: '000.000.000-00', teclado: TextInputType.number, mascara: _mascaraCpf),
            _campo('Data de nascimento', _nascimento, dica: 'DD/MM/AAAA', teclado: TextInputType.number, mascara: _mascaraData),
            _titulo('CNH'),
            _campo('Número da CNH', _cnh, teclado: TextInputType.number),
            Padding(
              padding: const EdgeInsets.only(bottom: Spacing.md),
              child: DropdownButtonFormField<String>(
                initialValue: _categoria,
                decoration: const InputDecoration(labelText: 'Categoria'),
                items: [for (final c in _categorias) DropdownMenuItem(value: c, child: Text(c))],
                onChanged: (v) => setState(() => _categoria = v ?? 'B'),
              ),
            ),
            _campo('Validade da CNH', _validade, dica: 'DD/MM/AAAA', teclado: TextInputType.number, mascara: _mascaraData),
            _titulo('Carro'),
            _campo('Marca', _marca, dica: 'Ex.: Chevrolet', maiusculas: TextCapitalization.words),
            _campo('Modelo', _modelo, dica: 'Ex.: Spin', maiusculas: TextCapitalization.words),
            _campo('Ano', _ano, teclado: TextInputType.number),
            _campo('Cor', _cor, maiusculas: TextCapitalization.words),
            _campo('Placa', _placa, dica: 'ABC1D23', maiusculas: TextCapitalization.characters),
            _titulo('Carteira'),
            _campo('Saldo inicial em R\$ (opcional)', _saldo, dica: 'Ex.: 50,00', teclado: const TextInputType.numberWithOptions(decimal: true)),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: _aprovar,
              onChanged: (v) => setState(() => _aprovar = v),
              title: const Text('Já aprovar', style: AppText.body),
              subtitle: Text(
                'Conferi a CNH, o documento do carro e o motorista pessoalmente.',
                style: AppText.caption.copyWith(color: AppColors.textMuted),
              ),
            ),
            if (_erro != null)
              Padding(
                padding: const EdgeInsets.only(top: Spacing.sm),
                child: Text(_erro!, style: AppText.body.copyWith(color: AppColors.danger)),
              ),
            const SizedBox(height: Spacing.lg),
            FilledButton(
              onPressed: _enviando ? null : _cadastrar,
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
              child: Text(_enviando ? 'Cadastrando...' : 'Cadastrar motorista'),
            ),
            const SizedBox(height: Spacing.xl),
          ],
        ),
      ),
    );
  }
}
