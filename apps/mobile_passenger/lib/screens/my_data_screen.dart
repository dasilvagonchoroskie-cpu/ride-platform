import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api/api_client.dart';
import '../core/avisos.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../core/utils/validadores.dart';
import '../data/models/models.dart';
import '../state/auth_state.dart';
import '../state/config_state.dart';
import '../widgets/form_ui.dart';
import '../widgets/painel_ui.dart';
import 'change_password_screen.dart';
import 'otp_screen.dart';
import 'reset_password_screen.dart';

/// Meus dados: nome, e-mail, genero, cidade e senha. CPF e telefone so
/// para conferir (o CPF entra uma vez, no cadastro).
class MyDataScreen extends StatefulWidget {
  const MyDataScreen({super.key});

  @override
  State<MyDataScreen> createState() => _MyDataScreenState();
}

class _MyDataScreenState extends State<MyDataScreen> {
  final TextEditingController _nome = TextEditingController();
  final TextEditingController _email = TextEditingController();
  final TextEditingController _cpf = TextEditingController();
  final TextEditingController _telefone = TextEditingController();
  String? _genero;
  String? _cidade;
  final Map<String, String?> _erros = {};
  bool _salvando = false;

  @override
  void initState() {
    super.initState();
    final u = context.read<AuthState>().user;
    if (u != null) {
      _nome.text = u.name;
      _email.text = u.email ?? '';
      _cpf.text = u.cpf == null ? '' : formatarCpf(u.cpf!);
      _telefone.text = telefoneLegivel(u.phone);
      _genero = u.genero;
      _cidade = u.cidade;
    }
  }

  @override
  void dispose() {
    _nome.dispose();
    _email.dispose();
    _cpf.dispose();
    _telefone.dispose();
    super.dispose();
  }

  Future<void> _escolherGenero() async {
    final v = await escolherOpcao(context, titulo: 'Gênero', opcoes: kGeneros, atual: _genero);
    if (v != null && mounted) setState(() => _genero = v);
  }

  Future<void> _escolherCidade(List<String> cidades) async {
    final v = await escolherOpcao(
      context,
      titulo: 'Cidade',
      opcoes: [for (final c in cidades) (c, c)],
      atual: _cidade,
    );
    if (v != null && mounted) setState(() => _cidade = v);
  }

  Future<void> _salvar(UserProfile u) async {
    final cpfNovo = u.cpf == null && _cpf.text.trim().isNotEmpty;
    final erros = <String, String?>{
      'nome': nomeCompleto(_nome.text) ? null : 'Informe nome e sobrenome, igual ao do CPF.',
      'email': emailValido(_email.text) ? null : 'Digite um e-mail válido.',
      'cpf': !cpfNovo || cpfValido(_cpf.text) ? null : 'CPF inválido. Confira os números.',
    };
    setState(() {
      _erros
        ..clear()
        ..addAll(erros);
    });
    if (erros.values.any((e) => e != null)) return;

    final nome = _nome.text.trim().replaceAll(RegExp(r'\s+'), ' ');
    final email = _email.text.trim().toLowerCase();
    setState(() => _salvando = true);
    try {
      await context.read<AuthState>().atualizarPerfil(
            nome: nome != u.name ? nome : null,
            email: email != (u.email ?? '') ? email : null,
            genero: _genero != null && _genero != u.genero ? _genero : null,
            cidade: _cidade != null && _cidade != u.cidade ? _cidade : null,
            cpf: cpfNovo ? onlyDigits(_cpf.text) : null,
          );
      avisar('Dados salvos.');
    } on ApiException {
      // O motivo ja aparece na tela (aviso do servidor).
    } finally {
      if (mounted) setState(() => _salvando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final u = context.watch<AuthState>().user;
    final cidades = context.watch<ConfigState>().cidades;
    const espaco = SizedBox(height: Spacing.xl);
    if (u == null) return const SizedBox.shrink();

    return TelaFormulario(
      titulo: 'Meus dados',
      child: ListView(
        padding: const EdgeInsets.fromLTRB(Spacing.xl, Spacing.xl, Spacing.xl, Spacing.xxl),
        children: [
          CampoForm(
            rotulo: 'Nome e sobrenome',
            controller: _nome,
            capitalizar: TextCapitalization.words,
            erro: _erros['nome'],
            aoMudar: (_) => setState(() => _erros['nome'] = null),
          ),
          espaco,
          CampoForm(
            rotulo: 'E-mail',
            controller: _email,
            teclado: TextInputType.emailAddress,
            erro: _erros['email'],
            aoMudar: (_) => setState(() => _erros['email'] = null),
          ),
          espaco,
          CampoSelecao(rotulo: 'Gênero', valor: rotuloGenero(_genero), aoTocar: _escolherGenero),
          espaco,
          if (cidades.isNotEmpty) ...[
            CampoSelecao(
              rotulo: 'Cidade',
              valor: _cidade ?? 'Selecione',
              aoTocar: () => _escolherCidade(cidades),
            ),
            espaco,
          ],
          CampoForm(
            rotulo: 'CPF',
            dica: 'Digite seu CPF',
            controller: _cpf,
            teclado: TextInputType.number,
            formatadores: [mascaraCpf],
            somenteLeitura: u.cpf != null,
            ajuda: u.cpf != null ? 'Para corrigir o CPF, fale com a Central.' : null,
            erro: _erros['cpf'],
            aoMudar: (_) => setState(() => _erros['cpf'] = null),
          ),
          espaco,
          CampoForm(
            rotulo: 'Telefone',
            controller: _telefone,
            somenteLeitura: true,
          ),
          const SizedBox(height: Spacing.xxl),
          BotaoPrincipal(texto: 'Salvar', carregando: _salvando, aoTocar: () => _salvar(u)),
          const SizedBox(height: Spacing.xl),
          const Divider(height: 1, color: AppColors.border),
          MenuLinha(
            icone: Icons.lock_outline,
            corIcone: AppColors.text,
            titulo: u.temSenha ? 'Alterar senha' : 'Criar senha',
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => u.temSenha ? const ChangePasswordScreen() : ResetPasswordScreen(telefone: u.phone),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
