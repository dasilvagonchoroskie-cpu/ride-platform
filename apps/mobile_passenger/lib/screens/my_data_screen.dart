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

/// Meus dados: nome, e-mail, genero, cidade, endereco, telefone e senha.
/// O telefone troca com o codigo que chega no e-mail da conta. O CPF entra
/// uma vez, no cadastro (para corrigir, a Central). Quem tambem e motorista
/// muda nome, telefone, e-mail e endereco pelo app do motorista (a Central
/// aprova) — Evandro, 10/10/2026.
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
  final TextEditingController _endereco = TextEditingController();
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
      _telefone.text = u.phone.isEmpty ? 'Não informado' : telefoneLegivel(u.phone);
      _genero = u.genero;
      _cidade = u.cidade;
      _endereco.text = u.endereco ?? '';
    }
  }

  @override
  void dispose() {
    _nome.dispose();
    _email.dispose();
    _cpf.dispose();
    _telefone.dispose();
    _endereco.dispose();
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

  Future<void> _trocarTelefone() async {
    final trocou = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
        child: const _TrocarTelefone(),
      ),
    );
    if (trocou == true && mounted) {
      final u = context.read<AuthState>().user;
      if (u != null) setState(() => _telefone.text = telefoneLegivel(u.phone));
      avisar('Telefone trocado. Use o número novo para entrar.');
    }
  }

  Future<void> _salvar(UserProfile u) async {
    final cpfNovo = u.cpf == null && _cpf.text.trim().isNotEmpty;
    final endereco = _endereco.text.trim().replaceAll(RegExp(r'\s+'), ' ');
    final enderecoNovo = u.driverId == null && endereco.isNotEmpty && endereco != (u.endereco ?? '');
    final erros = <String, String?>{
      'nome': nomeCompleto(_nome.text) ? null : 'Informe nome e sobrenome, igual ao do CPF.',
      'email': emailValido(_email.text) ? null : 'Digite um e-mail válido.',
      'cpf': !cpfNovo || cpfValido(_cpf.text) ? null : 'CPF inválido. Confira os números.',
      'endereco': !enderecoNovo || endereco.length >= 5 ? null : 'Escreva rua, número e bairro.',
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
            endereco: enderecoNovo ? endereco : null,
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
    final motorista = u.driverId != null;
    const pelaCentral = 'Você também é motorista: mude pelo app do motorista (Meus dados). A Central aprova.';

    return TelaFormulario(
      titulo: 'Meus dados',
      child: ListView(
        padding: const EdgeInsets.fromLTRB(Spacing.xl, Spacing.xl, Spacing.xl, Spacing.xxl),
        children: [
          CampoForm(
            rotulo: 'Nome e sobrenome',
            controller: _nome,
            capitalizar: TextCapitalization.words,
            somenteLeitura: motorista,
            ajuda: motorista ? pelaCentral : null,
            erro: _erros['nome'],
            aoMudar: (_) => setState(() => _erros['nome'] = null),
          ),
          espaco,
          CampoForm(
            rotulo: 'E-mail',
            controller: _email,
            teclado: TextInputType.emailAddress,
            somenteLeitura: motorista,
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
            rotulo: 'Endereço',
            dica: 'Rua, número e bairro',
            controller: _endereco,
            capitalizar: TextCapitalization.words,
            somenteLeitura: motorista,
            erro: _erros['endereco'],
            aoMudar: (_) => setState(() => _erros['endereco'] = null),
          ),
          espaco,
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
            ajuda: motorista ? pelaCentral : null,
          ),
          if (!motorista && !u.telefonePendente)
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: _trocarTelefone,
                icon: const Icon(Icons.phone_iphone, size: 18),
                label: const Text('Trocar telefone'),
              ),
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
                builder: (_) => u.temSenha ? const ChangePasswordScreen() : ResetPasswordScreen(telefone: u.phone, email: u.email),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Trocar o telefone: numero novo + codigo que chega no e-mail da conta.
class _TrocarTelefone extends StatefulWidget {
  const _TrocarTelefone();

  @override
  State<_TrocarTelefone> createState() => _TrocarTelefoneState();
}

class _TrocarTelefoneState extends State<_TrocarTelefone> {
  final TextEditingController _novo = TextEditingController();
  final TextEditingController _codigo = TextEditingController();
  bool _enviado = false;
  bool _ocupado = false;
  String? _erro;
  String? _destino;

  @override
  void dispose() {
    _novo.dispose();
    _codigo.dispose();
    super.dispose();
  }

  bool get _numeroOk {
    final d = onlyDigits(_novo.text);
    return d.length == 10 || d.length == 11;
  }

  Future<void> _pedir() async {
    if (!_numeroOk) {
      setState(() => _erro = 'Digite o telefone novo com DDD.');
      return;
    }
    final auth = context.read<AuthState>();
    setState(() {
      _ocupado = true;
      _erro = null;
    });
    try {
      final teste = await auth.pedirCodigoTelefone();
      if (!mounted) return;
      setState(() {
        _enviado = true;
        _destino = auth.codigoEnviadoPara;
        if (teste != null) _codigo.text = teste;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _erro = e.message);
    } catch (_) {
      if (mounted) setState(() => _erro = 'Sem conexão. Tente de novo.');
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  Future<void> _salvar() async {
    if (onlyDigits(_codigo.text).length != 6) {
      setState(() => _erro = 'O código tem 6 números.');
      return;
    }
    final auth = context.read<AuthState>();
    setState(() {
      _ocupado = true;
      _erro = null;
    });
    try {
      await auth.atualizarPerfil(telefone: '+55${onlyDigits(_novo.text)}', codigo: onlyDigits(_codigo.text));
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _erro = e.message);
    } catch (_) {
      if (mounted) setState(() => _erro = 'Sem conexão. Tente de novo.');
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(Spacing.xl, Spacing.xl, Spacing.xl, Spacing.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Trocar telefone', style: AppText.title),
            const SizedBox(height: Spacing.sm),
            Text(
              _enviado
                  ? 'Enviamos um código de 6 números para ${_destino ?? 'o e-mail da sua conta'}. Digite o código para confirmar.'
                  : 'Para sua segurança, vamos mandar um código para o e-mail da sua conta.',
              style: AppText.body.copyWith(color: AppColors.textMuted),
            ),
            const SizedBox(height: Spacing.lg),
            CampoForm(
              rotulo: 'Telefone novo (com DDD)',
              controller: _novo,
              teclado: TextInputType.phone,
              formatadores: [mascaraTelefone],
              somenteLeitura: _enviado,
              aoMudar: (_) => setState(() => _erro = null),
            ),
            if (_enviado) ...[
              const SizedBox(height: Spacing.lg),
              CampoForm(
                rotulo: 'Código do e-mail',
                controller: _codigo,
                teclado: TextInputType.number,
                tamanhoMaximo: 6,
                aoMudar: (_) => setState(() => _erro = null),
              ),
            ],
            if (_erro != null) ...[
              const SizedBox(height: Spacing.md),
              Text(_erro!, style: AppText.body.copyWith(color: AppColors.danger)),
            ],
            const SizedBox(height: Spacing.xl),
            BotaoPrincipal(
              texto: _enviado ? 'Confirmar telefone novo' : 'Receber código no e-mail',
              carregando: _ocupado,
              aoTocar: _enviado ? _salvar : _pedir,
            ),
            if (_enviado)
              TextButton(onPressed: _ocupado ? null : _pedir, child: const Text('Mandar outro código')),
          ],
        ),
      ),
    );
  }
}
