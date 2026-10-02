import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api/api_client.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../core/utils/validadores.dart';
import '../data/models/models.dart';
import '../state/auth_state.dart';
import '../state/config_state.dart';
import '../widgets/form_ui.dart';

/// Cadastro do passageiro, logo depois de confirmar o telefone e escolher
/// a cidade. Feito uma vez so.
class SignupScreen extends StatefulWidget {
  const SignupScreen({super.key});

  @override
  State<SignupScreen> createState() => _SignupScreenState();
}

class _SignupScreenState extends State<SignupScreen> {
  final TextEditingController _nome = TextEditingController();
  final TextEditingController _email = TextEditingController();
  final TextEditingController _cpf = TextEditingController();
  final TextEditingController _senha = TextEditingController();
  final TextEditingController _confirma = TextEditingController();
  String? _genero;
  final Map<String, String?> _erros = {};
  String? _erroGeral;
  bool _enviando = false;

  @override
  void initState() {
    super.initState();
    final u = context.read<AuthState>().user;
    if (u != null) {
      // O servidor cria a conta como "Passageiro 1234": isso nao e nome.
      if (!u.name.startsWith('Passageiro ')) _nome.text = u.name;
      _email.text = u.email ?? '';
      if (u.cpf != null) _cpf.text = formatarCpf(u.cpf!);
      _genero = u.genero;
    }
  }

  @override
  void dispose() {
    _nome.dispose();
    _email.dispose();
    _cpf.dispose();
    _senha.dispose();
    _confirma.dispose();
    super.dispose();
  }

  void _limpar(String campo) {
    if (_erros[campo] == null && _erroGeral == null) return;
    setState(() {
      _erros[campo] = null;
      _erroGeral = null;
    });
  }

  Future<void> _escolherGenero() async {
    final v = await escolherOpcao(context, titulo: 'Gênero', opcoes: kGeneros, atual: _genero);
    if (v == null || !mounted) return;
    setState(() {
      _genero = v;
      _erros['genero'] = null;
    });
  }

  Future<void> _enviar() async {
    if (_enviando) return;
    final erros = <String, String?>{
      'nome': nomeCompleto(_nome.text) ? null : 'Informe nome e sobrenome, igual ao do CPF.',
      'email': emailValido(_email.text) ? null : 'Digite um e-mail válido.',
      'genero': _genero == null ? 'Selecione uma opção.' : null,
      'cpf': cpfValido(_cpf.text) ? null : 'CPF inválido. Confira os números.',
      'senha': problemaSenha(_senha.text),
      'confirma': _senha.text == _confirma.text ? null : 'As senhas não são iguais.',
    };
    setState(() {
      _erros
        ..clear()
        ..addAll(erros);
      _erroGeral = null;
    });
    if (erros.values.any((e) => e != null)) return;

    setState(() => _enviando = true);
    final auth = context.read<AuthState>();
    try {
      await auth.concluirCadastro(
        nome: _nome.text.trim().replaceAll(RegExp(r'\s+'), ' '),
        email: _email.text,
        genero: _genero!,
        cpf: onlyDigits(_cpf.text),
        senha: _senha.text,
        cidade: auth.cidadeEscolhida,
      );
      // Deu certo: o aplicativo segue sozinho para os Termos.
    } on ApiException catch (e) {
      if (mounted) setState(() => _erroGeral = e.message);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    final temCidades = context.watch<ConfigState>().cidades.isNotEmpty;
    const espaco = SizedBox(height: Spacing.xl);

    return TelaFormulario(
      titulo: 'Cadastro',
      aoVoltar: () => temCidades ? auth.escolherCidade(null) : auth.logout(),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(Spacing.xl, Spacing.lg, Spacing.xl, Spacing.xxl),
        children: [
          Text(
            'Preencha os dados abaixo para se cadastrar no aplicativo e aproveitar nossos serviços.',
            style: AppText.body.copyWith(fontSize: 18, color: AppColors.textMuted, height: 1.4),
          ),
          if (auth.cidadeEscolhida != null) ...[
            const SizedBox(height: Spacing.sm),
            Text('Cidade: ${auth.cidadeEscolhida}', style: AppText.bodyStrong.copyWith(color: AppColors.brand)),
          ],
          const SizedBox(height: Spacing.lg),
          CampoForm(
            rotulo: 'Nome e sobrenome',
            dica: 'Digite seu nome',
            ajuda: 'Certifique-se de que seja igual ao nome que consta no seu CPF',
            controller: _nome,
            capitalizar: TextCapitalization.words,
            acao: TextInputAction.next,
            preenchimento: const [AutofillHints.name],
            erro: _erros['nome'],
            aoMudar: (_) => _limpar('nome'),
          ),
          espaco,
          CampoForm(
            rotulo: 'E-mail',
            dica: 'Digite seu e-mail',
            controller: _email,
            teclado: TextInputType.emailAddress,
            acao: TextInputAction.next,
            preenchimento: const [AutofillHints.email],
            erro: _erros['email'],
            aoMudar: (_) => _limpar('email'),
          ),
          espaco,
          CampoSelecao(
            rotulo: 'Gênero',
            valor: rotuloGenero(_genero),
            erro: _erros['genero'],
            aoTocar: _escolherGenero,
          ),
          espaco,
          CampoForm(
            rotulo: 'CPF',
            dica: 'Digite seu CPF',
            controller: _cpf,
            teclado: TextInputType.number,
            formatadores: [mascaraCpf],
            acao: TextInputAction.next,
            erro: _erros['cpf'],
            aoMudar: (_) => _limpar('cpf'),
          ),
          espaco,
          CampoForm(
            rotulo: 'Crie uma senha',
            dica: 'Digite uma senha',
            ajuda: 'Mínimo de 8 caracteres, com letras e números. Serve para entrar pelo e-mail.',
            controller: _senha,
            senha: true,
            acao: TextInputAction.next,
            preenchimento: const [AutofillHints.newPassword],
            erro: _erros['senha'],
            aoMudar: (_) => _limpar('senha'),
          ),
          espaco,
          CampoForm(
            rotulo: 'Confirme a senha',
            dica: 'Repita a senha',
            controller: _confirma,
            senha: true,
            acao: TextInputAction.done,
            erro: _erros['confirma'],
            aoMudar: (_) => _limpar('confirma'),
            aoEnviar: (_) => _enviar(),
          ),
          if (_erroGeral != null) ...[
            const SizedBox(height: Spacing.lg),
            Text(_erroGeral!, style: AppText.bodyStrong.copyWith(color: AppColors.danger)),
          ],
          const SizedBox(height: Spacing.xl),
          BotaoPrincipal(texto: 'Continuar', carregando: _enviando, aoTocar: _enviar),
        ],
      ),
    );
  }
}
