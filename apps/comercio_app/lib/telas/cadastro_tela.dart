import 'package:flutter/material.dart';

import '../core/formato.dart';
import '../dados/comercio_api.dart';
import '../estado/escopo.dart';
import '../widgets/comuns.dart';
import '../widgets/endereco_campos.dart';
import 'termos_tela.dart';

/// Cadastro do estabelecimento (separado do cadastro de passageiro). Depois de
/// enviado, fica AGUARDANDO: quem aprova e a Central.
class CadastroTela extends StatefulWidget {
  const CadastroTela({super.key});

  @override
  State<CadastroTela> createState() => _CadastroTelaState();
}

class _CadastroTelaState extends State<CadastroTela> {
  final _form = GlobalKey<FormState>();
  final _fantasia = TextEditingController();
  final _razao = TextEditingController();
  final _cnpj = TextEditingController();
  final _responsavel = TextEditingController();
  final _cpf = TextEditingController();
  final _telefone = TextEditingController();
  final _senha = TextEditingController();
  final _endereco = EnderecoControle();
  bool _ocupado = false;
  bool _aceitou = false;
  String? _erro;

  @override
  void dispose() {
    for (final c in [_fantasia, _razao, _cnpj, _responsavel, _cpf, _telefone, _senha]) {
      c.dispose();
    }
    _endereco.dispose();
    super.dispose();
  }

  Future<void> _enviar() async {
    if (!_form.currentState!.validate()) return;
    if (!_endereco.temLocalizacao) {
      setState(() => _erro = 'Confirme a localização do endereço no mapa ("Buscar no mapa") antes de enviar.');
      return;
    }
    if (!_aceitou) {
      setState(() => _erro = 'Para cadastrar, leia e aceite os termos de uso do Comércio.');
      return;
    }
    final s = EscopoSessao.ler(context);
    setState(() {
      _ocupado = true;
      _erro = null;
    });
    try {
      await s.cadastrar(DadosDoCadastro(
        nomeFantasia: _fantasia.text,
        razaoSocial: _razao.text,
        cnpj: _cnpj.text,
        responsavelNome: _responsavel.text,
        responsavelCpf: _cpf.text,
        telefone: _telefone.text,
        email: s.email ?? '',
        endereco: _endereco.ler(),
        senha: _senha.text,
        aceiteTermos: true,
      ));
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
      appBar: AppBar(
        title: const Text('Cadastrar estabelecimento'),
        actions: [TextButton(onPressed: _ocupado ? null : s.sair, child: const Text('Sair'))],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
          child: Form(
            key: _form,
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              const Faixa('Depois de enviar, a Central confere os dados e libera o seu estabelecimento. Você acompanha a situação aqui no app.'),
              const Titulo('ESTABELECIMENTO'),
              TextFormField(
                controller: _fantasia,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(labelText: 'Nome fantasia'),
                validator: (v) => Validar.obrigatorio(v, 'Nome fantasia', 2),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _razao,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(labelText: 'Razão social (opcional)'),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _cnpj,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'CNPJ'),
                validator: Validar.campoCnpj,
              ),
              const Titulo('RESPONSÁVEL'),
              TextFormField(
                controller: _responsavel,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(labelText: 'Nome do responsável'),
                validator: (v) => Validar.obrigatorio(v, 'Nome do responsável', 2),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _cpf,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'CPF do responsável (opcional)'),
                validator: Validar.campoCpf,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _telefone,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(labelText: 'Telefone (com DDD)'),
                validator: Validar.campoTelefone,
              ),
              const SizedBox(height: 12),
              TextFormField(
                initialValue: s.email ?? '',
                enabled: false,
                decoration: const InputDecoration(labelText: 'E-mail (o mesmo do código que você recebeu)'),
              ),
              const Titulo('ENDEREÇO DO ESTABELECIMENTO (ONDE O MOTORISTA COLETA)'),
              EnderecoCampos(controle: _endereco, servidor: s.servidor),
              const Titulo('SENHA PARA OS PRÓXIMOS ACESSOS (OPCIONAL)'),
              TextFormField(
                controller: _senha,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Crie uma senha', helperText: 'Opcional. Se este e-mail já tem senha, deixe em branco; você sempre pode entrar pelo código do e-mail.'),
                validator: (v) => (v ?? '').isEmpty ? null : Validar.campoSenha(v),
              ),
              const Titulo('TERMOS DE USO'),
              CheckboxListTile(
                key: const ValueKey('aceite-termos'),
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                value: _aceitou,
                onChanged: _ocupado ? null : (v) => setState(() => _aceitou = v ?? false),
                title: const Text('Li e aceito os termos de uso e as condições comerciais do Comércio'),
              ),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const TermosTela())),
                  icon: const Icon(Icons.article_outlined),
                  label: const Text('Ler os termos de uso'),
                ),
              ),
              if (_erro != null) ...[const SizedBox(height: 16), Faixa(_erro!, tipo: TipoFaixa.erro)],
              const SizedBox(height: 22),
              BotaoPrincipal(texto: 'Enviar cadastro', carregando: _ocupado, aoTocar: _enviar),
            ]),
          ),
        ),
      ),
    );
  }
}
