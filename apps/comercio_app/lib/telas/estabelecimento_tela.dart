import 'package:flutter/material.dart';

import '../core/formato.dart';
import '../estado/escopo.dart';
import '../widgets/comuns.dart';
import '../widgets/endereco_campos.dart';

/// Edita nome, responsavel, telefone e endereco. O CNPJ nao muda por aqui.
class EstabelecimentoTela extends StatefulWidget {
  const EstabelecimentoTela({super.key});

  @override
  State<EstabelecimentoTela> createState() => _EstabelecimentoTelaState();
}

class _EstabelecimentoTelaState extends State<EstabelecimentoTela> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _fantasia;
  late final TextEditingController _razao;
  late final TextEditingController _responsavel;
  late final TextEditingController _telefone;
  late final EnderecoControle _endereco;
  bool _ocupado = false;
  String? _erro;

  @override
  void initState() {
    super.initState();
    final e = EscopoSessao.ler(context).estabelecimento!;
    _fantasia = TextEditingController(text: e.nomeFantasia);
    _razao = TextEditingController(text: e.razaoSocial ?? '');
    _responsavel = TextEditingController(text: e.responsavelNome);
    _telefone = TextEditingController(text: Formato.telefone(e.telefone));
    _endereco = EnderecoControle(e.endereco);
  }

  @override
  void dispose() {
    for (final c in [_fantasia, _razao, _responsavel, _telefone]) {
      c.dispose();
    }
    _endereco.dispose();
    super.dispose();
  }

  Future<void> _salvar() async {
    if (!_form.currentState!.validate()) return;
    if (!_endereco.temLocalizacao) {
      setState(() => _erro = 'Confirme a localização do endereço no mapa ("Buscar no mapa") antes de salvar.');
      return;
    }
    final s = EscopoSessao.ler(context);
    setState(() {
      _ocupado = true;
      _erro = null;
    });
    try {
      final novo = await s.servidor.atualizar(
        nomeFantasia: _fantasia.text,
        razaoSocial: _razao.text,
        responsavelNome: _responsavel.text,
        telefone: _telefone.text,
        endereco: _endereco.ler(),
      );
      await s.salvarEstabelecimento(novo);
      if (!mounted) return;
      avisar(context, 'Dados salvos.');
      Navigator.of(context).pop();
    } catch (e) {
      if (mounted) setState(() => _erro = mensagemDe(e));
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = EscopoSessao.de(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Editar estabelecimento')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(20, 4, 20, 28 + MediaQuery.viewPaddingOf(context).bottom),
          child: Form(
            key: _form,
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              const Titulo('ESTABELECIMENTO'),
              TextFormField(controller: _fantasia, decoration: const InputDecoration(labelText: 'Nome fantasia'), validator: (v) => Validar.obrigatorio(v, 'Nome fantasia', 2)),
              const SizedBox(height: 12),
              TextFormField(controller: _razao, decoration: const InputDecoration(labelText: 'Razão social (opcional)')),
              const SizedBox(height: 12),
              TextFormField(controller: _responsavel, decoration: const InputDecoration(labelText: 'Responsável'), validator: (v) => Validar.obrigatorio(v, 'Responsável', 2)),
              const SizedBox(height: 12),
              TextFormField(controller: _telefone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Telefone (com DDD)'), validator: Validar.campoTelefone),
              const Titulo('ENDEREÇO (ONDE O MOTORISTA COLETA)'),
              EnderecoCampos(controle: _endereco, servidor: s.servidor),
              if (_erro != null) ...[const SizedBox(height: 16), Faixa(_erro!, tipo: TipoFaixa.erro)],
              const SizedBox(height: 22),
              BotaoPrincipal(texto: 'Salvar', carregando: _ocupado, aoTocar: _salvar),
            ]),
          ),
        ),
      ),
    );
  }
}
