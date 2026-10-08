import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api/api_client.dart';
import '../core/avisos.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/validadores.dart';
import '../data/models/models.dart';
import '../state/ride_state.dart';

/// Conta > Contatos de emergencia: ate 3 pessoas. Elas aparecem para a
/// Central no alerta de SOS, e a tela de SOS tem um botao para avisar cada
/// uma pelo WhatsApp com a sua localizacao.
class ContatosEmergenciaScreen extends StatefulWidget {
  const ContatosEmergenciaScreen({super.key});

  @override
  State<ContatosEmergenciaScreen> createState() => _ContatosEmergenciaScreenState();
}

class _Linha {
  _Linha([String nome = '', String telefone = ''])
      : nome = TextEditingController(text: nome),
        telefone = TextEditingController(text: telefone);

  final TextEditingController nome;
  final TextEditingController telefone;

  void dispose() {
    nome.dispose();
    telefone.dispose();
  }
}

class _ContatosEmergenciaScreenState extends State<ContatosEmergenciaScreen> {
  final List<_Linha> _linhas = [];
  bool _carregando = true;
  bool _salvando = false;
  String? _erro;

  @override
  void initState() {
    super.initState();
    _carregar();
  }

  @override
  void dispose() {
    for (final l in _linhas) {
      l.dispose();
    }
    super.dispose();
  }

  Future<void> _carregar() async {
    try {
      final lista = await context.read<RideState>().contatosEmergencia();
      if (!mounted) return;
      setState(() {
        for (final c in lista) {
          _linhas.add(_Linha(c.nome, c.telefoneBonito));
        }
        if (_linhas.isEmpty) _linhas.add(_Linha());
        _carregando = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _erro = e is ApiException ? e.message : 'Sem conexão com o servidor.';
        _carregando = false;
      });
    }
  }

  String? _problema() {
    for (final l in _linhas) {
      final nome = l.nome.text.trim();
      final tel = l.telefone.text.replaceAll(RegExp(r'\D'), '');
      if (nome.isEmpty && tel.isEmpty) continue;
      if (nome.isEmpty) return 'Escreva o nome de cada contato.';
      if (tel.length < 10 || tel.length > 11) return 'Telefone de ${nome.split(' ').first} incompleto: use DDD + número.';
    }
    return null;
  }

  Future<void> _salvar() async {
    final problema = _problema();
    if (problema != null) {
      avisar(problema);
      return;
    }
    setState(() => _salvando = true);
    final contatos = [
      for (final l in _linhas)
        if (l.nome.text.trim().isNotEmpty)
          ContatoEmergencia(nome: l.nome.text.trim(), telefone: l.telefone.text.replaceAll(RegExp(r'\D'), '')),
    ];
    try {
      await context.read<RideState>().gravarContatos(contatos);
      if (!mounted) return;
      avisar(contatos.isEmpty ? 'Contatos de emergência removidos.' : 'Contatos de emergência salvos.');
      await Navigator.of(context).maybePop();
    } on ApiException {
      // O motivo ja apareceu na tela.
    } catch (_) {
      avisar('Sem conexão. Os contatos não foram salvos.');
    } finally {
      if (mounted) setState(() => _salvando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(title: const Text('Contatos de emergência')),
      body: _carregando
          ? const Center(child: CircularProgressIndicator())
          : _erro != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(Spacing.xl),
                    child: Text(_erro!, textAlign: TextAlign.center, style: AppText.body.copyWith(color: AppColors.danger)),
                  ),
                )
              : ListView(
                  padding: const EdgeInsets.all(Spacing.lg),
                  children: [
                    Text(
                      'Até 3 pessoas de confiança. Em caso de SOS, a Central vê esses contatos e você pode avisar cada um pelo WhatsApp com a sua localização.',
                      style: AppText.body.copyWith(color: AppColors.textMuted),
                    ),
                    const SizedBox(height: Spacing.lg),
                    for (var i = 0; i < _linhas.length; i++) ...[
                      Row(
                        children: [
                          Text('Contato ${i + 1}', style: AppText.bodyStrong),
                          const Spacer(),
                          IconButton(
                            tooltip: 'Remover contato',
                            onPressed: () => setState(() {
                              _linhas.removeAt(i).dispose();
                            }),
                            icon: const Icon(Icons.delete_outline, color: AppColors.danger),
                          ),
                        ],
                      ),
                      TextField(
                        controller: _linhas[i].nome,
                        textCapitalization: TextCapitalization.words,
                        decoration: const InputDecoration(labelText: 'Nome (ex.: Maria, minha irmã)'),
                      ),
                      const SizedBox(height: Spacing.sm),
                      TextField(
                        controller: _linhas[i].telefone,
                        keyboardType: TextInputType.phone,
                        inputFormatters: [mascaraTelefone],
                        decoration: const InputDecoration(labelText: 'Telefone com DDD', hintText: '(64) 99999-1234'),
                      ),
                      const SizedBox(height: Spacing.lg),
                    ],
                    if (_linhas.length < 3)
                      OutlinedButton.icon(
                        onPressed: () => setState(() => _linhas.add(_Linha())),
                        icon: const Icon(Icons.person_add_alt),
                        label: const Text('Adicionar contato'),
                      ),
                    const SizedBox(height: Spacing.xl),
                    FilledButton(
                      onPressed: _salvando ? null : _salvar,
                      style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                      child: Text(_salvando ? 'Salvando...' : 'Salvar contatos'),
                    ),
                  ],
                ),
    );
  }
}
