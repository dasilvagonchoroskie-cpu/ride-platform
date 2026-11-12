import 'package:flutter/material.dart';

import '../core/formato.dart';
import '../core/tema.dart';
import '../estado/escopo.dart';
import '../widgets/comuns.dart';

/// Primeira tela: entrar com o codigo enviado por e-mail (cria a conta se for
/// a primeira vez) ou com e-mail e senha (depois do cadastro do estabelecimento).
class EntradaTela extends StatefulWidget {
  const EntradaTela({super.key});

  @override
  State<EntradaTela> createState() => _EntradaTelaState();
}

class _EntradaTelaState extends State<EntradaTela> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _codigo = TextEditingController();
  final _senha = TextEditingController();
  bool _comSenha = false;
  bool _codigoEnviado = false;
  bool _ocupado = false;
  String? _erro;

  @override
  void dispose() {
    _email.dispose();
    _codigo.dispose();
    _senha.dispose();
    super.dispose();
  }

  Future<void> _enviarCodigo() async {
    if (!_form.currentState!.validate()) return;
    final s = EscopoSessao.ler(context);
    setState(() {
      _ocupado = true;
      _erro = null;
    });
    try {
      await s.pedirCodigo(_email.text);
      if (!mounted) return;
      setState(() => _codigoEnviado = true);
      avisar(context, 'Enviamos um código para ${_email.text.trim()}.');
    } catch (e) {
      if (mounted) setState(() => _erro = mensagemDe(e));
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  Future<void> _entrar() async {
    if (!_form.currentState!.validate()) return;
    final s = EscopoSessao.ler(context);
    setState(() {
      _ocupado = true;
      _erro = null;
    });
    try {
      if (_comSenha) {
        await s.entrarComSenha(_email.text, _senha.text);
      } else {
        await s.entrarComCodigo(_email.text, _codigo.text);
      }
    } catch (e) {
      if (mounted) setState(() => _erro = mensagemDe(e));
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Form(
                key: _form,
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Center(child: Image.asset('assets/brand/logo_redondo.png', height: 96)),
                  const SizedBox(height: 18),
                  const Text('Fortaleza Move', textAlign: TextAlign.center, style: TextStyle(fontSize: 14, color: Cores.textoSuave, fontWeight: FontWeight.w600)),
                  const Text('Comércio', textAlign: TextAlign.center, style: TextStyle(fontSize: 30, fontWeight: FontWeight.w800, color: Cores.loja)),
                  const SizedBox(height: 8),
                  const Text(
                    'Peça a coleta e a entrega das encomendas da sua loja.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Cores.textoSuave, height: 1.4),
                  ),
                  const SizedBox(height: 28),
                  TextFormField(
                    controller: _email,
                    keyboardType: TextInputType.emailAddress,
                    autocorrect: false,
                    enabled: !_codigoEnviado || _comSenha,
                    decoration: const InputDecoration(labelText: 'E-mail do estabelecimento'),
                    validator: Validar.campoEmail,
                  ),
                  const SizedBox(height: 14),
                  if (_comSenha)
                    TextFormField(
                      controller: _senha,
                      obscureText: true,
                      decoration: const InputDecoration(labelText: 'Senha'),
                      validator: (v) => (v == null || v.isEmpty) ? 'Informe a senha.' : null,
                    )
                  else if (_codigoEnviado)
                    TextFormField(
                      controller: _codigo,
                      keyboardType: TextInputType.number,
                      maxLength: 8,
                      decoration: const InputDecoration(labelText: 'Código recebido por e-mail', counterText: ''),
                      validator: (v) => RegExp(r'^\d{4,8}$').hasMatch((v ?? '').trim()) ? null : 'Digite o código de 4 a 8 números.',
                    ),
                  if (_erro != null) ...[const SizedBox(height: 14), Faixa(_erro!, tipo: TipoFaixa.erro)],
                  const SizedBox(height: 20),
                  BotaoPrincipal(
                    texto: _comSenha ? 'Entrar' : (_codigoEnviado ? 'Confirmar código' : 'Receber código por e-mail'),
                    carregando: _ocupado,
                    aoTocar: _comSenha || _codigoEnviado ? _entrar : _enviarCodigo,
                  ),
                  const SizedBox(height: 10),
                  if (_codigoEnviado && !_comSenha)
                    TextButton(
                      onPressed: _ocupado ? null : _enviarCodigo,
                      child: const Text('Enviar o código de novo'),
                    ),
                  TextButton(
                    onPressed: _ocupado
                        ? null
                        : () => setState(() {
                              _comSenha = !_comSenha;
                              _codigoEnviado = false;
                              _erro = null;
                            }),
                    child: Text(_comSenha ? 'Entrar com código por e-mail' : 'Já tenho senha'),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Primeira vez? Receba o código, entre e cadastre o seu estabelecimento. A Central confere os dados antes de liberar os pedidos.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Cores.textoFraco, fontSize: 12, height: 1.4),
                  ),
                ]),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
